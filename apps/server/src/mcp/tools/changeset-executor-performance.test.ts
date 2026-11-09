import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "executor-budget-fixture" } as const;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-full-executor-budget-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const project = unitOfWork.run(human, ({ repository }) => repository.createProject({ name: "Full executor budget" }));
  const map = unitOfWork.run(human, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  const cards = unitOfWork.run(human, ({ repository }) => Array.from({ length: 1000 }, (_, index) => repository.createCard({ storyMapId: map.id, level: "activity", title: `Card ${index}` })));
  const proposal = unitOfWork.run(human, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: project.id, title: "200 updates", source: "human", createdAt: new Date().toISOString(),
    operations: cards.slice(0, 200).map((card, index) => ({ operationId: `update-${index}`, entity: "card", op: "update", entityId: card.id, baseVersion: card.version, after: { title: `Updated ${index}` } }))
  }));
  unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "executor-budget-host", mcpSessionId: "executor-budget-session" });
  return { directory, handle, repository, project, cards, proposal, registry };
}

it.each([1, 2, 3])("measures serial actual ApplyChangeSet pipeline sample %s including application preparation and real audit", async (sample) => {
  const f = fixture();
  try {
    const immutableInput = JSON.stringify(f.proposal.operations);
    const input = { changeSetId: f.proposal.id, approvalToken: "discarded", selectedOperationIds: f.proposal.operations.map((operation) => operation.operationId) };
    const start = performance.now();
    const result = await f.registry.call("ApplyChangeSet", input);
    const durationMs = performance.now() - start;
    const measurement = { measuredAt: new Date().toISOString(), pipeline: "actual-mcp-ApplyChangeSet", sample, cards: 1000, operations: 200, durationMs, nominalMs: 2000, toleranceMs: 4000, nominalPassed: durationMs < 2000, passed: durationMs < 4000 };
    appendFileSync(join(tmpdir(), "storymapper-4-6-executor-budget.jsonl"), JSON.stringify(measurement) + "\n");
    process.stdout.write(JSON.stringify(measurement) + "\n");
    expect(result.changeSet).toMatchObject({ status: "applied", execution: { actor: { actorType: "agent", actorId: "executor-budget-host", mcpSessionId: "executor-budget-session" }, restorePoint: expect.any(String) } });
    expect(result.changeSet?.execution?.operationResults).toHaveLength(200);
    expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
    expect(JSON.stringify(f.repository.getChangeSet(f.proposal.id)?.operations)).toBe(immutableInput);
    for (const [index, card] of f.cards.slice(0, 200).entries()) {
      expect(f.repository.getCard(card.id)).toMatchObject({ title: `Updated ${index}`, version: card.version + 1 });
      expect(f.repository.listCardHistoryPage(card.id, { limit: 10 }).versions).toHaveLength(2);
    }
    const activity = f.repository.listActivity(f.project.id);
    expect(activity.filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(200);
    expect(activity.filter((event) => event.action === "changeSet.applied")).toHaveLength(1);
    const audits = activity.filter((event) => event.action === "tool_call");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: "executor-budget-host", actorType: "agent", mcpSessionId: "executor-budget-session", affectedEntityId: "ApplyChangeSet", after: { outcome: "ok", inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"), outputHash: createHash("sha256").update(JSON.stringify(result)).digest("hex") } });
    expect(durationMs, `actual full pipeline ${durationMs.toFixed(2)}ms; nominal 2000ms`).toBeLessThan(4000);
  } finally {
    f.handle.current.$client.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});
