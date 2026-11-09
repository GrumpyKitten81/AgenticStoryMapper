import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, ResolvedEntityChange } from "@storymapper/contracts";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, openStoryMapperDb, publishRestorePoint } from "@storymapper/db";

const actor = { actorType: "human", actorId: "source-audit-test" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture(count: number) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-source-audit-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Source audit" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Audit map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Published Slice" });
    const cards = Array.from({ length: count }, (_, index) => tx.createCard({ storyMapId: map.id, level: "story", title: `Card ${String(index).padStart(3, "0")}`, releaseId: release.id }));
    return { project, map, release, cards };
  });
  return { handle, uow, repository, ...data };
}

function apply(data: ReturnType<typeof fixture>, operations: ChangeOperation[]): string {
  const proposal = data.uow.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id, title: "Publish source evidence", source: "human", createdAt: new Date().toISOString(), operations }));
  data.uow.run(actor, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  data.uow.runPrepared(actor, (database) => ({ supply: data.repository.prepareOperationSupply(operations, data.repository.getOperationSnapshot(data.project.id)), restorePoint: publishRestorePoint(database, "pre-apply").fileName }), ({ repository }, prepared) => repository.applyChangeSet(proposal.id, prepared));
  return proposal.id;
}

function bindAll(data: ReturnType<typeof fixture>): string {
  return apply(data, data.cards.map((card, index) => ({ operationId: `bind-${index}`, entityId: `binding-${index}`, entity: "externalRef", op: "set", after: { entityType: "card", entityId: card.id, scopeId: data.map.id, system: "source", externalId: `story-${index}` } })));
}

function operationAudits(data: ReturnType<typeof fixture>, changeSetId: string) {
  return data.repository.listActivity(data.project.id).filter((event) => event.action === "changeSet.operation.applied")
    .map((event) => event.after as { changeSetId: string; operationId: string; index: number; changes: ResolvedEntityChange[] }).filter((event) => event.changeSetId === changeSetId);
}

it("retains complete canonical baselines while audit evidence contains exactly the addressed entry delta", () => {
  const data = fixture(3);
  bindAll(data);
  const before = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const card = data.cards[1]!;
  const changeSetId = apply(data, [{ operationId: "publish-one", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "story-1" }, after: { storyMapId: data.map.id, level: "story", title: "Updated source Story" } }]);
  const after = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  expect(after.entries).toHaveLength(3);
  expect(after.releases).toEqual(before.releases);
  expect(after.entries.filter((entry) => entry.cardId !== card.id)).toEqual(before.entries.filter((entry) => entry.cardId !== card.id));
  const audits = operationAudits(data, changeSetId);
  expect(audits).toHaveLength(1);
  const evidence = audits[0]!.changes.find((change) => change.entity === "sourcePlanBaseline")!;
  if (evidence.entity !== "sourcePlanBaseline") throw new Error("Missing source baseline evidence");
  expect(evidence.evidenceScope).toBe("addressedEntries");
  const { entries: oldEntries, releases: oldReleases, ...oldMetadata } = before;
  const { entries: newEntries, releases: newReleases, ...newMetadata } = after;
  expect(evidence.before).toEqual({ ...oldMetadata, entries: [oldEntries.find((entry) => entry.cardId === card.id)!], releases: [] });
  expect(evidence.after).toEqual({ ...newMetadata, entries: [newEntries.find((entry) => entry.cardId === card.id)!], releases: [] });
  expect(evidence.after!.entries[0]).toMatchObject({ identity: { key: card.key, title: "Updated source Story" }, card: { key: card.key, version: card.version + 1 }, binding: { syncedVersion: card.version + 1 } });
  expect(audits[0]!.changes.find((change) => change.entity === "card")?.after).toEqual(data.repository.getCard(card.id));
  expect(audits[0]!.changes.find((change) => change.entity === "externalRef")?.after).toEqual(data.repository.listExternalRefsForStoryMap(data.map.id).find((ref) => ref.entityId === card.id));
});

it("keeps initial publication audit entries and serialized bytes linear as the canonical baseline grows", () => {
  const results = [50, 100].map((count) => {
    const data = fixture(count);
    const changeSetId = bindAll(data);
    const audits = operationAudits(data, changeSetId);
    expect(audits).toHaveLength(count);
    const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
    expect(baseline.entries).toHaveLength(count);
    expect(baseline.releases).toEqual([{ id: data.release.id, name: data.release.name }]);
    let entries = 0;
    let releases = 0;
    for (const audit of audits) {
      const change = audit.changes.find((entry) => entry.entity === "sourcePlanBaseline")!;
      if (change.entity !== "sourcePlanBaseline") throw new Error("Missing source baseline evidence");
      expect(change.evidenceScope).toBe("addressedEntries");
      expect(change.before?.entries ?? []).toEqual([]);
      expect(change.after!.entries).toHaveLength(1);
      const captured = change.after!.entries[0]!;
      expect(captured).toEqual(baseline.entries.find((entry) => entry.cardId === captured.cardId));
      entries += (change.before?.entries.length ?? 0) + change.after!.entries.length;
      releases += (change.before?.releases.length ?? 0) + change.after!.releases.length;
    }
    expect(entries).toBe(count);
    expect(releases).toBe(1);
    return { entries, bytes: Buffer.byteLength(JSON.stringify(audits)) };
  });
  expect(results[1]!.entries).toBe(results[0]!.entries * 2);
  expect(results[1]!.bytes / results[0]!.bytes).toBeGreaterThan(1.8);
  expect(results[1]!.bytes / results[0]!.bytes).toBeLessThan(2.25);
  expect(results[1]!.bytes).toBeLessThan(500_000);
});

it("records exact changed Release evidence without rewriting excluded Cards' captured Slice names", () => {
  const data = fixture(2);
  bindAll(data);
  const before = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const changeSetId = apply(data, [
    { operationId: "rename", entity: "release", op: "update", entityId: data.release.id, after: { name: "Reconciled Slice" } },
    { operationId: "publish", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "story-0" }, after: { storyMapId: data.map.id, level: "story", title: data.cards[0]!.title } }
  ]);
  const after = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const audits = operationAudits(data, changeSetId);
  const evidence = audits.flatMap((audit) => audit.changes).find((change) => change.entity === "sourcePlanBaseline")!;
  if (evidence.entity !== "sourcePlanBaseline") throw new Error("Missing source baseline evidence");
  expect(evidence.before!.entries).toEqual([before.entries.find((entry) => entry.cardId === data.cards[0]!.id)]);
  expect(evidence.after!.entries).toEqual([after.entries.find((entry) => entry.cardId === data.cards[0]!.id)]);
  expect(evidence.before!.releases).toEqual([{ id: data.release.id, name: "Published Slice" }]);
  expect(evidence.after!.releases).toEqual([{ id: data.release.id, name: "Reconciled Slice" }]);
  expect(after.entries.find((entry) => entry.cardId === data.cards[1]!.id)).toEqual(before.entries.find((entry) => entry.cardId === data.cards[1]!.id));
  expect(after.entries.find((entry) => entry.cardId === data.cards[0]!.id)?.releaseName).toBe("Reconciled Slice");
  expect(after.entries.find((entry) => entry.cardId === data.cards[1]!.id)?.releaseName).toBe("Published Slice");
});

it("allocates canonical keys in both audit cuts for multiple new upserts without inflating unchanged entry deltas", () => {
  const data = fixture(0);
  const count = 12;
  const operations: ChangeOperation[] = Array.from({ length: count }, (_, index) => ({ operationId: `new-${index}`, entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: `new-${index}` }, after: { storyMapId: data.map.id, level: "story", title: `New Card ${index}`, releaseId: data.release.id } }));
  operations.push({ operationId: "update-new", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "new-0" }, after: { storyMapId: data.map.id, level: "story", title: "Final Card", releaseId: data.release.id } });
  const changeSetId = apply(data, operations);
  const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  expect(baseline.entries).toHaveLength(count);
  const audits = operationAudits(data, changeSetId);
  expect(JSON.stringify(audits)).not.toContain("NEW-");
  let evidenceEntries = 0;
  for (const audit of audits) {
    const evidence = audit.changes.find((change) => change.entity === "sourcePlanBaseline")!;
    if (evidence.entity !== "sourcePlanBaseline") throw new Error("Missing source baseline evidence");
    expect(evidence.after!.entries).toHaveLength(1);
    for (const cut of [evidence.before, evidence.after]) for (const entry of cut?.entries ?? []) {
      const current = data.repository.getCard(entry.cardId)!;
      expect(entry.identity.key).toBe(current.key);
      expect(entry.card?.key).toBe(current.key);
      evidenceEntries += 1;
    }
  }
  expect(evidenceEntries).toBe(count + 2);
  const finalAudit = audits.find((audit) => audit.operationId === "update-new");
  expect(finalAudit).toMatchObject({ operationId: "update-new", index: count });
  const finalEvidence = finalAudit!.changes.find((change) => change.entity === "sourcePlanBaseline")!;
  if (finalEvidence.entity !== "sourcePlanBaseline") throw new Error("Missing source baseline evidence");
  expect(finalEvidence.before!.entries[0]!.identity.title).toBe("New Card 0");
  expect(finalEvidence.after!.entries[0]!.identity.title).toBe("Final Card");
});
