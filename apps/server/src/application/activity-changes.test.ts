import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

it("validates a human browser's Project-scoped change feed through the real HTTP route", async () => {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  const repository = new StoryMapperRepository(handle), unitOfWork = new UnitOfWork(handle);
  const originClientId = randomUUID();
  const actor = { actorType: "human", actorId: "browser", originClientId } as const;
  const project = unitOfWork.run(actor, ({ repository }) => repository.createProject({ name: "HTTP feed fixture" }));
  const server = Fastify();
  try {
    await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: ":memory:" });
    const query = `projectId=${project.id}&originClientId=${originClientId}`;
    const valid = await server.inject({ method: "GET", url: `/api/activity/changes?${query}` });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({ events: [], nextAfterSeq: null });
    for (const suffix of ["&limit=101", "&afterSeq=-1", "&unknown=true"]) expect((await server.inject({ method: "GET", url: `/api/activity/changes?${query}${suffix}` })).statusCode).toBe(400);
    expect((await server.inject({ method: "GET", url: `/api/activity/changes?projectId=${randomUUID()}&originClientId=${originClientId}` })).statusCode).toBe(404);
  } finally { await server.close(); handle.current.$client.close(); }
});
