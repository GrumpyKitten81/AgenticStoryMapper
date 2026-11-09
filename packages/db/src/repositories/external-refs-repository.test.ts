import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { externalRefs } from "@storymapper/db/schema";

const actor = { actorType: "human", actorId: "external-ref-test" } as const;
const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
const uow = new UnitOfWork(handle);
const repository = new StoryMapperRepository(handle);
afterEach(() => { vi.restoreAllMocks(); handle.current.$client.exec("DELETE FROM external_refs"); });

it("derives entity scope, records the current baseline without a root bump, and treats repeat binding as a no-op", () => {
  const data = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "References" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const otherMap = tx.createStoryMap({ projectId: project.id, name: "Other map" });
    const card = tx.createCard({ storyMapId: map.id, level: "story", title: "Card" });
    const otherCard = tx.createCard({ storyMapId: otherMap.id, level: "story", title: "Other card" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release" });
    const persona = tx.createPersona({ projectId: project.id, storyMapId: map.id, name: "Persona", role: "Reader" });
    const projectPersona = tx.createPersona({ projectId: project.id, name: "Project persona", role: "Reader" });
    return { project, map, otherMap, card, otherCard, release, persona, projectPersona };
  });
  const beforeCardVersion = repository.getCard(data.card.id)!.version;
  const beforeReleaseVersion = repository.getRelease(data.release.id)!.version;
  const cardResult = uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: data.card.id, system: "agent", externalId: "  Story-4  " }));
  expect(cardResult).toMatchObject({ status: "created", ref: { scopeId: data.map.id, syncedVersion: beforeCardVersion, externalId: "Story-4" } });
  const repeated = uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: data.card.id, system: "agent", externalId: "Story-4" }));
  expect(repeated).toEqual({ ...cardResult, status: "unchanged" });
  expect(repository.getCard(data.card.id)?.version).toBe(beforeCardVersion);
  expect(uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: data.otherCard.id, system: "agent", externalId: "Story-4" })).ref.scopeId).toBe(data.otherMap.id);
  expect(repository.listActivity(data.project.id).filter((event) => event.action === "externalRef.created" && event.affectedEntityId === data.card.id)).toHaveLength(1);
  expect(uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "release", entityId: data.release.id, system: "agent", externalId: "Release-1" })).ref)
    .toMatchObject({ scopeId: data.map.id, syncedVersion: beforeReleaseVersion });
  expect(uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "persona", entityId: data.persona.id, system: "agent", externalId: "Persona-1" })).ref.scopeId).toBe(data.map.id);
  expect(uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "persona", entityId: data.projectPersona.id, system: "agent", externalId: "Persona-2" })).ref.scopeId).toBe(data.project.id);
  expect(repository.getStoryMapSnapshot(data.map.id)?.externalRefs.map(({ externalId }) => externalId).sort()).toEqual(["Story-4", "Release-1", "Persona-1", "Persona-2"].sort());
  expect(repository.getStoryMapSnapshot(data.otherMap.id)?.externalRefs.map(({ externalId }) => externalId).sort()).toEqual(["Story-4", "Persona-2"].sort());
});

it("refuses both conflicting bindings and reserved github without changing references", () => {
  const { map, card, otherCard } = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Conflicts" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    return { map, card: tx.createCard({ storyMapId: map.id, level: "story", title: "One" }), otherCard: tx.createCard({ storyMapId: map.id, level: "story", title: "Two" }) };
  });
  uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "one" }));
  expect(() => uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "two" }))).toThrow(/different external reference/);
  expect(() => uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: otherCard.id, system: "agent", externalId: "one" }))).toThrow(/already bound/);
  expect(() => uow.run(actor, ({ repository: tx }) => tx.setExternalRef({ entityType: "card", entityId: card.id, system: "github", externalId: "1" }))).toThrow(/reserved/);
  expect(repository.listExternalRefsForStoryMap(map.id)).toHaveLength(1);
});

it("resolves a competing insert that wins after preflight as an unchanged binding", () => {
  const { map, card } = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Concurrent writer" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    return { map, card: tx.createCard({ storyMapId: map.id, level: "story", title: "Racing card" }) };
  });
  const result = uow.run(actor, ({ repository: tx }) => {
    const insert = tx.db.insert.bind(tx.db);
    vi.spyOn(tx.db, "insert").mockImplementation(((table: unknown) => {
      if (table === externalRefs) handle.current.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), "card", card.id, "agent", "raced", map.id, 1, new Date().toISOString());
      return insert(table as never);
    }) as typeof tx.db.insert);
    return tx.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "raced" });
  });
  expect(result.status).toBe("unchanged");
  expect(result.ref).toMatchObject({ entityId: card.id, externalId: "raced", scopeId: map.id });
});

it("turns competing scoped-key and entity-binding winners into conflicts without Activity", () => {
  const { project, map, card, other } = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Conflicting writers" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    return {
      project,
      map,
      card: tx.createCard({ storyMapId: map.id, level: "story", title: "Target" }),
      other: tx.createCard({ storyMapId: map.id, level: "story", title: "Scoped winner" })
    };
  });
  const insertCompeting = (tx: typeof repository, entityId: string, externalId: string) => {
    const insert = tx.db.insert.bind(tx.db);
    vi.spyOn(tx.db, "insert").mockImplementation(((table: unknown) => {
      if (table === externalRefs) handle.current.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), "card", entityId, "agent", externalId, map.id, 1, new Date().toISOString());
      return insert(table as never);
    }) as typeof tx.db.insert);
  };
  expect(() => uow.run(actor, ({ repository: tx }) => {
    insertCompeting(tx as unknown as typeof repository, other.id, "scoped-race");
    return tx.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "scoped-race" });
  })).toThrow(/already bound/);
  vi.restoreAllMocks();
  expect(() => uow.run(actor, ({ repository: tx }) => {
    insertCompeting(tx as unknown as typeof repository, card.id, "winner");
    return tx.setExternalRef({ entityType: "card", entityId: card.id, system: "agent", externalId: "loser" });
  })).toThrow(/already bound/);
  expect(repository.listExternalRefsForStoryMap(map.id)).toEqual([]);
  expect(repository.listActivity(project.id).filter((event) => event.action === "externalRef.created")).toEqual([]);
});

it("removes bindings on permanent deletion, retains archived-card bindings, and enforces database unique keys", () => {
  const { project, map, archived, removed, other, release, persona } = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Lifecycle" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const archived = tx.createCard({ storyMapId: map.id, level: "story", title: "Archived" });
    const removed = tx.createCard({ storyMapId: map.id, level: "story", title: "Removed" });
    const other = tx.createCard({ storyMapId: map.id, level: "story", title: "Other" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Removed release" });
    const persona = tx.createPersona({ projectId: project.id, name: "Removed persona", role: "Reader" });
    tx.setExternalRef({ entityType: "card", entityId: archived.id, system: "agent", externalId: "a" });
    tx.setExternalRef({ entityType: "card", entityId: removed.id, system: "agent", externalId: "b" });
    tx.setExternalRef({ entityType: "release", entityId: release.id, system: "agent", externalId: "release" });
    tx.setExternalRef({ entityType: "persona", entityId: persona.id, system: "agent", externalId: "persona" });
    tx.archiveCard(archived.id);
    tx.deleteCard(removed.id, { strategy: "unassign" });
    tx.deleteRelease(release.id);
    tx.deletePersona(persona.id, { definitionBefore: tx.getPersona(persona.id)!, affectedCards: [] });
    return { project, map, archived, removed, other, release, persona };
  });
  expect(repository.listExternalRefsForStoryMap(map.id).map(({ entityId }) => entityId)).toEqual([archived.id]);
  expect(() => handle.current.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("another", "card", archived.id, "agent", "different", map.id, 1, new Date().toISOString())).toThrow();
  expect(() => handle.current.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("third", "card", other.id, "agent", "a", map.id, 1, new Date().toISOString())).toThrow();
  expect(() => handle.current.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("whitespace", "card", other.id, "other", "\t", map.id, 1, new Date().toISOString())).toThrow();
  for (const entityId of [removed.id, release.id, persona.id]) {
    expect(handle.current.$client.prepare("SELECT id FROM external_refs WHERE entity_id = ?").all(entityId)).toEqual([]);
  }
  expect(project.id).toBeTruthy();
  expect(removed.id).toBeTruthy();
});
