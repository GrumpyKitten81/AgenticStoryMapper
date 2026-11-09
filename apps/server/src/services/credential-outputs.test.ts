import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import type { LightMyRequestResponse } from "fastify";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import JSZip from "jszip";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { credentialStatusesResponseSchema } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { storeGitHubCredential } from "@storymapper/server/application/connector/credential.use-cases";
import { createRuntimeLog } from "@storymapper/server/config/runtime-log";
import { createRoutes } from "@storymapper/server/http/routes";
import { credentialFilePath } from "@storymapper/server/services/credential-file";
import * as credentials from "@storymapper/server/services/credentials";
import { exportProjectArchive } from "@storymapper/server/services/project-archive";

const fixture = vi.hoisted(() => ({ home: "", exec: vi.fn(), fetch: vi.fn() }));
vi.mock("node:os", async (original) => ({ ...await original<typeof import("node:os")>(), homedir: () => fixture.home }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: fixture.exec }) };
});

const human = { actorType: "human", actorId: "credential-output-test" } as const;
let root: string;
let server: FastifyInstance | undefined;
let handle: DatabaseHandle | undefined;

beforeEach(async () => {
  vi.stubGlobal("fetch", fixture.fetch);
  fixture.fetch.mockRejectedValue(new Error("Unexpected network request blocked by the credential fixture"));
  root = await fs.mkdtemp(join(realpathSync(tmpdir()), "storymapper-credential-outputs-"));
  fixture.home = join(root, "home");
  for (const directory of [fixture.home, join(root, "app-data"), join(root, "gh")]) await fs.mkdir(directory, { mode: 0o700 });
  for (const [key, value] of Object.entries({ HOME: fixture.home, USERPROFILE: fixture.home, APPDATA: join(root, "app-data"), GH_CONFIG_DIR: join(root, "gh"), GITHUB_TOKEN: "", GH_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" })) vi.stubEnv(key, value);
  fixture.exec.mockRejectedValue(Object.assign(new Error("CLI is not installed in the fixture"), { code: "ENOENT" }));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (handle?.current.$client.open) handle.current.$client.close();
  handle = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fixture.exec.mockReset();
  fixture.fetch.mockReset();
  await fs.rm(root, { recursive: true, force: true });
});

async function application() {
  const directory = join(root, "project.lsm");
  const databasePath = join(directory, "storymapper.sqlite");
  handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  server = Fastify({ logger: { level: "info", stream: createRuntimeLog(join(directory, "logs")) } });
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  const created = await server.inject({ method: "POST", url: "/api/projects", payload: { name: "Credential isolation" } });
  expect(created.statusCode).toBe(201);
  const projectId = created.json<{ id: string }>().id;
  const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, projectId)).sampleStoryMapId!;
  const body = { projectId, provider: "github", name: "GitHub", authMode: "github-cli", owner: "owner", repository: "repo", readOnly: true };
  const connection = await server.inject({ method: "POST", url: "/api/connectors/connections", payload: body });
  expect(connection.statusCode).toBe(201);
  return { server, directory, databasePath, repository, unitOfWork, projectId, storyMapId, body, connectionId: connection.json().connection.id as string };
}

function expectPrivate(output: string | Buffer, forbidden: string[]): void {
  const bytes = typeof output === "string" ? Buffer.from(output) : output;
  for (const value of forbidden) expect(bytes.includes(Buffer.from(value)), "credential-bearing output must remain private").toBe(false);
}

it("keeps actual file-token and CLI HTTP validation outputs, logs, Activity, restore points and portable archives credential-free", async () => {
  const app = await application();
  const fileToken = randomUUID().replaceAll("-", "");
  const environmentToken = randomUUID().replaceAll("-", "");
  const cliToken = randomUUID().replaceAll("-", "");
  const privateBody = JSON.stringify({ token: fileToken, privateBody: randomUUID() });
  const authorization = `Bearer ${fileToken}`;
  const forbidden = [fileToken, environmentToken, cliToken, privateBody, authorization];
  vi.stubEnv("GITHUB_TOKEN", environmentToken);
  const beforeStorage = app.repository.listActivity(app.projectId);
  const stored = await storeGitHubCredential(human, { token: fileToken });
  expectPrivate(JSON.stringify(stored), forbidden);
  expect(app.repository.listActivity(app.projectId)).toEqual(beforeStorage);
  expect(JSON.parse(await fs.readFile(credentialFilePath(), "utf8"))).toEqual({ github: { token: fileToken } });
  expect(credentialFilePath()).toBe(process.platform === "win32" ? join(root, "app-data", "StoryMapper", "credentials.json") : join(fixture.home, ".config", "storymapper", "credentials.json"));

  const responses: string[] = [];
  const status = await app.server.inject("/api/credentials/status");
  await exerciseKeepsActualFileTokenAndCLIHTTPValidationOutputs2(responses, status, app, fileToken, authorization, privateBody);
  const rejected = await app.server.inject({ method: "POST", url: "/api/connectors/connections/validate", payload: app.body });
  await exerciseKeepsActualFileTokenAndCLIHTTPValidationOutputs(responses, rejected, fileToken, cliToken, privateBody, authorization, app);
  const cliRejected = await app.server.inject({ method: "POST", url: "/api/connectors/connections/validate", payload: app.body });
  responses.push(cliRejected.body);
  expect(cliRejected.statusCode).toBe(400);
  expect(fixture.fetch).toHaveBeenCalledTimes(2);

  const point = await app.server.inject({ method: "POST", url: `/api/human/projects/${app.projectId}/restore-points`, payload: { class: "manual" } });
  expect(point.statusCode).toBe(201);
  const operationalSnapshot = readFileSync(join(app.directory, "snapshots", point.json().restorePoint.fileName));
  const archive = await exportProjectArchive(handle!, app.projectId);
  const zip = await JSZip.loadAsync(archive.content);
  expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["storymapper.sqlite", "manifest.json"]));
  expect(Object.keys(zip.files).some((name) => /credentials|logs|snapshots/.test(name))).toBe(false);
  for (const entry of Object.values(zip.files).filter((entry) => !entry.dir)) expectPrivate(await entry.async("nodebuffer"), forbidden);
  const logs = await fs.readFile(join(app.directory, "logs", "storymapper.log"), "utf8");
  expect(logs).toContain('"msg":"request completed"');
  const activity = app.repository.listActivity(app.projectId);
  expect(activity.length).toBeGreaterThan(0);
  for (const output of [...responses, logs, JSON.stringify(activity), operationalSnapshot, readFileSync(app.databasePath)]) expectPrivate(output, forbidden);
  expect(JSON.parse(await fs.readFile(credentialFilePath(), "utf8"))).toEqual({ github: { token: fileToken } });
});

it("refuses disabled actual HTTP and MCP GitHub actions before credential or provider calls", async () => {
  const app = await application();
  const token = randomUUID().replaceAll("-", "");
  await storeGitHubCredential(human, { token });
  app.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(app.projectId, { agentMode: "apply", github: false }));
  const statusProbe = vi.spyOn(credentials, "githubCredentialStatuses");
  const providerAuth = vi.spyOn(credentials, "resolveProviderAuth");
  const githubAuth = vi.spyOn(credentials, "resolveGitHubAuth");
  fixture.exec.mockClear();
  const input = { storyMapId: app.storyMapId, connectionId: app.connectionId };
  const requests = [
    { url: "/api/connectors/connections/validate", payload: app.body },
    { url: "/api/sync/work-items/plan", payload: { ...input, mode: "import" } },
    { url: "/api/sync/work-items/import", payload: input },
    { url: "/api/mcp/call", payload: { name: "ImportGitHubIssues", input } },
    { url: "/api/mcp/call", payload: { name: "PlanWorkItems", input: { ...input, mode: "import" } } }
  ];
  for (const request of requests) {
    const response = await app.server.inject({ method: "POST", ...request });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "disabled" });
    expectPrivate(response.body, [token]);
  }
  expect(statusProbe).not.toHaveBeenCalled();
  expect(providerAuth).not.toHaveBeenCalled();
  expect(githubAuth).not.toHaveBeenCalled();
  expect(fixture.exec).not.toHaveBeenCalled();
  expect(fixture.fetch).not.toHaveBeenCalled();
  expect(JSON.parse(await fs.readFile(credentialFilePath(), "utf8"))).toEqual({ github: { token } });
});

async function exerciseKeepsActualFileTokenAndCLIHTTPValidationOutputs2(responses: string[], status: LightMyRequestResponse, app: Awaited<ReturnType<typeof application>>, fileToken: string, authorization: string, privateBody: string) {
  responses.push(status.body);
  expect(status.statusCode).toBe(200);
  expect(credentialStatusesResponseSchema.parse(status.json()).credentials).toEqual(expect.arrayContaining([expect.objectContaining({ source: "user-file", configured: true, selected: true })]));
  expect(fixture.fetch).not.toHaveBeenCalled();
  expect(fixture.exec.mock.calls.every((call) => JSON.stringify(call[1]) === JSON.stringify(["auth", "token", "--hostname", "github.com"]))).toBe(true);

  app.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(app.projectId, { github: true }));
  fixture.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "owner/repo", html_url: "https://github.com/owner/repo" }), { status: 200, headers: { "content-type": "application/json" } }));
  const verified = await app.server.inject({ method: "POST", url: "/api/connectors/connections/validate", payload: app.body });
  responses.push(verified.body);
  expect(verified.statusCode).toBe(200);
  expect(verified.json()).toMatchObject({ ok: true, message: "GitHub token connection validated." });
  expect(fixture.fetch).toHaveBeenLastCalledWith("https://api.github.com/repos/owner/repo", expect.objectContaining({ headers: expect.objectContaining({ authorization: `token ${fileToken}` }) }));
  fixture.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: `${authorization}\n${privateBody}` }), { status: 401, headers: { "content-type": "application/json" } }));
}

async function exerciseKeepsActualFileTokenAndCLIHTTPValidationOutputs(responses: string[], rejected: LightMyRequestResponse, fileToken: string, cliToken: string, privateBody: string, authorization: string, app: Awaited<ReturnType<typeof application>>) {
  responses.push(rejected.body);
  expect(rejected.statusCode).toBe(400);
  expect(rejected.json()).toMatchObject({ code: "validation", message: expect.stringMatching(/authentication|credential/i) });
  expect(fixture.fetch.mock.calls.map(([, options]) => options.headers.authorization)).toEqual([`token ${fileToken}`, `token ${fileToken}`]);

  fixture.exec.mockImplementation(async (_command, args: string[]) => args[0] === "auth" ? { stdout: cliToken, stderr: "" } : { stdout: privateBody, stderr: authorization });
  const cliVerified = await app.server.inject({ method: "POST", url: "/api/connectors/connections/validate", payload: app.body });
  responses.push(cliVerified.body);
  expect(cliVerified.statusCode).toBe(200);
  expect(cliVerified.json()).toMatchObject({ ok: true, credentials: expect.arrayContaining([expect.objectContaining({ source: "github-cli", selected: true })]) });
  fixture.exec.mockImplementation(async (_command, args: string[]) => {
    if (args[0] === "auth") return { stdout: cliToken, stderr: "" };
    throw Object.assign(new Error(privateBody), { code: 1, stdout: privateBody, stderr: authorization });
  });
}
