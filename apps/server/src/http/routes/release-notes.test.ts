import { afterEach, expect, it } from "vitest";
import { previewFixture, previewHuman } from "@storymapper/server/fixtures/changeset-preview";
import { getReleaseNotes } from "@storymapper/server/application/release/release.use-cases";
import { createAiProposal } from "@storymapper/server/application/ai/ai.use-cases";
import { proposeReleaseSlice } from "@storymapper/server/application/changeset/changeset.use-cases";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await previewFixture(); cleanup.push(f.close);
  const rows = f.unitOfWork.run(previewHuman, ({ repository }) => {
    repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.map.id, name: "Shipped", group: "done" });
    const step = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: f.cards[0]!.id, title: "Step" });
    const story = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: step.id, title: "Delivered", status: "Shipped", releaseId: f.release.id });
    const secondRelease = repository.createRelease({ storyMapId: f.map.id, name: "Explicit second Release" });
    const foreignProject = repository.createProject({ name: "Other Project" });
    const foreignMap = repository.createStoryMap({ projectId: foreignProject.id, name: "Other" });
    const foreign = repository.createRelease({ storyMapId: foreignMap.id, name: "Foreign" });
    repository.upsertProductContext({ projectId: foreignProject.id, storyMapId: foreignMap.id, purpose: "Foreign fixture" });
    return { story, secondRelease, foreignProject, foreign, foreignMap };
  });
  const notes = `/api/story-maps/${f.map.id}/releases/${f.release.id}/notes`;
  const call = (name: string, input: unknown) => f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input } });
  return { ...f, ...rows, notes, call };
}
const agent = { actorType: "agent", actorId: "notes-agent", mcpSessionId: "notes-session" } as const;

it("serves identical deterministic HTTP/MCP notes with zero domain writes and only required tool audit", async () => {
  const f = await fixture();
  const before = f.handle.current.$client.serialize();
  const first = await f.server.inject({ method: "GET", url: f.notes });
  expect(first.statusCode).toBe(200);
  expect(first.json().markdown).toContain(`## Card 0\n\n- ${f.story.key}: Delivered`);
  expect((await f.server.inject({ method: "GET", url: f.notes })).body).toBe(first.body);
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id);
  const activity = f.repository.listActivity(f.project.id).filter((row) => row.action !== "tool_call");
  const result = await f.call("GetReleaseNotes", { storyMapId: f.map.id, releaseId: f.release.id });
  expect(result.statusCode).toBe(200);
  expect(result.json().data).toEqual(first.json());
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(snapshot);
  expect(f.repository.listActivity(f.project.id).filter((row) => row.action !== "tool_call")).toEqual(activity);
  const audits = f.repository.listActivity(f.project.id).filter((row) => row.action === "tool_call");
  expect(audits).toHaveLength(1);
});

it("uses closed Issue evidence for timeline progress and HTTP/MCP notes despite an active Project status", async () => {
  const f = await fixture();
  f.unitOfWork.run(previewHuman, ({ repository }) => {
    repository.updateCard(f.story.id, { status: "In Review" });
    repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.map.id, name: "In Review", group: "active" });
    const source = { kind: "project" as const, projectId: "delivery", projectName: "Delivery", fieldId: "status" };
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", name: "GitHub", owner: "fixture", repository: "repo", authMode: "token", statusSource: source });
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, cardId: f.story.id, provider: "github", remoteId: "7", url: "https://github.com/fixture/repo/issues/7", labels: [], remoteState: "closed", statusEvidence: { source, issueState: "closed", membership: "present", optionId: "review", name: "In Review" }, syncState: "synced" });
  });
  const timeline = await f.server.inject({ method: "GET", url: `/api/reports/release-timeline?storyMapId=${f.map.id}` });
  expect(timeline.statusCode).toBe(200);
  expect(timeline.json().items.find((item: { release: { id: string } }) => item.release.id === f.release.id)).toMatchObject({ totalStories: 1, doneStories: 1, progressRatio: 1 });
  const notes = await f.server.inject({ method: "GET", url: f.notes });
  expect(notes.json().markdown).toContain(`${f.story.key}: Delivered`);
  const tool = await f.call("GetReleaseNotes", { storyMapId: f.map.id, releaseId: f.release.id });
  expect(tool.statusCode).toBe(200);
  expect(tool.json().data.markdown).toBe(notes.json().markdown);
});

it("refuses invalid scopes and disabled shared Agent access before reads or proposal writes", async () => {
  const f = await fixture();
  const deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  const input = { storyMapId: f.map.id, releaseId: f.foreign.id };
  expect((await f.server.inject({ method: "GET", url: `/api/story-maps/${f.map.id}/releases/${f.foreign.id}/notes` })).statusCode).toBe(404);
  expect(() => getReleaseNotes(deps, agent, input)).toThrow("Release not found");
  expect(() => proposeReleaseSlice(deps, previewHuman, { storyMapId: f.map.id, releaseTarget: { kind: "existing", releaseId: f.foreign.id } })).toThrow("Release not found");
  const aiInput = { projectId: f.project.id, storyMapId: f.map.id, templateId: "release-slice" as const, releaseTarget: { kind: "existing" as const, releaseId: f.foreign.id } };
  expect(() => createAiProposal(deps, previewHuman, aiInput)).toThrow("Release not found");
  expect((await f.call("GetReleaseNotes", input)).statusCode).toBeGreaterThanOrEqual(400);
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  const before = f.handle.current.$client.serialize();
  expect(() => getReleaseNotes(deps, agent, { storyMapId: f.map.id, releaseId: f.release.id })).toThrow("disabled");
  expect(() => proposeReleaseSlice(deps, agent, { storyMapId: f.map.id, releaseTarget: { kind: "new" } })).toThrow("disabled");
  expect(() => createAiProposal(deps, agent, { ...aiInput, releaseTarget: { kind: "new" } })).toThrow("disabled");
  expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
});

it("stores both happy-path generator proposals with explicit target, rationale and no application under both protection states", async () => {
  const f = await fixture();
  const deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  for (const agentProtection of [false, true]) {
    f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: agentProtection ? "propose" : "apply" }));
    for (const releaseTarget of [{ kind: "new" as const }, { kind: "existing" as const, releaseId: f.secondRelease.id }]) {
      const snapshot = f.repository.getStoryMapSnapshot(f.map.id);
      const direct = proposeReleaseSlice(deps, agent, { storyMapId: f.map.id, releaseTarget, rationale: "Requested journey" }).changeSet;
      const ai = createAiProposal(deps, agent, { projectId: f.project.id, storyMapId: f.map.id, templateId: "release-slice", releaseTarget, rationale: "Requested journey" }).changeSet;
      expect(direct.status).toBe("proposed"); expect(ai.status).toBe("proposed");
      if (releaseTarget.kind === "existing") {
        expect(direct.operations.filter((operation) => operation.entity === "card").map((operation) => operation.after)).toEqual([{ releaseId: f.secondRelease.id }]);
        expect(ai.operations.filter((operation) => operation.entity === "card").map((operation) => operation.after)).toEqual([{ releaseId: f.secondRelease.id }]);
      }
      expect(ai.operations.map(({ context, ...operation }) => operation)).toEqual(direct.operations);
      expect(direct.operations.every((operation) => operation.reason === "Requested journey")).toBe(true);
      expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(snapshot);
    }
  }
  expect((await f.call("ProposeReleaseSlice", { storyMapId: f.map.id })).statusCode).toBeGreaterThanOrEqual(400);
  expect((await f.call("ProposeReleaseSlice", { storyMapId: f.map.id, releaseTarget: { kind: "new" } })).statusCode).toBe(200);
});

it("keeps externally supplied BMad cuts as typed proposals with explicit apply=false", async () => {
  const f = await fixture();
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id);
  const result = await f.call("SubmitChangeSet", {
    projectId: f.project.id, title: "BMad Persona cut", apply: false,
    operations: [
      { operationId: "release", op: "create", entity: "release", entityId: "persona-cut", after: { storyMapId: f.map.id, name: "Persona cut" }, reason: "BMad selected this Persona journey" },
      { operationId: "assign", op: "update", entity: "card", entityId: f.story.id, baseVersion: f.story.version, after: { releaseId: "persona-cut" }, reason: "Include Persona journey Story" }
    ]
  });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ outcome: "proposed", changeSet: { status: "proposed" } });
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(snapshot);
});

it("uses full-map first12 and truthful provenance when AI requests select a later Story", async () => {
  const f = await fixture();
  const stories = f.unitOfWork.run(previewHuman, ({ repository }) => Array.from({ length: 14 }, (_, index) => repository.createCard({ storyMapId: f.map.id, level: "story", title: `Story ${index}`, position: index + 1 })));
  const expected = [f.story.id, ...stories.slice(0, 11).map((card) => card.id)];
  const deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  const releaseTarget = { kind: "existing" as const, releaseId: f.secondRelease.id };
  const direct = proposeReleaseSlice(deps, agent, { storyMapId: f.map.id, releaseTarget }).changeSet;
  const ai = createAiProposal(deps, agent, { projectId: f.project.id, storyMapId: f.map.id, templateId: "release-slice", releaseTarget }).changeSet;
  expect(ai.operations.map((operation) => operation.entityId)).toEqual(expected);
  expect(ai.operations.map(({ context, ...operation }) => operation)).toEqual(direct.operations);
  expect(ai.operations.every((operation) => JSON.stringify(operation.context?.cardIds) === JSON.stringify(expected))).toBe(true);
  expect(ai.operations.every((operation) => (operation.after as { releaseId: string }).releaseId === f.secondRelease.id)).toBe(true);
});

it("refuses cross-Project Release targets over HTTP/MCP/shared use cases and disabled foreign Agent scopes without domain changes", async () => {
  const f = await fixture();
  const deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  const releaseTarget = { kind: "existing" as const, releaseId: f.foreign.id };
  const aiInput = { projectId: f.project.id, storyMapId: f.map.id, templateId: "release-slice" as const, releaseTarget };
  const domains = () => [f.repository.getStoryMapSnapshot(f.map.id), f.repository.getStoryMapSnapshot(f.foreignMap.id), f.repository.listChangeSets(), f.repository.listActivity().filter((event) => event.action !== "tool_call")];
  const before = domains();
  expect((await f.server.inject({ method: "GET", url: `/api/story-maps/${f.map.id}/releases/${f.foreign.id}/notes` })).statusCode).toBe(404);
  expect((await f.server.inject({ method: "POST", url: "/api/ai/proposals", payload: aiInput })).statusCode).toBe(404);
  for (const [name, input] of [["GetReleaseNotes", { storyMapId: f.map.id, releaseId: f.foreign.id }], ["ProposeReleaseSlice", { storyMapId: f.map.id, releaseTarget }], ["CreateAiProposal", aiInput]] as const) expect((await f.call(name, input)).statusCode).toBeGreaterThanOrEqual(400);
  expect(() => getReleaseNotes(deps, agent, { storyMapId: f.map.id, releaseId: f.foreign.id })).toThrow("Release not found");
  expect(() => proposeReleaseSlice(deps, agent, { storyMapId: f.map.id, releaseTarget })).toThrow("Release not found");
  expect(() => createAiProposal(deps, agent, aiInput)).toThrow("Release not found");
  expect(domains()).toEqual(before);
  f.unitOfWork.run(previewHuman, ({ repository }) => repository.updateSafetySettings(f.foreignProject.id, { agentMode: "off" }));
  const disabledBefore = domains();
  const foreignAi = { ...aiInput, projectId: f.foreignProject.id, storyMapId: f.foreignMap.id };
  for (const [name, input] of [["GetReleaseNotes", { storyMapId: f.foreignMap.id, releaseId: f.foreign.id }], ["ProposeReleaseSlice", { storyMapId: f.foreignMap.id, releaseTarget }], ["CreateAiProposal", foreignAi]] as const) expect((await f.call(name, input)).statusCode).toBeGreaterThanOrEqual(400);
  expect(() => getReleaseNotes(deps, agent, { storyMapId: f.foreignMap.id, releaseId: f.foreign.id })).toThrow("disabled");
  expect(() => proposeReleaseSlice(deps, agent, { storyMapId: f.foreignMap.id, releaseTarget })).toThrow("disabled");
  expect(() => createAiProposal(deps, agent, foreignAi)).toThrow("disabled");
  expect(domains()).toEqual(disabledBefore);
});
