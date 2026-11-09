import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const REPOSITORY_DIRECTORY = fileURLToPath(new URL("../../../", import.meta.url));
const WEB_BUILD_DIRECTORY = join(REPOSITORY_DIRECTORY, "apps", "web", "dist");

async function unusedLoopbackPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Expected a loopback TCP address");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForHealth(child: ChildProcess, origin: string, development: boolean): Promise<Response> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Server command exited before becoming healthy");
    try {
      return await fetch(`${origin}/health`, { headers: { origin: development ? "http://127.0.0.1:5173" : origin }, signal: AbortSignal.timeout(1000) });
    } catch (error) {
      if (!(error instanceof TypeError) || !(error.cause instanceof Error) || !("code" in error.cause) || error.cause.code !== "ECONNREFUSED") throw error;
    }
    await setTimeout(100);
  }
  throw new Error("Server command did not become healthy within 20 seconds");
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error;
  }
}

async function stopServerCommand(child: ChildProcess, closed: Promise<void>): Promise<void> {
  if (process.platform === "win32") {
    if (child.exitCode === null && child.pid) {
      const termination = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      await new Promise<void>((resolve, reject) => {
        termination.once("error", reject);
        termination.once("close", (code) => code === 0 ? resolve() : reject(new Error(`taskkill exited with ${code}`)));
      });
    }
  } else {
    signalProcessGroup(child, "SIGTERM");
    await Promise.race([closed, setTimeout(3000)]);
    signalProcessGroup(child, "SIGKILL");
  }
  await Promise.race([closed, setTimeout(3000, undefined, { ref: false }).then(() => { throw new Error("Server command did not close after termination"); })]);
}

async function withServerCommand(command: "dev" | "start", inspect: (origin: string, health: Response, output: () => string) => Promise<void>, overrides: NodeJS.ProcessEnv = {}): Promise<void> {
  const port = await unusedLoopbackPort();
  const directory = mkdtempSync(join(tmpdir(), "storymapper-command-"));
  const child = spawn("corepack", ["pnpm", "--filter", "@storymapper/server", command], {
    cwd: REPOSITORY_DIRECTORY,
    env: { ...process.env, STORYMAPPER_DB_PATH: join(directory, "storymapper.sqlite"), HOST: "127.0.0.1", PORT: String(port), STORYMAPPER_ALLOW_REMOTE_HOST: "false", LOG_LEVEL: "error", ...overrides },
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let startupError: Error | undefined;
  child.once("error", (error) => { startupError = error; });
  let output = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  child.stderr?.resume();
  try {
    const origin = `http://127.0.0.1:${port}`;
    const health = await waitForHealth(child, origin, command === "dev");
    if (startupError) throw startupError;
    expect(health.status).toBe(200);
    expect((await health.json()).ok).toBe(true);
    await inspect(origin, health, () => output);
  } finally {
    try {
      await stopServerCommand(child, closed);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

async function socketStatus(origin: string, path: string, headers: Record<string, string>, setHost = headers.host !== ""): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${origin}${path}`, { headers, setHost }, (response) => { response.resume(); resolve(response.statusCode!); });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

async function inspectSocketBoundary(origin: string, development: boolean): Promise<void> {
  for (const path of ["/health", "/api/projects", "/", "/assets/missing.js", "/missing", "/mcp"]) {
    expect(await socketStatus(origin, path, { host: "evil.example:4317" })).toBe(403);
    expect(await socketStatus(origin, path, { origin: "https://evil.example" })).toBe(403);
  }
  expect(await socketStatus(origin, "/health", { origin })).toBe(200);
  expect(await socketStatus(origin, "/health", { origin: "http://127.0.0.1:5173" })).toBe(development ? 200 : 403);
  expect(await socketStatus(origin, "/health", { host: "127.0.0.1:4317" })).toBe(403);
  const port = new URL(origin).port;
  for (const path of ["/health", "/api/projects", "/", "/assets/missing.js", "/mcp"]) expect(await socketStatus(origin, path, {}, false)).toBe(403);
  for (const host of [`localhost:0${port}`, `localhost:${port}junk`, `localhost:+${port}`, `localhost:${port}:80`, `::1:${port}`, `[::1]:${port}junk`, `[::1]:+${port}`, `[localhost]:${port}`, ""]) {
    for (const path of ["/health", "/api/projects", "/", "/assets/missing.js", "/mcp"]) expect(await socketStatus(origin, path, { host }), `${host} ${path}`).toBe(403);
  }
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]) expect(await socketStatus(origin, "/health", { host })).toBe(200);
  for (const originHeader of [`http://localhost:${port}`, `http://[::1]:${port}`]) expect(await socketStatus(origin, "/health", { origin: originHeader })).toBe(200);
  for (const originHeader of ["null", `https://localhost:${port}`, `${origin}/`, `http://localhost:${Number(port) + 1}`]) expect(await socketStatus(origin, "/health", { origin: originHeader })).toBe(403);
  expect(await socketStatus(origin, "/health", { origin: "http://localhost:5173" })).toBe(development ? 200 : 403);
  expect(await socketStatus(origin, "/health", { origin: "http://[::1]:5173" })).toBe(403);
  const rejected = await fetch(`${origin}/api/projects`, { method: "POST", headers: { "content-type": "text/plain" }, body: "foreign write" });
  expect(rejected.status).toBe(415);
  const preflight = await fetch(`${origin}/api/projects`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:5173", "access-control-request-method": "POST" } });
  expect(preflight.status).toBe(development ? 204 : 403);
}

it("the actual development command selects API-only mode and Vite CORS", async () => {
  await withServerCommand("dev", async (origin, health) => {
    await inspectSocketBoundary(origin, true);
    expect(health.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect((await fetch(`${origin}/api/projects`, { signal: AbortSignal.timeout(1000) })).status).toBe(200);
    const appRoute = await fetch(`${origin}/story-maps`, { signal: AbortSignal.timeout(1000) });
    expect(appRoute.status).toBe(404);
    expect((await appRoute.json()).statusCode).toBe(404);
  });
}, 30_000);

it("the actual production command serves the default built app and assets", async () => {
  await withServerCommand("start", async (origin, health) => {
    await inspectSocketBoundary(origin, false);
    expect(health.headers.get("access-control-allow-origin")).toBeNull();
    const html = readFileSync(join(WEB_BUILD_DIRECTORY, "index.html"), "utf8");
    for (const path of ["/", "/story-maps/map-id"]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(1000) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toBe(html);
    }
    const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
    expect(resources.length).toBeGreaterThan(0);
    for (const path of resources) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(1000) });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync(join(WEB_BUILD_DIRECTORY, path)));
    }
  });
}, 30_000);

it.each([undefined, "false"])("direct remote binding refuses opt-in %s before creating a database", async (allowRemoteHost) => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-refused-bind-"));
  const databasePath = join(directory, "data", "storymapper.sqlite");
  const child = spawn("corepack", ["pnpm", "--filter", "@storymapper/server", "start"], {
    cwd: REPOSITORY_DIRECTORY, shell: process.platform === "win32", detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, HOST: "0.0.0.0", STORYMAPPER_ALLOW_REMOTE_HOST: allowRemoteHost, STORYMAPPER_DB_PATH: databasePath }
  });
  let diagnostic = "";
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { diagnostic += chunk; });
  try {
    await Promise.race([closed, setTimeout(10_000, undefined, { ref: false }).then(() => { throw new Error("Refused binding command did not exit"); })]);
    expect(child.exitCode).not.toBe(0);
    expect(diagnostic).toContain("STORYMAPPER_ALLOW_REMOTE_HOST=true");
    expect(existsSync(join(directory, "data"))).toBe(false);
  } finally {
    try { await stopServerCommand(child, closed); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
}, 30_000);

it("explicit direct remote binding warns and retains loopback-only HTTP admission", async () => {
  await withServerCommand("start", async (origin, _health, output) => {
    expect(output()).toContain("Remote binding enabled by STORYMAPPER_ALLOW_REMOTE_HOST=true");
    expect(await socketStatus(origin, "/health", { host: `0.0.0.0:${new URL(origin).port}` })).toBe(403);
    expect(await socketStatus(origin, "/health", { origin })).toBe(200);
  }, { HOST: "0.0.0.0", STORYMAPPER_ALLOW_REMOTE_HOST: "true", LOG_LEVEL: "warn" });
}, 30_000);
