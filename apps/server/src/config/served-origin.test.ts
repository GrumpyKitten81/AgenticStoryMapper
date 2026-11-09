import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { buildGitHubIssueBody } from "@storymapper/core";
import type { Card } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { servedLoopbackOrigin } from "@storymapper/server/config/served-origin";
import { createRoutes } from "@storymapper/server/http/routes";
import { createWorkItemProvider } from "@storymapper/github";
import { reviewedPushPlanningFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn(() => { throw new Error("Unexpected provider creation."); }) }));
vi.mock("@storymapper/server/services/credentials", async (original) => ({ ...await original<typeof import("@storymapper/server/services/credentials")>(), resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

it("uses the actual ephemeral listener port for generated Card deep links", async () => {
  const server = Fastify();
  expect(() => servedLoopbackOrigin(server)).toThrow("must be listening");
  try {
    const origin = await server.listen({ host: "127.0.0.1", port: 0 });
    expect(servedLoopbackOrigin(server)).toBe(origin);
    const body = buildGitHubIssueBody({ id: "card", storyMapId: "map", key: "MAP-1", description: "Authored" } as Card, "Map", { origin: servedLoopbackOrigin(server), projectId: "project" });
    expect(body).toContain(`${origin}/projects/project/story-maps/map/discovery?card=card`);
  } finally { await server.close(); }
});

it("threads the served origin through actual HTTP planning without mutating local prose", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-origin-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const server = Fastify();
  try {
    const { card, map, connection } = unitOfWork.run({ actorType: "human", actorId: "origin-fixture" }, ({ repository }) => {
      const project = repository.createProject({ name: "Origin fixture" });
      repository.updateSafetySettings(project.id, { github: true });
      const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
      const card = repository.createCard({ storyMapId: map.id, level: "activity", cardType: "task", title: "Requirement", description: "Authored Markdown" }, "human");
      const connection = repository.createConnectorConnection({ projectId: project.id, provider: "github", name: "Fixture", authMode: "token", owner: "fixture", repository: "repository", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] });
      return { card, map, connection };
    });
    const provider = reviewedPushPlanningFixture({ writable: true, issueTypes: ["Task"], labels: ["local-story-map", "status:todo", `story-map:${map.cardKeyPrefix}`, "level:activity"], milestones: [] });
    vi.mocked(createWorkItemProvider).mockReturnValueOnce(provider);
    await server.register(createRoutes, { repository, unitOfWork, databasePath });
    const origin = await server.listen({ host: "127.0.0.1", port: 0 });
    const response = await server.inject({ method: "POST", url: "/api/sync/work-items/plan", payload: { storyMapId: map.id, connectionId: connection.id, mode: "push" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().plan.blockers).toEqual([]);
    expect(response.json().plan.items[0].payload.body).toContain(`${origin}/projects/${map.projectId}/story-maps/${map.id}/discovery?card=${card.id}`);
    expect(repository.getRemotePushPlan(response.json().plan.id)?.plan).toEqual(response.json().plan);
    expect(resolveProviderAuth).toHaveBeenCalledWith(connection);
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(provider.writeMilestone).not.toHaveBeenCalled();
    expect(repository.getCardDetails(card.id)?.description).toBe("Authored Markdown");
    const restarted = Fastify();
    try {
      await restarted.register(createRoutes, { repository, unitOfWork, databasePath });
      const nextOrigin = await restarted.listen({ host: "127.0.0.1", port: 0 });
      expect(nextOrigin).not.toBe(origin);
      const confirm = await restarted.inject({ method: "POST", url: "/api/sync/work-items/confirm", payload: { planId: response.json().plan.id } });
      expect(confirm.statusCode).toBe(409);
      expect(confirm.json().message).toContain("origin changed");
      expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    } finally { await restarted.close(); }
  } finally { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); }
});
