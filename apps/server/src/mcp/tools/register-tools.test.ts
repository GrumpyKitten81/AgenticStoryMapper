import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createMcpRegistry, listMcpToolStates } from "@storymapper/server/mcp/tools/register-tools";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

describe("createMcpRegistry", () => {
  it("reads projects and persists proposal ChangeSets", testReadsProjectsAndPersistsProposalChangeSets);

  it("enables ApplyChangeSet for approved proposals", testEnablesApplyChangeSetForApprovedProposals);

  it("retains protected command proposals and audits executor applications", testRetainsProtectedCommandProposalsAndAuditsExecutorApplications);

  it("lists GitHub links as a read-only MCP tool", testListsGitHubLinksAsAReadOnlyMCPTool);

  it("registers GitHub write tools behind the GitHub safety switch", async () => {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-"));
    const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
    cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle);

    const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "MCP GitHub Write Test" }));
    const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
    const connection = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createConnectorConnection({
      projectId: project.id,
      provider: "github",
      authMode: "token",
      name: "GitHub",
      owner: "org",
      repository: "repo"
    }));
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "test-host" });

    await expect(registry.call("ImportGitHubIssues", {
      storyMapId: storyMap.id,
      connectionId: connection.id
    })).rejects.toThrow("GitHub is disabled by the safety switch");

    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { github: true }));
    const toolStates = listMcpToolStates(repository, project.id);

    expect(toolStates.find((tool) => tool.name === "ImportGitHubIssues")?.enabled).toBe(true);
    expect(toolStates.find((tool) => tool.name === "PushCardsToGitHub")?.enabled).toBe(true);
    expect(toolStates.find((tool) => tool.name === "SyncGitHubLinks")?.enabled).toBe(true);

    await expect(registry.call("PushCardsToGitHub", {
      storyMapId: storyMap.id,
      connectionId: connection.id
    })).rejects.toThrow("read-only");
  });
});

async function testReadsProjectsAndPersistsProposalChangeSets() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "MCP Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Thin Story" }));
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "test-host" });

  const projects = await registry.call("ListProjects", {});
  const proposal = await registry.call("ProposeBacklogGrooming", { storyMapId: storyMap.id });

  expect((projects.data as { projects: unknown[] }).projects).toHaveLength(1);
  expect(proposal.changeSet?.operations.length).toBeGreaterThan(0);
  expect(repository.listChangeSets(project.id)).toHaveLength(1);
}

async function testEnablesApplyChangeSetForApprovedProposals() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "MCP Apply Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Thin Story" }));
  const changeSet = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createChangeSet({
    id: "00000000-0000-4000-8000-000000000301",
    projectId: project.id,
    title: "Apply via MCP",
    source: "mcp",
    status: "proposed",
    operations: [{
      operationId: "fixture-operation-1", op: "update",
      entity: "card",
      entityId: story.id,
      after: { estimate: 2 }
    }],
    createdAt: new Date().toISOString()
  }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "test-host" });
  const applyTool = listMcpToolStates(repository, project.id).find((tool) => tool.name === "ApplyChangeSet");
  const result = await registry.call("ApplyChangeSet", { changeSetId: changeSet.id, approvalToken: "local-approval" });

  expect(applyTool?.enabled).toBe(true);
  expect(result.changeSet?.status).toBe("applied");
  expect(repository.getCardDetails(story.id)?.estimate).toBe(2);
}

async function testRetainsProtectedCommandProposalsAndAuditsExecutorApplications() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "MCP Write Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "propose" }));
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "test-host" });

  const proposal = await registry.call("CreateStoryMapCard", {
    storyMapId: storyMap.id, level: "activity", title: "Reviewed Activity"
  });
  expect(proposal).toMatchObject({ outcome: "proposed", changeSetId: expect.any(String), previewRef: { changeSetId: proposal.changeSet?.id } });
  expect(repository.listCards(storyMap.id)).toHaveLength(0);
  expect(listMcpToolStates(repository, project.id).find((tool) => tool.name === "CreateStoryMapCard")?.enabled).toBe(true);
  expect(listMcpToolStates(repository, project.id).find((tool) => tool.name === "PushCardsToGitHub")?.enabled).toBe(false);
  const protectedCalls = [
    ["ExportStoryMap", { storyMapId: storyMap.id, format: "markdown" }],
    ["ExportAudit", { projectId: project.id, format: "json" }],
    ["CreateGitHubIssueDryRun", { storyMapId: storyMap.id, repo: "fixture/fixture" }]
  ] as const;
  for (const [name, input] of protectedCalls) {
    expect(listMcpToolStates(repository, project.id).find((tool) => tool.name === name)?.enabled, name).toBe(false);
    await expect(registry.call(name, input), name).rejects.toMatchObject({ code: "protected" });
  }

  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  const result = await registry.call("CreateStoryMapCard", {
    storyMapId: storyMap.id,
    level: "activity",
    title: "Allowed Activity"
  });
  expect(result).toMatchObject({ outcome: "applied", changeSetId: result.changeSet?.id, previewRef: { changeSetId: result.changeSet?.id } });
  const card = repository.listCards(storyMap.id)[0]!;
  const writeTool = listMcpToolStates(repository, project.id).find((tool) => tool.name === "CreateStoryMapCard");
  const activity = repository.listActivity(project.id);

  expect(writeTool?.enabled).toBe(true);
  expect(card.title).toBe("Allowed Activity");
  expect(activity.filter((event) => event.action === "tool_call")).toEqual(expect.arrayContaining([
    expect.objectContaining({ actor: "test-host", after: expect.objectContaining({ toolName: "CreateStoryMapCard", outcome: "ok" }) }),
    expect.objectContaining({ actor: "test-host", after: expect.objectContaining({ toolName: "CreateStoryMapCard", outcome: "ok" }) })
  ]));
}

async function testListsGitHubLinksAsAReadOnlyMCPTool() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "MCP GitHub Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Linked Story" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createGitHubLink({
    cardId: story.id,
    repo: "owner/repo",
    issueNumber: 7,
    url: "https://github.com/owner/repo/issues/7",
  }));
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "test-host" });
  const tool = listMcpToolStates(repository, project.id).find((candidate) => candidate.name === "ListGitHubLinks");
  const result = await registry.call("ListGitHubLinks", { storyMapId: storyMap.id });

  expect(tool?.enabled).toBe(true);
  expect((result.data as { links: Array<{ issueNumber?: number }> }).links[0]?.issueNumber).toBe(7);
}
