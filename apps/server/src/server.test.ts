import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "@storymapper/server/server";
import { githubCredentialStatuses } from "@storymapper/server/services/credentials";

vi.mock("@storymapper/server/services/credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storymapper/server/services/credentials")>();
  return { ...actual, githubCredentialStatuses: vi.fn(actual.githubCredentialStatuses) };
});

const FIXTURE_RUNTIME = { host: "127.0.0.1", port: 4317, allowRemoteHost: false };
const WEB_BUILD_DIRECTORY = fileURLToPath(new URL("../../web/dist", import.meta.url));
let directory: string;
let webBuildDirectory: string;
let html: string;
let server: FastifyInstance | undefined;
function inject(input: string | InjectOptions) {
  const options = typeof input === "string" ? { url: input } : input;
  return server!.inject({ ...options, headers: { host: "localhost:4317", ...options.headers } });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "storymapper-server-"));
  webBuildDirectory = join(directory, "web");
  cpSync(WEB_BUILD_DIRECTORY, webBuildDirectory, { recursive: true });
  html = readFileSync(join(webBuildDirectory, "index.html"), "utf8");
  process.env.STORYMAPPER_DB_PATH = join(directory, "data", "storymapper.sqlite");
});

const originalDatabasePath = process.env.STORYMAPPER_DB_PATH;
afterEach(async () => {
  await server?.close();
  server = undefined;
  if (originalDatabasePath === undefined) delete process.env.STORYMAPPER_DB_PATH;
  else process.env.STORYMAPPER_DB_PATH = originalDatabasePath;
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});

describe("production web app", () => {
  it("serves the actual entry point and client routes with GET and HEAD", testServesTheActualEntryPointAndClientRoutesWithGETAnd);

  it("serves built script and stylesheet bytes and MIME types on this origin", testServesBuiltScriptAndStylesheetBytesAndMIMETypesOnThis);

  it("keeps API and health JSON and returns JSON 404 for unknown endpoints and files", testKeepsAPIAndHealthJSONAndReturnsJSON404ForUnknown);

  it("rejects malformed URLs without crashing subsequent requests", async () => {
    server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    for (const url of ["/foo%ZZ", "/foo%00.js"]) {
      for (const method of ["GET", "HEAD", "POST"] as const) {
        const response = await inject({ method, url });
        expect(response.statusCode).toBe(url.includes("%00") && method === "POST" ? 415 : 400);
        expect(response.headers["content-type"]).toContain("application/json");
        expect((await inject("/health")).statusCode).toBe(200);
      }
    }
  });

  it("refuses unverifiable overlong filesystem filenames with JSON 403 and stays healthy", async () => {
    server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    const response = await inject(`/${"x".repeat(300)}.js`);
    expect(response.statusCode).toBe(403);
    expect(response.json().statusCode).toBe(403);
    expect((await inject("/api/projects")).statusCode).toBe(200);
  });

  it("preserves static admission for noncanonical paths and filesystem case aliases", testPreservesStaticAdmissionForNoncanonicalPathsAndFilesystemCaseAliases);

  it("bounds files to the built directory and handles removed assets", testBoundsFilesToTheBuiltDirectoryAndHandlesRemovedAssets);

  it("fails with the build command before creating the database", async () => {
    rmSync(join(webBuildDirectory, "index.html"));
    await expect(buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME })).rejects.toThrow("corepack pnpm --filter @storymapper/web build");
    expect(existsSync(join(directory, "data"))).toBe(false);
  });

  it("never allows Vite cross-origin access in production", async () => {
    server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    for (const origin of ["http://127.0.0.1:5173", "http://localhost:5173"]) {
      const response = await inject({ url: "/health", headers: { origin } });
      expect(response.statusCode).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("installs the production root gate for HTML and built assets while draining existing work, then resumes normal serving", testInstallsTheProductionRootGateForHTMLAndBuiltAssetsWhile);
});

describe("development API", () => {
  it("starts without built assets and permits only the existing Vite origins", async () => {
    rmSync(webBuildDirectory, { recursive: true });
    server = await buildServer({ development: true, webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    for (const origin of ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5174"]) {
      const response = await inject({ url: "/health", headers: { origin } });
      expect(response.statusCode).toBe(origin.endsWith(":5173") ? 200 : 403);
      expect(response.headers["access-control-allow-origin"]).toBe(origin.endsWith(":5173") ? origin : undefined);
    }
    expect((await inject("/api/projects")).statusCode).toBe(200);
    const appRoute = await inject("/story-maps");
    expect(appRoute.statusCode).toBe(404);
    expect(appRoute.json().statusCode).toBe(404);
  });
});

it("carries the tab client id through the real server request pipeline into the committed activity row", async () => {
  server = await buildServer({ development: true, webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const abort = new AbortController();
  const stream = await fetch(`${base}/api/events`, { headers: { accept: "text/event-stream" }, signal: abort.signal });
  const reader = stream.body!.getReader();
  let buffer = "";
  const nextEvent = async () => {
    while (!buffer.includes("\n\n")) buffer += new TextDecoder().decode((await reader.read()).value);
    const boundary = buffer.indexOf("\n\n");
    const frame = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    return JSON.parse(frame.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
  };
  await nextEvent();
  const originClientId = "6bd3570e-00f2-4c92-93dd-f0c1e425ab89";
  const response = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json", "x-storymapper-client-id": originClientId }, body: JSON.stringify({ name: "Origin pipeline" }) });
  expect(response.status).toBe(201);
  await response.body?.cancel();
  expect(await nextEvent()).toMatchObject({ originClientId, actor: { originClientId } });
  abort.abort();
  await reader.cancel().catch((error: unknown) => { if (!(error instanceof Error) || error.name !== "AbortError") throw error; });
});

describe("real server security", () => {
  it("enforces complete loopback Host authorities on every HTTP surface before parsing", testEnforcesCompleteLoopbackHostAuthoritiesOnEveryHTTPSurfaceBeforeParsing);

  it("requires present Origins to exactly match served loopback origins", async () => {
    server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    const asset = [...html.matchAll(/src="([^"]+\.js)"/g)][0]![1]!;
    for (const origin of ["null", "", "https://localhost:4317", "http://localhost:4318", "http://localhost:4317/", "http://localhost:4317/path", "http://127.0.0.1:5173", "http://localhost:5173", "http://evil.example:4317"]) {
      for (const url of ["/api/projects", "/health", "/", asset, "/unknown", "/mcp", "/api/projects/import"]) {
        expect((await inject({ method: "POST", url, headers: { origin, "content-type": "application/json" }, payload: "not json" })).statusCode).toBe(403);
      }
    }
    for (const origin of ["http://127.0.0.1:4317", "http://localhost:4317", "http://[::1]:4317"]) {
      for (const url of ["/api/projects", "/health", "/", asset]) expect((await inject({ url, headers: { origin } })).statusCode).toBe(200);
    }
  });

  it("rejects foreign writes before parsing and preserves persisted projects", testRejectsForeignWritesBeforeParsingAndPreservesPersistedProjects);

  it("rejects non-JSON mutation media including bodyless DELETE without removing persisted data", testRejectsNonJSONMutationMediaIncludingBodylessDELETEWithoutRemovingPersisted);

  it("admits multipart archive validation while other uploads require JSON", testAdmitsMultipartArchiveValidationWhileOtherUploadsRequireJSON);

  it("starts and serves local app/API assets with every outbound network boundary forbidden", async () => {
    const forbidden = () => { throw new Error("Unexpected outbound network call"); };
    const calls = [
      vi.spyOn(http, "request").mockImplementation(forbidden), vi.spyOn(http, "get").mockImplementation(forbidden),
      vi.spyOn(https, "request").mockImplementation(forbidden), vi.spyOn(https, "get").mockImplementation(forbidden),
      vi.spyOn(net.Socket.prototype, "connect").mockImplementation(forbidden), vi.spyOn(tls, "connect").mockImplementation(forbidden),
      vi.spyOn(globalThis, "fetch").mockImplementation(forbidden)
    ];
    syncBuiltinESMExports();
    server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
    const projectId = (await inject("/api/projects")).json().projects[0].id as string;
    const settingsUrl = `/api/settings/safety?projectId=${projectId}`;
    for (const url of ["/health", "/api/projects", "/api/story-maps", settingsUrl, "/"]) {
      expect((await inject(url)).statusCode).toBe(200);
    }
    const settings = (await inject(settingsUrl)).json().settings;
    expect(settings.github).toBe(false);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
    for (const asset of assets) {
      expect(asset).toMatch(/^\/(?!\/)/);
      expect((await inject(asset)).statusCode).toBe(200);
    }
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
});

async function testServesTheActualEntryPointAndClientRoutesWithGETAnd() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  for (const url of ["/", "/story-maps", "/story-maps/map-id?view=board"]) {
    const response = await inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toBe(html);
    const head = await inject({ method: "HEAD", url });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-length"]).toBe(response.headers["content-length"]);
  }
}

async function testServesBuiltScriptAndStylesheetBytesAndMIMETypesOnThis() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
  expect(references.filter((path) => path.endsWith(".js")).length).toBeGreaterThan(0);
  expect(references.filter((path) => path.endsWith(".css")).length).toBeGreaterThan(0);
  for (const path of references) {
    expect(path).toMatch(/^\/(?!\/)/);
    const response = await inject({ method: "GET", url: path });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(readFileSync(join(webBuildDirectory, path)))).toBe(true);
    if (path.endsWith(".js")) expect(response.headers["content-type"]).toMatch(/javascript/);
    if (path.endsWith(".css")) expect(response.headers["content-type"]).toContain("text/css");
    const head = await inject({ method: "HEAD", url: path });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
  }
}

async function testKeepsAPIAndHealthJSONAndReturnsJSON404ForUnknown() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  for (const url of ["/api/projects", "/health"]) {
    const response = await inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toBeTypeOf("object");
  }
  for (const url of ["/api", "/api/unknown", "/api/unknown/file.js", "/health/unknown", "/assets/missing.js", "/assets/missing", "/missing.css"]) {
    const response = await inject({ method: "GET", url });
    expect(response.statusCode).toBe(404);
    expect(response.json().statusCode).toBe(404);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    const response = await inject({ method, url: "/unknown" });
    expect(response.statusCode).toBe(415);
    expect(response.json().message).toContain("application/json");
  }
}

async function testPreservesStaticAdmissionForNoncanonicalPathsAndFilesystemCaseAliases() {
  writeFileSync(join(webBuildDirectory, "CaseProbe.js"), "case-sensitive asset");
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const canonical = await inject("/CaseProbe.js");
  expect(canonical.statusCode).toBe(200);
  expect(canonical.body).toBe("case-sensitive asset");
  for (const url of ["/assets//missing.js", `/assets//${"x".repeat(300)}.js`]) {
    const response = await inject(url);
    expect(response.statusCode).toBe(403);
    expect(response.json().statusCode).toBe(403);
  }
  const caseAlias = await inject("/caseprobe.js");
  expect(caseAlias.statusCode).toBe(existsSync(join(webBuildDirectory, "caseprobe.js")) ? 403 : 404);
  expect((await inject("/health")).statusCode).toBe(200);
}

async function testBoundsFilesToTheBuiltDirectoryAndHandlesRemovedAssets() {
  const outside = join(directory, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "outside build");
  symlinkSync(outside, join(webBuildDirectory, "outside"), "junction");
  writeFileSync(join(webBuildDirectory, ".private"), "hidden");
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  for (const url of ["/outside/secret.txt", "/../outside/secret.txt", "/%2e%2e/outside/secret.txt", "/.private"]) {
    expect((await inject(url)).statusCode).toBe(404);
  }
  const resource = [...html.matchAll(/src="([^"]+\.js)"/g)][0]![1]!;
  rmSync(join(webBuildDirectory, resource));
  const missing = await inject(resource);
  expect(missing.statusCode).toBe(404);
  expect(missing.json().statusCode).toBe(404);
  expect((await inject("/health")).statusCode).toBe(200);
}

async function testInstallsTheProductionRootGateForHTMLAndBuiltAssetsWhile() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const projectId = (await inject("/api/projects")).json().projects[0].id as string;
  const point = (await inject({ method: "POST", url: `/api/human/projects/${projectId}/restore-points`, payload: { class: "manual" } })).json().restorePoint;
  let started!: () => void;
  let release!: (value: Awaited<ReturnType<typeof githubCredentialStatuses>>) => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const deferred = new Promise<Awaited<ReturnType<typeof githubCredentialStatuses>>>((resolve) => { release = resolve; });
  vi.mocked(githubCredentialStatuses).mockImplementationOnce(() => { started(); return deferred; });
  const inFlight = inject("/api/credentials/status").then((response) => response);
  await entered;
  const restoring = inject({ method: "POST", url: `/api/human/projects/${projectId}/restore`, payload: { fileName: point.fileName, confirm: true } }).then((response) => response);
  await vi.waitFor(async () => { expect((await inject("/health")).statusCode).toBe(503); });
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
  for (const url of ["/", "/story-maps", ...assets]) {
    const response = await inject(url);
    expect(response.statusCode).toBe(503);
    expect(response.json().message).toContain("restore is in progress");
  }
  release([]);
  expect((await inFlight).statusCode).toBe(200);
  expect((await restoring).statusCode).toBe(200);
  for (const url of ["/", "/story-maps", ...assets]) expect((await inject(url)).statusCode).toBe(200);
}

async function testEnforcesCompleteLoopbackHostAuthoritiesOnEveryHTTPSurfaceBeforeParsing() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const asset = [...html.matchAll(/src="([^"]+\.js)"/g)][0]![1]!;
  const paths = ["/api/projects", "/health", "/", asset, "/unknown", "/mcp", "/api/projects/import"];
  const invalidHosts = ["localhost", "localhost:04317", "localhost:0004317", "localhost:4318", "evil.example:4317", "localhost:4317junk", "localhost:4317.foo", "localhost:+4317", "localhost:-4317", "localhost:4317:80", "::1:4317", "[::1]:4317junk", "[::1]:+4317", "[::1]4317", "[::1:4317", "[localhost]:4317", "127.0.0.1:4317/path"];
  for (const host of invalidHosts) {
    for (const url of paths) {
      const response = await inject({ method: "POST", url, headers: { host, "content-type": "application/json" }, payload: "not json" });
      expect(response.statusCode, `${host} ${url}`).toBe(403);
    }
  }
  for (const host of ["127.0.0.1:4317", "localhost:4317", "LOCALHOST:4317", "[::1]:4317"]) {
    for (const url of ["/api/projects", "/health", "/", asset]) expect((await inject({ url, headers: { host } })).statusCode).toBe(200);
    expect((await inject({ url: "/api/unknown", headers: { host } })).statusCode).toBe(404);
  }
}

async function testRejectsForeignWritesBeforeParsingAndPreservesPersistedProjects() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const before = (await inject("/api/projects")).json();
  const asset = [...html.matchAll(/src="([^"]+\.js)"/g)][0]![1]!;
  for (const headers of [{ host: "evil.example:4317" }, { origin: "https://evil.example" }]) {
    for (const method of ["GET", "HEAD"] as const) {
      for (const url of [asset, "/story-maps/map-id?view=board"]) expect((await inject({ method, url, headers })).statusCode).toBe(403);
    }
    for (const url of ["/api/projects", "/health", "/", "/assets/missing.js", "/missing", "/mcp", "/api/mcp/call", "/api/projects/import"]) {
      expect((await inject({ method: "POST", url, headers: { ...headers, "content-type": "application/json" }, payload: "not json" })).statusCode).toBe(403);
    }
    expect((await inject({ method: "OPTIONS", url: "/health", headers: { ...headers, "access-control-request-method": "POST" } })).statusCode).toBe(403);
  }
  for (const contentType of ["application/x-www-form-urlencoded", "text/plain"]) {
    expect((await inject({ method: "POST", url: "/api/projects", headers: { "content-type": contentType }, payload: "name=blocked" })).statusCode).toBe(415);
  }
  expect((await inject("/api/projects")).json()).toEqual(before);
  const created = await inject({ method: "POST", url: "/api/projects", headers: { "content-type": "Application/JSON; Charset=UTF-8" }, payload: JSON.stringify({ name: "Security acceptance" }) });
  expect(created.statusCode).toBe(201);
  expect((await inject("/api/projects")).json().projects).toHaveLength(before.projects.length + 1);
}

async function testRejectsNonJSONMutationMediaIncludingBodylessDELETEWithoutRemovingPersisted() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const project = (await inject({ method: "POST", url: "/api/projects", payload: { name: "Deletion security" } })).json();
  const storyMap = (await inject({ method: "POST", url: "/api/story-maps", payload: { projectId: project.id, name: "Deletion security map" } })).json();
  const before = (await inject("/api/projects")).json();
  const mapsUrl = `/api/story-maps?projectId=${project.id}`;
  const mapsBefore = (await inject(mapsUrl)).json();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    for (const contentType of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=blocked", "application/json-other", "application/json.foo", "application/json+suffix", "application/json other"]) {
      const headers = contentType ? { "content-type": contentType } : {};
      for (const url of ["/api/projects", `/api/story-maps/${storyMap.id}`, "/health", "/", "/unknown"]) {
        expect((await inject({ method, url, headers })).statusCode, `${method} ${contentType} ${url}`).toBe(415);
      }
    }
  }
  expect((await inject("/api/projects")).json()).toEqual(before);
  expect((await inject(mapsUrl)).json()).toEqual(mapsBefore);
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    for (const contentType of ["application/json", "Application/JSON; Charset=UTF-8"]) {
      expect((await inject({ method, url: "/api/unknown", headers: { "content-type": contentType }, payload: "{}" })).statusCode).toBe(404);
    }
  }
  const patched = await inject({ method: "PATCH", url: `/api/story-maps/${storyMap.id}`, headers: { "content-type": "Application/JSON; Charset=UTF-8" }, payload: JSON.stringify({ name: "Patched security map", baseVersion: storyMap.version }) });
  expect(patched.statusCode).toBe(200);
  expect((await inject(mapsUrl)).json().storyMaps).toContainEqual(expect.objectContaining({ id: storyMap.id, name: "Patched security map" }));
  const current = (await inject(`/api/story-maps/${storyMap.id}`)).json().storyMap.version;
  expect((await inject({ method: "DELETE", url: `/api/story-maps/${storyMap.id}?baseVersion=${current}`, payload: {} })).statusCode).toBe(200);
  expect((await inject(mapsUrl)).json().storyMaps.map((map: { id: string }) => map.id)).not.toContain(storyMap.id);
  expect((await inject("/api/projects")).json()).toEqual(before);
}

async function testAdmitsMultipartArchiveValidationWhileOtherUploadsRequireJSON() {
  server = await buildServer({ webBuildDirectory, runtimeConfig: FIXTURE_RUNTIME });
  const payload = Buffer.from('--acceptance\r\nContent-Disposition: form-data; name="file"; filename="invalid.zip"\r\nContent-Type: application/zip\r\n\r\ninvalid archive\r\n--acceptance--\r\n');
  const headers = { "content-type": "multipart/form-data; boundary=acceptance" };
  for (const url of ["/api/projects/import", "/api/projects/import?source=archive"]) {
    const response = await inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Archive could not be read");
    const nonMultipart = await inject({ method: "POST", url, payload: {} });
    expect(nonMultipart.statusCode).toBe(400);
    expect(nonMultipart.json()).toEqual({ code: "validation", message: "Archive upload must use multipart/form-data." });
    for (const forbiddenHeaders of [{ host: "evil.example:4317" }, { origin: "null" }]) {
      expect((await inject({ method: "POST", url, headers: { ...headers, ...forbiddenHeaders }, payload })).statusCode).toBe(403);
    }
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      expect((await inject({ method, url, headers, payload })).statusCode).toBe(415);
    }
  }
  for (const url of ["/api/source-documents/import", "/api/cards/card-id/attachments", "/api/mcp/call"]) {
    expect((await inject({ method: "POST", url, headers, payload })).statusCode).toBe(415);
  }
  for (const url of ["/mcp", "/mcp?session=local"]) {
    expect((await inject({ method: "DELETE", url })).statusCode).toBe(400);
    for (const headers of [{ host: "evil.example:4317" }, { origin: "null" }]) expect((await inject({ method: "DELETE", url, headers })).statusCode).toBe(403);
    for (const method of ["POST", "PUT", "PATCH"] as const) expect((await inject({ method, url })).statusCode).toBe(415);
  }
  for (const url of ["/mcp/", "/mcp-other", "/api/projects/import/", "/api/projects/import-other"]) {
    expect((await inject({ method: "DELETE", url })).statusCode).toBe(415);
    expect((await inject({ method: "POST", url })).statusCode).toBe(415);
  }
}
