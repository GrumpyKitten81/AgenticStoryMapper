import { afterEach, expect, it } from "vitest";
import type { OperationSupply } from "@storymapper/contracts";
import { prepareSourceOperations } from "@storymapper/server/application/changeset/prepare-operation-supply";
import { human, publicationResult, roundTripFixture, type RoundTripFixture } from "@storymapper/server/fixtures/bmad-round-trip/harness";
import { recordedFiles } from "@storymapper/server/fixtures/bmad-round-trip/composer";

const fixtures: RoundTripFixture[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

it.each(["http", "sdk"])("submits reserved operation IDs on %s and requires human approval before separate apply", async (surface) => {
  const f = await roundTripFixture(true);
  fixtures.push(f);
  const file = recordedFiles("initial")[0]!;
  const operations = [
    { operationId: "__proto__", op: "import", entity: "sourceDocument", after: { projectId: f.project.id, title: file.name, type: "markdown", fileHash: file.hash, inlineContent: file.content } },
    { operationId: "constructor", op: "upsert", entity: "card", selector: { kind: "externalRef", system: "bmad", scopeId: f.map.id, externalId: "reserved-card" }, after: { storyMapId: f.map.id, title: "Reserved ID", level: "activity" } },
    { operationId: "toString", op: "create", entity: "roadmap", after: { projectId: f.project.id, storyMapId: f.map.id, name: "Reserved roadmap", type: "simple" } }
  ];
  const response = await f.call(surface, { projectId: f.project.id, title: "Reserved IDs", operations, apply: true });
  expect(response, JSON.stringify(response)).not.toHaveProperty("code");
  const submitted = publicationResult(response);
  expect(submitted.outcome).toBe("proposed");
  const supply = f.repository.prepareOperationSupply(submitted.changeSet.operations, f.repository.getOperationSnapshot(f.project.id));
  for (const field of ["ids", "externalRefIds", "copyIds", "boardIds", "boardHashes", "roadmapSeedIds", "bulkRelationshipIds", "preparedSourceImports"] as const) expect(Object.getPrototypeOf(supply[field]!)).toBeNull();
  for (const operation of operations) expect(supply.ids[operation.operationId]).toEqual(expect.any(String));
  const source = submitted.changeSet.operations.find((operation) => operation.entity === "sourceDocument")!;
  for (const malformed of [{}, null, { document: { id: "" } }]) {
    const prepared = { [source.operationId]: malformed } as unknown as OperationSupply["preparedSourceImports"];
    expect(() => f.repository.prepareOperationSupply([source], f.repository.getOperationSnapshot(f.project.id), prepared)).toThrow("Prepared source document violates its domain schema.");
  }
  for (const ids of [{}, Object.create({ __proto__: "inherited" }), { ["__proto__"]: "" }, { ["__proto__"]: "  " }, { ["__proto__"]: 42 }]) {
    expect(() => prepareSourceOperations([source], f.repository.getOperationSnapshot(f.project.id), { ...supply, ids }, [source.operationId])).toThrow("Application must supply an allocated source id.");
  }
  const preview = await (await fetch(`${f.base}/api/changesets/${submitted.changeSetId}/preview`)).json();
  expect(preview.conflicts).toEqual([]);
  expect(preview.operations.map((row: { operationId: string }) => row.operationId)).toEqual(operations.map((row) => row.operationId));
  const denied = await fetch(`${f.base}/api/changesets/${submitted.changeSetId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect(denied.ok).toBe(false);
  expect(f.repository.getOperationSnapshot(f.project.id).cards).toEqual([]);
  await f.reviewedApply(submitted.changeSetId);
  const state = f.repository.getOperationSnapshot(f.project.id);
  expect(state.sourceDocuments).toHaveLength(1);
  expect(state.cards).toHaveLength(1);
  expect(state.externalRefs).toHaveLength(1);
  expect(state.roadmaps).toHaveLength(1);
  expect(state.roadmapColumns).toHaveLength(3);
  expect(f.repository.getChangeSet(submitted.changeSetId)?.approval?.actor.actorType).toBe(human.actorType);
  for (const rows of [state.sourceDocuments, state.cards, state.externalRefs, state.roadmaps]) expect(rows[0]!.id).toEqual(expect.any(String));
});
