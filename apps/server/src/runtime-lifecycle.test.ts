import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { operationalHealthSchema, type OperationalHealth } from "@storymapper/contracts";
import { DatabaseHandle, developmentSchemaVersion, openExistingStoryMapperDb, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { inspectRuntimeDatabase, openWalPinnedReader } from "@storymapper/db/fixtures/runtime-inspection";
import { acquireProjectLock } from "@storymapper/server/config/project-lock";
import { createRuntimeLog } from "@storymapper/server/config/runtime-log";
import { buildServer } from "@storymapper/server/server";
import { installRuntimePort } from "@storymapper/server/config/runtime-port";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";
import { infrastructureRoutes } from "@storymapper/server/http/routes/infrastructure-routes";
import * as storyMapUseCases from "@storymapper/server/application/story-map/story-map.use-cases";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TSX = pathToFileURL(createRequire(join(ROOT, "apps/server/package.json")).resolve("tsx")).href;
const cleanup: Array<() => void | Promise<void>> = [];
const ACTOR = { actorType: "human", actorId: "runtime-fixture" } as const;

function pending<Result>(): { promise: Promise<Result>; resolve: (value: Result) => void } {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function holdArchiveLoad(): { entered: Promise<void>; resume: () => void } {
  const entered = pending<void>();
  const resume = pending<void>();
  const load = JSZip.loadAsync;
  vi.spyOn(JSZip, "loadAsync").mockImplementationOnce(async (...args) => {
    entered.resolve();
    await resume.promise;
    return load(...args);
  });
  return { entered: entered.promise, resume: () => resume.resolve() };
}

function uploadArchive(url: string, content: ArrayBuffer): Promise<Response> {
  const archive = new FormData();
  archive.append("archive", new Blob([content]), "fixture.zip");
  return fetch(`${url}/api/projects/import`, { method: "POST", body: archive });
}

function coordinateSnapshotRead(server: FastifyInstance, storyMapId: string) {
  const mapAdmitted = pending<void>();
  const healthQueued = pending<void>();
  const releaseMap = pending<void>();
  const snapshotFinished = pending<void>();
  cleanup.push(() => { releaseMap.resolve(); snapshotFinished.resolve(); });
  const phases: string[] = [];
  let snapshotDuration = 0;
  const getSnapshot = storyMapUseCases.getStoryMapSnapshot;
  vi.spyOn(storyMapUseCases, "getStoryMapSnapshot").mockImplementation((...args) => {
    expect(phases).toEqual(["map-admitted", "health-queued"]);
    phases.push("snapshot-entered");
    const started = performance.now();
    const snapshot = getSnapshot(...args);
    snapshotDuration = performance.now() - started;
    expect(snapshot.cards).toHaveLength(1000);
    phases.push("snapshot-completed");
    snapshotFinished.resolve();
    return snapshot;
  });
  server.addHook("onRequest", async (request) => {
    if (request.url === `/api/story-maps/${storyMapId}`) {
      phases.push("map-admitted");
      mapAdmitted.resolve();
      await releaseMap.promise;
    } else if (request.url === "/api/health") {
      phases.push("health-queued");
      healthQueued.resolve();
      await snapshotFinished.promise;
      phases.push("health-released");
    }
  });
  return { mapAdmitted: mapAdmitted.promise, healthQueued: healthQueued.promise, releaseMap: () => releaseMap.resolve(), phases, snapshotDuration: () => snapshotDuration };
}

async function assertUnavailableWriter(url: string, currentPath: string, failure: string): Promise<void> {
  const health = await fetch(`${url}/api/health`);
  expect(health.status).toBe(200);
  expect(operationalHealthSchema.parse(await health.json())).toMatchObject({ writeGate: "unavailable", schemaVersion: null, epoch: null });
  const before = inspectRuntimeDatabase(currentPath);
  const write = await fetch(`${url}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Unavailable writer must refuse" }) });
  expect(write.status).toBe(503);
  expect(await write.json()).toEqual({ message: failure });
  expect(inspectRuntimeDatabase(currentPath)).toEqual(before);
}

async function assertStoppingHealth(url: string, health: OperationalHealth): Promise<void> {
  const response = await fetch(`${url}/api/health`);
  expect(response.status).toBe(200);
  expect(operationalHealthSchema.parse(await response.json())).toEqual({ ...health, writeGate: "stopping" });
  const ordinary = await fetch(`${url}/api/projects`);
  expect(ordinary.status).toBe(503);
  expect(await ordinary.json()).toEqual({ message: "Agentic Story Mapper is shutting down." });
}

function fixture(): { directory: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "storymapper-lifecycle-"));
  const directory = join(root, "runtime.lsm");
  mkdirSync(directory);
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  return { directory, path: join(directory, "storymapper.sqlite") };
}

function launch(path: string, slow = false) {
  const temporaryDirectory = dirname(dirname(path));
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: temporaryDirectory, TMP: temporaryDirectory, TEMP: temporaryDirectory, TSX_TSCONFIG_PATH: join(ROOT, "apps/server/tsconfig.json"), STORYMAPPER_DB_PATH: path, HOST: "127.0.0.1", LOG_LEVEL: "warn" };
  delete env.PORT;
  const child = spawn(process.execPath, ["--import", TSX, join(ROOT, `apps/server/src/${slow ? "fixtures/runtime-lifecycle" : "main"}.ts`), "--dev"], {
    cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let output = "";
  child.stdout!.on("data", (data) => { output += data; });
  child.stderr!.on("data", (data) => { output += data; });
  const messages: Array<{ type: string; url?: string }> = [];
  child.on("message", (message) => {
    messages.push(message as { type: string; url?: string });
    if (message && typeof message === "object" && "message" in message) output += String(message.message);
  });
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
  cleanup.push(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
  return { child, closed, messages, output: () => output };
}

async function message(runtime: ReturnType<typeof launch>, type: string): Promise<{ type: string; url?: string }> {
  let result: { type: string; url?: string } | undefined;
  await vi.waitFor(() => {
    result = runtime.messages.find((value) => value.type === type);
    if (!result && runtime.child.exitCode !== null) throw new Error(runtime.output());
    expect(result).toBeDefined();
  }, { timeout: 20_000 });
  return result!;
}

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("refuses live/malformed owners before opening and never removes a replacement lock", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  const release = acquireProjectLock(data.path, () => { throw new Error("Unexpected takeover"); });
  const record = JSON.parse(readFileSync(join(data.directory, ".lock"), "utf8"));
  await expect(buildServer({ development: true })).rejects.toThrow(`PID ${process.pid}, process start time ${record.processStartTime}`);
  expect(existsSync(data.path)).toBe(false);
  writeFileSync(join(data.directory, ".lock"), JSON.stringify({ ...record, owner: "replacement" }));
  expect(release).toThrow("another runtime's lock");
  expect(JSON.parse(readFileSync(join(data.directory, ".lock"), "utf8")).owner).toBe("replacement");
  writeFileSync(join(data.directory, ".lock"), "malformed");
  await expect(buildServer({ development: true })).rejects.toThrow("ownership cannot be proved");
  expect(readFileSync(join(data.directory, ".lock"), "utf8")).toBe("malformed");
});

it("reclaims an actual dead server and dead acquisition claim with exactly one competing writer", async () => {
  const data = fixture();
  const initial = launch(data.path);
  await message(initial, "listening");
  const record = JSON.parse(readFileSync(join(data.directory, ".lock"), "utf8"));
  initial.child.kill("SIGKILL");
  await initial.closed;
  const claim = join(data.directory, ".lock.claim");
  mkdirSync(claim);
  writeFileSync(join(claim, record.owner), JSON.stringify(record));
  const contenders = [launch(data.path), launch(data.path)];
  await vi.waitFor(() => expect(contenders.flatMap((runtime) => runtime.messages).filter((value) => value.type === "listening")).toHaveLength(1), { timeout: 20_000 });
  const winner = contenders.find((runtime) => runtime.messages.some((value) => value.type === "listening"))!;
  const loser = contenders.find((runtime) => runtime !== winner)!;
  expect((await loser.closed).code).toBe(1);
  expect(loser.output()).toMatch(/owned by PID|acquisition metadata|EPERM: operation not permitted/);
  expect(JSON.parse(readFileSync(join(data.directory, ".lock"), "utf8")).pid).toBe(winner.child.pid);
  expect(winner.output()).toContain(`Reclaimed dead Project owner PID ${record.pid}, process start time ${record.processStartTime}`);
  winner.child.send({ type: "shutdown" });
  expect((await winner.closed).code).toBe(0);
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  expect(existsSync(join(data.directory, ".port"))).toBe(false);
}, 30_000);

it.each(["SIGINT", "SIGTERM", "IPC"] as const)("%s drains an actual admitted long agent call and durable audit before checkpoint/owned cleanup", async (signal) => {
  const data = fixture();
  const runtime = launch(data.path, true);
  const { url } = await message(runtime, "listening");
  const call = fetch(`${url}/api/mcp/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ListProjects", input: {} }) });
  await message(runtime, "call-entered");
  const started = performance.now();
  if (signal === "IPC") runtime.child.send({ type: "shutdown" });
  else if (process.platform === "win32") runtime.child.send({ type: "fixture-signal", signal });
  else runtime.child.kill(signal);
  await vi.waitFor(async () => expect((await fetch(`${url}/api/projects`)).status).toBe(503));
  expect((await call).status).toBe(200);
  expect((await runtime.closed).code).toBe(0);
  expect(performance.now() - started).toBeGreaterThan(2000);
  for (const path of [".lock", ".port", ".lock.claim", "storymapper.sqlite-wal"]) expect(existsSync(join(data.directory, path))).toBe(false);
  const db = openExistingStoryMapperDb(data.path);
  try { expect(db.$client.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'tool_call'").get()).toEqual({ count: 1 }); }
  finally { db.$client.close(); }
}, 30_000);

it("drains a disconnected admitted agent call and shares repeated IPC shutdown completion", async () => {
  const data = fixture();
  const runtime = launch(data.path, true);
  const { url } = await message(runtime, "listening");
  const abort = new AbortController();
  const call = fetch(`${url}/api/mcp/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ListProjects", input: {} }), signal: abort.signal });
  await message(runtime, "call-entered");
  abort.abort();
  await expect(call).rejects.toThrow();
  runtime.child.send({ type: "shutdown" });
  runtime.child.send({ type: "shutdown" });
  expect((await runtime.closed).code).toBe(0);
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  const db = openExistingStoryMapperDb(data.path);
  try { expect(db.$client.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'tool_call'").get()).toEqual({ count: 1 }); }
  finally { db.$client.close(); }
}, 30_000);

it("opens original and replacement connections with explicit raw pragmas", () => {
  const data = fixture();
  for (const open of [openStoryMapperDb, openExistingStoryMapperDb]) {
    const db = open(data.path);
    try {
      expect(db.$client.pragma("busy_timeout", { simple: true })).toBe(5000);
      expect(db.$client.pragma("wal_autocheckpoint", { simple: true })).toBe(1000);
      expect(() => db.$client.pragma("wal_checkpoint(TRUNCATE)")).not.toThrow();
      db.$client.pragma("journal_mode = DELETE");
    } finally { db.$client.close(); }
  }
});

it("aborts an admitted incomplete HTTP body before its handler so shutdown completes", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  const admitted = pending<FastifyRequest>();
  server.addHook("onRequest", async (request) => {
    if (request.method === "POST" && request.url === "/api/projects") admitted.resolve(request);
  });
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  const url = new URL(await server.listen({ host: "127.0.0.1", port: 0 }));
  publish();
  const before = inspectRuntimeDatabase(data.path);
  const socket = createConnection({ host: "127.0.0.1", port: Number(url.port) });
  const socketClosed = pending<void>();
  const socketErrors: Error[] = [];
  socket.on("error", (error) => socketErrors.push(error));
  socket.once("close", () => socketClosed.resolve());
  cleanup.push(async () => { socket.destroy(); await server.close(); });
  socket.write(`POST /api/projects HTTP/1.1\r\nHost: ${url.host}\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"name":"Incomplete body`);
  const request = await admitted.promise;
  expect(request.raw.complete).toBe(false);
  expect(request.raw.destroyed).toBe(false);
  let closed = false;
  const closing = server.close().then(() => { closed = true; });
  await vi.waitFor(() => expect(closed).toBe(true), { timeout: 2000 });
  await closing;
  await socketClosed.promise;
  expect(request.raw.destroyed).toBe(true);
  expect(socketErrors.every((error) => "code" in error && error.code === "ECONNRESET")).toBe(true);
  for (const path of [".lock", ".port", "storymapper.sqlite-wal"]) expect(existsSync(join(data.directory, path))).toBe(false);
  expect(inspectRuntimeDatabase(data.path)).toEqual(before);
});

it("refuses shutdown with a real WAL-pinned read-only reader and retains ownership and committed data", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  let reader: ReturnType<typeof openWalPinnedReader> | undefined;
  let handle: DatabaseHandle | undefined;
  let shutdownAttempted = false;
  cleanup.push(async () => {
    reader?.close();
    if (!shutdownAttempted) await server.close();
    if (handle?.current.$client.open) handle.current.$client.close();
  });
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  expect(existsSync(`${data.path}-wal`)).toBe(true);
  reader = openWalPinnedReader(data.path);
  const before = reader.inspect();
  const response = await fetch(`${url}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Committed behind WAL reader" }) });
  expect(response.status).toBe(201);
  const project = await response.json();
  expect(reader.inspect()).toEqual(before);
  expect(inspectRuntimeDatabase(data.path).projectIds).toContain(project.id);
  const lock = readFileSync(join(data.directory, ".lock"), "utf8");
  const port = readFileSync(join(data.directory, ".port"), "utf8");
  const drain = DatabaseHandle.prototype.drain;
  vi.spyOn(DatabaseHandle.prototype, "drain").mockImplementation(function (this: DatabaseHandle) { handle = this; return drain.call(this); });
  shutdownAttempted = true;
  await expect(server.close()).rejects.toThrow("Shutdown checkpoint is busy; ownership is retained.");
  expect(handle?.stopping).toBe(true);
  expect(handle?.current.$client.open).toBe(true);
  expect(readFileSync(join(data.directory, ".lock"), "utf8")).toBe(lock);
  expect(readFileSync(join(data.directory, ".port"), "utf8")).toBe(port);
  expect(existsSync(`${data.path}-wal`)).toBe(true);
  expect(() => acquireProjectLock(data.path, () => { throw new Error("Unexpected takeover"); })).toThrow(`PID ${process.pid}`);
  handle!.current.$client.close();
  expect(inspectRuntimeDatabase(data.path).projectIds).toContain(project.id);
}, 15_000);

it("keeps operational HTTP health current while admitted work holds shutdown draining", async () => {
  const data = fixture();
  const handle = new DatabaseHandle(openStoryMapperDb(data.path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Stopping health fixture" }));
  const epoch = repository.getSafetySettings(project.id).epoch;
  const schemaVersion = developmentSchemaVersion(handle.current);
  const server = Fastify();
  cleanup.push(() => server.close());
  installRestoreRequestGate(server, handle);
  await server.register(infrastructureRoutes, { repository, unitOfWork, databasePath: data.path });
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  expect(handle.enterRequest()).toBe(true);
  let drained = false;
  const drain = handle.drain().then(() => { drained = true; });
  try {
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);
    expect(operationalHealthSchema.parse(await response.json())).toMatchObject({ schemaVersion, epoch, writeGate: "stopping", pendingMigration: null });
    expect((await fetch(`${url}/api/mcp/tools`)).status).toBe(503);
    expect(drained).toBe(false);
    expect(handle.current.$client.open).toBe(true);
  } finally { handle.leaveRequest(); await drain; }
});

it("retains writer and discovery ownership until a disconnected real HTTP archive import completes", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  cleanup.push(() => server.close());
  const disconnected = pending<void>();
  server.addHook("onRequest", async (request) => {
    if (request.url === "/api/projects/import") request.raw.socket.once("close", () => disconnected.resolve());
  });
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const project = (await (await fetch(`${url}/api/projects`)).json()).projects[0];
  const health = operationalHealthSchema.parse(await (await fetch(`${url}/api/health`)).json());
  const exported = await fetch(`${url}/api/projects/export?projectId=${project.id}`);
  const archive = new FormData();
  archive.append("archive", new Blob([await exported.arrayBuffer()]), "fixture.zip");
  const held = holdArchiveLoad();
  const abort = new AbortController();
  const call = fetch(`${url}/api/projects/import`, { method: "POST", body: archive, signal: abort.signal });
  await held.entered;
  abort.abort();
  await expect(call).rejects.toThrow();
  await disconnected.promise;
  const stopping = pending<DatabaseHandle>();
  const drain = DatabaseHandle.prototype.drain;
  await exerciseRetainsWriterAndDiscoveryOwnershipUntilADisconnectedReal(stopping, drain, server, url, health, data, held);
  const imported = readdirSync(join(data.directory, "..")).find((name) => name.startsWith("imported-"))!;
  const importedPath = join(data.directory, "..", imported, "storymapper.sqlite");
  expect(existsSync(join(data.directory, "..", imported, ".lock"))).toBe(false);
  expect(existsSync(`${importedPath}-wal`)).toBe(false);
  const db = openExistingStoryMapperDb(importedPath);
  try { expect(db.$client.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'project.archiveImported'").get()).toEqual({ count: 1 }); }
  finally { db.$client.close(); }
});

it("cleans owned startup state after failed port publication while preserving the foreign port file", async () => {
  const data = fixture();
  const path = join(data.directory, ".port");
  const foreign = JSON.stringify({ host: "127.0.0.1", port: 4317, owner: "foreign" });
  writeFileSync(path, foreign);
  const runtime = launch(data.path);
  expect((await runtime.closed).code).toBe(1);
  expect(runtime.output()).toContain("runtime port file already exists");
  expect(readFileSync(path, "utf8")).toBe(foreign);
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  expect(existsSync(`${data.path}-wal`)).toBe(false);
});

it("holds ownership until discovery cleanup completes so a restarting writer cannot see the old port", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  cleanup.push(() => server.close());
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  let refusal = "";
  server.getDecorator<(finish: () => void) => void>("registerRuntimeCleanup")(() => {
    expect(existsSync(`${data.path}-wal`)).toBe(false);
    try { acquireProjectLock(data.path, () => { throw new Error("Unexpected takeover"); })(); }
    catch (error) { if (!(error instanceof Error)) throw error; refusal = error.message; }
  });
  await server.close();
  expect(refusal).toContain(`PID ${process.pid}`);
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  expect(existsSync(join(data.directory, ".port"))).toBe(false);
});

it("reports restoring and unavailable writer state without blocking health or exposing the failure path", async () => {
  const data = fixture();
  const handle = new DatabaseHandle(openStoryMapperDb(data.path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Health fixture" }));
  const server = Fastify();
  cleanup.push(() => server.close());
  installRestoreRequestGate(server, handle);
  await server.register(infrastructureRoutes, { repository, unitOfWork, databasePath: data.path });
  await handle.restore(async () => {
    const response = await server.inject("/api/health");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ writeGate: "restoring", pendingMigration: null });
  });
  expect(handle.exclusive("test", () => handle.writeGate)).toBe("writing");
  handle.markUnavailable("C:\\Users\\Private Name\\database unavailable");
  const response = await server.inject("/api/health");
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ schemaVersion: null, epoch: null, writeGate: "unavailable", pendingMigration: null });
  expect(response.body).not.toContain("Private Name");
});

it("retains the startup lock through restore/repeated archive switches and releases only closed imported ownership", async () => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  cleanup.push(() => server.close());
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const project = (await (await fetch(`${url}/api/projects`)).json()).projects[0];
  const lock = readFileSync(join(data.directory, ".lock"), "utf8");
  const health = await (await fetch(`${url}/api/health`)).json();
  const point = (await (await fetch(`${url}/api/human/projects/${project.id}/restore-points`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ class: "manual" }) })).json()).restorePoint;
  expect((await fetch(`${url}/api/human/projects/${project.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: point.fileName, confirm: true }) })).status).toBe(200);
  expect(readFileSync(join(data.directory, ".lock"), "utf8")).toBe(lock);
  expect((await (await fetch(`${url}/api/health`)).json()).epoch).not.toBe(health.epoch);
  let previousImported: string | undefined;
  for (let index = 0; index < 2; index++) {
    const exported = await fetch(`${url}/api/projects/export?projectId=${project.id}`);
    const archive = new FormData();
    archive.append("archive", new Blob([await exported.arrayBuffer()]), "fixture.zip");
    const response = await fetch(`${url}/api/projects/import`, { method: "POST", body: archive });
    expect(response.status).toBe(200);
    const imported = await response.json();
    expect(existsSync(join(imported.localPath, ".lock"))).toBe(true);
    expect(readFileSync(join(data.directory, ".lock"), "utf8")).toBe(lock);
    expect(existsSync(join(data.directory, ".port"))).toBe(true);
    if (previousImported) expect(existsSync(join(previousImported, ".lock"))).toBe(false);
    vi.stubEnv("STORYMAPPER_DB_PATH", join(imported.localPath, "storymapper.sqlite"));
    await expect(buildServer({ development: true })).rejects.toThrow(`PID ${process.pid}`);
    previousImported = imported.localPath;
  }
  await server.close();
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  expect(existsSync(join(previousImported!, ".lock"))).toBe(false);
  expect(existsSync(join(data.directory, ".port"))).toBe(false);
});

it.each(["replaced", "corrupted"] as const)("marks the assigned archive writer unavailable when previous imported ownership is %s", async (kind) => {
  const data = fixture();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "error");
  const server = await buildServer({ development: true });
  let damaged = false;
  cleanup.push(async () => {
    const close = server.close();
    if (damaged) await expect(close).rejects.toThrow("Project ownership cleanup failed.");
    else await close;
  });
  const publish = installRuntimePort(server, data.path, "127.0.0.1");
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const startupLock = readFileSync(join(data.directory, ".lock"), "utf8");
  const port = readFileSync(join(data.directory, ".port"), "utf8");
  const project = (await (await fetch(`${url}/api/projects`)).json()).projects[0];
  const archive = await (await fetch(`${url}/api/projects/export?projectId=${project.id}`)).arrayBuffer();
  const first = await uploadArchive(url, archive);
  expect(first.status).toBe(200);
  const oldPath = (await first.json()).localPath;
  const oldLockPath = join(oldPath, ".lock");
  const oldLock = JSON.parse(readFileSync(oldLockPath, "utf8"));
  const foreign = kind === "replaced" ? JSON.stringify({ ...oldLock, owner: "foreign-owner" }) : "corrupted ownership metadata";
  writeFileSync(oldLockPath, foreign);
  damaged = true;
  let handle: DatabaseHandle | undefined;
  const markUnavailable = DatabaseHandle.prototype.markUnavailable;
  vi.spyOn(DatabaseHandle.prototype, "markUnavailable").mockImplementation(function (this: DatabaseHandle, reason) { handle = this; markUnavailable.call(this, reason); });
  const second = await uploadArchive(url, archive);
  const failure = "The new Project was opened, but previous ownership cleanup failed. The runtime is unavailable.";
  expect(second.status).toBe(400);
  expect(await second.json()).toMatchObject({ code: "validation", message: failure });
  expect(handle?.writeGate).toBe("unavailable");
  expect(handle?.current.$client.open).toBe(true);
  const currentPath = handle!.current.$client.name;
  expect(currentPath).not.toBe(join(oldPath, "storymapper.sqlite"));
  expect(existsSync(join(dirname(currentPath), ".lock"))).toBe(true);
  expect(readFileSync(oldLockPath, "utf8")).toBe(foreign);
  expect(readFileSync(join(data.directory, ".lock"), "utf8")).toBe(startupLock);
  expect(readFileSync(join(data.directory, ".port"), "utf8")).toBe(port);
  await assertUnavailableWriter(url, currentPath, failure);
  expect(() => acquireProjectLock(currentPath, () => { throw new Error("Unexpected takeover"); })).toThrow(`PID ${process.pid}`);
});

it("bounds five real log files and omits credentials, full payloads and personal paths with spaces", () => {
  const data = fixture();
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const path = join(data.directory, "storymapper.log");
  writeFileSync(path, "");
  for (let index = 0; index < 7; index++) {
    truncateSync(path, 10 * 1024 * 1024);
    const log = createRuntimeLog(data.directory);
    log.write(JSON.stringify({ level: 30, msg: "incoming request", req: { authorization: "private-credential", body: { content: "private-payload" }, url: "C:\\Users\\Personal Name\\Documents\\map" }, err: { stack: "/home/Personal Name/secret" } }));
    log.write(JSON.stringify({ level: 50, msg: "C:\\Users\\Personal Name\\private-credential", payload: "private-payload" }));
  }
  const files = readdirSync(data.directory).filter((name) => name.startsWith("storymapper.log"));
  expect(files).toHaveLength(5);
  for (const file of files) {
    expect(statSync(join(data.directory, file)).size).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(readFileSync(join(data.directory, file), "utf8")).not.toMatch(/private-credential|private-payload|Personal Name/);
  }
});

it("rotates when successive writes from one log writer cross the byte threshold", () => {
  const data = fixture();
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const path = join(data.directory, "storymapper.log");
  const record = JSON.stringify({ level: 30, msg: "incoming request" });
  const output = `${record}\n`;
  const bytes = Buffer.byteLength(output);
  const limit = 10 * 1024 * 1024;
  writeFileSync(path, Buffer.alloc(limit - 2 * bytes));
  const log = createRuntimeLog(data.directory);
  log.write(record);
  log.write(record);
  expect(statSync(path).size).toBe(limit);
  expect(existsSync(`${path}.1`)).toBe(false);
  log.write(record);
  expect(statSync(`${path}.1`).size).toBe(limit);
  expect(readFileSync(path, "utf8")).toBe(output);
  expect(readdirSync(data.directory).filter((name) => name.startsWith("storymapper.log"))).toHaveLength(2);
});

it("reports the persisted epoch/current schema and serves health within 1000ms during a real 1000-Card HTTP read", async () => {
  const data = fixture();
  const db = openStoryMapperDb(data.path);
  cleanup.push(() => { if (db.$client.open) db.$client.close(); });
  const handle = new DatabaseHandle(db);
  const uow = new UnitOfWork(handle);
  const project = uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Runtime fixture" }));
  const map = uow.run(ACTOR, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "1000 Card fixture" }));
  uow.run(ACTOR, ({ repository }) => {
    const parent = repository.createCard({ storyMapId: map.id, level: "activity", title: "Fixture activity" });
    const step = repository.createCard({ storyMapId: map.id, parentId: parent.id, level: "step", title: "Fixture step" });
    for (let index = 0; index < 998; index++) repository.createCard({ storyMapId: map.id, parentId: step.id, level: "story", title: `Fixture story ${index}` });
  });
  const epoch = new StoryMapperRepository(handle).getSafetySettings(project.id).epoch;
  const schemaVersion = developmentSchemaVersion(db);
  db.$client.close();
  vi.stubEnv("STORYMAPPER_DB_PATH", data.path);
  vi.stubEnv("LOG_LEVEL", "info");
  const server = await buildServer({ development: true });
  cleanup.push(() => server.close());
  const coordinated = coordinateSnapshotRead(server, map.id);
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener");
  const url = `http://127.0.0.1:${address.port}`;
  const snapshot = fetch(`${url}/api/story-maps/${map.id}`);
  await coordinated.mapAdmitted;
  const started = performance.now();
  const healthResponse = fetch(`${url}/api/health`);
  await coordinated.healthQueued;
  coordinated.releaseMap();
  const response = await healthResponse;
  const health = operationalHealthSchema.parse(await response.json());
  const elapsed = performance.now() - started;
  expect(response.status).toBe(200);
  expect(health).toMatchObject({ schemaVersion, epoch, writeGate: "available", pendingMigration: null });
  expect((await (await snapshot).json()).cards).toHaveLength(1000);
  expect(coordinated.phases).toEqual(["map-admitted", "health-queued", "snapshot-entered", "snapshot-completed", "health-released"]);
  expect(elapsed).toBeGreaterThanOrEqual(coordinated.snapshotDuration());
  expect(elapsed).toBeLessThan(1_000);
  expect(readFileSync(join(data.directory, "logs", "storymapper.log"), "utf8")).toContain("incoming request");
  await vi.waitFor(() => expect(readFileSync(join(data.directory, "logs", "storymapper.log"), "utf8").split("\n").filter((line) => line.includes('"msg":"request completed"'))).toHaveLength(2));
  process.stdout.write(`1000-Card concurrent HTTP health: ${elapsed.toFixed(2)} ms; real snapshot processing: ${coordinated.snapshotDuration().toFixed(2)} ms; admitted-map/queued-health/snapshot phase order verified (local Node ${process.versions.node}, warm fixture)\n`);
});

async function exerciseRetainsWriterAndDiscoveryOwnershipUntilADisconnectedReal(stopping: { promise: Promise<DatabaseHandle>; resolve: (value: DatabaseHandle) => void; }, drain: () => Promise<void>, server: FastifyInstance, url: string, health: OperationalHealth, data: { directory: string; path: string; }, held: { entered: Promise<void>; resume: () => void; }) {
  vi.spyOn(DatabaseHandle.prototype, "drain").mockImplementation(function(this: DatabaseHandle) {
    stopping.resolve(this);
    return drain.call(this);
  });
  let closed = false;
  const close = server.close().then(() => { closed = true; });
  try {
    expect((await stopping.promise).stopping).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    await assertStoppingHealth(url, health);
    expect(existsSync(join(data.directory, ".lock"))).toBe(true);
    expect(existsSync(join(data.directory, ".port"))).toBe(true);
    expect(() => acquireProjectLock(data.path, () => { throw new Error("Unexpected takeover"); })).toThrow(`PID ${process.pid}`);
  } finally { held.resume(); await close; }
  expect(existsSync(join(data.directory, ".lock"))).toBe(false);
  expect(existsSync(join(data.directory, ".port"))).toBe(false);
}
