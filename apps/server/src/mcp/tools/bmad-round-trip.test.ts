import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { storyMapSnapshotSchema, type WorkflowStatus, type StoryMapSnapshot } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from "@storymapper/db";
import { human, publicationResult, roundTripFixture, type RoundTripFixture } from "@storymapper/server/fixtures/bmad-round-trip/harness";
import { recordedFiles } from "@storymapper/server/fixtures/bmad-round-trip/composer";

import { splitMarkdownIntoChunks } from "@storymapper/importers";
import { recordedDeliveryTargets } from "@storymapper/server/fixtures/bmad-round-trip/sprint-recording";

const fixtures: RoundTripFixture[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0).reverse()) await fixture.close(); });
async function fixture(protectedProject = false) { const f = await roundTripFixture(protectedProject); fixtures.push(f); return f; }
function cardFor(snapshot: StoryMapSnapshot, externalId: string) { const ref = snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.scopeId === snapshot.storyMap.id && ref.externalId === externalId)!; return snapshot.cards.find((card) => card.id === ref.entityId)!; }
function publishedState(snapshot: StoryMapSnapshot) { const { productContext: _unpersistedDefault, ...state } = snapshot; return state; }
function semantic(snapshot: StoryMapSnapshot) {
  const refs = snapshot.externalRefs.filter((ref) => ref.system === "bmad");
  const identity = (id: string | null) => refs.find((ref) => ref.entityId === id)?.externalId ?? null;
  return { cards: snapshot.cards.map((card) => ({ identity: identity(card.id), title: card.title, description: card.description, level: card.level, parent: identity(card.parentId), release: identity(card.releaseId), status: card.status, version: card.version, provenance: card.provenance })).sort((a, b) => a.identity!.localeCompare(b.identity!)), releases: snapshot.releases.map((release) => ({ identity: identity(release.id), name: release.name, position: release.position, version: release.version })).sort((a, b) => a.position - b.position), references: refs.map((ref) => ({ type: ref.entityType, id: ref.externalId, version: ref.syncedVersion })).sort((a, b) => a.id.localeCompare(b.id)), evidence: snapshot.sourceLinks.filter((link) => link.kind === "chunk").map((link) => ({ identity: identity(link.cardId), text: snapshot.sourceChunks.find((chunk) => link.kind === "chunk" && chunk.id === link.chunkId)?.text })).sort((a, b) => a.identity!.localeCompare(b.identity!)) };
}
function assertNoop(f: RoundTripFixture, changeSetId: string): void {
  const rows = f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied" && event.after && typeof event.after === "object" && "changeSetId" in event.after && event.after.changeSetId === changeSetId);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.after).toMatchObject({ status: "unchanged", changes: [] });
}
async function initial(f: RoundTripFixture, surface: string) { const result = publicationResult((await f.publication(surface, "initial")).result); expect(result.outcome).toBe("applied"); await f.rememberSources(surface, "initial"); return result; }
function assertInitial(snapshot: StoryMapSnapshot): void {
  expect(snapshot.cards.filter((card) => card.level === "activity")).toHaveLength(6);
  expect(snapshot.cards.filter((card) => card.level === "step")).toHaveLength(6);
  expect(snapshot.cards.filter((card) => card.level === "story")).toHaveLength(34);
  expect(snapshot.externalRefs).toHaveLength(49);
  expect(snapshot.sourceLinks).toHaveLength(49);
  expect(snapshot.releases).toHaveLength(3);
  for (const card of snapshot.cards) {
    expect(card).toMatchObject({ version: 1, provenance: "linked", description: expect.stringMatching(/^Given .* when .* then /) });
    expect(snapshot.externalRefs.find((ref) => ref.entityId === card.id)?.syncedVersion).toBe(1);
    const link = snapshot.sourceLinks.find((link) => link.cardId === card.id)!;
    expect(link.kind).toBe("chunk");
    if (link.kind === "chunk") expect(snapshot.sourceChunks.find((chunk) => chunk.id === link.chunkId)?.text && card.description.includes(snapshot.sourceChunks.find((chunk) => chunk.id === link.chunkId)!.text)).toBe(true);
    if (card.level === "step") expect(snapshot.cards.find((parent) => parent.id === card.parentId)).toMatchObject({ level: "activity", title: card.title });
    if (card.level === "story") expect(snapshot.cards.find((parent) => parent.id === card.parentId)?.level).toBe("step");
  }
  const storyFile = recordedFiles("initial").find((file) => file.name === "stories/1.1.md")!;
  const multiline = cardFor(snapshot, "story-1.1");
  expect(multiline.description).toBe(storyFile.content.split("\n").slice(1).join("\n").trim());
  expect(multiline.description).toContain("## Acceptance Criteria\n- The supplied name is retained.");
  expect(snapshot.sourceLinks.filter((link) => link.cardId === multiline.id).map((link) => snapshot.sourceChunks.find((chunk) => link.kind === "chunk" && chunk.id === link.chunkId)!.locator).sort()).toEqual(splitMarkdownIntoChunks(storyFile.content).map((chunk) => chunk.locator).sort());
  assertSliceMembership(snapshot, recordedFiles("initial").at(-1)!.content);
}

function assertSliceMembership(snapshot: StoryMapSnapshot, content: string): void {
  const expected = new Set<string>();
  for (const line of content.trim().split("\n")) {
    const [id, , members] = line.split("|");
    const releaseId = snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.entityType === "release" && ref.externalId === `release-${id}`)!.entityId;
    const actual = snapshot.cards.filter((card) => card.level === "story" && !card.archived && card.releaseId === releaseId).map((card) => snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.entityType === "card" && ref.entityId === card.id)!.externalId);
    const ids = members ? members.split(",").map((id) => `story-${id}`) : [];
    expect(actual.sort()).toEqual(ids.sort());
    for (const id of ids) expected.add(id);
  }
  for (const card of snapshot.cards.filter((card) => card.level === "story" && !card.archived)) {
    const id = snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.entityId === card.id)!.externalId;
    if (!expected.has(id)) expect(card.releaseId).toBeNull();
  }
}
function assertCurrentEvidence(snapshot: StoryMapSnapshot, documents: Awaited<ReturnType<RoundTripFixture["read"]>>["documents"], externalId: string, recording: "refresh" | "evidence", oldLinks: StoryMapSnapshot["sourceLinks"]): void {
  const card = cardFor(snapshot, externalId);
  const file = recordedFiles(recording).find((file) => file.name === `stories/${externalId.slice(6)}.md`)!;
  const chunks = documents.find((doc) => doc.document.fileHash === file.hash)!.chunks.filter((chunk) => chunk.heading?.startsWith("Story "));
  for (const old of oldLinks) expect(snapshot.sourceLinks.some((link) => link.id === old.id)).toBe(false);
  const links = snapshot.sourceLinks.filter((link) => link.cardId === card.id && link.kind === "chunk" && chunks.some((chunk) => link.kind === "chunk" && chunk.id === link.chunkId));
  expect(links.map((link) => link.kind === "chunk" ? link.chunkId : "").sort()).toEqual(chunks.map((chunk) => chunk.id).sort());
  expect(card.description).toBe(file.content.split("\n").slice(1).join("\n").split("\n# Recording")[0]!.trim());
  expect(card.title).toBe(file.content.split("\n")[0]!.split(": ").slice(1).join(": "));
}

it.each(["http", "sdk"])("publishes 6/34 on %s, previews protection and human API apply with equivalent durable hierarchy/evidence/audit", async (surface) => {
  const f = await fixture();
  const result = await initial(f, surface);
  const state = (await f.read(surface)).snapshot;
  assertInitial(state);
  expect(result.changeSet.proposedBy).toMatchObject({ actorType: "agent", actorId: surface === "sdk" ? "round-trip-sdk-host" : "local-mcp-host", mcpSessionId: surface === "sdk" ? f.transport.sessionId : expect.any(String) });
  expect(result.changeSet.execution?.actor).toEqual(result.changeSet.proposedBy);
  expect(f.live.filter((event) => event.entities.some((entity) => entity.entityType === "card"))).toHaveLength(1);
  const protectedFixture = await fixture(true);
  const before = protectedFixture.repository.getOperationSnapshot(protectedFixture.project.id);
  const proposed = publicationResult((await protectedFixture.publication(surface, "initial")).result);
  expect(proposed.outcome).toBe("proposed");
  expect(protectedFixture.repository.getOperationSnapshot(protectedFixture.project.id)).toEqual(before);
  expect(readdirSync(protectedFixture.directory)).not.toContain("snapshots");
  expect(protectedFixture.repository.listChangeSets()).toHaveLength(1);
  const preview = await (await fetch(`${protectedFixture.base}/api/changesets/${proposed.changeSetId}/preview`)).json();
  expect(preview.conflicts).toEqual([]);
  expect(preview.operations).toHaveLength(proposed.changeSet.operations.length);
  expect(preview.operations.flatMap((operation: { changes: Array<{ entity: string; before?: unknown }> }) => operation.changes).filter((change: { entity: string; before?: unknown }) => change.entity === "card" && !change.before)).toHaveLength(46);
  await protectedFixture.reviewedApply(proposed.changeSetId);
  assertInitial((await protectedFixture.read(surface)).snapshot);
  expect(semantic((await protectedFixture.read(surface)).snapshot)).toEqual(semantic(state));
  const identical = publicationResult((await f.publication(surface, "initial")).result);
  assertNoop(f, identical.changeSetId);
  expect(publishedState((await f.read(surface)).snapshot)).toEqual(publishedState(state));
  const reopened = openStoryMapperDb(f.path);
  try {
    const durable = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(durable.listCards(f.map.id)).toHaveLength(46);
    const audits = durable.listActivity(f.project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "SubmitChangeSet");
    expect(audits).toHaveLength(2);
    for (const audit of audits) expect(audit).toMatchObject({ actorType: "agent", actor: result.changeSet.proposedBy!.actorId, after: { outcome: "ok" } });
  } finally { reopened.$client.close(); }
});

it.each(["http", "sdk"])("refreshes two edits/remove/add on %s with reviewed archive, immutable source history and repeat no-op", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const removedId = cardFor((await f.read(surface)).snapshot, "story-6.5").id;
  f.unitOfWork.run(human, ({ repository }) => repository.setExternalRef({ entityType: "card", entityId: removedId, system: "other", externalId: "removed-story" }));
  const old = await f.read(surface);
  const unrelatedRef = old.snapshot.externalRefs.find((ref) => ref.system === "other")!;
  const proposed = publicationResult((await f.publication(surface, "refresh", false)).result);
  expect(proposed.outcome).toBe("proposed");
  expect(proposed.changeSet.operations.filter((op) => op.op === "archive")).toMatchObject([{ entityId: cardFor(old.snapshot, "story-6.5").id, baseVersion: 1 }]);
  expect(publishedState((await f.read(surface)).snapshot)).toEqual(publishedState(old.snapshot));
  await f.reviewedApply(proposed.changeSetId); await f.rememberSources(surface, "refresh");
  const current = await f.read(surface);
  expect(current.snapshot.cards).toHaveLength(47);
  expect(cardFor(current.snapshot, "story-6.5")).toMatchObject({ id: cardFor(old.snapshot, "story-6.5").id, archived: true, status: cardFor(old.snapshot, "story-6.5").status });
  for (const id of ["story-1.1", "story-3.1"]) expect(cardFor(current.snapshot, id)).toMatchObject({ id: cardFor(old.snapshot, id).id, version: 2 });
  expect(cardFor(current.snapshot, "story-6.6")).toMatchObject({ version: 1, status: "todo" });
  for (const id of ["story-1.1", "story-3.1"]) assertCurrentEvidence(current.snapshot, current.documents, id, "refresh", old.snapshot.sourceLinks.filter((link) => link.cardId === cardFor(old.snapshot, id).id));
  assertSliceMembership(current.snapshot, recordedFiles("refresh").at(-1)!.content);
  expect(current.documents).toHaveLength(old.documents.length + 4);
  for (const doc of old.documents) expect(current.documents).toContainEqual(doc);
  const previousEdited = old.documents.find((doc) => doc.document.title === "stories/1.1.md")!;
  const historicalRead = (await f.call(surface, { documentId: previousEdited.document.id }, "GetSourceDocument")).data;
  expect({ document: historicalRead.document, chunks: historicalRead.chunks }).toEqual(previousEdited);
  const repeat = publicationResult((await f.publication(surface, "refresh")).result);
  expect(repeat.changeSet.operations.some((op) => op.op === "archive")).toBe(false);
  assertNoop(f, repeat.changeSetId);
  expect(publishedState((await f.read(surface)).snapshot)).toEqual(publishedState(current.snapshot));
  expect(current.snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.entityId === removedId)?.syncedVersion).toBe(2);
  expect(current.snapshot.externalRefs.find((ref) => ref.system === "other")).toEqual(unrelatedRef);
  const returning = publicationResult((await f.publication(surface, "initial", false)).result);
  await f.reviewedApply(returning.changeSetId); await f.rememberSources(surface, "initial");
  const returned = (await f.read(surface)).snapshot;
  expect(cardFor(returned, "story-6.5")).toMatchObject({ id: removedId, status: "todo", version: 3 });
  expect(returned.externalRefs.find((ref) => ref.system === "other")).toEqual(unrelatedRef);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(removedId, { title: "Intervening human edit" }));
  const humanState = f.repository.getOperationSnapshot(f.project.id);
  const refused = (await f.publication(surface, "refresh", false)).result;
  expect(refused).toMatchObject({ code: "conflict", conflicts: expect.arrayContaining([expect.objectContaining({ id: removedId })]) });
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(humanState);
});

it.each(["http", "sdk"])("updates evidence-only baselines on %s and preserves manual evidence and other maps/systems", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const originalRead = await f.read(surface);
  const original = cardFor(originalRead.snapshot, "story-1.1");
  publicationResult(await f.call(surface, { projectId: f.project.id, title: "Preserve supplied manual evidence", operations: [
    { operationId: "retain-publication", op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "story-1.1" }, after: { storyMapId: f.map.id, level: "story", title: original.title } },
    { operationId: "manual-note", entityId: "manual-note-local", op: "link", entity: "sourceLink", after: { cardId: original.id, kind: "note", note: "Supplied manual evidence outside the recipe" } },
    { operationId: "manual-chunk", entityId: "manual-chunk-local", op: "link", entity: "sourceLink", after: { cardId: original.id, kind: "chunk", chunkId: originalRead.documents.find((doc) => doc.document.title === "stories/1.2.md")!.chunks[0]!.id } }
  ] }));
  const old = await f.read(surface);
  const card = cardFor(old.snapshot, "story-1.1");
  const manual = old.snapshot.sourceLinks.filter((link) => link.cardId === original.id && (link.kind === "note" || link.kind === "chunk" && originalRead.documents.find((doc) => doc.document.title === "stories/1.2.md")!.chunks.some((chunk) => chunk.id === link.chunkId)));
  f.unitOfWork.run(human, ({ repository }) => {
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "other", externalId: "same" });
    const foreign = repository.createCard({ storyMapId: f.otherMap.id, level: "story", title: card.title });
    repository.setExternalRef({ entityType: "card", entityId: foreign.id, system: "bmad", externalId: "story-1.1" });
  });
  const before = await f.read(surface);
  const unrelated = publishedState(f.repository.getStoryMapSnapshot(f.otherMap.id)!);
  const result = publicationResult((await f.publication(surface, "evidence")).result);
  expect(result.outcome).toBe("applied"); await f.rememberSources(surface, "evidence");
  const after = await f.read(surface);
  expect(cardFor(after.snapshot, "story-1.1")).toMatchObject({ title: card.title, description: card.description, version: card.version + 1 });
  expect(after.snapshot.externalRefs.find((ref) => ref.system === "bmad" && ref.entityId === card.id)?.syncedVersion).toBe(card.version + 1);
  expect(after.snapshot.externalRefs.find((ref) => ref.system === "other")).toEqual(before.snapshot.externalRefs.find((ref) => ref.system === "other"));
  expect(publishedState(f.repository.getStoryMapSnapshot(f.otherMap.id)!)).toEqual(unrelated);
  expect(after.documents).toHaveLength(before.documents.length + 1);
  expect(manual).toHaveLength(2);
  for (const link of manual) expect(after.snapshot.sourceLinks).toContainEqual(link);
  assertCurrentEvidence(after.snapshot, after.documents, "story-1.1", "evidence", originalRead.snapshot.sourceLinks.filter((link) => link.cardId === original.id));
  const currentHash = recordedFiles("evidence").find((file) => file.name === "stories/1.1.md")!.hash;
  const currentChunk = after.documents.find((doc) => doc.document.fileHash === currentHash)!.chunks.find((chunk) => chunk.heading?.startsWith("Story "))!.id;
  const linked = after.snapshot.sourceLinks.find((link) => link.cardId === card.id && link.kind === "chunk" && link.chunkId === currentChunk)!;
  expect(after.documents.find((doc) => linked.kind === "chunk" && doc.chunks.some((chunk) => chunk.id === linked.chunkId))?.document.fileHash).toBe(currentHash);
  const repeat = publicationResult((await f.publication(surface, "evidence")).result);
  assertNoop(f, repeat.changeSetId);
  expect(publishedState((await f.read(surface)).snapshot)).toEqual(publishedState(after.snapshot));
});

it.each(["http", "sdk"])("uses exact scoped identities on %s for duplicate titles and same-title renumbering", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const before = (await f.read(surface)).snapshot;
  expect(cardFor(before, "story-1.2").title).toBe(cardFor(before, "story-1.3").title);
  expect(cardFor(before, "story-1.2").id).not.toBe(cardFor(before, "story-1.3").id);
  const proposal = publicationResult((await f.publication(surface, "renumber", false)).result);
  await f.reviewedApply(proposal.changeSetId);
  const after = (await f.read(surface)).snapshot;
  expect(cardFor(after, "story-1.1")).toMatchObject({ id: cardFor(before, "story-1.1").id, archived: true, status: cardFor(before, "story-1.1").status });
  expect(cardFor(after, "story-1.7").title).toBe(cardFor(before, "story-1.1").title);
  expect(cardFor(after, "story-1.7").id).not.toBe(cardFor(before, "story-1.1").id);
  expect(cardFor(after, "story-1.2").id).toBe(cardFor(before, "story-1.2").id);
});

it.each(["http", "sdk"])("reports every changed/unchanged/removed human baseline on %s before proposal/source/snapshot writes", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const state = (await f.read(surface)).snapshot;
  const ids = ["story-1.1", "story-2.1", "story-6.5"].map((id) => cardFor(state, id).id);
  for (const id of ids) f.unitOfWork.run(human, ({ repository }) => repository.updateCard(id, { title: "Human title" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = ids.map((id) => f.repository.listCardHistory(id));
  const proposals = f.repository.listChangeSets().length;
  const snapshots = readdirSync(join(f.directory, "snapshots"));
  const { result, operations } = await f.publication(surface, "refresh", false);
  expect(result.code).toBe("conflict");
  expect(result.conflicts.map((conflict: { id: string }) => conflict.id).sort()).toEqual([...ids].sort());
  for (const conflict of result.conflicts) expect(operations[conflict.index]!.operationId).toBe(conflict.operationId);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(ids.map((id) => f.repository.listCardHistory(id))).toEqual(history);
  expect(f.repository.listChangeSets()).toHaveLength(proposals);
  expect(readdirSync(join(f.directory, "snapshots"))).toEqual(snapshots);
});

it.each(["http", "sdk"])("reviews explicit slicing and configured delivery on %s with notes and Activity reads", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const state = (await f.read(surface)).snapshot;
  const story = cardFor(state, "story-1.1");
  const operations = [{ operationId: "slice", op: "upsert", entity: "release", entityId: "slice-local", selector: { kind: "externalRef", system: "bmad", scopeId: f.map.id, externalId: "release-sprint-review" }, after: { storyMapId: f.map.id, name: "Review sprint" } }, { operationId: "assign", op: "upsert", entity: "card", selector: { kind: "externalRef", system: "bmad", scopeId: f.map.id, externalId: "story-1.1" }, after: { storyMapId: f.map.id, level: "story", title: story.title, releaseId: "slice-local" } }];
  const proposal = publicationResult(await f.call(surface, { projectId: f.project.id, title: "Reviewed slice", apply: false, operations }));
  expect(proposal.outcome).toBe("proposed"); await f.reviewedApply(proposal.changeSetId);
  expect((await f.call(surface, { projectId: f.project.id }, "GetSafetySettings")).data.settings).toMatchObject({ agentMode: "apply" });
  const customization = (await f.call(surface, { projectId: f.project.id, storyMapId: f.map.id }, "GetCustomization")).data;
  const targets = recordedDeliveryTargets(customization.workflowStatuses as WorkflowStatus[]);
  const delivered = publicationResult(await f.call(surface, { storyMapId: f.map.id, cards: targets }, "UpdateDeliveryStatus"));
  expect(delivered.outcome).toBe("applied");
  const current = storyMapSnapshotSchema.parse((await f.call(surface, { storyMapId: f.map.id }, "GetStoryMapSnapshot")).data);
  expect(cardFor(current, "story-1.1").status).toBe("Verified");
  expect(cardFor(current, "story-1.2").status).toBe("Review");
  const notes = await f.call(surface, { storyMapId: f.map.id, releaseId: cardFor(current, "story-1.1").releaseId }, "GetReleaseNotes");
  expect(JSON.stringify(notes.data)).toContain(story.title);
  const activity = await (await fetch(`${f.base}/api/activity?projectId=${f.project.id}`)).json();
  expect(JSON.stringify(activity)).toContain("UpdateDeliveryStatus");
  const republished = publicationResult((await f.publication(surface, "initial")).result);
  expect(republished.outcome).toBe("applied");
  const rerun = (await f.read(surface)).snapshot;
  for (const target of targets) {
    const before = cardFor(current, target.externalId);
    expect(cardFor(rerun, target.externalId)).toMatchObject({ id: before.id, status: target.status });
    expect(rerun.externalRefs.find((ref) => ref.system === "bmad" && ref.entityId === before.id)?.syncedVersion).toBe(cardFor(rerun, target.externalId).version);
  }
});

it.each(["http", "sdk"])("refuses delayed human drift after actual proposal and approval on %s atomically", async (surface) => {
  const f = await fixture(); await initial(f, surface);
  const old = (await f.read(surface)).snapshot;
  const proposed = publicationResult((await f.publication(surface, "refresh", false)).result);
  const approval = await fetch(`${f.base}/api/changesets/${proposed.changeSetId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect(approval.status).toBe(200);
  const edited = cardFor(old, "story-3.1");
  const humanEdit = await fetch(`${f.base}/api/cards/${edited.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Delayed human title", baseVersion: edited.version }) });
  expect(humanEdit.status).toBe(200);
  const before = f.repository.getOperationSnapshot(f.project.id);
  const snapshots = readdirSync(join(f.directory, "snapshots"));
  const response = await fetch(`${f.base}/api/changesets/${proposed.changeSetId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect(response.status).toBe(409);
  expect((await response.json()).conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ id: edited.id })]));
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(readdirSync(join(f.directory, "snapshots"))).toEqual(snapshots);
});
