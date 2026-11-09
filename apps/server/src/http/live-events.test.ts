import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerResponse } from "node:http";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { liveTransactionSchema, type LiveReset, type LiveTransaction } from "@storymapper/contracts";
import { createRestorePoint, DatabaseHandle, openStoryMapperDb, restoreProject, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import * as database from "@storymapper/db";
import { registerLiveEvents } from "@storymapper/server/http/live-events";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";
import { installRequestSecurity } from "@storymapper/server/http/request-security";
import { requestActor } from "@storymapper/server/http/request-origin";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { exportProjectArchive, importProjectArchive } from "@storymapper/server/services/project-archive";

const ACTOR = { actorType: "human", actorId: "live-fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];

async function fixture(path?: string, slow?: (unitOfWork: UnitOfWork, storyMapId: string) => Promise<unknown>) {
  if (!path) {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-live-"));
    const projectDirectory = join(directory, "runtime.lsm");
    mkdirSync(projectDirectory);
    path = join(projectDirectory, "storymapper.sqlite");
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  }
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle, undefined, requestActor);
  const project = repository.listProjects()[0] ?? unitOfWork.run(ACTOR, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Live events" }));
  const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  const server = Fastify();
  installRequestSecurity(server, 0, false);
  installRestoreRequestGate(server, handle);
  const streams = registerLiveEvents(server, handle, unitOfWork);
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "fixture-agent" });
  server.post("/api/fixture/tool", async () => registry.call("ListProjects", {}));
  server.post("/api/fixture/cards", async () => unitOfWork.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId, level: "story", title: "Private content must stay out of events" })));
  if (slow) server.post("/api/fixture/slow", async () => slow(unitOfWork, storyMapId));
  server.addHook("onClose", async () => { handle.current.$client.close(); });
  const url = await server.listen({ port: 0, host: "127.0.0.1" });
  cleanup.push(() => server.close());
  return { server, handle, repository, unitOfWork, project, storyMapId, streams, path, url };
}

async function stream(url: string, cursor?: string) {
  const abort = new AbortController();
  const response = await fetch(`${url}/api/events`, { headers: { accept: "text/event-stream", ...(cursor ? { "last-event-id": cursor } : {}) }, signal: abort.signal });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  let buffer = "";
  cleanup.push(async () => { abort.abort(); await reader.cancel().catch((error: unknown) => { if (!(error instanceof Error) || error.name !== "AbortError") throw error; }); });
  return { abort, reader, async next(): Promise<{ event: string; data: Record<string, unknown>; raw: string }> {
    while (!buffer.includes("\n\n")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("Stream closed before event.");
      buffer += new TextDecoder().decode(chunk.value);
    }
    const boundary = buffer.indexOf("\n\n");
    const raw = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const lines = raw.split("\n");
    const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
    return { event: lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "heartbeat", data: data ? JSON.parse(data) : {}, raw };
  } };
}

afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });

it("validates SSE Accept, cursors, origins and passive stream lifecycle admission", async () => {
  const data = await fixture();
  for (const accept of ["*/*", "application/json", "text/event-stream;q=0"]) {
    expect((await fetch(`${data.url}/api/events`, { headers: { accept } })).status).toBe(406);
  }
  for (const cursor of ["broken", `${randomUUID()}:1.2`, `${randomUUID()}:-1`]) {
    expect((await fetch(`${data.url}/api/events`, { headers: { accept: "text/event-stream", "last-event-id": cursor } })).status).toBe(400);
  }
  expect((await fetch(`${data.url}/api/events`, { headers: { accept: "text/event-stream", origin: "http://example.test" } })).status).toBe(403);
  expect((await data.server.inject({ url: "/api/events", headers: { accept: "text/event-stream", host: "example.test" } })).statusCode).toBe(403);
  expect((await fetch(`${data.url}/api/fixture/cards`, { method: "POST", headers: { "content-type": "application/json", "x-storymapper-client-id": "invalid" }, body: "{}" })).status).toBe(400);
  data.handle.markUnavailable("Unavailable fixture");
  expect((await fetch(`${data.url}/api/events`, { headers: { accept: "text/event-stream" } })).status).toBe(503);
});

it("emits committed final metadata with request origin and replays durable grouped events after restart", async () => {
  const data = await fixture();
  const active = await stream(data.url);
  const ready = await active.next();
  expect(ready.event).toBe("ready");
  const originClientId = randomUUID();
  const response = await fetch(`${data.url}/api/fixture/cards`, { method: "POST", headers: { "content-type": "application/json", "x-storymapper-client-id": originClientId }, body: "{}" });
  expect(response.status).toBe(200);
  const first = await active.next();
  expect(first.event).toBe("transaction");
  expect(liveTransactionSchema.parse(first.data)).toMatchObject({ originClientId, actor: ACTOR });
  expect(first.raw).not.toContain("Private content");
  expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => { repository.createCard({ storyMapId: data.storyMapId, level: "story", title: "Rollback content" }); throw new Error("rollback"); })).toThrow("rollback");
  const cards = data.unitOfWork.run({ actorType: "agent", actorId: "fixture-agent" }, ({ repository }) => Array.from({ length: 30 }, (_, index) => repository.createCard({ storyMapId: data.storyMapId, level: "story", title: `Burst ${index}` })));
  const burst = await active.next();
  expect(burst.event).toBe("transaction");
  expect(liveTransactionSchema.parse(burst.data).entities.filter((entity) => cards.some((card) => card.id === entity.entityId))).toHaveLength(30);
  active.abort.abort();
  await data.server.close();
  const restarted = await fixture(data.path);
  const replay = await stream(restarted.url, String(ready.data.id));
  expect((await replay.next()).data).toEqual(first.data);
  expect((await replay.next()).data).toEqual(burst.data);
  expect((await replay.next()).event).toBe("ready");
});

it("resets only after successful restore, resets foreign cursors and remains passive while restoring", async () => {
  const data = await fixture();
  const active = await stream(data.url);
  const initial = (await active.next()).data as unknown as LiveReset;
  const point = createRestorePoint(data.handle, "manual");
  await expect(restoreProject(data.handle, data.project.id, "missing.sqlite", ACTOR)).rejects.toThrow();
  expect(data.streams.clients.size).toBe(1);
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  const reset = await active.next();
  expect(reset.event).toBe("reset");
  expect(reset.data.epoch).not.toBe(initial.epoch);
  const foreign = await stream(data.url, initial.id);
  expect((await foreign.next()).event).toBe("reset");
});

it("sends an actual fifteen-second heartbeat and closes sockets before storage shutdown", async () => {
  const data = await fixture();
  const active = await stream(data.url);
  await active.next();
  const start = performance.now();
  expect((await active.next()).raw).toBe(": heartbeat");
  expect(performance.now() - start).toBeGreaterThan(14_000);
  await data.server.close();
  expect(data.streams.clients.size).toBe(0);
  expect(data.handle.current.$client.open).toBe(false);
  expect((await active.reader.read()).done).toBe(true);
}, 20_000);

it("keeps streams and storage open until admitted asynchronous work commits and drains", async () => {
  let entered!: () => void;
  let resume!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const continuing = new Promise<void>((resolve) => { resume = resolve; });
  const data = await fixture(undefined, async (unitOfWork, storyMapId) => {
    entered();
    await continuing;
    expect(data.handle.current.$client.open).toBe(true);
    expect(data.streams.clients.size).toBe(1);
    return unitOfWork.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId, level: "story", title: "Drained transaction" }));
  });
  const active = await stream(data.url);
  await active.next();
  const request = fetch(`${data.url}/api/fixture/slow`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await started;
  const closing = data.server.close();
  expect(data.streams.clients.size).toBe(1);
  resume();
  expect((await active.next()).event).toBe("transaction");
  expect((await request).status).toBe(200);
  await closing;
  expect(data.streams.clients.size).toBe(0);
  expect(data.handle.current.$client.open).toBe(false);
});

it("preserves each tab origin through asynchronous terminal tool-call batching", async () => {
  const data = await fixture();
  const active = await stream(data.url);
  await active.next();
  const origins = [randomUUID(), randomUUID()];
  const responses = await Promise.all(origins.map((origin) => fetch(`${data.url}/api/fixture/tool`, { method: "POST", headers: { "content-type": "application/json", "x-storymapper-client-id": origin }, body: "{}" })));
  expect(responses.every((response) => response.ok)).toBe(true);
  const events = [await active.next(), await active.next()];
  expect(new Set(events.map((event) => event.data.originClientId))).toEqual(new Set(origins));
  expect(events.every((event) => liveTransactionSchema.parse(event.data).entities.every((entity) => entity.entityType === "activity"))).toBe(true);
});

it("replays multiple bounded pages in order while admitting an ordinary request and subsequent live commit", async () => {
  const data = await fixture();
  const initial = await stream(data.url);
  const cursor = String((await initial.next()).data.id);
  initial.abort.abort();
  for (let index = 0; index < 450; index++) data.unitOfWork.run(ACTOR, ({ repository }) => repository.gettingStarted.dismiss(data.project.id));
  const replay = await stream(data.url, cursor);
  const response = await fetch(`${data.url}/api/fixture/cards`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(response.status).toBe(200);
  const sequences: number[] = [];
  while (sequences.length < 451) {
    const event = await replay.next();
    if (event.event === "transaction") sequences.push(liveTransactionSchema.parse(event.data).seq);
  }
  expect(sequences).toEqual([...new Set(sequences)].sort((left, right) => left - right));
  expect(sequences.at(-1)).toBe(sequences[0]! + 450);
});

it("resets an existing socket only after a valid archive is successfully opened", async () => {
  const data = await fixture();
  const active = await stream(data.url);
  const initial = (await active.next()).data;
  const archive = await exportProjectArchive(data.handle, data.project.id);
  await expect(importProjectArchive(Buffer.from("Invalid archive"), data.handle, ACTOR)).rejects.toThrow();
  expect(data.streams.clients.size).toBe(1);
  await importProjectArchive(archive.content, data.handle, ACTOR);
  const reset = await active.next();
  expect(reset.event).toBe("reset");
  expect(reset.data.epoch).not.toBe(initial.epoch);
  expect(data.handle.current.$client.name).not.toBe(data.path);
});

it("delivers a valid transaction larger than1MiB and then a later event on the same socket", async () => {
  const subscribe = UnitOfWork.prototype.subscribe;
  let publish!: (event: LiveTransaction) => void;
  const capture = vi.spyOn(UnitOfWork.prototype, "subscribe").mockImplementation(function (this: UnitOfWork, listener) {
    publish = listener;
    return subscribe.call(this, listener);
  });
  const data = await fixture();
  capture.mockRestore();
  const active = await stream(data.url);
  const ready = (await active.next()).data as unknown as LiveReset;
  const large = liveTransactionSchema.parse({ ...ready, id: `${ready.epoch}:${ready.seq + 1}`, seq: ready.seq + 1,
    actor: ACTOR, originClientId: null, entities: Array.from({ length: 10_000 }, () => ({ entityType: "card", entityId: randomUUID(), projectId: data.project.id, version: 1 })) });
  expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(1_048_576);
  publish(large);
  const later = { ...large, id: `${ready.epoch}:${large.seq + 1}`, seq: large.seq + 1, entities: large.entities.slice(0, 1) };
  publish(later);
  const received = await active.next();
  expect(received.event).toBe("transaction");
  expect(received.data).toEqual(large);
  expect((await active.next()).data).toEqual(later);
  expect(data.streams.clients.size).toBe(1);
});

it("replays consecutive large transactions through backpressure before sending ready", async () => {
  const data = await fixture();
  const initial = database.readLiveCursor(data.handle);
  const entities = Array.from({ length: 10_000 }, () => ({ entityType: "card" as const, entityId: randomUUID(), projectId: data.project.id, version: 1 }));
  const events = [1, 2].map((offset) => liveTransactionSchema.parse({ ...initial, id: `${initial.epoch}:${initial.seq + offset}`, seq: initial.seq + offset, actor: ACTOR, originClientId: null, entities }));
  const last = events[1]!;
  vi.spyOn(database, "readLiveCursor").mockReturnValue({ epoch: last.epoch, id: last.id, seq: last.seq });
  const replay = vi.spyOn(database, "replayLiveTransactions").mockImplementation((_handle, after) => events.filter((event) => event.seq > after));
  const active = await stream(data.url, initial.id);
  expect((await active.next()).data).toEqual(events[0]);
  expect((await active.next()).data).toEqual(last);
  expect((await active.next()).event).toBe("ready");
  expect(replay).toHaveBeenCalledOnce();
  expect(data.streams.clients.size).toBe(1);
});

it("advances past a non-transaction replay boundary when a later commit appears during replay", async () => {
  const data = await fixture();
  data.handle.current.$client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), data.project.id, "audit-agent", "agent", "tool_call", new Date().toISOString());
  const boundary = database.readLiveCursor(data.handle);
  const cursor = { ...boundary, id: `${boundary.epoch}:0`, seq: 0 };
  const original = database.replayLiveTransactions;
  const replay = vi.spyOn(database, "replayLiveTransactions");
  let committed = false;
  replay.mockImplementation((handle, after, limit) => {
    if (!committed) {
      committed = true;
      data.unitOfWork.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: data.storyMapId, level: "story", title: "Concurrent replay commit" }));
    }
    return original(handle, after, limit);
  });
  const active = await stream(data.url, cursor.id);
  const transactions: number[] = [];
  let transaction: Awaited<ReturnType<typeof active.next>>;
  do {
    transaction = await active.next();
    expect(transaction.event).toBe("transaction");
    transactions.push(transaction.data.seq as number);
  } while ((transaction.data.seq as number) <= boundary.seq);
  expect(transactions.at(-1)).toBeGreaterThan(boundary.seq);
  expect((await active.next()).event).toBe("ready");
  expect(data.streams.clients.size).toBe(1);
});

it("keeps the accepted cursor monotonic while earlier queued frames drain", async () => {
  const subscribe = UnitOfWork.prototype.subscribe;
  let publish!: (event: LiveTransaction) => void;
  const capture = vi.spyOn(UnitOfWork.prototype, "subscribe").mockImplementation(function (this: UnitOfWork, listener) {
    publish = listener; return subscribe.call(this, listener);
  });
  const data = await fixture(); capture.mockRestore();
  const active = await stream(data.url);
  const ready = (await active.next()).data as unknown as LiveReset;
  const streamClient = [...data.streams.clients][0]!;
  const write = vi.spyOn(streamClient.response, "write").mockReturnValue(false);
  for (const offset of [1, 2, 3]) publish(liveTransactionSchema.parse({ epoch: ready.epoch, seq: ready.seq + offset, id: `${ready.epoch}:${ready.seq + offset}`,
    actor: ACTOR, originClientId: null, entities: [{ entityType: "card", entityId: randomUUID(), projectId: data.project.id, version: 1 }] }));
  expect(streamClient.cursor.seq).toBe(ready.seq + 3);
  streamClient.response.emit("drain");
  expect(streamClient.output).toHaveLength(1);
  expect(streamClient.cursor.seq).toBe(ready.seq + 3);
  write.mockRestore(); streamClient.response.emit("drain");
});

it("drains commits arriving during queued replay backpressure once in sequence before ready", async () => {
  const subscribe = UnitOfWork.prototype.subscribe;
  let publish!: (event: LiveTransaction) => void;
  const capture = vi.spyOn(UnitOfWork.prototype, "subscribe").mockImplementation(function (this: UnitOfWork, listener) {
    publish = listener; return subscribe.call(this, listener);
  });
  const data = await fixture(); capture.mockRestore();
  const initial = database.readLiveCursor(data.handle);
  const events = [1, 2, 3, 4].map((offset) => liveTransactionSchema.parse({ epoch: initial.epoch, seq: initial.seq + offset, id: `${initial.epoch}:${initial.seq + offset}`,
    actor: ACTOR, originClientId: null, entities: [{ entityType: "card", entityId: randomUUID(), projectId: data.project.id, version: 1 }] }));
  const first = events[0]!;
  vi.spyOn(database, "readLiveCursor").mockReturnValue({ epoch: first.epoch, id: first.id, seq: first.seq });
  vi.spyOn(database, "replayLiveTransactions").mockReturnValue([first]);
  const write = ServerResponse.prototype.write;
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, chunk: unknown) {
    const accepted = write.call(this, chunk, "utf8");
    const text = String(chunk);
    return text.startsWith(`id: ${events[0]!.id}\n`) || text.startsWith(`id: ${events[1]!.id}\n`) ? false : accepted;
  });
  const active = await stream(data.url, initial.id);
  expect((await active.next()).data.seq).toBe(first.seq);
  const streamClient = [...data.streams.clients][0]!;
  publish(events[1]!); publish(events[2]!);
  streamClient.response.emit("drain");
  expect((await active.next()).data.seq).toBe(events[1]!.seq);
  publish(events[3]!);
  streamClient.response.emit("drain");
  const rest = [await active.next(), await active.next(), await active.next()];
  expect(rest.map((event) => [event.event, event.data.seq])).toEqual([["transaction", events[2]!.seq], ["transaction", events[3]!.seq], ["ready", events[3]!.seq]]);
  expect(streamClient.pending).toHaveLength(0);
  expect(streamClient.replaying).toBe(false);
});
