import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openStoryMapperDb, DatabaseHandle, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "local-ui" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));

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

it("removes warnings about unreadable earlier proposals from actual Agent list, approval and apply responses", async () => {
  const f = fixture();
  const mapId = (f.proposal.operations[0]!.after as { storyMapId: string }).storyMapId;
  const proposals = f.unitOfWork.run(human, ({ repository }) => {
    const privateProject = repository.createProject({ name: "Private warning dependencies" });
    repository.updateSafetySettings(privateProject.id, { agentMode: "off" });
    repository.updateSafetySettings(f.proposal.projectId, { agentMode: "autonomous" });
    const privateMap = repository.createStoryMap({ projectId: privateProject.id, name: "Private" });
    const privateCard = repository.createCard({ storyMapId: privateMap.id, title: "Private Card", level: "activity" });
    const earlier = repository.createChangeSet({ id: randomUUID(), projectId: f.proposal.projectId, source: "human", title: "Private earlier proposal title", createdAt: new Date().toISOString(), operations: [{ operationId: "earlier", entity: "release", op: "upsert", context: { cardIds: [privateCard.id] }, selector: { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "private-publication" }, after: { storyMapId: mapId, name: "MVP" } }] });
    const later = repository.createChangeSet({ ...earlier, id: randomUUID(), title: "Accessible later proposal", operations: earlier.operations.map(({ context: _context, ...operation }) => ({ ...operation, operationId: "later" })) });
    return { earlier, later };
  });
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "warning-reader" });
  const listed = await registry.call("ListChangeSets", { projectId: f.proposal.projectId });
  expect(JSON.stringify(listed)).not.toContain(proposals.earlier.title);
  expect(JSON.stringify(listed)).not.toContain(proposals.earlier.id);
  const approved = await registry.call("ApproveChangeSet", { changeSetId: proposals.later.id });
  expect(approved.changeSet?.warnings).toEqual([]);
  const applied = await registry.call("ApplyChangeSet", { changeSetId: proposals.later.id, approvalToken: "discarded" });
  expect(applied.changeSet?.warnings).toEqual([]);
  expect(f.repository.getChangeSet(proposals.later.id)?.warnings?.[0]?.priorChangeSetTitle).toBe(proposals.earlier.title);
});
