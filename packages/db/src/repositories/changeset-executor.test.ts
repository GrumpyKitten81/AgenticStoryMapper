import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as core from "@storymapper/core";
import { conflictResponseSchema } from "@storymapper/contracts";
import { openStoryMapperDb, DatabaseHandle, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

const human = { actorType: "human", actorId: "local-ui" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); cleanup.splice(0).reverse().forEach((close) => close()); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "changeset-executor-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const proposal = unitOfWork.run(human, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Executor" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    return tx.createChangeSet({ id: randomUUID(), projectId: project.id, title: "Reviewed cut", source: "human", createdAt: new Date().toISOString(), operations: [{ operationId: "create-card", op: "create", entity: "card", entityId: "local-card", after: { storyMapId: map.id, title: "Activity", level: "activity" } }] });
  });
  return { database, directory, unitOfWork, repository, proposal };
}

it("binds actual approval and keeps reviewed operations immutable across resolved application", () => {
  const f = fixture();
  expect(() => applyChangeSet(f, human, f.proposal.id)).toThrow(/approval/);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  const approved = approveChangeSet(f, human, f.proposal.id).changeSet;
  expect(approved.approval?.actor).toEqual(human);
  expect(approved.approval?.selectedOperationIds).toEqual(["create-card"]);
  const operations = JSON.stringify(approved.operations);
  const applied = applyChangeSet(f, human, f.proposal.id).changeSet;
  expect(JSON.stringify(applied.operations)).toBe(operations);
  expect(applied.execution?.operationResults[0]?.entityIds).toHaveLength(1);
  expect(applied.execution?.restorePoint).toBeTruthy();
  expect(f.repository.getCard(applied.execution!.operationResults[0]!.entityIds[0]!)?.title).toBe("Activity");
  expect(() => applyChangeSet(f, human, f.proposal.id)).toThrow(/permanently historical/);
});

it("takes no snapshot for empty reviewed selection and refuses later selection changes", () => {
  const f = fixture();
  approveChangeSet(f, human, f.proposal.id, []);
  expect(() => applyChangeSet(f, human, f.proposal.id, ["create-card"])).toThrow(/fresh approval/);
  const applied = applyChangeSet(f, human, f.proposal.id).changeSet;
  expect(applied.execution?.selectedOperationIds).toEqual([]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("rolls domain effects back when the applied Activity fails and retains the preapply snapshot", () => {
  const f = fixture();
  approveChangeSet(f, human, f.proposal.id);
  rejectAppliedActivity();
  let failure: unknown;
  try { applyChangeSet(f, human, f.proposal.id); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "internal", details: { errorId: expect.any(String), retainedRestorePoint: expect.any(String), retainedPreparedEffects: [] } });
  expect(f.repository.getChangeSet(f.proposal.id)?.status).toBe("approved");
  expect(f.database.$client.prepare("SELECT count(*) AS n FROM cards").get()).toEqual({ n: 0 });
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
});

it("only the new command creation flow can autoapply and caller receipt objects cannot bypass stored approval", () => {
  const f = fixture();
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.applyChangeSet(f.proposal.id, { commandReceipt: {} }))).toThrow(/recorded approval/);
  const input = { ...f.proposal, id: randomUUID(), operations: f.proposal.operations.map((operation) => ({ ...operation, operationId: "new-command" })) };
  const applied = executeChangeSetCommand(f, human, input).changeSet;
  expect(applied.status).toBe("applied");
  expect(applied.approval).toBeUndefined();
  expect(applied.proposedBy).toEqual(human);
  expect(f.repository.getChangeSet(f.proposal.id)?.status).toBe("proposed");
});
it("collects all repeated-root and bulk conflicts with stable original operation indexes before snapshot", () => {
  const f = fixture();
  const projectId = f.proposal.projectId;
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const cards = f.unitOfWork.run(human, ({ repository }) => ["One", "Two"].map((title) => repository.createCard({ storyMapId: mapId, title, level: "activity" }, "human")));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId, title: "Conflict batch", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "first", entity: "card", op: "update", entityId: cards[0]!.id, baseVersion: 1, after: { title: "First" } },
    { operationId: "repeat", entity: "card", op: "update", entityId: cards[0]!.id, baseVersion: 1, after: { title: "Repeat" } },
    { operationId: "bulk", entity: "card", op: "bulk", entityId: "batch", after: { storyMapId: mapId, cards: [{ id: cards[1]!.id, baseVersion: 1 }], patch: { status: "active" } } }
  ] }));
  approveChangeSet(f, human, proposal.id);
  f.unitOfWork.run(human, ({ repository }) => cards.forEach((card) => repository.updateCard(card.id, { title: "Human drift" })));
  try { applyChangeSet(f, human, proposal.id); throw new Error("Expected conflict"); }
  catch (error) {
    expect(error).toMatchObject({ code: "conflict", conflicts: [
      { operationId: "first", index: 0, id: cards[0]!.id, currentVersion: 2 },
      { operationId: "repeat", index: 1, id: cards[0]!.id, currentVersion: 2 },
      { operationId: "bulk", index: 2, id: cards[1]!.id, currentVersion: 2 }
    ] });
  }
  expect(f.repository.getChangeSet(proposal.id)?.status).toBe("conflict");
  expect(cards.map((card) => f.repository.getCard(card.id)?.title)).toEqual(["Human drift", "Human drift"]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("warns about the named earlier pending proposal sharing an external identity without modifying either input", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const first = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "mcp", title: "Earlier publication", createdAt: new Date().toISOString(), operations: [{ operationId: "earlier", entity: "release", op: "upsert", selector: { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "mvp" }, after: { storyMapId: mapId, name: "MVP" } }] }));
  const second = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...first, id: randomUUID(), title: "Later publication", operations: first.operations.map((operation) => ({ ...operation, operationId: "later" })) }));
  expect(second.warnings).toEqual([{ code: "pending_external_reference_overlap", priorChangeSetId: first.id, priorChangeSetTitle: first.title, operationIds: ["later"], priorOperationIds: ["earlier"] }]);
  expect(f.repository.getChangeSet(second.id)?.warnings).toEqual(second.warnings);
  expect(f.repository.getChangeSet(first.id)?.operations).toEqual(first.operations);
});

it("reports an open sync conflict with its stable operation and target while preserving domain state without a snapshot", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: mapId, title: "Synced activity", level: "activity" });
    const connection = repository.createConnectorConnection({ projectId: f.proposal.projectId, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
    const run = repository.createSyncRun({ storyMapId: mapId, connectionId: connection.id, mode: "sync", status: "planned" });
    repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: connection.id, provider: "github", remoteId: "1", url: "https://github.com/owner/repo/issues/1", labels: [] });
    Object.assign(card, repository.getCard(card.id));
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(card.id)!.storyMapId).find((row) => row.cardId === card.id)!.externalRefId, cardId: card.id, syncRunId: run.id, connectionId: connection.id, remoteId: "1", field: "title", localValue: card.title, remoteValue: "Remote title" });
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, title: "Conflicted edit", source: "human", createdAt: new Date().toISOString(), operations: [{ operationId: "sync-edit", op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after: { title: "Changed" } }] });
    return { card, conflict, proposal };
  });
  approveChangeSet(f, human, state.proposal.id);
  expect(() => applyChangeSet(f, human, state.proposal.id)).toThrow("conflicts with newer changes");
  expect(f.repository.getChangeSet(state.proposal.id)?.status).toBe("conflict");
  expect(f.repository.getCard(state.card.id)?.title).toBe(state.card.title);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  try { approveChangeSet(f, human, state.proposal.id); applyChangeSet(f, human, state.proposal.id); }
  catch (error) { expect(error).toMatchObject({ conflicts: [{ operationId: "sync-edit", index: 0, id: state.card.id, reason: "sync", syncConflictId: state.conflict.id }] }); }
});

it("persists nonversion fingerprint conflict metadata after rollback without making a restore point", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: mapId, targetName: "Copied" }));
  approveChangeSet(f, human, proposal.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateStoryMap(mapId, { description: "Human drift" }));
  expect(() => applyChangeSet(f, human, proposal.id)).toThrow("conflicts with newer changes");
  expect(f.repository.getChangeSet(proposal.id)?.status).toBe("conflict");
  expect(f.repository.listStoryMaps(f.proposal.projectId)).toHaveLength(1);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});
it("prepares reviewed source bytes before SQLite and rolls imported evidence back with a failed applied audit", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const card = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: mapId, level: "activity", title: "Source consumer" }, "human"));
  const filePath = join(f.directory, "reviewed.txt");
  const content = "Reviewed requirement";
  writeFileSync(filePath, content);
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, title: "Prepared source", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "import", entity: "sourceDocument", op: "import", after: { projectId: f.proposal.projectId, title: "Requirement", type: "txt", filePath, fileHash: createHash("sha256").update(content).digest("hex") } },
    { operationId: "link", entity: "sourceLink", op: "link", entityId: "local-link", after: { cardId: card.id, kind: "chunk", chunk: { kind: "import", operationId: "import", locator: "paragraph#1" } } }
  ] }));
  approveChangeSet(f, human, proposal.id);
  const failure = rejectAppliedActivity();
  expect(() => applyChangeSet(f, human, proposal.id)).toThrow("An internal error occurred.");
  expect(f.database.$client.prepare("SELECT count(*) AS n FROM source_documents").get()).toEqual({ n: 0 });
  expect(f.database.$client.prepare("SELECT count(*) AS n FROM card_source_links").get()).toEqual({ n: 0 });
  expect(readFileSync(filePath, "utf8")).toBe(content);
  expect(f.repository.getCard(card.id)?.version).toBe(1);
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  failure.mockRestore();
  const applied = applyChangeSet(f, human, proposal.id).changeSet;
  expect(applied.execution?.retainedPreparedEffects).toEqual([]);
  expect(f.repository.listSourceLinksForStoryMap(mapId)).toHaveLength(1);
});

it("closes approval selection before checking local ownership and ignores deselected source preparation", () => {
  const f = fixture();
  const operations = f.proposal.operations;
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...f.proposal, id: randomUUID(), operations: [
    ...operations,
    { operationId: "dependent", op: "update", entity: "card", entityId: "local-card", selector: { kind: "local", localId: "local-card" }, after: { title: "Dependent change" } },
    { operationId: "missing-source", op: "import", entity: "sourceDocument", entityId: "local-source", after: { projectId: f.proposal.projectId, title: "Unavailable deselected input", type: "txt", fileHash: "0".repeat(64), filePath: join(f.directory, "absent.txt") } }
  ] }));
  const approved = approveChangeSet(f, human, proposal.id, ["dependent"]);
  expect(approved.changeSet.approval?.selectedOperationIds).toEqual([]);
  const applied = applyChangeSet(f, human, proposal.id);
  expect(applied.changeSet.execution?.selectedOperationIds).toEqual([]);
  expect(applied.changeSet.execution?.retainedPreparedEffects).toEqual([]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("ignores a deleted copy source for selected independent work and empty approval", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const copies = f.unitOfWork.run(human, ({ repository }) => ["selected", "empty"].map((name) => {
    const copy = repository.proposeStoryMapCopy({ sourceStoryMapId: mapId, targetName: name });
    return repository.createChangeSet({ ...copy, id: randomUUID(), operations: [...copy.operations, { operationId: "independent", entity: "persona", op: "create", after: { projectId: f.proposal.projectId, name, role: "User" } }] });
  }));
  approveChangeSet(f, human, copies[0]!.id, ["independent"]);
  approveChangeSet(f, human, copies[1]!.id, []);
  f.unitOfWork.run(human, ({ repository }) => repository.deleteStoryMap(mapId));
  expect(applyChangeSet(f, human, copies[1]!.id).changeSet.execution?.selectedOperationIds).toEqual([]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  expect(applyChangeSet(f, human, copies[0]!.id).changeSet.execution?.selectedOperationIds).toEqual(["independent"]);
  expect(f.repository.listPersonas(f.proposal.projectId)).toHaveLength(1);
});

it("combines every changed or missing source and copy fingerprint with indexed root conflicts before snapshot", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const content = "Reviewed bytes";
  const files = ["changed.txt", "missing.txt"].map((name) => join(f.directory, name));
  files.forEach((path) => writeFileSync(path, content));
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: mapId, level: "activity", title: "Retained" });
    const copies = ["Copy one", "Copy two"].map((targetName) => repository.proposeStoryMapCopy({ sourceStoryMapId: mapId, targetName }));
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "All preparation conflicts", createdAt: new Date().toISOString(), operations: [
      ...copies.flatMap((copy, index) => copy.operations.map((operation) => ({ ...operation, operationId: `copy-${index}` }))),
      ...files.map((filePath, index) => ({ operationId: `source-${index}`, entity: "sourceDocument" as const, op: "import" as const, after: { projectId: f.proposal.projectId, title: "Reviewed", type: "txt" as const, filePath, fileHash: createHash("sha256").update(content).digest("hex") } })),
      { operationId: "edit", entity: "card", op: "update", entityId: card.id, baseVersion: card.version, after: { title: "Attempted" } }
    ] });
    return { card, proposal };
  });
  approveChangeSet(f, human, state.proposal.id);
  writeFileSync(files[0]!, "Changed bytes");
  rmSync(files[1]!);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(state.card.id, { title: "Human version" }));
  const before = f.database.$client.prepare("SELECT count(*) AS n FROM card_versions").get();
  try { applyChangeSet(f, human, state.proposal.id); throw new Error("Expected aggregated conflicts"); }
  catch (error) {
    expect(conflictResponseSchema.safeParse(error).success).toBe(true);
    expect(error).toMatchObject({ code: "conflict", conflicts: [
    { operationId: "copy-0", index: 0, id: mapId, reason: "fingerprint" },
    { operationId: "copy-1", index: 1, id: mapId, reason: "fingerprint" },
    { operationId: "source-0", index: 2, reason: "source" },
    { operationId: "source-1", index: 3, reason: "source" },
    { operationId: "edit", index: 4, id: state.card.id, baseVersion: 1, currentVersion: 2 }
  ] }); }
  expect(f.repository.getChangeSet(state.proposal.id)?.status).toBe("conflict");
  expect(f.repository.getChangeSet(state.proposal.id)?.approval).toBeUndefined();
  expect(f.repository.getCard(state.card.id)?.title).toBe("Human version");
  expect(f.database.$client.prepare("SELECT count(*) AS n FROM card_versions").get()).toEqual(before);
  expect(f.repository.getOperationSnapshot(f.proposal.projectId).sourceDocuments).toEqual([]);
  expect(f.repository.listStoryMaps(f.proposal.projectId)).toHaveLength(1);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("collects a stale upsert and all subsequent alias baselines against the existing root", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: mapId, level: "activity", title: "Published" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "bmad", externalId: "published" });
    const baseline = repository.getCard(card.id)!.version;
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "Alias conflict", createdAt: new Date().toISOString(), operations: [
      { operationId: "publish", entity: "card", op: "upsert", entityId: "published-alias", baseVersion: baseline, selector: { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "published" }, after: { storyMapId: mapId, level: "activity", title: "Published" } },
      { operationId: "alias-edit", entity: "card", op: "update", entityId: "published-alias", selector: { kind: "local", localId: "published-alias" }, baseVersion: baseline, after: { title: "Attempted" } },
      { operationId: "alias-repeat", entity: "card", op: "update", entityId: "published-alias", selector: { kind: "local", localId: "published-alias" }, baseVersion: baseline, after: { description: "Attempted" } }
    ] });
    return { card, baseline, proposal };
  });
  approveChangeSet(f, human, state.proposal.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(state.card.id, { title: "Human drift" }));
  try { applyChangeSet(f, human, state.proposal.id); throw new Error("Expected alias conflicts"); }
  catch (error) { expect(error).toMatchObject({ conflicts: ["publish", "alias-edit", "alias-repeat"].map((operationId, index) => ({ operationId, index, id: state.card.id, baseVersion: state.baseline, currentVersion: state.baseline + 1 })) }); }
  expect(f.repository.getCard(state.card.id)?.title).toBe("Human drift");
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("applies a canonical Card GitHub binding using its baseline independently of Release versions", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: mapId, level: "activity", title: "Linked" });
    const release = repository.createRelease({ storyMapId: mapId, name: "Release" });
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "Canonical GitHub owner", createdAt: new Date().toISOString(), operations: [{ operationId: "github", entity: "githubExternalRef", op: "create", baseVersion: card.version, after: { entityType: "card", entityId: card.id, scopeId: mapId, externalId: "https://github.com/org/repo/issues/4" } }] });
    return { card, release, proposal };
  });
  f.unitOfWork.run(human, ({ repository }) => repository.updateRelease(state.release.id, { name: "Different version" }));
  expect(f.repository.getRelease(state.release.id)?.version).not.toBe(state.card.version);
  approveChangeSet(f, human, state.proposal.id);
  expect(applyChangeSet(f, human, state.proposal.id).changeSet.status).toBe("applied");
  expect(f.repository.getOperationSnapshot(f.proposal.projectId).githubLinks[0]).toMatchObject({ cardId: state.card.id, url: "https://github.com/org/repo/issues/4" });
  expect(f.repository.getOperationSnapshot(f.proposal.projectId).githubLinks[0]?.releaseId).toBeUndefined();
});

it("persists parentOverrideLocal when an approved resolved Card move changes its remote parent", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const activity = repository.createCard({ storyMapId: mapId, level: "activity", title: "Activity" });
    const steps = ["Remote parent", "Local parent"].map((title) => repository.createCard({ storyMapId: mapId, level: "step", parentId: activity.id, title }));
    const card = repository.createCard({ storyMapId: mapId, level: "story", parentId: steps[0]!.id, title: "Remote story" });
    const connection = repository.createConnectorConnection({ projectId: f.proposal.projectId, provider: "github", authMode: "token", name: "GitHub", owner: "org", repository: "repo" });
    const link = repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: connection.id, provider: "github", remoteId: "4", remoteNumber: 4, remoteParentNumber: 3, url: "https://github.com/org/repo/issues/4", labels: [] });
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "Local parent move", createdAt: new Date().toISOString(), operations: [{ operationId: "move", entity: "card", op: "move", entityId: card.id, baseVersion: card.version, after: { parentId: steps[1]!.id, position: 0 } }] });
    return { card, parent: steps[1]!, link, proposal };
  });
  approveChangeSet(f, human, state.proposal.id);
  applyChangeSet(f, human, state.proposal.id);
  expect(f.repository.getCard(state.card.id)?.parentId).toBe(state.parent.id);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(mapId).find((link) => link.id === state.link.id)).toMatchObject({ parentOverrideLocal: true, remoteParentNumber: 3 });
});

it("tracks a changed GitHub primary owner across sequential operations while comparing initial roots", () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const state = f.unitOfWork.run(human, ({ repository }) => {
    const cards = ["Old owner", "New owner"].map((title) => repository.createCard({ storyMapId: mapId, level: "activity", title }));
    const link = repository.createGitHubLink({ cardId: cards[0]!.id, repo: "org/repo", issueNumber: 3, url: "https://github.com/org/repo/issues/3" });
    return { cards, link };
  });
  const baselines = state.cards.map((card) => f.repository.getCard(card.id)!.version);
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "Changing link owner", createdAt: new Date().toISOString(), operations: [
    { operationId: "owner-change", entity: "githubExternalRef", op: "update", entityId: state.link.id, baseVersion: baselines[0]!, after: { entityType: "card", entityId: state.cards[1]!.id, scopeId: mapId, externalId: "https://github.com/org/repo/issues/3" } },
    { operationId: "new-owner-edit", entity: "githubExternalRef", op: "update", entityId: state.link.id, baseVersion: baselines[1]!, after: { entityType: "card", entityId: state.cards[1]!.id, scopeId: mapId, externalId: "https://github.com/org/repo/issues/4" } }
  ] }));
  approveChangeSet(f, human, proposal.id);
  f.unitOfWork.run(human, ({ repository }) => state.cards.forEach((card) => repository.updateCard(card.id, { title: `${card.title} drift` })));
  try { applyChangeSet(f, human, proposal.id); throw new Error("Expected owner conflicts"); }
  catch (error) { expect(error).toMatchObject({ conflicts: [
    { operationId: "owner-change", index: 0, id: state.cards[0]!.id, baseVersion: baselines[0], currentVersion: baselines[0]! + 1 },
    { operationId: "new-owner-edit", index: 1, id: state.cards[1]!.id, baseVersion: baselines[1], currentVersion: baselines[1]! + 1 }
  ] }); }
  expect(f.repository.getOperationSnapshot(f.proposal.projectId).githubLinks[0]?.cardId).toBe(state.cards[0]!.id);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it("refuses changed approved operation bytes before snapshot and at the transaction boundary", () => {
  const f = fixture();
  approveChangeSet(f, human, f.proposal.id);
  const operations = f.proposal.operations.map((operation) => ({ ...operation, after: { ...operation.after, title: "Changed reviewed bytes" } }));
  f.database.$client.prepare("UPDATE change_sets SET operations_json = ? WHERE id = ?").run(JSON.stringify(operations), f.proposal.id);
  const snapshot = f.repository.getOperationSnapshot(f.proposal.projectId);
  const history = f.repository.listActivity(f.proposal.projectId);
  expect(() => applyChangeSet(f, human, f.proposal.id)).toThrow("operations require fresh approval");
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.applyChangeSet(f.proposal.id))).toThrow("operations require fresh approval");
  expect(f.repository.getOperationSnapshot(f.proposal.projectId)).toEqual(snapshot);
  expect(f.repository.listActivity(f.proposal.projectId)).toEqual(history);
  expect(f.repository.getChangeSet(f.proposal.id)?.status).toBe("approved");
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["proposal-only", "protected"] as const)("retains reviewed inline content for %s proposals without domain effects", (mode) => {
  const f = fixture();
  const projectId = f.proposal.projectId;
  const agent = { actorType: "agent", actorId: "source-host", mcpSessionId: "source-session" } as const;
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(projectId, { agentMode: mode === "protected" ? "propose" : "apply" }));
  const content = "Reviewed inline source.";
  const fileHash = createHash("sha256").update(content).digest("hex");
  const operation = { operationId: "inline-import", op: "import", entity: "sourceDocument", after: { projectId, title: "Inline source", type: "txt", fileHash, inlineContent: content } } as const;
  const before = f.repository.getOperationSnapshot(projectId);
  const result = executeChangeSetCommand(f, agent, { id: randomUUID(), projectId, title: "Deferred inline source", source: "mcp", createdAt: new Date().toISOString(), operations: [operation] }, { apply: mode !== "proposal-only" });
  expect(result).toMatchObject({ outcome: "proposed", changeSetId: result.changeSet.id, previewRef: { changeSetId: result.changeSet.id }, changeSet: { proposedBy: agent, operations: [operation] } });
  expect(f.repository.getOperationSnapshot(projectId)).toEqual(before);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  approveChangeSet(f, human, result.changeSetId);
  expect(applyChangeSet(f, human, result.changeSetId).changeSet.status).toBe("applied");
  const snapshot = f.repository.getOperationSnapshot(projectId);
  expect(snapshot.sourceDocuments).toHaveLength(1);
  expect(snapshot.sourceChunks).toMatchObject([{ text: content }]);
});

it("keeps immediate inline preparation executable and deferred durable imports independently executable", () => {
  const f = fixture();
  const projectId = f.proposal.projectId;
  const content = "Reviewed inline source.";
  const fileHash = createHash("sha256").update(content).digest("hex");
  const operation = { operationId: "inline-import", op: "import", entity: "sourceDocument", after: { projectId, title: "Inline source", type: "txt", fileHash, filePath: "inline://source" } } as const;
  const preparedSourceImports = { [operation.operationId]: { document: { ...operation.after, id: randomUUID(), importedAt: new Date().toISOString() }, chunks: [] } };
  const applied = executeChangeSetCommand(f, human, { id: randomUUID(), projectId, title: "Immediate import", source: "human", createdAt: new Date().toISOString(), operations: [operation] }, { preparedSourceImports }).changeSet;
  expect(applied.status).toBe("applied");
  const filePath = join(f.directory, "durable.txt");
  writeFileSync(filePath, content);
  const durableOperation = { ...operation, operationId: "durable-import", after: { ...operation.after, filePath, title: "Reviewed new metadata" } };
  const proposal = executeChangeSetCommand(f, human, { id: randomUUID(), projectId, title: "Deferred durable import", source: "human", createdAt: new Date().toISOString(), operations: [durableOperation] }, { apply: false }).changeSet;
  approveChangeSet(f, human, proposal.id);
  expect(applyChangeSet(f, human, proposal.id).changeSet.status).toBe("applied");
  const documents = f.repository.getOperationSnapshot(projectId).sourceDocuments;
  expect(documents).toHaveLength(1);
  expect(documents[0]).toEqual(preparedSourceImports[operation.operationId]!.document);
});

it("records GitHub execution separately from admitted Agent and stored human initiation", () => {
  const f = fixture();
  const projectId = f.proposal.projectId;
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(projectId, { github: true }));
  const agent = { actorType: "agent", actorId: "github-host", mcpSessionId: "github-session" } as const;
  const github = { ...agent, actorType: "github" } as const;
  const mapId = f.repository.listStoryMaps(projectId)[0]!.id;
  const input = () => ({ id: randomUUID(), projectId, title: "GitHub local command", source: "github" as const, createdAt: new Date().toISOString(), operations: [{ operationId: "github-card", op: "create" as const, entity: "card" as const, after: { storyMapId: mapId, level: "story" as const, title: "GitHub local Card" } }] });
  const immediate = executeChangeSetCommand(f, github, input(), { initiatingActor: agent });
  expect(immediate).toMatchObject({ outcome: "applied", changeSet: { source: "github", proposedBy: agent, execution: { actor: github, initiatedBy: agent, restorePoint: expect.any(String) } } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(projectId, { agentMode: "propose" }));
  const deferred = executeChangeSetCommand(f, github, input(), { initiatingActor: agent });
  expect(deferred).toMatchObject({ outcome: "proposed", changeSet: { proposedBy: agent } });
  approveChangeSet(f, human, deferred.changeSetId);
  const applied = applyChangeSet(f, human, deferred.changeSetId);
  expect(applied.changeSet).toMatchObject({ proposedBy: agent, execution: { actor: { ...human, actorType: "github" }, initiatedBy: human } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(projectId, { agentMode: "off" }));
  const before = f.repository.listChangeSets(projectId);
  expect(() => executeChangeSetCommand(f, github, input(), { initiatingActor: agent })).toThrow("access is disabled");
  expect(f.repository.listChangeSets(projectId)).toEqual(before);
});

it("checks immutable inline source hashes even when prepared content is supplied", () => {
  const f = fixture();
  const projectId = f.proposal.projectId;
  const operation = { operationId: "tampered-inline", op: "import", entity: "sourceDocument", after: { projectId, title: "Reviewed inline", type: "txt", fileHash: createHash("sha256").update("Reviewed bytes").digest("hex"), inlineContent: "Changed bytes" } } as const;
  const preparedSourceImports = { [operation.operationId]: { document: { projectId, title: operation.after.title, type: operation.after.type, fileHash: operation.after.fileHash, filePath: "inline://reviewed", id: randomUUID(), importedAt: new Date().toISOString() }, chunks: [] } };
  expect(() => executeChangeSetCommand(f, human, { id: randomUUID(), projectId, title: "Tampered source", source: "human", operations: [operation], createdAt: new Date().toISOString() }, { preparedSourceImports })).toThrow("conflicts with newer changes");
  expect(f.repository.getOperationSnapshot(projectId).sourceDocuments).toEqual([]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  expect(f.repository.listChangeSets(projectId).at(-1)?.status).toBe("conflict");
});

function rejectAppliedActivity() {
  const original = core.createActivityEvent;
  return vi.spyOn(core, "createActivityEvent").mockImplementation((input) => {
    if (input.action === "changeSet.applied") throw new Error("applied event refused");
    return original(input);
  });
}
