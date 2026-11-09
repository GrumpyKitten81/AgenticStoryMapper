import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import type { Project, Card, Release, Persona } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getTableName, is, Table } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, UnitOfWork, StoryMapperRepository, openExistingStoryMapperDb, openStoryMapperDb, createRedactedSnapshot, redactedTables, aggregateTables, assertClassifiedTables, RedactedSnapshot } from "@storymapper/db";
import { archiveBusinessRows, archiveBusinessTables, archiveDemoActor, archiveDemoSecrets, populateArchiveDemo } from "@storymapper/db/fixtures/archive-demo";
import { projectArchiveManifestSchema } from "@storymapper/contracts";
import { validateArchiveDatabase } from "@storymapper/db/archive-database";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";
import * as schema from "@storymapper/db/schema";

const cleanup: Array<() => void> = [];
const actor = { actorType: "human", actorId: "archive-fixture" } as const;
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

it("reconciles provenance after excluding GitHub evidence while retaining origin notes", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-provenance-archive-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = new UnitOfWork(handle).run(actor, ({ repository }) => {
    const project = repository.createProjectWithGettingStarted({ name: "Provenance archive" });
    const storyMapId = initializeSampleFixture(repository, project.id).sampleStoryMapId!;
    const issueOnly = repository.createCard({ storyMapId, level: "activity", title: "Issue origin" }, "human");
    const withNote = repository.createCard({ storyMapId, level: "activity", title: "Note origin" }, "ai");
    const identity = repository.createGitHubLink({ cardId: issueOnly.id, repo: "archive/fixture", issueNumber: 1, url: "https://github.com/archive/fixture/issues/1" });
    repository.createCardSourceLink(withNote.id, { kind: "github", externalRefId: identity.id });
    repository.createCardSourceLink(withNote.id, { kind: "note", note: "Retained origin" });
    return { project, issueOnly, withNote };
  });
  const snapshot = createRedactedSnapshot(path, data.project.id);
  const db = new Database(snapshot.snapshotPath, { readonly: true });
  try {
    expect(db.prepare("SELECT creation_origin, provenance FROM cards WHERE id = ?").get(data.issueOnly.id))
      .toEqual({ creation_origin: "manual", provenance: "manual" });
    expect(db.prepare("SELECT creation_origin, provenance FROM cards WHERE id = ?").get(data.withNote.id))
      .toEqual({ creation_origin: "inference", provenance: "linked" });
    expect(db.prepare("SELECT note FROM card_source_links WHERE card_id = ?").all(data.withNote.id))
      .toEqual([{ note: "Retained origin" }]);
    expect(db.prepare("SELECT * FROM card_github_evidence").all()).toEqual([]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  } finally { db.close(); rmSync(snapshot.snapshotPath); }
});

it("classifies every physical and declared table and names new unclassified tables", () => {
  const db = openStoryMapperDb(":memory:");
  try {
    const actual = (db.$client.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>).map(({ name }) => name);
    assertClassifiedTables(actual);
    assertClassifiedTables(Object.values(schema).filter((value) => is(value, Table)).map((table) => getTableName(table as Table)), "declared");
    expect(() => assertClassifiedTables([...actual, "unclassified_future_table"])).toThrow("unclassified_future_table");
    expect(() => assertClassifiedTables([...actual, actual[0]!])).toThrow(actual[0]!);
    expect(() => assertClassifiedTables(actual.filter((table) => table !== "projects"))).toThrow("projects");
    const assignments = Object.entries(aggregateTables);
    const registry = vi.spyOn(Object, "entries").mockReturnValueOnce([...assignments, ["Duplicate", ["cards"]]]);
    try { expect(() => assertClassifiedTables(actual)).toThrow("cards"); } finally { registry.mockRestore(); }
    expect(redactedTables).toContain("remote_work_item_links");
    expect(redactedTables).not.toContain("external_refs");
  } finally { db.$client.close(); }
});

it("scopes to one demo Project, keeps business links and deleted Card history, and removes secret free-page bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-archive-db-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const work = new UnitOfWork(handle);
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = work.run(actor, ({ repository }) => {
    const project = repository.createProjectWithGettingStarted({ name: "Portable demo" });
    const mapId = initializeSampleFixture(repository, project.id).sampleStoryMapId!;
    const deleted = repository.createCard({ storyMapId: mapId, level: "activity", title: "Historical demo" });
    const card = repository.createCard({ storyMapId: mapId, level: "activity", title: "Business card" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "included" });
    const release = repository.createRelease({ storyMapId: mapId, name: "Business release" });
    repository.setExternalRef({ entityType: "release", entityId: release.id, system: "agent", externalId: "release-included" });
    const persona = repository.createPersona({ projectId: project.id, name: "Demo reader", role: "Reader" });
    repository.setExternalRef({ entityType: "persona", entityId: persona.id, system: "agent", externalId: "persona-included" });
    repository.setCardPersona(card.id, persona.id);
    repository.deleteCard(deleted.id, { strategy: "unassign" });

    return { project, mapId, card, deleted, release, persona };
  });
  populateArchiveDemo(work, data.project.id, data.mapId, data.card.id);
  work.run({ actorType: "agent", actorId: "excluded-runtime-host" }, ({ repository }) => repository.logMcpToolCall({ projectId: null, metadata: { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "ok", affectedEntityIds: [] } }));
  const business = archiveBusinessRows(handle.current);
  const activity = (handle.current.$client.prepare("SELECT * FROM activity_events WHERE project_id = ? AND affected_entity_type NOT IN ('connectorConnection', 'remoteWorkItemLink', 'githubLink', 'syncRun', 'syncConflict', 'githubDryRun', 'remotePushPlan', 'remotePushExecution', 'cardReview') ORDER BY id").all(data.project.id) as Array<Record<string, unknown>>)
    .map((row) => [row.before_json, row.after_json].some((value) => typeof value === "string" && (JSON.parse(value).kind === "github" || JSON.parse(value).system === "github"))
      ? { ...row, before_json: null, before_schema_version: null, after_json: null, after_schema_version: null } : row);
  for (const table of redactedTables) expect(handle.current.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 1 });
  work.run(actor, ({ repository }) => {
    const excluded = repository.createProjectWithGettingStarted({ name: "Excluded demo" });
    const excludedMapId = initializeSampleFixture(repository, excluded.id).sampleStoryMapId!;
    const excludedCard = repository.createCard({ storyMapId: excludedMapId, level: "activity", title: "Excluded card" });
    const excludedRelease = repository.createRelease({ storyMapId: excludedMapId, name: "Excluded release" });
    const excludedPersona = repository.createPersona({ projectId: excluded.id, name: "Excluded persona", role: "Reader" });
    repository.setExternalRef({ entityType: "card", entityId: excludedCard.id, system: "agent", externalId: "excluded" });
    repository.setExternalRef({ entityType: "release", entityId: excludedRelease.id, system: "agent", externalId: "release-excluded" });
    repository.setExternalRef({ entityType: "persona", entityId: excludedPersona.id, system: "agent", externalId: "persona-excluded" });
  });
  const snapshot = createRedactedSnapshot(path, data.project.id);
  exerciseScopesToOneDemoProjectKeepsBusinessLinksAnd(snapshot, data, business, activity);
});


it("redacts copied Map Activity identities without removing chunk/note evidence or business metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-copy-archive-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const work = new UnitOfWork(handle);
  const target = randomUUID();
  const data = work.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Copy archive" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Source" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Business" });
    return { project, map, card };
  });
  populateArchiveDemo(work, data.project.id, data.map.id, data.card.id);
  work.run(actor, ({ repository }) => {
    repository.createCardSourceLink(data.card.id, { kind: "note", note: "Keep note" });
    const issueOnly = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Issue-only copied origin" }, "human");
    repository.createGitHubLink({ cardId: issueOnly.id, repo: "archive/fixture", issueNumber: 77, url: "https://github.com/archive/fixture/issues/77" });
    copyStoryMap.call(repository, data.map.id, "Copied", target);
  });
  const original = handle.current.$client.prepare("SELECT * FROM activity_events WHERE action = 'storyMap.copied' AND affected_entity_id = ?").get(target) as { id: string; after_json: string; [key: string]: unknown };
  const originalSnapshot = JSON.parse(original.after_json);
  expect(originalSnapshot.githubLinks).toHaveLength(3);
  expect(originalSnapshot.sourceLinks.map((link: { kind: string }) => link.kind).sort()).toEqual(["chunk", "github", "github", "github", "note"]);
  const snapshot = createRedactedSnapshot(path, data.project.id);
  const database = new Database(snapshot.snapshotPath);
  try {
    const row = database.prepare("SELECT * FROM activity_events WHERE id = ?").get(original.id) as typeof original;
    expect({ ...row, after_json: original.after_json }).toEqual(original);
    const retained = JSON.parse(row.after_json);
    expect(retained).toEqual({ ...originalSnapshot, githubLinks: [],
      externalRefs: originalSnapshot.externalRefs.filter((ref: { system: string }) => ref.system !== "github"),
      sourceLinks: originalSnapshot.sourceLinks.filter((link: { kind: string }) => link.kind !== "github"),
      cards: originalSnapshot.cards.map((card: { title: string }) => card.title === "Issue-only copied origin" ? { ...card, provenance: "inference" } : card)
    });
    const issueOnly = retained.cards.find((card: { title: string }) => card.title === "Issue-only copied origin");
    expect(issueOnly).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
    expect(database.prepare("SELECT creation_origin, provenance FROM cards WHERE id = ?").get(issueOnly.id)).toEqual({ creation_origin: "inference", provenance: "inference" });
    for (const secret of archiveDemoSecrets) expect(readFileSync(snapshot.snapshotPath).includes(Buffer.from(secret))).toBe(false);
    const manifest = projectArchiveManifestSchema.parse({ schemaVersion: snapshot.schemaVersion, databaseSha256: snapshot.databaseSha256, redactedTables: snapshot.redactedTables, redactedRowCount: snapshot.redactedRowCount, counts: snapshot.counts,
      formatVersion: 1, exportedAt: new Date().toISOString(), appVersion: "test", databaseFileName: "storymapper.sqlite", dataClassification: "business-data", includedFolders: [] });
    expect(validateArchiveDatabase(snapshot.snapshotPath, manifest)).toBe(data.project.id);
  } finally { database.close(); rmSync(snapshot.snapshotPath); }
});

it.each(["inconsistent provenance", "GitHub reference row", "GitHub sourceLink payload", "canonical deletion payload", "canonical command payload", "copied identity payload", "copied evidence payload"])("refuses an archive with %s", (damage) => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-invalid-provenance-archive-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = new UnitOfWork(handle).run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Invalid provenance" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "No evidence" });
    return { project, map, card };
  });
  const snapshot = createRedactedSnapshot(path, data.project.id);
  const database = new Database(snapshot.snapshotPath);
  const manifest = projectArchiveManifestSchema.parse({ formatVersion: 1, schemaVersion: snapshot.schemaVersion,
    exportedAt: new Date().toISOString(), appVersion: "test", databaseFileName: "storymapper.sqlite", databaseSha256: snapshot.databaseSha256,
    dataClassification: "business-data", redactedTables: snapshot.redactedTables, redactedRowCount: snapshot.redactedRowCount,
    counts: snapshot.counts, includedFolders: [] });
  try {
    expect(validateArchiveDatabase(snapshot.snapshotPath, manifest)).toBe(data.project.id);
    if (damage === "inconsistent provenance") database.prepare("UPDATE cards SET provenance = 'linked' WHERE id = ?").run(data.card.id);
    else if (damage === "GitHub reference row") database.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, 'card', ?, 'github', ?, ?, 1, ?)")
      .run(randomUUID(), data.card.id, "https://github.com/excluded/identity/issues/1", data.map.id, new Date().toISOString());
    else if (damage === "canonical command payload") database.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, 'Historical adapter payload', 'github', 'applied', 1, ?, ?)")
      .run(randomUUID(), data.project.id, JSON.stringify([{ operationId: "import", entity: "githubExternalRef", op: "create", after: { externalId: "https://github.com/excluded/identity/issues/1" } }]), new Date().toISOString());
    else {
      const payload = damage === "GitHub sourceLink payload" ? { kind: "github", repoFullName: "excluded/identity" }
        : damage === "canonical deletion payload" ? { reason: "entity-deleted", before: { system: "github", externalId: "https://github.com/excluded/identity/issues/1" } }
        : damage === "copied identity payload" ? { githubLinks: [{ repo: "excluded/identity" }], sourceLinks: [] }
        : { githubLinks: [], sourceLinks: [{ kind: "chunk", chunkId: "retained" }, { kind: "note", note: "retained" }, { kind: "github", repoFullName: "excluded/identity" }] };
      database.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, affected_entity_type, before_json, after_json, created_at, before_schema_version, after_schema_version) VALUES (?, ?, 'demo', 'human', ?, ?, ?, ?, ?, 1, 1)")
        .run(randomUUID(), data.project.id, damage === "GitHub sourceLink payload" ? "cardSourceLink.created" : damage === "canonical deletion payload" ? "externalRef.deleted" : "storyMap.copied", damage === "GitHub sourceLink payload" ? "sourceLink" : "storyMap", JSON.stringify(payload), JSON.stringify(payload), new Date().toISOString());
    }
    expect(() => validateArchiveDatabase(snapshot.snapshotPath, manifest)).toThrow(damage === "inconsistent provenance" ? "inconsistent Card provenance" : damage === "GitHub reference row" ? "unredacted GitHub external references" : "unredacted Sync activity payloads");
  } finally { database.close(); rmSync(snapshot.snapshotPath); }
});

it("redacts nested canonical deletion and historical command evidence while retaining Agent bindings and business operations", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-canonical-history-archive-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const canary = `archive-${randomUUID()}`;
  const data = new UnitOfWork(handle).run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Canonical history" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, title: "Retained business card", level: "activity" });
    const issue = repository.createGitHubLink({ cardId: card.id, repo: `fixture/${canary}`, issueNumber: 1, url: `https://github.com/fixture/${canary}/issues/1` });
    const agentRef = repository.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "retained-agent-source" }).ref;
    return { project, map, card, issue, agentRef };
  });
  const reference = handle.current.$client.prepare("SELECT * FROM external_refs WHERE id = ?").get(data.issue.id) as Record<string, unknown>;
  const activityId = randomUUID();
  handle.current.$client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, affected_entity_type, before_json, created_at, before_schema_version) VALUES (?, ?, 'fixture', 'human', 'externalRef.deleted', 'externalRef', ?, ?, 1)")
    .run(activityId, data.project.id, JSON.stringify({ reason: "entity-deleted", before: { system: "github", externalId: reference.external_id } }), new Date().toISOString());
  const operation = { operationId: "business", op: "update", entity: "card", entityId: data.card.id, after: { title: "Retained proposed title" } };
  const changeSetId = randomUUID();
  handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, 'Mixed history', 'mcp', 'approved', 1, ?, ?)")
    .run(changeSetId, data.project.id, JSON.stringify([{ operationId: "binding", op: "create", entity: "githubExternalRef", after: { externalId: reference.external_id } }, operation]), new Date().toISOString());
  const baseline = handle.current.$client.prepare("SELECT * FROM source_plan_baselines").all();
  const snapshot = createRedactedSnapshot(path, data.project.id);
  const database = new Database(snapshot.snapshotPath, { readonly: true });
  try {
    expect(database.prepare("SELECT id FROM external_refs WHERE system = 'github'").all()).toEqual([]);
    expect(database.prepare("SELECT external_id FROM external_refs WHERE id = ?").get(data.agentRef.id)).toEqual({ external_id: "retained-agent-source" });
    expect(database.prepare("SELECT * FROM source_plan_baselines").all()).toEqual(baseline);
    expect(database.prepare("SELECT before_json, after_json FROM activity_events WHERE id = ?").get(activityId)).toEqual({ before_json: null, after_json: null });
    expect(database.prepare("SELECT status, operations_json FROM change_sets WHERE id = ?").get(changeSetId)).toEqual({ status: "stale", operations_json: JSON.stringify([operation]) });
    expect(readFileSync(snapshot.snapshotPath).includes(Buffer.from(canary))).toBe(false);
    const imported = new DatabaseHandle(openExistingStoryMapperDb(snapshot.snapshotPath));
    try { expect(new StoryMapperRepository(imported).listDeletedGitHubRefs(data.project.id)).toEqual([]); }
    finally { imported.current.$client.close(); }
  } finally { database.close(); rmSync(snapshot.snapshotPath); }
});

it("roundtrips non-GitHub deletion Activity while removing and refusing typed GitHub deletion payloads", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mixed-deletion-archive-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = new UnitOfWork(handle).run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Mixed deletion history" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, title: "Business Card", level: "activity" });
    repository.createGitHubLink({ cardId: card.id, repo: "fixture/repo", issueNumber: 1, url: "https://github.com/fixture/repo/issues/1" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "bmad", externalId: "retained-deletion-source" });
    return { project, map, card, refs: repository.listExternalRefsForStoryMap(map.id) };
  });
  const events = data.refs.map((ref) => ({ id: randomUUID(), payload: JSON.stringify({ reason: "entity-deleted", projectId: data.project.id, storyMapId: data.map.id, entityType: "card", entityId: data.card.id, before: ref }), system: ref.system }));
  for (const event of events) handle.current.$client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, affected_entity_type, after_json, created_at, after_schema_version) VALUES (?, ?, 'fixture', 'human', 'externalRef.deleted', 'externalRef', ?, ?, 1)")
    .run(event.id, data.project.id, event.payload, new Date().toISOString());
  const snapshot = createRedactedSnapshot(path, data.project.id);
  const database = new Database(snapshot.snapshotPath);
  const manifest = projectArchiveManifestSchema.parse({ formatVersion: 1, schemaVersion: snapshot.schemaVersion, exportedAt: new Date().toISOString(), appVersion: "test", databaseFileName: "storymapper.sqlite", databaseSha256: snapshot.databaseSha256, dataClassification: "business-data", redactedTables: snapshot.redactedTables, redactedRowCount: snapshot.redactedRowCount, counts: snapshot.counts, includedFolders: [] });
  try {
    for (const event of events) expect(database.prepare("SELECT before_json, after_json FROM activity_events WHERE id = ?").get(event.id))
      .toEqual({ before_json: null, after_json: event.system === "github" ? null : event.payload });
    expect(database.prepare("SELECT system FROM external_refs").all()).toEqual([{ system: "bmad" }]);
    expect(validateArchiveDatabase(snapshot.snapshotPath, manifest)).toBe(data.project.id);
    const imported = new DatabaseHandle(openExistingStoryMapperDb(snapshot.snapshotPath));
    try { expect(new StoryMapperRepository(imported).listDeletedGitHubRefs(data.project.id)).toEqual([]); }
    finally { imported.current.$client.close(); }
    const github = events.find((event) => event.system === "github")!;
    database.prepare("UPDATE activity_events SET after_json = ?, after_schema_version = 1 WHERE id = ?").run(github.payload, github.id);
    expect(() => validateArchiveDatabase(snapshot.snapshotPath, manifest)).toThrow("unredacted Sync activity payloads");
  } finally { database.close(); rmSync(snapshot.snapshotPath); }
});

function exerciseScopesToOneDemoProjectKeepsBusinessLinksAnd(snapshot: RedactedSnapshot, data: { project: Project; mapId: string; card: Card; deleted: Card; release: Release; persona: Persona; }, business: Record<string, unknown[]>, activity: Record<string, unknown>[]) {
  const db = new Database(snapshot.snapshotPath, { readonly: true });
  try {
    expect(snapshot.counts.projects).toBe(1);
    expect(db.prepare("SELECT name FROM projects").all()).toEqual([{ name: "Portable demo" }]);
    expect(db.prepare("SELECT card_id FROM card_personas").all()).toEqual([{ card_id: data.card.id }]);
    expect(db.prepare("SELECT entity_type, entity_id, external_id FROM external_refs ORDER BY entity_type").all()).toEqual([
      { entity_type: "card", entity_id: data.card.id, external_id: "included" },
      { entity_type: "persona", entity_id: data.persona.id, external_id: "persona-included" },
      { entity_type: "release", entity_id: data.release.id, external_id: "release-included" }
    ]);
    expect(db.prepare("SELECT card_id FROM card_versions WHERE card_id = ?").all(data.deleted.id)).not.toHaveLength(0);
    expect(db.prepare("SELECT project_id FROM activity_events").all().every((row) => (row as { project_id: string; }).project_id === data.project.id)).toBe(true);
    expect(db.prepare("SELECT * FROM activity_events WHERE project_id IS NULL").all()).toEqual([]);
    expect(readFileSync(snapshot.snapshotPath).includes(Buffer.from("excluded-runtime-host"))).toBe(false);
    for (const table of redactedTables) expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    for (const table of archiveBusinessTables) expect(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).toEqual(business[table]);
    expect(db.prepare("SELECT * FROM activity_events WHERE project_id = ? AND affected_entity_type NOT IN ('connectorConnection', 'remoteWorkItemLink', 'githubLink', 'syncRun', 'syncConflict', 'githubDryRun', 'remotePushPlan', 'remotePushExecution', 'cardReview') ORDER BY id").all(data.project.id)).toEqual(activity);
    expect(db.prepare("SELECT actor, actor_type, mcp_session_id FROM card_versions WHERE actor_type = 'agent'").all()).toContainEqual({ actor: archiveDemoActor.actorId, actor_type: archiveDemoActor.actorType, mcp_session_id: archiveDemoActor.mcpSessionId });
    for (const secret of archiveDemoSecrets) expect(readFileSync(snapshot.snapshotPath).includes(Buffer.from(secret))).toBe(false);
  } finally { db.close(); rmSync(snapshot.snapshotPath); }
}
