import { splitTextIntoChunks } from "@storymapper/importers";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRoadmapDetails, resolveOperations } from "@storymapper/core";
import { hashText } from "@storymapper/db/repositories/repository-values";
import type { ActorContext, ChangeOperation } from "@storymapper/contracts";
import { DatabaseHandle } from "@storymapper/db/database-handle";
import { openStoryMapperDb, type SqliteDatabase } from "@storymapper/db/connection";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import * as schema from "@storymapper/db/schema";
import { UnitOfWork, type TransactionRepositories } from "@storymapper/db/unit-of-work";

const ACTOR: ActorContext = { actorType: "agent", actorId: "version-agent", mcpSessionId: "session-one" };
const BASE_TIME = Date.parse("2026-10-04T10:00:00.000Z");
const ROOT_TABLES = ["story_maps", "cards", "releases", "personas", "roadmaps"];
const cleanup: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) close();
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-root-versions-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const hook = vi.fn();
  const unitOfWork = new UnitOfWork(handle, hook);
  const repository = new StoryMapperRepository(handle);
  const roots = unitOfWork.run({ actorType: "system", actorId: "fixture" }, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Version fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release" });
    const persona = tx.createPersona({ projectId: project.id, name: "Reader" });
    const annotation = tx.createAnnotation({ projectId: project.id, name: "Risk" });
    const card = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity", releaseId: release.id });
    const second = tx.createCard({ storyMapId: map.id, level: "activity", title: "Second", releaseId: release.id });
    const roadmap = tx.createRoadmap({ projectId: project.id, storyMapId: map.id, name: "Roadmap" });
    const column = buildRoadmapDetails(tx.getRoadmapDetailsData(roadmap.id))!.columns[0]!;
    const roadmapCard = tx.createRoadmapCard({ roadmapId: roadmap.id, columnId: column.id, title: "Plan" });
    const content = "Required story behavior.";
    const { chunks } = tx.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: project.id, title: "Requirements", type: "txt", content, fileHash: hashText(content) });
    const chunk = chunks[0]!;
    return { project, map, release, persona, annotation, card, second, roadmap, roadmapCard, chunk };
  });
  hook.mockClear();
  return { ...roots, database, hook, unitOfWork, repository };
}

type Fixture = ReturnType<typeof fixture>;
type TxRepository = TransactionRepositories["repository"];
type RootName = "map" | "card" | "release" | "persona" | "roadmap";

function versions(data: Fixture): Record<RootName, number> {
  return {
    map: data.repository.getStoryMapSnapshot(data.map.id)!.storyMap.version,
    card: data.repository.getCardDetails(data.card.id)!.version,
    release: data.repository.listReleases(data.map.id).find((root) => root.id === data.release.id)!.version,
    persona: data.repository.listPersonas(data.project.id).find((root) => root.id === data.persona.id)!.version,
    roadmap: buildRoadmapDetails(data.repository.getRoadmapDetailsData(data.roadmap.id))!.roadmap.version
  };
}

function databaseState(database: SqliteDatabase): unknown {
  const tables = database.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all() as Array<{ name: string }>;
  return tables.map(({ name }) => [name, database.$client.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]);
}

function latestHistory(data: Fixture, cardId = data.card.id) {
  const row = data.database.$client.prepare("SELECT version, actor, actor_type, mcp_session_id, snapshot_json, created_at FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1").get(cardId) as {
    version: number; actor: string; actor_type: string; mcp_session_id: string | null; snapshot_json: string; created_at: string;
  };
  return { ...row, snapshot: JSON.parse(row.snapshot_json) as { version: number; title: string; releaseId: string | null } };
}

const mutationCases: Array<{ name: string; owner: RootName; mutate: (tx: TxRepository, data: Fixture) => unknown }> = [
  { name: "map fields and owned Product Context", owner: "map", mutate: (tx, data) => {
    tx.updateStoryMap(data.map.id, { name: "Edited map" });
    tx.updateStoryMap(data.map.id, { description: "Edited description" });
    tx.upsertProductContext({ projectId: data.project.id, storyMapId: data.map.id, purpose: "Map purpose" });
  } },
  { name: "map-scoped Product Context alone", owner: "map", mutate: (tx, data) => tx.upsertProductContext({ projectId: data.project.id, storyMapId: data.map.id, purpose: "Map purpose" }) },
  { name: "Card fields and owned links", owner: "card", mutate: (tx, data) => {
    tx.bulkUpdateCards({ storyMapId: data.map.id, cardIds: [data.card.id], patch: { status: "active", addPersonaId: data.persona.id, addAnnotationId: data.annotation.id } });
    tx.createCardAttachment(data.card.id, { label: "Evidence", filePath: "evidence.txt" });
    tx.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.chunk.id });
  } },
  { name: "Card explicit save twice", owner: "card", mutate: (tx, data) => {
    tx.updateCard(data.card.id, { title: "Edited title" });
    tx.updateCard(data.card.id, { description: "Final description" });
  } },
  { name: "Card archive", owner: "card", mutate: (tx, data) => tx.archiveCard(data.card.id) },
  { name: "Card park and unpark", owner: "card", mutate: (tx, data) => {
    tx.parkCard(data.card.id, { childStrategy: "unassign" });
    tx.unparkCard(data.card.id);
  } },
  { name: "Release fields twice", owner: "release", mutate: (tx, data) => {
    tx.updateRelease(data.release.id, { name: "Edited release" });
    tx.updateRelease(data.release.id, { goal: "Edited goal" });
  } },
  { name: "Persona fields twice", owner: "persona", mutate: (tx, data) => {
    tx.updatePersona(data.persona.id, { name: "Edited persona" });
    tx.updatePersona(data.persona.id, { goals: ["Read stories"] });
  } },
  { name: "Roadmap fields and every owned child", owner: "roadmap", mutate: (tx, data) => {
    tx.updateRoadmap(data.roadmap.id, { name: "Edited roadmap" });
    const column = tx.createRoadmapColumn({ roadmapId: data.roadmap.id, name: "Future" });
    const swimlane = tx.createRoadmapSwimlane({ roadmapId: data.roadmap.id, name: "Team" });
    const card = tx.createRoadmapCard({ roadmapId: data.roadmap.id, columnId: column.id, swimlaneId: swimlane.id, title: "Next plan" });
    tx.createRoadmapReference({ roadmapCardId: card.id, targetType: "card", targetId: data.card.id });
  } }
];

describe("editable root version ownership", () => {
  it("creates all five roots at version one, including initialized Roadmap children", () => {
    const data = fixture();
    expect(versions(data)).toEqual({ map: 1, card: 1, release: 1, persona: 1, roadmap: 1 });
    for (const root of [data.map, data.card, data.release, data.persona, data.roadmap]) expect(root.version).toBe(1);
    expect(buildRoadmapDetails(data.repository.getRoadmapDetailsData(data.roadmap.id))).toMatchObject({ columns: expect.any(Array), cards: [expect.objectContaining({ id: data.roadmapCard.id })] });
    expect(latestHistory(data)).toMatchObject({ version: 1, snapshot: { version: 1 } });
  });

  it.each(mutationCases)("increments only the owner once for $name", ({ owner, mutate }) => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => mutate(repository, data));
    expect(versions(data)).toEqual({ map: 1, card: 1, release: 1, persona: 1, roadmap: 1, [owner]: 2 });
    expect(data.hook).toHaveBeenCalledOnce();
    if (owner === "card") {
      expect(data.repository.listCardHistory(data.card.id).map((version) => version.version)).toEqual([1, 2]);
      expect(latestHistory(data).snapshot).toEqual(data.repository.getCardDetails(data.card.id));
    }
  });

  it("leaves root versions unchanged for project Product Context and Customization", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.upsertProductContext({ projectId: data.project.id, purpose: "Project purpose" });
      repository.updateAnnotation(data.annotation.id, { name: "Updated risk" });
      repository.createWorkflowStatus({ projectId: data.project.id, storyMapId: data.map.id, name: "review", group: "active" });
    });
    expect(versions(data)).toEqual({ map: 1, card: 1, release: 1, persona: 1, roadmap: 1 });
  });

  it("preserves version one when new aggregates receive initial owned content in their creation UoW", testPreservesVersionOneWhenNewAggregatesReceiveInitialOwnedContentIn);

  it("bumps the moved Card only while sibling positions change", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.moveCard(data.second.id, { parentId: null, position: 0 }));
    expect(data.repository.getCardDetails(data.second.id)).toMatchObject({ position: 0, version: 2 });
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ position: 1, version: 1 });
    expect(data.repository.getStoryMapSnapshot(data.map.id)!.storyMap.version).toBe(1);
    expect(latestHistory(data, data.second.id).snapshot).toEqual(data.repository.getCardDetails(data.second.id));
  });

  it("bumps each changed Release once while leaving unchanged lanes and Cards alone", testBumpsEachChangedReleaseOnceWhileLeavingUnchangedLanesAndCards);
});

describe("owned link versions", () => {
  it("does not increment Card or Roadmap versions for duplicate links", () => {
    const data = fixture();
    const add = (repository: TxRepository) => {
      repository.setCardPersona(data.card.id, data.persona.id);
      repository.setCardAnnotation(data.card.id, data.annotation.id);
      repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.chunk.id });
      repository.createRoadmapReference({ roadmapCardId: data.roadmapCard.id, targetType: "card", targetId: data.card.id });
    };
    data.unitOfWork.run(ACTOR, ({ repository }) => add(repository));
    const before = databaseState(data.database);
    data.unitOfWork.run(ACTOR, ({ repository }) => add(repository));
    expect(databaseState(data.database)).toEqual(before);
    expect(versions(data)).toEqual({ map: 1, card: 2, release: 1, persona: 1, roadmap: 2 });
  });

  it("versions the Card once when removing all its owned links", () => {
    const data = fixture();
    const attachment = data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.setCardPersona(data.card.id, data.persona.id);
      repository.setCardAnnotation(data.card.id, data.annotation.id);
      repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.chunk.id });
      return repository.createCardAttachment(data.card.id, { label: "Evidence", filePath: "evidence.txt" })!;
    });
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      expect(repository.deleteCardPersona(data.card.id, data.persona.id)).toBe(true);
      expect(repository.deleteCardAnnotation(data.card.id, data.annotation.id)).toBe(true);
      expect(repository.deleteCardSourceLink(data.card.id, { kind: "chunk", id: repository.listSourceLinksForStoryMap(data.map.id).find((link) => link.kind === "chunk" && link.chunkId === data.chunk.id)!.id })).toBe(true);
      expect(repository.deleteCardAttachment(data.card.id, attachment.id)).toBe(true);
    });
    expect(versions(data)).toEqual({ map: 1, card: 3, release: 1, persona: 1, roadmap: 1 });
    expect(latestHistory(data)).toMatchObject({ version: 3, snapshot: { version: 3 } });
  });
});

const coalescingCases: Array<{ name: string; elapsed: number; actor: ActorContext; coalesced: boolean }> = [
  { name: "same actor at the same instant", elapsed: 0, actor: ACTOR, coalesced: true },
  { name: "same actor inside the window", elapsed: 59_999, actor: ACTOR, coalesced: true },
  { name: "same actor at sixty seconds", elapsed: 60_000, actor: ACTOR, coalesced: true },
  { name: "same actor outside the window", elapsed: 60_001, actor: ACTOR, coalesced: false },
  { name: "clock moves backward", elapsed: -1, actor: ACTOR, coalesced: false },
  { name: "different actor id at the same instant", elapsed: 0, actor: { ...ACTOR, actorId: "other-agent" }, coalesced: false },
  { name: "different actor type at the same instant", elapsed: 0, actor: { ...ACTOR, actorType: "human" }, coalesced: false },
  { name: "different session", elapsed: 1, actor: { ...ACTOR, mcpSessionId: "session-two" }, coalesced: false },
  { name: "session omitted", elapsed: 1, actor: { actorType: "agent", actorId: ACTOR.actorId }, coalesced: false }
];

describe("Card explicit-save coalescing", () => {
  registerPreservesASDependencyHistoryBoundaryBeforeCoalescingConsecutive();

  it("retains the dependency marker through same-version writes and database reopening", testRetainsTheDependencyMarkerThroughSameVersionWritesAndDatabaseReopening);

  registerRefusesSchemaDriftThatRemovesDependencyHistoryMetadata();

  registerHandlesName();

  it("measures against the latest coalesced save time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    for (const elapsed of [0, 50_000, 100_000]) {
      vi.setSystemTime(BASE_TIME + elapsed);
      data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: `Save ${elapsed}` }));
    }
    expect(data.repository.listCardHistory(data.card.id).map((item) => item.version)).toEqual([1, 4]);
    expect(latestHistory(data)).toMatchObject({ version: 4, created_at: new Date(BASE_TIME + 100_000).toISOString(), snapshot: { title: "Save 100000", version: 4 } });
  });

  it("gives a stale baseline no match after a coalesced save by the same actor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    const baseline = data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "First save" })!).version;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Coalesced save" }));
    const current = data.repository.getCardDetails(data.card.id)!;
    expect(current.version).toBeGreaterThan(baseline);
    expect(latestHistory(data).version).toBe(current.version);
  });

  it("keeps structural and owned-link mutations as separate versions inside the save window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Save" }));
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.moveCard(data.card.id, { parentId: null, position: 1 }));
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.setCardPersona(data.card.id, data.persona.id));
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteRelease(data.release.id));
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ version: 5, releaseId: null });
    expect(data.repository.listCardHistory(data.card.id).map((item) => item.version)).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserves each save's independent audit before and after content within one UoW", testPreservesEachSaveSIndependentAuditBeforeAndAfterContentWithin);

  it("returns the committed version after a coalesced save and structural action share a UoW", testReturnsTheCommittedVersionAfterACoalescedSaveAndStructuralAction);

  it("returns the durable deletion version after a coalesced save and delete share a UoW", testReturnsTheDurableDeletionVersionAfterACoalescedSaveAndDelete);
});

describe("explicit root reference cleanup", () => {
  it.each(["persona", "annotation"] as const)("unlinks a deleted %s and versions every affected Card", (kind) => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      for (const card of [data.card, data.second]) {
        if (kind === "persona") repository.setCardPersona(card.id, data.persona.id);
        else repository.setCardAnnotation(card.id, data.annotation.id);
      }
    });
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      expect(kind === "persona" ? repository.deletePersona(data.persona.id, { definitionBefore: repository.getPersona(data.persona.id)!, affectedCards: [data.card, data.second].filter((card) => repository.listCardPersonasForStoryMap(data.map.id).some((link) => link.cardId === card.id && link.personaId === data.persona.id)).map((card) => ({ id: card.id, baseVersion: repository.getCardDetails(card.id)!.version })), confirmUnlink: true }) : repository.deleteAnnotation(data.annotation.id, { definitionBefore: data.annotation, affectedCards: [data.card, data.second].filter((card) => repository.listCardAnnotationsForStoryMap(data.map.id).some((link) => link.cardId === card.id && link.annotationId === data.annotation.id)).map((card) => ({ id: card.id, baseVersion: repository.getCardDetails(card.id)!.version })), confirmUnlink: true })).toBe(true);
    });
    for (const card of [data.card, data.second]) expect(data.repository.getCardDetails(card.id)!.version).toBe(3);
    expect(data.database.$client.prepare(`SELECT * FROM card_${kind === "persona" ? "personas" : "annotations"}`).all()).toEqual([]);
    expect(data.repository.getStoryMapSnapshot(data.map.id)!.storyMap.version).toBe(1);
  });

  it("unassigns every physical Card on Release deletion, including hidden-map Cards", testUnassignsEveryPhysicalCardOnReleaseDeletionIncludingHiddenMapCards);

  it("clears connector defaults on both visible and hidden maps explicitly", testClearsConnectorDefaultsOnBothVisibleAndHiddenMapsExplicitly);

  it("hides retained deleted Card history when its Story Map is subsequently hidden", testHidesRetainedDeletedCardHistoryWhenItsStoryMapIsSubsequently);

  it("deletes Card-owned children and Sync references while retaining unique final history", testDeletesCardOwnedChildrenAndSyncReferencesWhileRetainingUniqueFinal);
});

describe("atomic version failures", () => {
  it.each(["INSERT", "UPDATE"] as const)("rolls back all tables and notification on Card history %s failure", (operation) => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    if (operation === "UPDATE") data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "First save" }));
    const before = databaseState(data.database);
    data.hook.mockClear();
    data.database.$client.exec(`CREATE TRIGGER reject_history BEFORE ${operation} ON card_versions BEGIN SELECT RAISE(ABORT, 'history rejected'); END`);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Rejected save" }))).toThrow("history rejected");
    expect(databaseState(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });

  it.each(["persona", "annotation", "release", "card", "connector"] as const)("rolls back explicit %s cleanup after its delete fails", (kind) => {
    const data = fixture();
    const connection = data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.setCardPersona(data.card.id, data.persona.id);
      repository.setCardAnnotation(data.card.id, data.annotation.id);
      const connection = repository.createConnectorConnection({ projectId: data.project.id, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
      repository.updateStoryMap(data.map.id, { defaultConnectionId: connection.id });
      return connection;
    });
    const tables = { persona: "personas", annotation: "annotations", release: "releases", card: "cards", connector: "connector_connections" };
    const before = databaseState(data.database);
    data.hook.mockClear();
    data.database.$client.exec(`CREATE TRIGGER reject_cleanup BEFORE DELETE ON ${tables[kind]} BEGIN SELECT RAISE(ABORT, 'delete rejected'); END`);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => {
      if (kind === "persona") repository.deletePersona(data.persona.id, { definitionBefore: repository.getPersona(data.persona.id)!, affectedCards: [data.card, data.second].filter((card) => repository.listCardPersonasForStoryMap(data.map.id).some((link) => link.cardId === card.id && link.personaId === data.persona.id)).map((card) => ({ id: card.id, baseVersion: repository.getCardDetails(card.id)!.version })), confirmUnlink: true });
      else if (kind === "annotation") repository.deleteAnnotation(data.annotation.id, { definitionBefore: data.annotation, affectedCards: [data.card, data.second].filter((card) => repository.listCardAnnotationsForStoryMap(data.map.id).some((link) => link.cardId === card.id && link.annotationId === data.annotation.id)).map((card) => ({ id: card.id, baseVersion: repository.getCardDetails(card.id)!.version })), confirmUnlink: true });
      else if (kind === "release") repository.deleteRelease(data.release.id);
      else if (kind === "card") repository.deleteCard(data.card.id, { strategy: "unassign" });
      else repository.deleteConnectorConnection(connection.id);
    })).toThrow("delete rejected");
    expect(databaseState(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });
});

describe("root schema invariants", () => {
  it("has no runtime or Drizzle automatic deletion affecting either side of a root FK", () => {
    const data = fixture();
    const tables = data.database.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>;
    let rootReferences = 0;
    for (const { name } of tables) {
      const keys = data.database.$client.prepare(`PRAGMA foreign_key_list("${name}")`).all() as Array<{ table: string; on_delete: string }>;
      for (const key of keys.filter((entry) => ROOT_TABLES.includes(name) || ROOT_TABLES.includes(entry.table))) {
        rootReferences++;
        expect(["CASCADE", "SET NULL"], `${name} references ${key.table}`).not.toContain(key.on_delete);
      }
    }
    expect(rootReferences).toBeGreaterThan(0);
    for (const table of Object.values(schema).filter((value) => is(value, SQLiteTable))) {
      const config = getTableConfig(table);
      for (const key of config.foreignKeys) {
        const target = getTableConfig(key.reference().foreignTable).name;
        if (ROOT_TABLES.includes(config.name) || ROOT_TABLES.includes(target)) expect(["cascade", "set null"], `${config.name} references ${target}`).not.toContain(key.onDelete);
      }
    }
  });

  it.each(ROOT_TABLES.flatMap((table) => [0, -1, 1.5, null].map((version) => ({ table, version }))))("rejects invalid $table version $version without changing the row", ({ table, version }) => {
    const data = fixture();
    const rows = data.database.$client.prepare(`SELECT * FROM "${table}" ORDER BY id`);
    const before = rows.all() as Array<{ id: string }>;
    expect(before.length).toBeGreaterThan(0);
    expect(() => data.database.$client.prepare(`UPDATE "${table}" SET version = ? WHERE id = ?`).run(version, before[0]!.id)).toThrow(/(?:CHECK|NOT NULL) constraint failed/);
    expect(rows.all()).toEqual(before);
  });

  it("enforces unique Card/version history independently of repository writes", () => {
    const data = fixture();
    const indexes = data.database.$client.prepare("PRAGMA index_list(card_versions)").all() as Array<{ name: string; unique: number }>;
    const uniqueColumns = indexes.filter((index) => index.unique).map((index) => {
      const columns = data.database.$client.prepare(`PRAGMA index_info("${index.name}")`).all() as Array<{ name: string }>;
      return columns.map((column) => column.name);
    });
    expect(uniqueColumns).toContainEqual(["card_id", "version"]);
    expect(() => data.database.$client.prepare("INSERT INTO card_versions (id, card_id, actor, actor_type, mcp_session_id, version, snapshot_json, created_at) SELECT ?, card_id, actor, actor_type, mcp_session_id, version, snapshot_json, created_at FROM card_versions WHERE card_id = ?").run(randomUUID(), data.card.id)).toThrow(/UNIQUE constraint failed/);
    expect(data.repository.listCardHistory(data.card.id)).toHaveLength(1);
  });
});

it("roundtrips all Card scalar fields and supported clears with increasing versions and coalesced history", () => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  const data = fixture();
  const actor: ActorContext = { actorType: "human", actorId: "field-editor" };
  const patch = { title: "Edited Card", description: "## Acceptance\n\nRequired behavior", status: "active", priority: "custom-priority", businessValue: 7, effort: 3, estimate: 0, color: "#123456", assignee: "Reader", releaseId: data.release.id };
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.card.id, patch));
  expect(data.repository.getCard(data.card.id)).toMatchObject({ ...patch, version: 2 });
  const historyCount = data.repository.listCardHistory(data.card.id).length;
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.card.id, { description: "", assignee: "", priority: "", releaseId: null }));
  expect(data.repository.listCardHistory(data.card.id)).toHaveLength(historyCount);
  const databasePath = (data.database.$client.pragma("database_list") as Array<{ name: string; file: string }>).find((entry) => entry.name === "main")!.file;
  const reopened = openStoryMapperDb(databasePath);
  cleanup.push(() => reopened.$client.close());
  const saved = new StoryMapperRepository(new DatabaseHandle(reopened)).getCard(data.card.id)!;
  expect(saved).toMatchObject({ ...patch, version: 3, description: "", assignee: "", priority: "", releaseId: null });
  expect(latestHistory(data).snapshot).toMatchObject({ version: 3, estimate: 0, description: "", priority: "", releaseId: null });
});

function registerHandlesName() {
  it.each(coalescingCases)("handles $name", ({ elapsed, actor, coalesced }) => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => expect(repository.updateCard(data.card.id, { title: "First save" })!.version).toBe(2));
    vi.setSystemTime(BASE_TIME + elapsed);
    const after = data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.card.id, { title: "Final save", description: "Final description" })!);
    expect(after.version).toBe(3);
    expect(data.repository.listCardHistory(data.card.id).map((item) => item.version)).toEqual(coalesced ? [1, 3] : [1, 2, 3]);
    expect(latestHistory(data)).toMatchObject({ version: 3, actor: actor.actorId, actor_type: actor.actorType, mcp_session_id: actor.mcpSessionId ?? null });
    expect(latestHistory(data).snapshot).toEqual(after);
    expect(data.repository.listCardHistory(data.card.id).at(-1)?.changedFields).toEqual(expect.arrayContaining(["title", "description"]));
    const snapshots = data.repository.listActivity(data.project.id).filter((item) => item.action === "card.updated").map((event) => event.after);
    expect(snapshots).toContainEqual(after);
  });
}

function registerRefusesSchemaDriftThatRemovesDependencyHistoryMetadata() {
  it("refuses schema drift that removes dependency history metadata", () => {
    const data = fixture();
    const databasePath = (data.database.$client.pragma("database_list") as Array<{ name: string; file: string; }>).find((entry) => entry.name === "main")!.file;
    data.database.$client.exec("ALTER TABLE card_versions DROP COLUMN dependency_change");
    expect(() => openStoryMapperDb(databasePath)).toThrow("inconsistent schema");
  });
}

function registerPreservesASDependencyHistoryBoundaryBeforeCoalescingConsecutive() {
  it.each(["set", "unset", "delete", "changeset-set", "changeset-delete", "changeset-update-set"])("preserves a %s dependency history boundary before coalescing consecutive ordinary saves", (action) => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const data = fixture();
    if (action === "unset" || action.endsWith("delete")) data.unitOfWork.run(ACTOR, ({ repository }) => repository.mutateCardDependency(data.card.id, data.second.id, true));
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      if (action.startsWith("changeset-")) {
        const operation: ChangeOperation = action === "changeset-delete"
          ? { operationId: "delete-prerequisite", op: "delete", entity: "card", entityId: data.second.id, after: { strategy: "unassign" } }
          : { operationId: "set-dependency", op: "set", entity: "cardDependency", after: { cardId: { kind: "id", id: data.card.id }, prerequisiteCardId: { kind: "id", id: data.second.id } } };
        const operations: ChangeOperation[] = action === "changeset-update-set"
          ? [{ operationId: "ordinary-update", op: "update", entity: "card", entityId: data.card.id, after: { title: "Proposal save" } }, operation] : [operation];
        const resolution = resolveOperations(repository.getOperationSnapshot(data.project.id), operations, { createdAt: new Date().toISOString(), creationOrigin: "manual", ids: { [operation.operationId]: randomUUID() }, externalRefIds: {} });
        repository.persistOperationResolution(resolution, data.project.id, randomUUID());
      } else if (action === "delete") repository.deleteCard(data.second.id, { strategy: "unassign" });
      else repository.mutateCardDependency(data.card.id, data.second.id, action === "set");
    });
    const dependencyVersion = data.repository.getCard(data.card.id)!.version;
    const boundaryVersions = data.repository.listCardHistory(data.card.id).map((row) => row.version);
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "First ordinary save" }));
    expect(data.repository.listCardHistory(data.card.id).map((row) => row.version)).toEqual([...boundaryVersions, dependencyVersion + 1]);
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Second ordinary save" }));
    expect(data.repository.listCardHistory(data.card.id).map((row) => row.version)).toEqual([...boundaryVersions, dependencyVersion + 2]);
  });
}

function testPreservesVersionOneWhenNewAggregatesReceiveInitialOwnedContentIn() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Initialized" });
    repository.upsertProductContext({ projectId: data.project.id, storyMapId: map.id, purpose: "Initial purpose" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Initialized card" });
    repository.setCardPersona(card.id, data.persona.id);
    repository.setCardAnnotation(card.id, data.annotation.id);
    repository.createCardAttachment(card.id, { label: "Initial attachment", filePath: "initial.txt" });
    expect(repository.getStoryMapSnapshot(map.id)!.storyMap.version).toBe(1);
    expect(repository.getCardDetails(card.id)!.version).toBe(1);
    expect(repository.listCardHistory(card.id)).toMatchObject([{ version: 1, snapshot: { version: 1 } }]);
  });
}

function testBumpsEachChangedReleaseOnceWhileLeavingUnchangedLanesAndCards() {
  const data = fixture();
  const { middle, last } = data.unitOfWork.run(ACTOR, ({ repository }) => ({
    middle: repository.createRelease({ storyMapId: data.map.id, name: "Middle" }),
    last: repository.createRelease({ storyMapId: data.map.id, name: "Last" })
  }));
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateRelease(middle.id, { name: "Moved middle", position: 0 }));
  expect(data.repository.listReleases(data.map.id).map(({ id, position, version }) => ({ id, position, version }))).toEqual([
    { id: middle.id, position: 0, version: 2 }, { id: data.release.id, position: 1, version: 2 }, { id: last.id, position: 2, version: 1 }
  ]);
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ releaseId: data.release.id, version: 1 });
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.storyMap.version).toBe(1);
}

function testRetainsTheDependencyMarkerThroughSameVersionWritesAndDatabaseReopening() {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.mutateCardDependency(data.card.id, data.second.id, true);
    repository.updateCard(data.card.id, { title: "Same transaction save" });
  });
  const databasePath = (data.database.$client.pragma("database_list") as Array<{ name: string; file: string }>).find((entry) => entry.name === "main")!.file;
  const reopened = openStoryMapperDb(databasePath);
  cleanup.push(() => reopened.$client.close());
  const handle = new DatabaseHandle(reopened);
  new UnitOfWork(handle).run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "After reopening" }));
  expect(new StoryMapperRepository(handle).listCardHistory(data.card.id).map((row) => row.version)).toEqual([1, 2, 3]);
  expect(reopened.$client.prepare("SELECT dependency_change FROM card_versions WHERE card_id = ? AND version = 2").get(data.card.id)).toEqual({ dependency_change: 1 });
}

function testPreservesEachSaveSIndependentAuditBeforeAndAfterContentWithin() {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  const data = fixture();
  vi.setSystemTime(BASE_TIME + 1_000);
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Original" }));
  const eventCount = data.repository.listActivity(data.project.id).length;
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    vi.setSystemTime(BASE_TIME + 2_000);
    repository.updateCard(data.card.id, { title: "First" });
    vi.setSystemTime(BASE_TIME + 3_000);
    repository.updateCard(data.card.id, { title: "Second" });
  });
  const committed = data.repository.getCardDetails(data.card.id)!;
  const events = data.repository.listActivity(data.project.id).slice(eventCount);
  expect(events).toMatchObject([
    { action: "card.updated", before: { title: "Original" }, after: { title: "First", version: committed.version } },
    { action: "card.updated", before: { title: "First" }, after: { title: "Second", version: committed.version } }
  ]);
  expect(latestHistory(data).snapshot).toMatchObject({ title: "Second", version: committed.version });
}

function testReturnsTheCommittedVersionAfterACoalescedSaveAndStructuralAction() {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "First save" }));
  const returned = data.unitOfWork.run(ACTOR, ({ repository }) => {
    const save = repository.updateCard(data.card.id, { title: "Final title" })!;
    const move = repository.moveCard(data.card.id, { parentId: null, position: 1 })!;
    return { save, move };
  });
  const committed = data.repository.getCardDetails(data.card.id)!;
  expect(committed).toMatchObject({ version: 3, title: "Final title", position: 1 });
  expect(returned.save).toEqual(committed);
  expect(returned.move).toEqual(committed);
  expect(latestHistory(data).snapshot).toEqual(committed);
  expect(data.repository.listCardHistory(data.card.id).map((item) => item.version)).toEqual([1, 3]);
}

function testReturnsTheDurableDeletionVersionAfterACoalescedSaveAndDelete() {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "First save" }));
  const saved = data.unitOfWork.run(ACTOR, ({ repository }) => {
    const saved = repository.updateCard(data.card.id, { title: "Final saved title" })!;
    expect(repository.deleteCard(data.card.id, { strategy: "unassign" })).toBe(true);
    return saved;
  });
  expect(data.repository.getCardDetails(data.card.id)).toBeUndefined();
  const retained = latestHistory(data);
  expect(retained).toMatchObject({ version: 3, snapshot: { version: 3, title: "Final saved title" } });
  expect(saved).toEqual(retained.snapshot);
  expect(data.repository.listCardHistory(data.card.id).map((item) => item.version)).toEqual([1, 3]);
  const snapshots = data.repository.listActivity(data.project.id).filter((event) => event.action === "card.updated").map((event) => event.after);
  expect(snapshots).toContainEqual(retained.snapshot);
}

function testUnassignsEveryPhysicalCardOnReleaseDeletionIncludingHiddenMapCards() {
  const data = fixture();
  const hidden = data.unitOfWork.run(ACTOR, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Hidden" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Retained physical Card" });
    repository.deleteStoryMap(map.id);
    return { map, card };
  });
  data.database.$client.prepare("UPDATE cards SET release_id = ? WHERE id = ?").run(data.release.id, hidden.card.id);
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: data.project.id, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", releaseId: data.release.id, remoteId: "1", url: "https://github.com/owner/repo/milestone/1", labels: [] });
    repository.createGitHubLink({ releaseId: data.release.id, repo: "owner/repo", url: "https://github.com/owner/repo/milestone/1" });
  });
  data.unitOfWork.run(ACTOR, ({ repository }) => expect(repository.deleteRelease(data.release.id)).toBe(true));
  for (const card of [data.card, data.second, hidden.card]) {
    expect(data.database.$client.prepare("SELECT release_id, version FROM cards WHERE id = ?").get(card.id)).toEqual({ release_id: null, version: 2 });
    expect(latestHistory(data, card.id)).toMatchObject({ version: 2, actor: ACTOR.actorId, actor_type: ACTOR.actorType, snapshot: { releaseId: null, version: 2 } });
  }
  expect(data.repository.getCardDetails(hidden.card.id)).toBeUndefined();
  expect(data.database.$client.prepare("SELECT version FROM story_maps WHERE id = ?").get(hidden.map.id)).toEqual({ version: 1 });
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.storyMap.version).toBe(1);
  expect(data.database.$client.prepare("SELECT * FROM external_refs WHERE entity_type = 'release' AND entity_id = ?").all(data.release.id)).toEqual([]);
  expect(data.database.$client.prepare("SELECT * FROM remote_work_item_links").all()).toEqual([]);
}

function testClearsConnectorDefaultsOnBothVisibleAndHiddenMapsExplicitly() {
  const data = fixture();
  const { connection, hidden } = data.unitOfWork.run(ACTOR, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: data.project.id, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
    const hidden = repository.createStoryMap({ projectId: data.project.id, name: "Hidden" });
    repository.updateStoryMap(data.map.id, { defaultConnectionId: connection.id });
    repository.updateStoryMap(hidden.id, { defaultConnectionId: connection.id });
    repository.deleteStoryMap(hidden.id);
    return { connection, hidden };
  });
  const before = data.database.$client.prepare("SELECT id, version FROM story_maps ORDER BY id").all() as Array<{ id: string; version: number }>;
  data.unitOfWork.run(ACTOR, ({ repository }) => expect(repository.deleteConnectorConnection(connection.id)).toBe(true));
  for (const map of [data.map, hidden]) {
    expect(data.database.$client.prepare("SELECT default_connection_id, version FROM story_maps WHERE id = ?").get(map.id)).toEqual({ default_connection_id: null, version: before.find((item) => item.id === map.id)!.version + 1 });
  }
}

function testHidesRetainedDeletedCardHistoryWhenItsStoryMapIsSubsequently() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteCard(data.card.id, { strategy: "unassign" }));
  const retained = data.repository.listCardHistory(data.card.id);
  expect(retained).toHaveLength(2);
  expect(retained.at(-1)?.snapshot).toMatchObject({ title: data.card.title, storyMapId: data.map.id });
  const rows = data.database.$client.prepare("SELECT * FROM card_versions WHERE card_id = ? ORDER BY version");
  const before = rows.all(data.card.id);
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteStoryMap(data.map.id));
  expect(data.database.$client.prepare("SELECT version FROM story_maps WHERE id = ?").get(data.map.id)).toEqual({ version: 2 });
  expect(data.repository.listCardHistory(data.card.id)).toEqual([]);
  expect(rows.all(data.card.id)).toEqual(before);
}

function testDeletesCardOwnedChildrenAndSyncReferencesWhileRetainingUniqueFinal() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.setCardPersona(data.card.id, data.persona.id);
    repository.setCardAnnotation(data.card.id, data.annotation.id);
    repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.chunk.id });
    repository.createCardAttachment(data.card.id, { label: "Evidence", filePath: "evidence.txt" });
    const connection = repository.createConnectorConnection({ projectId: data.project.id, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: data.card.id, remoteId: "1", url: "https://github.com/owner/repo/issues/1", labels: [] });
    repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: connection.id, mode: "sync", status: "planned" });
    repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: data.card.id, remoteId: "1", field: "title", localValue: "Local", remoteValue: "Remote" });
    repository.createRoadmapReference({ roadmapCardId: data.roadmapCard.id, targetType: "card", targetId: data.card.id });
  });
  const before = data.repository.getCardDetails(data.card.id)!;
  data.unitOfWork.run(ACTOR, ({ repository }) => expect(repository.deleteCard(data.card.id, { strategy: "unassign" })).toBe(true));
  expect(data.repository.getCardDetails(data.card.id)).toBeUndefined();
  for (const table of ["card_personas", "card_annotations", "card_source_links", "card_attachments", "sync_conflicts"]) {
    expect(data.database.$client.prepare(`SELECT * FROM ${table} WHERE card_id = ?`).all(data.card.id)).toEqual([]);
  }
  expect(data.database.$client.prepare("SELECT * FROM external_refs WHERE entity_type = 'card' AND entity_id = ?").all(data.card.id)).toEqual([]);
  expect(data.database.$client.prepare("SELECT * FROM remote_work_item_links").all()).toEqual([]);
  expect(latestHistory(data)).toMatchObject({ version: before.version + 1, actor: ACTOR.actorId, snapshot: { ...before, version: before.version + 1 } });
  expect(buildRoadmapDetails(data.repository.getRoadmapDetailsData(data.roadmap.id))!.roadmap.version).toBe(2);
}
