import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { changeSetCommandResponseSchema } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "delivery-budget-fixture" } as const;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-delivery-budget-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Delivery budget" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    repository.createWorkflowStatus({ projectId: project.id, name: "Review", group: "active" });
    const cards = Array.from({ length: 1000 }, (_, index) => repository.createCard({ storyMapId: map.id, level: "activity", title: `Card ${index}` }));
    for (const [index, card] of cards.slice(0, 100).entries()) for (const system of ["bmad", "other"]) repository.setExternalRef({ entityType: "card", entityId: card.id, system, externalId: `Story-${index}` });
    return { project, map, cards };
  });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "delivery-budget-host", mcpSessionId: "delivery-budget-session" });
  return { directory, handle, repository, registry, ...rows };
}

it.each([1, 2, 3])("measures serial complete audited 100-status delivery on 1,000 Cards sample %s with relaxed 6s bound", async (sample) => {
  const f = fixture();
  try {
    const input = { storyMapId: f.map.id, cards: f.cards.slice(0, 100).map((_, index) => ({ system: "bmad", externalId: `Story-${index}`, status: index % 2 ? "done" : "Review" })) };
    const start = performance.now();
    let completed = false;
    let result;
    let durationMs = 0;
    try { result = await f.registry.call("UpdateDeliveryStatus", input); completed = true; }
    finally {
      durationMs = performance.now() - start;
      const measurement = { measuredAt: new Date().toISOString(), pipeline: "actual-mcp-UpdateDeliveryStatus", sample, cards: 1000, operations: 100, durationMs, boundMs: 2000, completed, passed: completed && durationMs <= 2000 };
      appendFileSync(join(tmpdir(), "storymapper-4-11-delivery-budget.jsonl"), JSON.stringify(measurement) + "\n");
      process.stdout.write(JSON.stringify(measurement) + "\n");
    }
    const response = changeSetCommandResponseSchema.parse(result);
    expect(response).toMatchObject({ outcome: "applied", changeSet: { execution: { actor: { actorType: "agent", actorId: "delivery-budget-host", mcpSessionId: "delivery-budget-session" }, restorePoint: expect.any(String) } } });
    expect(response.changeSet.execution?.operationResults).toHaveLength(100);
    expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
    const refs = f.repository.listExternalRefsForStoryMap(f.map.id);
    for (const [index, card] of f.cards.slice(0, 100).entries()) {
      expect(f.repository.getCard(card.id)).toMatchObject({ status: input.cards[index]!.status, version: card.version + 1 });
      expect(f.repository.listCardHistory(card.id)).toHaveLength(2);
      expect(refs.find((ref) => ref.entityId === card.id && ref.system === "bmad")?.syncedVersion).toBe(card.version + 1);
      expect(refs.find((ref) => ref.entityId === card.id && ref.system === "other")?.syncedVersion).toBe(card.version);
    }
    const activity = f.repository.listActivity(f.project.id);
    expect(activity.filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(100);
    expect(activity.filter((event) => event.action === "changeSet.applied")).toHaveLength(1);
    expect(activity.filter((event) => event.action === "tool_call")).toMatchObject([{ actor: "delivery-budget-host", actorType: "agent", mcpSessionId: "delivery-budget-session", affectedEntityId: "UpdateDeliveryStatus", after: { outcome: "ok", inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"), outputHash: createHash("sha256").update(JSON.stringify(result)).digest("hex") } }]);
    expect(durationMs, `complete delivery ${durationMs.toFixed(2)}ms; nominal 2000ms`).toBeLessThanOrEqual(6000);
  } finally { f.handle.current.$client.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
