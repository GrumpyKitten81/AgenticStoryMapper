import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cardHistoryResponseSchema } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-history-http-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const { card, map } = unitOfWork.run({ actorType: "human", actorId: "history-reader" }, ({ repository: tx }) => {
    const project = tx.createProject({ name: "HTTP history fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const card = tx.createCard({ storyMapId: map.id, level: "activity", title: "Initial" });
    return { card, map };
  });
  for (let version = 2; version <= 23; version++) unitOfWork.run({ actorType: "agent", actorId: `agent-${version}`, mcpSessionId: "http-session" }, ({ repository: tx }) => tx.updateCard(card.id, { title: `Saved title ${version}` }));
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  return { server, handle, card, map, unitOfWork };
}

describe("Card history HTTP pages", () => {
  it("defaults to 20 descending rows with a predecessor and advances to creation", async () => {
    const { server, card } = await fixture();
    const first = await server.inject({ method: "GET", url: `/api/cards/${card.id}/history` });
    expect(first.statusCode).toBe(200);
    const page = cardHistoryResponseSchema.parse(first.json());
    expect(page.versions).toHaveLength(20);
    expect(page.nextCursor).toBe(4);
    expect(page.versions.at(-1)).toMatchObject({ version: 4, previousSnapshot: { version: 3, title: "Saved title 3" }, changedFields: ["title"] });
    const next = await server.inject({ method: "GET", url: `/api/cards/${card.id}/history?beforeVersion=4` });
    const oldest = cardHistoryResponseSchema.parse(next.json());
    expect(oldest.versions.map((entry) => entry.version)).toEqual([3, 2, 1]);
    expect(oldest.nextCursor).toBeNull();
    expect(oldest.versions.at(-1)?.previousSnapshot).toBeNull();
  });

  it("returns explicit 400 query errors and preserves missing/hidden Card 404 and empty state", async () => {
    const { server, card, map, unitOfWork, handle } = await fixture();
    for (const query of ["limit=0", "limit=101", "limit=1.2", "beforeVersion=0", "beforeVersion=invalid", "beforeVersion=", "limit=1&limit=2", "unknown=1"]) {
      const response = await server.inject({ method: "GET", url: `/api/cards/${card.id}/history?${query}` });
      expect(response.statusCode, query).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation", message: "Request validation failed.", details: { issues: expect.any(Array) } });
    }
    expect((await server.inject({ method: "GET", url: `/api/cards/${randomUUID()}/history` })).statusCode).toBe(404);
    handle.current.$client.prepare("DELETE FROM card_versions WHERE card_id = ?").run(card.id);
    expect((await server.inject({ method: "GET", url: `/api/cards/${card.id}/history` })).json()).toEqual({ versions: [], nextCursor: null });
    unitOfWork.run({ actorType: "human", actorId: "history-reader" }, ({ repository }) => repository.deleteStoryMap(map.id));
    expect((await server.inject({ method: "GET", url: `/api/cards/${card.id}/history` })).statusCode).toBe(404);
  });
});
