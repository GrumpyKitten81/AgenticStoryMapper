import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { planStateSchema, planStateComparisonSchema, planStateSummarySchema, slicesReportSchema } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import * as plans from "@storymapper/server/application/report/plan-state.use-cases";
import { reportRoutes } from "@storymapper/server/http/routes/report-routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "state-human" } as const;
const agent = { actorType: "agent", actorId: "state-agent", mcpSessionId: "state-session" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

function fixture() {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  cleanup.push(() => { handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const data = unitOfWork.run(human, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Plan states transport" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Slice map" });
    const other = tx.createStoryMap({ projectId: project.id, name: "Other map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release one" });
    const story = tx.createCard({ storyMapId: map.id, level: "story", title: "Story", releaseId: release.id });
    return { project, map, other, release, story };
  });
  return { repository, unitOfWork, ...data };
}

it("refuses Agent capture without writes and guards all direct reads when Project Agent access is disabled", () => {
  const data = fixture();
  expect(() => plans.capturePlanState(data, agent, data.map.id)).toThrow("human-only");
  expect(data.repository.listPlanStates(data.map.id)).toEqual([]);
  const state = plans.capturePlanState(data, human, data.map.id).state;
  expect(state.actor).toBe(human.actorId);
  data.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "off" }));
  const reads = [
    () => plans.listPlanStates(data, agent, data.map.id),
    () => plans.getPlanState(data, agent, data.map.id, state.id),
    () => plans.comparePlanStates(data, agent, data.map.id, state.id, state.id),
    () => plans.getSlicesReport(data, agent, data.map.id)
  ];
  for (const read of reads) expect(read).toThrow("Agent access is disabled");
  expect(plans.getPlanState(data, human, data.map.id, state.id).state).toEqual(state);
  expect(data.repository.listActivity().filter((event) => event.action === "planState.recorded")).toMatchObject([{ actor: human.actorId, actorType: "human" }]);
});

it("serves human HTTP state envelopes, exact comparisons and scoped errors without restoring the board", async () => {
  const data = fixture();
  const app = Fastify();
  cleanup.push(() => app.close());
  await app.register(reportRoutes, { repository: data.repository, unitOfWork: data.unitOfWork, databasePath: ":memory:" });
  const root = `/api/story-maps/${data.map.id}`;
  const captured = await app.inject({ method: "POST", url: `${root}/plan-states`, payload: {} });
  expect(captured.statusCode).toBe(200);
  const before = planStateSchema.parse(captured.json().state);
  expect(before.actor).toBe("local-user");
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(data.story.id, { releaseId: null }));
  const after = planStateSchema.parse((await app.inject({ method: "POST", url: `${root}/plan-states`, payload: {} })).json().state);
  const listed = await app.inject({ method: "GET", url: `${root}/plan-states` });
  expect(listed.statusCode).toBe(200);
  expect(listed.json().states.map((value: unknown) => planStateSummarySchema.parse(value).id).sort()).toEqual([before.id, after.id].sort());
  const fetched = await app.inject({ method: "GET", url: `${root}/plan-states/${before.id}` });
  expect(fetched.json()).toEqual({ state: before });
  const compared = await app.inject({ method: "GET", url: `${root}/plan-states/compare?beforeId=${before.id}&afterId=${after.id}` });
  expect(compared.statusCode).toBe(200);
  expect(planStateComparisonSchema.parse(compared.json()).changes).toEqual([{ cardId: data.story.id, kind: "moved", beforeReleaseId: data.release.id, afterReleaseId: null }]);
  const report = await app.inject({ method: "GET", url: `${root}/slices` });
  expect(slicesReportSchema.parse(report.json()).lanes.find((lane) => lane.releaseId === null)?.storyIds).toEqual([data.story.id]);
  const foreign = await app.inject({ method: "GET", url: `/api/story-maps/${data.other.id}/plan-states/${before.id}` });
  expect(foreign.statusCode).toBe(404);
  expect(foreign.json()).toMatchObject({ code: "not_found" });
  const missingQuery = await app.inject({ method: "GET", url: `${root}/plan-states/compare?beforeId=${before.id}` });
  expect(missingQuery.statusCode).toBe(400);
  expect(data.repository.getCard(data.story.id)?.releaseId).toBeNull();
});

it("registers real MCP read tools with typed data and refuses foreign-map comparisons and disabled Project access", async () => {
  const data = fixture();
  const before = plans.capturePlanState(data, human, data.map.id).state;
  const foreign = plans.capturePlanState(data, human, data.other.id).state;
  const registry = createMcpRegistry(data.repository, data.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "plan-state-mcp" });
  const listed = await registry.call("ListPlanStates", { storyMapId: data.map.id });
  expect(listed.data).toEqual({ states: [expect.objectContaining({ id: before.id })] });
  expect((await registry.call("GetPlanState", { storyMapId: data.map.id, stateId: before.id })).data).toEqual({ state: before });
  const equal = await registry.call("ComparePlanStates", { storyMapId: data.map.id, beforeId: before.id, afterId: before.id });
  expect(planStateComparisonSchema.parse(equal.data).changes).toEqual([]);
  const report = await registry.call("GetSlicesReport", { storyMapId: data.map.id });
  expect(slicesReportSchema.parse(report.data).storyMapId).toBe(data.map.id);
  await expect(registry.call("ComparePlanStates", { storyMapId: data.map.id, beforeId: before.id, afterId: foreign.id })).rejects.toMatchObject({ code: "not_found" });
  data.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "off" }));
  const calls = [
    ["ListPlanStates", { storyMapId: data.map.id }],
    ["GetPlanState", { storyMapId: data.map.id, stateId: before.id }],
    ["ComparePlanStates", { storyMapId: data.map.id, beforeId: before.id, afterId: before.id }],
    ["GetSlicesReport", { storyMapId: data.map.id }]
  ] as const;
  for (const [name, input] of calls) await expect(registry.call(name, input)).rejects.toMatchObject({ code: "disabled" });
});
