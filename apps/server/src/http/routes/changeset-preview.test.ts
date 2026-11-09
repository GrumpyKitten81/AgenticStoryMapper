import { visibleCards } from "@storymapper/core";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { Card, Release, StoryMapSnapshot } from "@storymapper/contracts";
import { previewFixture, previewHuman } from "@storymapper/server/fixtures/changeset-preview";
import { previewChangeSet } from "@storymapper/server/application/changeset/preview-changeset.use-cases";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture(count?: number) { const f = await previewFixture(count); cleanup.push(f.close); return f; }

it("projects sequential changes, NEW keys and removed ghosts without any SQLite/history/audit mutation", async () => {
  const f = await fixture();
  const proposal = f.proposal([
    { operationId: "create", op: "create", entity: "card", entityId: "new-card", after: { storyMapId: f.map.id, level: "activity", title: "New activity" } },
    { operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, baseVersion: f.cards[0]!.version, after: { title: "Edited activity" } },
    { operationId: "remove", op: "delete", entity: "card", entityId: f.cards[1]!.id, after: { strategy: "unassign" } },
    { operationId: "remove-release", op: "delete", entity: "release", entityId: f.release.id, after: {} }
  ]);
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(proposal.id);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
  expect(preview.selectedOperationIds).toEqual(["create", "edit", "remove", "remove-release"]);
  expect(preview.operations).toHaveLength(4);
  expect(preview.operations[1]).toMatchObject({ index: 1, operationId: "edit", changes: [expect.objectContaining({ before: expect.objectContaining({ title: "Card 0" }), after: expect.objectContaining({ title: "Edited activity" }) })] });
  expect(preview.boards[0]!.snapshot.cards).toEqual(expect.arrayContaining([expect.objectContaining({ title: "New activity", key: "NEW-1" }), expect.objectContaining({ id: f.cards[1]!.id, title: "Card 1" })]));
  expect(preview.boards[0]!.snapshot.releases).toContainEqual(expect.objectContaining({ id: f.release.id }));
  expect(preview.boards[0]!.markers).toEqual(expect.arrayContaining([
    expect.objectContaining({ entity: "card", entityId: f.cards[1]!.id, kind: "removed", operationIds: ["remove"] }),
    expect.objectContaining({ entity: "release", entityId: f.release.id, kind: "removed", operationIds: ["remove-release"] })
  ]));
  expect(preview.operations.every((row) => !("state" in row))).toBe(true);
});

it("server-closes transitive dependencies, returns all excluded rows, and binds approve/apply to exactly that cut", async () => {
  const f = await fixture();
  const proposal = f.proposal([
    { operationId: "first", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "First edit" } },
    { operationId: "second", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { description: "Second edit" } },
    { operationId: "third", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Third edit" } },
    { operationId: "independent", op: "update", entity: "card", entityId: f.cards[1]!.id, after: { title: "Selected edit" } }
  ]);
  const preview = await f.readPreview(proposal.id, ["second", "third", "independent"]);
  expect(preview.selectedOperationIds).toEqual(["independent"]);
  expect(preview.operations.slice(0, 3).map((row) => row.status)).toEqual(["excluded", "excluded", "excluded"]);
  expect(preview.operations[2]!.dependencies).toContain("second");
  const payload = { selectedOperationIds: preview.selectedOperationIds };
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/approve`, payload })).statusCode).toBe(200);
  expect(f.repository.getChangeSet(proposal.id)).toMatchObject({ approval: { selectedOperationIds: ["independent"] } });
  expect(await f.readPreview(proposal.id)).toMatchObject({ selectedOperationIds: ["independent"], canApply: true });
  expect((await f.readPreview(proposal.id, ["first", "second", "third", "independent"])).canApply).toBe(false);
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload })).statusCode).toBe(200);
  expect(f.repository.getCard(f.cards[0]!.id)?.title).toBe("Card 0");
  expect(f.repository.getCard(f.cards[1]!.id)?.title).toBe("Selected edit");
  const historical = await f.readPreview(proposal.id);
  expect(historical.operations.slice(0, 3).map((operation) => operation.status)).toEqual(["excluded", "excluded", "excluded"]);
  expect(historical.operations.find((operation) => operation.operationId === "independent")?.changes).toContainEqual(expect.objectContaining({ before: expect.objectContaining({ title: "Card 1" }), after: expect.objectContaining({ title: "Selected edit" }) }));
});

it.each([{ selection: ["edit", "edit"] }, { selection: ["unknown"] }])("rejects invalid preview selection $selection without changing stored selection", async ({ selection }) => {
  const f = await fixture();
  const proposal = f.proposal([{ operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Edit" } }]);
  const before = f.handle.current.$client.serialize();
  expect((await f.preview(proposal.id, selection)).statusCode).toBe(400);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});

it("collects every drift conflict, preserves the current board and immutable submitted baselines", async () => {
  const f = await fixture();
  const proposal = f.proposal(f.cards.slice(0, 2).map((card, index) => ({ operationId: `edit-${index}`, op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after: { title: `Proposal ${index}` } })));
  f.unitOfWork.run(previewHuman, ({ repository }) => { for (const card of f.cards.slice(0, 2)) repository.updateCard(card.id, { title: "Incoming edit" }); });
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(proposal.id);
  expect(preview.presentationStatus).toBe("conflict");
  expect(preview.conflicts).toHaveLength(2);
  expect(preview.operations.map((row) => row.status)).toEqual(["conflict", "conflict"]);
  expect(preview.operations.every((row) => row.cause && row.cause.length > 0)).toBe(true);
  expect(preview.canApprove).toBe(false);
  expect(preview.canApply).toBe(false);
  expect(preview.boards[0]!.snapshot.cards.filter((card) => card.title === "Incoming edit")).toHaveLength(2);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
  expect(f.repository.getChangeSet(proposal.id)?.operations).toEqual(proposal.operations);
});

it("refuses persisted foreign targets even when they masquerade as creation-local aliases", async () => {
  const f = await fixture();
  const foreign = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const project = repository.createProject({ name: "Private owner" });
    repository.updateSafetySettings(project.id, { agentMode: "off" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Private board" });
    return repository.createCard({ storyMapId: map.id, level: "activity", title: "Private card" });
  });
  const proposal = f.proposal([{ operationId: "foreign", op: "create", entity: "card", entityId: foreign.id, after: { storyMapId: f.map.id, level: "activity", title: "Private replacement" } }]);
  const before = f.handle.current.$client.serialize();
  const response = await f.preview(proposal.id);
  expect(response.statusCode).toBe(400);
  expect(response.body).not.toContain("Private card");
  expect(() => previewChangeSet(f, { actorType: "agent", actorId: "private-reader" }, proposal.id)).toThrow();
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});

it.each([
  { status: "applied", undone: 0, presentation: "applied", closed: true },
  { status: "proposed", undone: 1, presentation: "discarded", closed: true },
  { status: "stale", undone: 0, presentation: "stale", closed: false }
])("reads incompatible $presentation history without executing or current-schema parsing", async ({ status, undone, presentation, closed }) => {
  const f = await fixture();
  const id = randomUUID();
  const operations = [null, { retiredOperation: "Historical evidence" }];
  f.handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at, undone_by_restore) VALUES (?, ?, 'Historical cut', 'human', ?, 1, ?, ?, ?)").run(id, f.project.id, status, JSON.stringify(operations), new Date().toISOString(), undone);
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(id);
  expect(preview).toMatchObject({ presentationStatus: presentation, closed, canApprove: false, canApply: false, changeSet: { operations } });
  expect(preview.explanation).toBeTruthy();
  expect(preview.boards).toEqual([]);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});

it("returns 404 for missing preview and keeps rejected current proposals reapprovable", async () => {
  const f = await fixture();
  expect((await f.preview(randomUUID())).statusCode).toBe(404);
  const proposal = f.proposal([{ operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Reviewed again" } }]);
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "rejected"));
  expect(await f.readPreview(proposal.id)).toMatchObject({ presentationStatus: "rejected", closed: false, canApprove: true, canApply: false });
});

function semanticBoard(snapshot: StoryMapSnapshot) {
  const normalizeCard = ({ id: _id, key: _key, createdAt: _createdAt, updatedAt: _updatedAt, version: _version, releaseId, ...card }: Card) => ({ ...card, assignee: card.assignee ?? null, businessValue: card.businessValue ?? null, color: card.color ?? null, effort: card.effort ?? null, estimate: card.estimate ?? null, priority: card.priority ?? null, releaseName: snapshot.releases.find((release) => release.id === releaseId)?.name ?? null });
  const normalizeRelease = ({ id: _id, version: _version, ...release }: Release) => release;
  return { cards: snapshot.cards.map(normalizeCard).sort((a, b) => a.title.localeCompare(b.title)), releases: snapshot.releases.map(normalizeRelease).sort((a, b) => a.name.localeCompare(b.name)) };
}

it("matches preview and actual HTTP approve/apply semantic state after creation-id/key/time normalization", async () => {
  const f = await fixture();
  const proposal = f.proposal([
    { operationId: "lane", op: "create", entity: "release", entityId: "new-lane", after: { storyMapId: f.map.id, name: "New lane" } },
    { operationId: "create", op: "create", entity: "card", entityId: "new-card", after: { storyMapId: f.map.id, level: "activity", title: "New activity", releaseId: "new-lane" } },
    { operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, baseVersion: f.cards[0]!.version, after: { title: "Updated activity" } }
  ]);
  const preview = await f.readPreview(proposal.id);
  const payload = { selectedOperationIds: preview.selectedOperationIds };
  for (const action of ["approve", "apply"]) expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/${action}`, payload })).statusCode).toBe(200);
  expect(semanticBoard(f.repository.getStoryMapSnapshot(f.map.id)!)).toEqual(semanticBoard(preview.boards[0]!.snapshot));
  expect(f.repository.getChangeSet(proposal.id)?.operations).toEqual(proposal.operations);
  expect(await f.readPreview(proposal.id)).toMatchObject({ presentationStatus: "applied", closed: true, canApprove: false, canApply: false });
});

it("reviews all non-board effects and exposes archived upsert implicit unarchive with may-change wording", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const persona = repository.createPersona({ projectId: f.project.id, name: "Existing persona" });
    const annotation = repository.createAnnotation({ projectId: f.project.id, name: "Existing annotation" });
    repository.archiveCard(f.cards[0]!.id);
    repository.setExternalRef({ entityType: "card", entityId: f.cards[0]!.id, system: "bmad", externalId: "archived-activity" });
    return { persona, annotation };
  });
  const proposal = f.proposal([
    { operationId: "persona", entity: "persona", op: "update", entityId: rows.persona.id, after: { name: "Reviewed persona" } },
    { operationId: "annotation", entity: "annotation", op: "update", entityId: rows.annotation.id, after: { name: "Reviewed annotation" } },
    { operationId: "context", entity: "productContext", op: "set", entityId: f.project.id, after: { projectId: f.project.id, purpose: "Reviewed purpose" } },
    { operationId: "upsert", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "archived-activity" }, after: { storyMapId: f.map.id, level: "activity", title: "Reviewed activity" } }
  ]);
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(proposal.id);
  expect(preview.conflicts).toEqual([]);
  expect(preview.operations.map((row) => row.operationId)).toEqual(["persona", "annotation", "context", "upsert"]);
  expect(preview.operations[0]!.changes).toContainEqual(expect.objectContaining({ entity: "persona", before: expect.objectContaining({ name: "Existing persona" }), after: expect.objectContaining({ name: "Reviewed persona" }) }));
  expect(preview.operations[1]!.changes).toContainEqual(expect.objectContaining({ entity: "annotation", before: expect.objectContaining({ name: "Existing annotation" }), after: expect.objectContaining({ name: "Reviewed annotation" }) }));
  expect(preview.operations[2]!.changes).toContainEqual(expect.objectContaining({ entity: "productContext", after: expect.objectContaining({ purpose: "Reviewed purpose" }) }));
  expect(preview.operations[3]!.label).toContain("may change");
  expect(preview.operations[3]!.changes).toContainEqual(expect.objectContaining({ entity: "card", implicit: "unarchive", before: expect.objectContaining({ archived: true, status: "todo" }), after: expect.objectContaining({ archived: false, status: "todo" }) }));
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});


it("reports reviewed Source file drift and only prepares dependency-closed selected imports", async () => {
  const f = await fixture();
  const content = "Reviewed source evidence.";
  const filePath = join(f.directory, "reviewed.txt");
  writeFileSync(filePath, content);
  const proposal = f.proposal([
    { operationId: "source", op: "import", entity: "sourceDocument", entityId: "source-local", after: { projectId: f.project.id, title: "Reviewed source", type: "txt", filePath, fileHash: createHash("sha256").update(content).digest("hex") } },
    { operationId: "independent", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Independent edit" } }
  ]);
  const valid = await f.readPreview(proposal.id);
  expect(valid.operations[0]!.changes).toContainEqual(expect.objectContaining({ entity: "sourceDocument", after: expect.objectContaining({ title: "Reviewed source" }) }));
  expect(f.repository.listSourceDocumentSummaryData(f.project.id)).toEqual([]);
  writeFileSync(filePath, "Incoming source edit.");
  const before = f.handle.current.$client.serialize();
  const drift = await f.readPreview(proposal.id);
  expect(drift).toMatchObject({ presentationStatus: "conflict", canApprove: false, canApply: false });
  expect(drift.conflicts).toContainEqual(expect.objectContaining({ operationId: "source", index: 0, reason: "source" }));
  expect(drift.operations[0]!.cause).toContain("changed");
  const selected = await f.readPreview(proposal.id, ["independent"]);
  expect(selected.conflicts).toEqual([]);
  expect(selected.operations[0]).toMatchObject({ operationId: "source", status: "excluded" });
  expect(selected.boards[0]!.snapshot.cards[0]!.title).toBe("Independent edit");
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});

it("requires Agent access to the owning Project even for an empty selected cut", async () => {
  const f = await fixture();
  const proposal = f.proposal([{ operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Edit" } }]);
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  expect(() => previewChangeSet(f, { actorType: "agent", actorId: "disabled-reader" }, proposal.id, [])).toThrow();
  expect((await f.preview(proposal.id, [])).statusCode).toBe(200);
});

it("projects moves with current Before and resulting After placement plus server moved markers", async () => {
  const f = await fixture();
  const proposal = f.proposal([{ operationId: "move", op: "move", entity: "card", entityId: f.cards[0]!.id, after: { parentId: null, position: 2 } }]);
  const preview = await f.readPreview(proposal.id);
  expect(preview.operations[0]!.changes).toContainEqual(expect.objectContaining({ entity: "card", entityId: f.cards[0]!.id, before: expect.objectContaining({ position: 0 }), after: expect.objectContaining({ position: 2 }) }));
  expect(preview.boards[0]!.markers).toContainEqual({ entity: "card", entityId: f.cards[0]!.id, kind: "moved", operationIds: ["move"] });
  expect(f.repository.getCard(f.cards[0]!.id)?.position).toBe(0);
});

it("preserves archived hierarchy as removed server ghosts in original placements", async () => {
  const f = await fixture();
  const children = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const step = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: f.cards[0]!.id, title: "Hidden step" });
    const story = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: step.id, title: "Hidden story" });
    return [step, story];
  });
  const proposal = f.proposal([{ operationId: "archive", op: "archive", entity: "card", entityId: f.cards[0]!.id, after: {} }]);
  const preview = await f.readPreview(proposal.id);
  for (const card of [f.cards[0]!, ...children]) {
    expect(preview.boards[0]!.snapshot.cards).toContainEqual(expect.objectContaining({ id: card.id, parentId: card.parentId, parked: false }));
    expect(preview.boards[0]!.markers).toContainEqual({ entity: "card", entityId: card.id, kind: "removed", operationIds: ["archive"] });
  }
  expect(preview.operations[0]!.changes).toContainEqual(expect.objectContaining({ entity: "card", after: expect.objectContaining({ archived: true, status: "todo" }) }));
});

it("retains canonical hidden Cards for dependency keys and explicit removal ghosts", async () => {
  const f = await fixture();
  const hidden = f.unitOfWork.run(previewHuman, ({ repository }) => {
    repository.archiveCard(f.cards[0]!.id);
    const step = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: f.cards[0]!.id, title: "Archived descendant" });
    repository.parkCard(f.cards[1]!.id, { childStrategy: "unassign" });
    return [f.cards[0]!.id, step.id, f.cards[1]!.id];
  });
  const proposal = f.proposal([{ operationId: "remove", op: "delete", entity: "card", entityId: f.cards[2]!.id, after: { strategy: "unassign" } }]);
  const preview = await f.readPreview(proposal.id);
  expect(preview.boards[0]!.snapshot.cards.map((card) => card.id).sort()).toEqual([...hidden, f.cards[2]!.id].sort());
  expect(visibleCards(preview.boards[0]!.snapshot.cards).map((card) => card.id)).toEqual([f.cards[2]!.id]);
  expect(preview.boards[0]!.markers).toContainEqual(expect.objectContaining({ entityId: f.cards[2]!.id, kind: "removed" }));
  for (const id of hidden) expect(preview.boards[0]!.markers.some((marker) => marker.entityId === id)).toBe(false);
});

it("retains a moved marker after a later content edit of the same Card", async () => {
  const f = await fixture();
  const proposal = f.proposal([
    { operationId: "move", op: "move", entity: "card", entityId: f.cards[0]!.id, after: { parentId: null, position: 2 } },
    { operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Moved and edited" } }
  ]);
  const preview = await f.readPreview(proposal.id);
  expect(preview.boards[0]!.markers).toContainEqual({ entity: "card", entityId: f.cards[0]!.id, kind: "moved", operationIds: ["move", "edit"] });
  expect(preview.boards[0]!.snapshot.cards.find((card) => card.id === f.cards[0]!.id)).toMatchObject({ title: "Moved and edited", position: 2 });
});

it("disables GitHub ChangeSet application in preview when Project GitHub access is disabled", async () => {
  const f = await fixture();
  const proposal = f.unitOfWork.run(previewHuman, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: f.project.id, title: "GitHub review", source: "github", createdAt: new Date().toISOString(),
    operations: [{ operationId: "edit", op: "update", entity: "card", entityId: f.cards[0]!.id, after: { title: "Incoming GitHub title" } }]
  }));
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/approve`, payload: {} })).statusCode).toBe(200);
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: false }));
  expect(await f.readPreview(proposal.id)).toMatchObject({ canApply: false });
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload: {} })).statusCode).toBe(403);
  expect(f.repository.getCard(f.cards[0]!.id)?.title).toBe("Card 0");
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: true }));
  expect(await f.readPreview(proposal.id)).toMatchObject({ canApply: true });
});

it("aggregates addressed external baselines independently of absent or fresh captured operation baselines in actual preview", async () => {
  const f = await fixture();
  f.unitOfWork.run(previewHuman, ({ repository }) => {
    for (const [index, card] of f.cards.slice(0, 2).entries()) repository.setExternalRef({ entityType: "card", entityId: card.id, system: "bmad", externalId: `Delivery-${index}` });
  });
  const operations = f.cards.slice(0, 2).map((card, index) => ({ operationId: `delivery-${index}`, op: "update" as const, entity: "card" as const, entityId: card.id,
    selector: { kind: "externalRef" as const, scopeId: f.map.id, system: "bmad", externalId: `Delivery-${index}` }, after: { status: "done" } }));
  const proposal = f.proposal(operations);
  f.unitOfWork.run(previewHuman, ({ repository }) => { for (const card of f.cards.slice(0, 2)) repository.updateCard(card.id, { title: "Human delivery edit" }); });
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(proposal.id);
  expect(preview).toMatchObject({ presentationStatus: "conflict", canApply: false, canApprove: false });
  expect(preview.conflicts).toHaveLength(2);
  for (const [index, card] of f.cards.slice(0, 2).entries()) expect(preview.conflicts[index]).toMatchObject({ entity: "card", id: card.id, operationId: `delivery-${index}`, index, baseVersion: card.version, currentVersion: card.version + 1 });
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
  expect(f.repository.getChangeSet(proposal.id)?.operations).toEqual(proposal.operations);
  const fresh = f.proposal([{ ...operations[0]!, operationId: "fresh-operation-stale-reference", baseVersion: f.repository.getCard(f.cards[0]!.id)!.version }]);
  const freshBefore = f.handle.current.$client.serialize();
  const freshPreview = await f.readPreview(fresh.id);
  expect(freshPreview.conflicts).toHaveLength(1);
  expect(freshPreview.conflicts[0]).toMatchObject({ entity: "card", id: f.cards[0]!.id, operationId: "fresh-operation-stale-reference", index: 0, baseVersion: f.cards[0]!.version, currentVersion: f.cards[0]!.version + 1 });
  expect(freshPreview).toMatchObject({ presentationStatus: "conflict", canApply: false, canApprove: false });
  expect(f.handle.current.$client.serialize().equals(freshBefore)).toBe(true);
});
