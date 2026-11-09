import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import type { StoryMap, ConnectorConnection, Card } from "@storymapper/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import type { GitHubIssueDryRun, StoryMapSnapshot, RemotePushPlan } from "@storymapper/contracts";
import { expect, it, vi } from "vitest";
import { createRoutes } from "@storymapper/server/http/routes";
import { createWorkItemProvider, WorkItemProvider } from "@storymapper/github";
import { reviewedPushPlanningFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn(() => { throw new Error("Unexpected provider creation."); }) }));
vi.mock("@storymapper/server/services/credentials", async (original) => ({ ...await original<typeof import("@storymapper/server/services/credentials")>(), resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

it("FR-15 preserves saved rich-editor Markdown through storage and the modal's work-item push plan", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-card-markdown-"));
  let db: ReturnType<typeof openStoryMapperDb> | undefined;
  let server: FastifyInstance | undefined;
  try {
    const databasePath = join(directory, "storymapper.sqlite");
    db = openStoryMapperDb(databasePath);
    const handle = new DatabaseHandle(db);
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle);

    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.ensureSeedData());
    const project = repository.listProjects()[0]!;
    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id));
    const storyMap = repository.listStoryMaps(project.id)[0]!;
    const card = repository.getStoryMapSnapshot(storyMap.id)!.cards.find((item) => item.level === "story")!;
    const description = "## ***Create traceable story cards***\n\n- Preserve source links\n- Keep Markdown";
    const connection = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createConnectorConnection({
      projectId: project.id, provider: "github", authMode: "token", name: "Baseline",
      owner: "fixture", repository: "baseline", readOnly: false, issueTypeMapping: [{ cardType: "story", issueType: "Task" }]
    }));
    const provider = reviewedPushPlanningFixture({ writable: true, issueTypes: ["Task"], labels: ["local-story-map", `status:${card.status}`, `story-map:${storyMap.cardKeyPrefix}`, "level:story"], milestones: [] });
    vi.mocked(createWorkItemProvider).mockReturnValueOnce(provider);
    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { github: true }));
    server = Fastify();
    await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
    const save = await server.inject({ method: "PATCH", url: `/api/cards/${card.id}`, payload: { description, cardType: "story", baseVersion: card.version } });
    expect(save.statusCode).toBe(200);
    const read = await server.inject({ method: "GET", url: `/api/story-maps/${storyMap.id}` });
    expect(read.json<StoryMapSnapshot>().cards.find((item) => item.id === card.id)?.description).toBe(description);
    const preview = await server.inject({ method: "POST", url: "/api/github/issue-dry-run", payload: { storyMapId: storyMap.id, cardIds: [card.id], repo: "fixture/baseline" } });
    expect(preview.statusCode).toBe(200);
    const body = preview.json<{ dryRuns: GitHubIssueDryRun[] }>().dryRuns[0]!.body;
    await exerciseFR15PreservesSavedRichEditorMarkdownThroughStorage(body, description, server, storyMap, connection, card, repository, provider);
  } finally {
    try {
      await server?.close();
    } finally {
      try {
        db?.$client.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});

async function exerciseFR15PreservesSavedRichEditorMarkdownThroughStorage(body: string, description: string, server: FastifyInstance, storyMap: StoryMap, connection: ConnectorConnection, card: Card, repository: StoryMapperRepository<"root">, provider: WorkItemProvider) {
  expect(body.startsWith(description)).toBe(true);
  const planned = await server.inject({
    method: "POST", url: "/api/sync/work-items/plan",
    payload: { storyMapId: storyMap.id, connectionId: connection.id, cardIds: [card.id], mode: "push" }
  });
  expect(planned.statusCode).toBe(200);
  const plan = planned.json<{ plan: RemotePushPlan; }>().plan;
  expect(plan.blockers).toEqual([]);
  const issues = plan.items.filter((item) => item.kind === "issue");
  expect(issues).toHaveLength(1);
  expect(issues[0]?.entityId).toBe(card.id);
  expect(issues[0]?.payload.body.startsWith(description)).toBe(true);
  expect(issues[0]?.payload.body).not.toContain("<h2>");
  expect(repository.getRemotePushPlan(plan.id)?.plan).toEqual(plan);
  expect(resolveProviderAuth).toHaveBeenCalledWith(connection);
  expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(provider.writeMilestone).not.toHaveBeenCalled();
}
