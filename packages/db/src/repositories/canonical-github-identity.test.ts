import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { externalRefDeletedEvidenceSchema, workItemSyncBaselineSchema, type ChangeOperation } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, createRedactedSnapshot, restoreProject } from "@storymapper/db";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";

const ACTOR = { actorType: "human", actorId: "canonical-identity-fixture" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));

it("preserves one canonical field disagreement across repeated creation, reopen and Restore", async () => {
  const data = fixture();
  const ref = issue(data);
  const seeded = data.uow.run(ACTOR, ({ repository }) => {
    repository.upsertRemoteWorkItemLink({ externalRefId: ref.id, connectionId: data.connections[0]!.id, labels: [] });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connections[0]!.id, mode: "sync", status: "applied" });
    const input = { externalRefId: ref.id, syncRunId: run.id, connectionId: data.connections[0]!.id, cardId: data.card.id, remoteId: "1", field: "title" as const, localValue: "Reviewed local", remoteValue: "Reviewed remote" };
    return { input, conflict: repository.createSyncConflict(input) };
  });
  const repeated = () => data.uow.run(ACTOR, ({ repository }) => repository.createSyncConflict({ ...seeded.input, localValue: "New local", remoteValue: "New remote" }));
  expect(repeated()).toEqual(seeded.conflict);
  const row = data.handle.current.$client.prepare("SELECT * FROM sync_conflicts WHERE id = ?").get(seeded.conflict.id) as Record<string, unknown>;
  const columns = Object.keys(row);
  expect(() => data.handle.current.$client.prepare(`INSERT INTO sync_conflicts (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => column === "id" ? randomUUID() : row[column]))).toThrow(/UNIQUE/);
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.createSyncConflict({ ...seeded.input, connectionId: data.connections[1]!.id }))).toThrow(/disagree/);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(repeated()).toEqual(seeded.conflict);
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(ACTOR, ({ repository }) => repository.resolveSyncConflict(seeded.conflict.id, "remote"));
  expect(data.read.getSyncConflict(seeded.conflict.id)?.status).toBe("resolved-remote");
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(repeated()).toEqual(seeded.conflict);
  expect(data.read.getWorkItemSyncHealthData(data.map.id).openConflicts).toEqual([seeded.conflict]);
  data.uow.run(ACTOR, ({ repository }) => repository.updateConnectorConnection(data.connections[0]!.id, { owner: "retargeted" }));
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.resolveSyncConflict(seeded.conflict.id, "remote"))).toThrow(/disagree/);
  expect(data.read.getSyncConflict(seeded.conflict.id)).toEqual(seeded.conflict);
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-canonical-github-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const read = new StoryMapperRepository(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const roots = uow.run(ACTOR, ({ repository }) => {
    const project = repository.createProject({ name: "Canonical identity" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, title: "Issue owner", level: "activity" });
    const release = repository.createRelease({ storyMapId: map.id, name: "Release" });
    const connections = ["First", "Second"].map((name) => repository.createConnectorConnection({ projectId: project.id, name, provider: "github", authMode: "token", owner: "fixture", repository: "repo" }));
    return { project, map, card, release, connections };
  });
  return { ...roots, path, handle, uow, read };
}

function issue(data: ReturnType<typeof fixture>, number = 1) {
  return data.uow.run(ACTOR, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "fixture/repo", issueNumber: number, url: `https://github.com/fixture/repo/issues/${number}` }));
}

function persistOperations(data: ReturnType<typeof fixture>, operations: ChangeOperation[]): void {
  data.uow.run(ACTOR, ({ repository }) => {
    const snapshot = repository.getOperationSnapshot(data.project.id);
    const resolution = resolveOperations(snapshot, operations, repository.prepareOperationSupply(operations, snapshot));
    repository.persistOperationResolution(resolution, data.project.id);
  });
}

it("keeps one canonical Issue owner and one sync association across two connections", () => {
  const data = fixture();
  const ref = issue(data);
  const first = data.uow.run(ACTOR, ({ repository }) => repository.upsertRemoteWorkItemLink({ externalRefId: ref.id, connectionId: data.connections[0]!.id, labels: [] }));
  const before = data.handle.current.$client.serialize();
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.upsertRemoteWorkItemLink({ externalRefId: ref.id, connectionId: data.connections[1]!.id, labels: [] }))).toThrow(/another connection/);
  expect(() => data.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: data.map.id, title: "Duplicate owner", level: "story" });
    repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connections[1]!.id, provider: "github", remoteId: "1", url: ref.url, labels: [] });
  })).toThrow(/bound/);
  expect(data.handle.current.$client.serialize().equals(before)).toBe(true);
  expect(data.read.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([first]);
  expect(data.read.listExternalRefsForStoryMap(data.map.id).filter((entry) => entry.system === "github")).toHaveLength(1);
});

it("refuses generic mutation and deletion of adapter-owned canonical refs", () => {
  const data = fixture();
  const ref = issue(data);
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.setExternalRef({ entityType: "card", entityId: data.card.id, system: "github", externalId: ref.url }))).toThrow(/reserved/);
  const before = data.read.getOperationSnapshot(data.project.id);
  expect(() => resolveOperations(before, [{ operationId: "generic-delete", entity: "externalRef", op: "delete", entityId: ref.id, after: {} }],
    { createdAt: new Date().toISOString(), ids: {}, externalRefIds: {}, creationOrigin: "manual" })).toThrow(/reserved/);
  expect(data.read.getOperationSnapshot(data.project.id)).toEqual(before);
});

it("atomically records typed entity-deletion evidence and excludes undone or live-equivalent events", () => {
  const data = fixture();
  const ref = issue(data);
  data.handle.current.$client.exec("CREATE TRIGGER reject_deletion_evidence BEFORE INSERT ON activity_events WHEN NEW.action = 'externalRef.deleted' BEGIN SELECT RAISE(ABORT, 'reject deletion evidence'); END");
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.deleteCard(data.card.id, { strategy: "unassign" }))).toThrow("reject deletion evidence");
  expect(data.read.getGitHubLink(ref.id)).toMatchObject({ url: ref.url });
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([]);
  data.handle.current.$client.exec("DROP TRIGGER reject_deletion_evidence");
  data.uow.run(ACTOR, ({ repository }) => repository.deleteCard(data.card.id, { strategy: "unassign" }));
  const [evidence] = data.read.listDeletedGitHubRefs(data.project.id, data.map.id);
  expect(externalRefDeletedEvidenceSchema.parse(evidence)).toMatchObject({ reason: "entity-deleted", entityType: "card", entityId: data.card.id, projectId: data.project.id, storyMapId: data.map.id, before: { id: ref.id, system: "github", externalId: ref.url } });
  expect(data.read.listDeletedGitHubRefs(randomUUID())).toEqual([]);
  expect(data.read.listDeletedGitHubRefs(data.project.id, randomUUID())).toEqual([]);
  const replacement = data.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: data.map.id, title: "Explicit replacement owner", level: "story" });
    return repository.createGitHubLink({ cardId: card.id, repo: "fixture/repo", issueNumber: 1, url: ref.url });
  });
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([]);
  data.uow.run(ACTOR, ({ repository }) => repository.deleteGitHubLink(replacement.id));
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([evidence]);
  data.handle.current.$client.prepare("UPDATE activity_events SET undone_by_restore = 1 WHERE action = 'externalRef.deleted'").run();
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([]);
});

it("does not record entity deletion for source detach, canonical rebind, park or archive", () => {
  const data = fixture();
  const ref = issue(data);
  data.uow.run(ACTOR, ({ repository }) => {
    const citing = repository.createCard({ storyMapId: data.map.id, title: "Citation", level: "story" });
    const source = repository.createCardSourceLink(citing.id, { kind: "github", externalRefId: ref.id })!;
    repository.deleteCardSourceLink(citing.id, { kind: "github", id: source.id });
    repository.updateGitHubLink(ref.id, { issueNumber: 2, url: "https://github.com/fixture/repo/issues/2" });
    repository.parkCard(data.card.id, { childStrategy: "unassign" });
    repository.archiveCard(data.card.id);
    repository.deleteGitHubLink(ref.id);
  });
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([]);
  expect(data.read.listActivity(data.project.id).filter((event) => event.action === "externalRef.deleted")).toEqual([]);
});

it.each(["direct", "executor"] as const)("versions and audits removed-map citation roots on %s canonical edit and hard deletion", (mode) => {
  const data = fixture();
  const ref = issue(data);
  const citing = data.uow.run(ACTOR, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Removed map" });
    const card = repository.createCard({ storyMapId: map.id, title: "Retained citation", level: "story" });
    repository.createCardSourceLink(card.id, { kind: "github", externalRefId: ref.id });
    repository.deleteStoryMap(map.id);
    return card;
  });
  const stored = () => data.handle.current.$client.prepare("SELECT version, provenance FROM cards WHERE id = ?").get(citing.id) as { version: number; provenance: string };
  const initial = stored().version;
  if (mode === "direct") data.uow.run(ACTOR, ({ repository }) => repository.updateGitHubLink(ref.id, { issueNumber: 2, url: "https://github.com/fixture/repo/issues/2" }));
  else persistOperations(data, [{ operationId: "edit", entity: "githubExternalRef", op: "update", entityId: ref.id, after: { entityType: "card", entityId: data.card.id, scopeId: data.map.id, externalId: "https://github.com/fixture/repo/issues/2" } }]);
  expect(stored()).toEqual({ version: initial + 1, provenance: "linked" });
  if (mode === "direct") data.uow.run(ACTOR, ({ repository }) => repository.deleteCard(data.card.id, { strategy: "unassign" }));
  else persistOperations(data, [{ operationId: "delete", entity: "card", op: "delete", entityId: data.card.id, after: { strategy: "unassign" } }]);
  expect(stored()).toEqual({ version: initial + 2, provenance: "manual" });
  const history = data.handle.current.$client.prepare("SELECT actor, snapshot_json FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1").get(citing.id) as { actor: string; snapshot_json: string };
  expect(history.actor).toBe(ACTOR.actorId);
  expect(JSON.parse(history.snapshot_json)).toMatchObject({ version: initial + 2, provenance: "manual" });
  expect(data.read.listActivity(data.project.id).filter((event) => event.affectedEntityId === citing.id && event.action === "card.sourceEvidence.updated")).toHaveLength(2);
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toHaveLength(1);
  expect(data.read.getCard(citing.id)).toBeUndefined();
});

it("copies Release-owned Issue evidence without sync ownership and reopens the populated current schema intact", () => {
  const data = fixture();
  const active = issue(data, 2);
  const source = data.uow.run(ACTOR, ({ repository }) => {
    repository.upsertRemoteWorkItemLink({ externalRefId: active.id, connectionId: data.connections[0]!.id, labels: [] });
    const ref = repository.createGitHubLink({ releaseId: data.release.id, repo: "fixture/repo", issueNumber: 1, url: "https://github.com/fixture/repo/issues/1" });
    repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: ref.id });
    return ref;
  });
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.upsertRemoteWorkItemLink({ externalRefId: source.id, connectionId: data.connections[0]!.id, labels: [] }))).toThrow(/Card Issue or Release Milestone/);
  const target = randomUUID();
  data.uow.run(ACTOR, ({ repository }) => copyStoryMap.call(repository, data.map.id, "Provenance copy", target));
  const copied = data.read.getStoryMapSnapshot(target)!;
  expect(copied.githubLinks).toHaveLength(2);
  expect(copied.remoteWorkItemLinks).toEqual([]);
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.createWorkItemPushPlan({ storyMapId: target, connectionId: data.connections[0]!.id, mode: "push", localOrigin: "http://127.0.0.1:4317" }))).toThrow(/source-only/i);
  expect(copied.sourceLinks.filter((link) => link.kind === "github")).toHaveLength(2);
  expect(copied.externalRefs.every((ref) => ref.system !== "github" || ref.id !== source.id && ref.id !== active.id)).toBe(true);
  data.uow.run(ACTOR, ({ repository }) => repository.deleteRelease(data.release.id));
  expect(data.read.getStoryMapSnapshot(target)!.sourceLinks).toEqual(copied.sourceLinks);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(data.read.getStoryMapSnapshot(target)!.sourceLinks).toEqual(copied.sourceLinks);
  expect(data.handle.current.$client.pragma("foreign_key_check")).toEqual([]);
  expect(data.handle.current.$client.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
});


function applyCanonical(data: ReturnType<typeof fixture>, operation: ChangeOperation) {
  return data.uow.run(ACTOR, ({ repository }) => {
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: data.project.id, title: "Reviewed canonical mutation", source: "human", operations: [operation], createdAt: new Date().toISOString() });
    repository.updateChangeSetStatus(proposal.id, "approved");
    return repository.applyChangeSet(proposal.id)!;
  });
}

it("uses the old owner's baseline for a different-version rebind and keeps identical updates free of root/history writes", () => {
  const data = fixture();
  const ref = issue(data);
  const destination = data.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Destination" }));
  const oldOwner = data.read.getCard(data.card.id)!;
  expect(oldOwner.version).not.toBe(destination.version);
  const noop: ChangeOperation = { operationId: "noop", entity: "githubExternalRef", op: "update", entityId: ref.id, baseVersion: oldOwner.version, after: { entityType: "card", entityId: oldOwner.id, scopeId: data.map.id, externalId: ref.url } };
  const history = data.read.listCardHistory(data.card.id);
  const state = data.read.getOperationSnapshot(data.project.id);
  expect(resolveOperations(state, [noop], data.read.prepareOperationSupply([noop], state)).operations[0]).toMatchObject({ status: "unchanged", changes: [] });
  applyCanonical(data, noop);
  data.uow.run(ACTOR, ({ repository }) => repository.updateGitHubLink(ref.id, { url: ref.url }));
  expect(data.read.getCard(data.card.id)).toEqual(oldOwner);
  expect(data.read.listCardHistory(data.card.id)).toEqual(history);
  expect(() => applyCanonical(data, { ...noop, baseVersion: oldOwner.version - 1 })).toThrow("conflicts with newer changes");
  applyCanonical(data, { ...noop, operationId: "rebind", after: { ...noop.after, entityId: destination.id } });
  expect(data.read.getGitHubLink(ref.id)?.cardId).toBe(destination.id);
  expect(data.read.getCard(oldOwner.id)?.version).toBe(oldOwner.version + 1);
  expect(data.read.getCard(destination.id)?.version).toBe(destination.version + 1);
});

it.each(["direct-rebind", "direct-detach", "executor-rebind", "executor-detach"] as const)("retires only obsolete open conflicts with attributed audit for %s", (mode) => {
  const data = fixture();
  const ref = issue(data);
  const seeded = data.uow.run(ACTOR, ({ repository }) => {
    repository.upsertRemoteWorkItemLink({ externalRefId: ref.id, connectionId: data.connections[0]!.id, labels: [] });
    const other = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Other issue" });
    repository.bindRemoteWorkItemLink({ cardId: other.id, provider: "github", connectionId: data.connections[0]!.id, remoteId: "9", url: "https://github.com/fixture/repo/issues/9", labels: [] });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connections[0]!.id, mode: "sync", status: "applied" });
    const common = { externalRefId: ref.id, syncRunId: run.id, connectionId: data.connections[0]!.id, cardId: data.card.id, remoteId: "1", localValue: "Local", remoteValue: "Remote" };
    const obsolete = repository.createSyncConflict({ ...common, field: "title" });
    const closed = repository.createSyncConflict({ ...common, field: "description" });
    repository.resolveSyncConflict(closed.id, "remote");
    const unrelated = repository.createSyncConflict({ ...common, externalRefId: repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId === other.id)!.externalRefId, cardId: other.id, remoteId: "9", field: "title" });
    return { obsolete, closed: repository.getSyncConflict(closed.id)!, unrelated };
  });
  if (mode.startsWith("direct")) data.uow.run(ACTOR, ({ repository }) => mode.endsWith("rebind") ? repository.updateGitHubLink(ref.id, { url: "https://github.com/fixture/repo/issues/2" }) : repository.deleteGitHubLink(ref.id));
  else applyCanonical(data, mode.endsWith("rebind")
    ? { operationId: "rebind", entity: "githubExternalRef", op: "update", entityId: ref.id, baseVersion: data.read.getCard(data.card.id)!.version, after: { entityType: "card", entityId: data.card.id, scopeId: data.map.id, externalId: "https://github.com/fixture/repo/issues/2" } }
    : { operationId: "detach", entity: "githubExternalRef", op: "delete", entityId: ref.id, baseVersion: data.read.getCard(data.card.id)!.version, after: {} });
  expect(data.read.getSyncConflict(seeded.obsolete.id)).toBeUndefined();
  expect(data.read.getSyncConflict(seeded.closed.id)).toEqual(seeded.closed);
  expect(data.read.getSyncConflict(seeded.unrelated.id)).toEqual(seeded.unrelated);
  const event = data.read.listActivity(data.project.id).find((entry) => entry.action === "syncConflict.retired" && entry.affectedEntityId === seeded.obsolete.id)!;
  expect(event).toMatchObject({ actor: ACTOR.actorId, actorType: ACTOR.actorType, before: seeded.obsolete, after: { reason: "identity-changed", externalRefId: ref.id } });
  expect(data.read.listActivity(data.project.id).filter((entry) => entry.action === "syncConflict.retired")).toHaveLength(1);
  expect(data.read.listDeletedGitHubRefs(data.project.id)).toEqual([]);
});

it("persists distinct acknowledged and observed sync fields through executor, populated reopen and Restore, while redacting portable copies", async () => {
  const data = fixture();
  const ref = issue(data);
  const baseline = workItemSyncBaselineSchema.parse({
    pendingReleaseAssignment: true,
    acknowledgedLocal: { releaseMetadata: null, titleHash: "local-title", bodyHash: "local-body", remoteState: "open", statusLabels: ["ready"], annotationLabels: ["existing-label"], releaseId: null, milestone: null },
    observedRemote: { releaseMetadata: { name: "Remote", goal: "Remote authored goal", released: true, startDate: null, releaseDate: "2026-11-01" }, titleHash: "remote-title", bodyHash: "remote-body", remoteState: "closed", statusLabels: ["finished"], annotationLabels: [], milestone: "https://github.com/fixture/repo/milestone/1" }
  });
  persistOperations(data, [{ operationId: "baseline", entity: "remoteWorkItemLink", op: "set", after: { externalRefId: ref.id, connectionId: data.connections[0]!.id, baseline, labels: [], syncState: "unsynced", parentOverrideLocal: false } }]);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(data.read.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.baseline).toEqual(baseline);
  const point = createRestorePoint(data.handle, "manual");
  const updated = structuredClone(baseline);
  updated.acknowledgedLocal.releaseId = data.release.id;
  data.uow.run(ACTOR, ({ repository }) => repository.upsertRemoteWorkItemLink({ externalRefId: ref.id, connectionId: data.connections[0]!.id, baseline: updated, labels: [], syncState: "synced" }));
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(data.read.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.baseline).toEqual(baseline);
  const portable = createRedactedSnapshot(data.path, data.project.id);
  const redacted = new Database(portable.snapshotPath, { readonly: true });
  try {
    expect(redacted.prepare("SELECT count(*) AS count FROM remote_work_item_links").get()).toEqual({ count: 0 });
    expect(JSON.stringify(redacted.prepare("SELECT before_json, after_json FROM activity_events").all())).not.toContain("remote-title");
  } finally { redacted.close(); rmSync(portable.snapshotPath); }
});
