import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, OperationSnapshot, StoryMapSnapshot } from "@storymapper/contracts";
import { previewFixture, previewHuman } from "@storymapper/server/fixtures/changeset-preview";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

function semantic(state: Pick<OperationSnapshot | StoryMapSnapshot, "cards" | "githubLinks" | "sourceLinks">) {
  const cardIdentity = new Map(state.cards.map((card) => [card.id, card.key.startsWith("NEW-") || card.title === "Created activity" ? "created-activity" : card.id]));
  const cards = state.cards.map((card) => ({ ...Object.fromEntries(Object.entries(card).filter(([key, value]) => value !== null && !["id", "key", "createdAt", "updatedAt"].includes(key))), identity: cardIdentity.get(card.id), parentId: card.parentId ? cardIdentity.get(card.parentId) : null })).sort((a, b) => a.identity!.localeCompare(b.identity!));
  return { cards, githubLinks: state.githubLinks.map((row) => ({ ...row, ...(row.cardId ? { cardId: cardIdentity.get(row.cardId) } : {}) })), sourceLinks: state.sourceLinks.map((row) => ({ ...row, cardId: cardIdentity.get(row.cardId) })).sort((a, b) => a.id.localeCompare(b.id)) };
}

it.each(["all", "exclude-create", "exclude-remove"])("keeps mixed dependency effects equal through HTTP preview, approval and separate Apply: %s", async (selection) => {
  const f = await previewFixture();
  cleanup.push(f.close);
  const identity = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const github = repository.createGitHubLink({ cardId: f.cards[0]!.id, repo: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" });
    repository.createCardSourceLink(f.cards[1]!.id, { kind: "github", externalRefId: github.id });
    return github;
  });
  const operations: ChangeOperation[] = [
    { operationId: "create", op: "create", entity: "card", entityId: "new-activity", after: { storyMapId: f.map.id, level: "activity", title: "Created activity", releaseId: f.release.id } },
    { operationId: "reassign", op: "update", entity: "githubExternalRef", entityId: identity.id, after: { entityType: "card", entityId: "new-activity", externalId: identity.url, scopeId: f.map.id } },
    { operationId: "detach", op: "update", entity: "card", entityId: "new-activity", after: { releaseId: null } },
    { operationId: "remove", op: "delete", entity: "githubExternalRef", entityId: identity.id, after: {} },
    { operationId: "shared", op: "update", entity: "card", entityId: f.cards[1]!.id, after: { title: "Shared edit" } },
    { operationId: "chain", op: "update", entity: "card", entityId: f.cards[1]!.id, after: { description: "Chained edit" } },
    { operationId: "independent", op: "update", entity: "card", entityId: f.cards[2]!.id, after: { title: "Independent edit" } }
  ];
  const proposal = f.proposal(operations);
  const requested = operations.filter((operation) => selection === "all" || operation.operationId !== (selection === "exclude-create" ? "create" : "remove")).map((operation) => operation.operationId);
  const before = f.handle.current.$client.serialize();
  const preview = await f.readPreview(proposal.id, requested);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
  expect(preview.conflicts).toEqual([]);
  const selected = selection === "all" ? requested : selection === "exclude-create" ? ["independent"] : ["create", "reassign", "detach", "independent"];
  expect(preview.selectedOperationIds).toEqual(selected);
  const payload = { selectedOperationIds: selected };
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/approve`, payload })).statusCode).toBe(200);
  expect(f.repository.getChangeSet(proposal.id)?.approval).toMatchObject({ actor: { actorType: "human" }, selectedOperationIds: selected });
  expect(f.repository.getOperationSnapshot(f.project.id).cards).toHaveLength(3);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload });
  expect(applied.statusCode, applied.body).toBe(200);
  expect(f.repository.getChangeSet(proposal.id)?.execution?.selectedOperationIds).toEqual(selected);
  const projected = preview.boards.find((board) => board.snapshot.storyMap.id === f.map.id)!.snapshot;
  expect(semantic(f.repository.getStoryMapSnapshot(f.map.id)!)).toEqual(semantic(projected));
  const activity = f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied" && event.after && typeof event.after === "object" && "changeSetId" in event.after && event.after.changeSetId === proposal.id);
  expect(activity.map((event) => (event.after as { operationId: string }).operationId).sort()).toEqual([...selected].sort());
});

it("retains a physical shared attachment while it is hidden by canonical ownership and reveals it after moving away", async () => {
  const f = await previewFixture();
  cleanup.push(f.close);
  const seeded = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const identity = repository.createGitHubLink({ cardId: f.cards[0]!.id, repo: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" });
    const evidence = repository.createCardSourceLink(f.cards[1]!.id, { kind: "github", externalRefId: identity.id })!;
    return { identity, evidence };
  });
  for (const cardId of [f.cards[1]!.id, f.cards[0]!.id]) {
    const proposal = f.proposal([{ operationId: "reassign", op: "update", entity: "githubExternalRef", entityId: seeded.identity.id, after: { entityType: "card", entityId: cardId, externalId: seeded.identity.url, scopeId: f.map.id } }]);
    const preview = await f.readPreview(proposal.id);
    expect(preview.conflicts).toEqual([]);
    for (const action of ["approve", "apply"]) expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/${action}`, payload: {} })).statusCode).toBe(200);
    const actual = f.repository.getStoryMapSnapshot(f.map.id)!;
    expect(semantic(actual)).toEqual(semantic(preview.boards[0]!.snapshot));
    expect(f.handle.current.$client.prepare("SELECT id FROM card_github_evidence WHERE id = ?").get(seeded.evidence.id)).toEqual({ id: seeded.evidence.id });
    expect(actual.sourceLinks.filter((row) => row.kind === "github" && row.externalRefId === seeded.identity.id && row.cardId === cardId)).toHaveLength(1);
  }
  const final = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(final.sourceLinks).toContainEqual(expect.objectContaining({ id: seeded.evidence.id, cardId: f.cards[1]!.id }));
  expect(final.cards.find((card) => card.id === f.cards[1]!.id)?.provenance).toBe("linked");
  const removal = f.proposal([
    { operationId: "reassign-again", op: "update", entity: "githubExternalRef", entityId: seeded.identity.id, after: { entityType: "card", entityId: f.cards[1]!.id, externalId: seeded.identity.url, scopeId: f.map.id } },
    { operationId: "unlink-canonical", op: "unlink", entity: "sourceLink", entityId: "canonical-evidence", after: { kind: "github", cardId: f.cards[1]!.id, id: seeded.identity.id } }
  ]);
  const preview = await f.readPreview(removal.id);
  expect(preview.conflicts).toEqual([]);
  for (const action of ["approve", "apply"]) expect((await f.server.inject({ method: "POST", url: `/api/changesets/${removal.id}/${action}`, payload: {} })).statusCode).toBe(200);
  const removed = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(semantic(removed)).toEqual(semantic(preview.boards[0]!.snapshot));
  expect(removed.githubLinks).toEqual([]);
  expect(f.handle.current.$client.prepare("SELECT id FROM card_github_evidence WHERE id = ?").get(seeded.evidence.id)).toBeUndefined();
});

it("projects one canonical Issue source for a newly created GitHub identity", async () => {
  const f = await previewFixture();
  cleanup.push(f.close);
  const proposal = f.proposal([{ operationId: "create-github", op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: f.cards[0]!.id, externalId: "https://github.com/org/repo/issues/7", scopeId: f.map.id } }]);
  const preview = await f.readPreview(proposal.id);
  expect(preview.conflicts).toEqual([]);
  expect(preview.boards[0]!.snapshot.sourceLinks).toHaveLength(1);
  for (const action of ["approve", "apply"]) expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/${action}`, payload: {} })).statusCode).toBe(200);
  const actual = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(actual.sourceLinks).toHaveLength(1);
  expect(actual.sourceLinks[0]).toMatchObject({ id: actual.githubLinks[0]!.id, externalRefId: actual.githubLinks[0]!.id, cardId: f.cards[0]!.id });
  expect(actual.cards.find((card) => card.id === f.cards[0]!.id)?.provenance).toBe(preview.boards[0]!.snapshot.cards.find((card) => card.id === f.cards[0]!.id)?.provenance);
  expect(f.repository.getOperationSnapshot(f.project.id).sourceLinks).toEqual([]);
});
