import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import JSZip from "jszip";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectGitHubConnectionRequestSchema, connectGitHubConnectionResponseSchema, verifyGitHubConnectionRequestSchema, verifyGitHubConnectionResponseSchema, type GitHubConnectionCandidate } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { connectGitHubConnection, verifyGitHubConnection } from "@storymapper/server/application/connector/github-connect.use-cases";
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
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const human = { actorType: "human", actorId: "local-user" } as const;
let root: string;
let server: FastifyInstance;
let handle: DatabaseHandle;
let repository: StoryMapperRepository;
let unitOfWork: UnitOfWork;
let candidate: GitHubConnectionCandidate;
const reply = (status = 200, data: unknown = { full_name: "owner/repo", html_url: "https://github.com/owner/repo", permissions: { pull: true, push: false } }) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const canary = () => randomUUID().replaceAll("-", "");
const post = async (url: string, payload: object) => server.inject({ method: "POST", url, payload });
const verify = () => post("/api/connectors/github/verify", { candidate, consent: true });
const connect = (verificationId: string) => post("/api/connectors/github/connect", { candidate, verificationId, confirm: true });

beforeEach(async () => {
  root = await fs.mkdtemp(join(realpathSync(tmpdir()), "storymapper-connect-"));
  fixture.home = join(root, "home");
  await fs.mkdir(fixture.home, { mode: 0o700 });
  for (const [key, value] of Object.entries({ HOME: fixture.home, USERPROFILE: fixture.home, APPDATA: join(root, "appdata"), GH_CONFIG_DIR: join(root, "gh"), GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", fixture.fetch);
  fixture.fetch.mockRejectedValue(new Error("Unexpected fixture transport"));
  fixture.exec.mockRejectedValue(Object.assign(new Error("Fixture CLI absent"), { code: "ENOENT" }));
  handle = new DatabaseHandle(openStoryMapperDb(join(root, "project.lsm", "storymapper.sqlite")));
  repository = new StoryMapperRepository(handle);
  unitOfWork = new UnitOfWork(handle);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  server = Fastify({ logger: { stream: createRuntimeLog(join(root, "logs")) } });
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: handle.current.$client.name });
  const project = await post("/api/projects", { name: "Connection fixture" });
  candidate = { configuration: { projectId: project.json().id, provider: "github", name: "Connection", authMode: "token", owner: "owner", repository: "repo" }, credential: { method: "token", token: canary() } };
});

afterEach(async () => {
  await server.close();
  if (handle.current.$client.open) handle.current.$client.close();
  vi.restoreAllMocks();
  vi.mocked(fs.rename).mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fixture.exec.mockReset();
  fixture.fetch.mockReset();
  await fs.rm(root, { recursive: true, force: true });
});

async function verifiedId(): Promise<string> {
  fixture.fetch.mockResolvedValueOnce(reply());
  const response = await verify();
  expect(response.statusCode).toBe(200);
  const result = verifyGitHubConnectionResponseSchema.parse(response.json());
  if (!result.ok) throw new Error("Fixture verification failed");
  return result.verificationId;
}

it("verifies the candidate while off without mutations, then atomically saves and enables exactly once", async () => {
  const before = repository.listActivity(candidate.configuration.projectId);
  const cliToken = canary();
  fixture.exec.mockResolvedValue({ stdout: cliToken, stderr: "" });
  fixture.fetch.mockResolvedValueOnce(reply());
  const verification = await verify();
  const result = verifyGitHubConnectionResponseSchema.parse(verification.json());
  expect(result).toMatchObject({ ok: true, verifiedSource: "candidate-token", operationalSource: "github-cli", githubEnabled: false, capabilities: { read: true, write: "unavailable" }, message: "Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub." });
  expect(repository.listActivity(candidate.configuration.projectId)).toEqual(before);
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
  expect(await fs.stat(credentialFilePath()).then(() => true, () => false)).toBe(false);
  expect(fixture.fetch.mock.calls[0]?.[1]?.headers.authorization === `token ${candidate.credential.method === "token" ? candidate.credential.token : ""}`).toBe(true);
  if (!result.ok) throw new Error("Fixture verification failed");
  const responses = await Promise.all([connect(result.verificationId), connect(result.verificationId)]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  const connected = connectGitHubConnectionResponseSchema.parse(responses.find((response) => response.statusCode === 200)!.json());
  expect(connected).toMatchObject({ ok: true, credentialStored: true, connection: { readOnly: true, defaultLabel: "local-story-map", releaseSource: "milestone", iterationFieldName: "Iteration", labelsAsAnnotations: false }, settings: { github: true }, credentials: expect.arrayContaining([expect.objectContaining({ source: "github-cli", selected: true })]) });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toHaveLength(1);
  const safety = repository.listActivity(candidate.configuration.projectId).filter((event) => event.action === "settings.safetyUpdated");
  expect(safety).toHaveLength(1);
  expect(safety[0]).toMatchObject({ actorType: "human", actor: "local-user" });
  expect((await connect(result.verificationId)).statusCode).toBe(409);
});

it.each([[401, "credentials"], [403, "repository"], [404, "repository"], [429, "rate-limit"]])("sanitizes HTTP %s without local changes", async (status, kind) => {
  const secret = candidate.credential.method === "token" ? candidate.credential.token : "";
  fixture.fetch.mockResolvedValueOnce(reply(status as number, { message: secret }));
  const response = await verify();
  expect(verifyGitHubConnectionResponseSchema.parse(response.json())).toMatchObject({ ok: false, failure: { kind, nextAction: expect.any(String) } });
  expect(response.body.includes(secret)).toBe(false);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
});

it("reports network failure and requires explicit consent before any credential or provider access", async () => {
  const invalid = await post("/api/connectors/github/verify", { candidate, consent: false });
  expect(invalid.statusCode).toBe(400);
  expect(fixture.exec).not.toHaveBeenCalled();
  expect(fixture.fetch).not.toHaveBeenCalled();
  fixture.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
  expect((await verify()).json()).toMatchObject({ ok: false, failure: { kind: "network" } });
});

it("refuses agents and missing MCP tools before credential/provider access", async () => {
  const actor = { actorType: "agent", actorId: "fixture" } as const;
  const deps = { repository, unitOfWork };
  await expect(verifyGitHubConnection(deps, actor, { candidate, consent: true })).rejects.toThrow("human-only");
  await expect(connectGitHubConnection(deps, actor, { candidate, verificationId: randomUUID(), confirm: true })).rejects.toThrow("human-only");
  const tools = (await server.inject({ method: "GET", url: "/api/mcp/tools" })).json().tools as Array<{ name: string }>;
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.filter(({ name }) => /github/i.test(name) && /verif|connect/i.test(name))).toEqual([]);
  expect(fixture.exec).not.toHaveBeenCalled();
  expect(fixture.fetch).not.toHaveBeenCalled();
});

it("requires actual CLI credentials and rejects a changed CLI identity before Connect", async () => {
  candidate = { ...candidate, configuration: { ...candidate.configuration, authMode: "github-cli" }, credential: { method: "github-cli" } };
  expect((await verify()).json()).toMatchObject({ ok: false, failure: { kind: "credentials", nextAction: expect.stringContaining("gh auth login") } });
  expect(fixture.fetch).not.toHaveBeenCalled();
  const first = canary();
  fixture.exec.mockImplementation(async (_command, args: string[]) => args[0] === "auth" ? { stdout: first, stderr: "" } : { stdout: JSON.stringify({ permissions: { pull: true, push: true } }), stderr: "" });
  const result = (await verify()).json();
  expect(result).toMatchObject({ ok: true, verifiedSource: "github-cli", capabilities: { write: "available" } });
  fixture.exec.mockResolvedValue({ stdout: canary(), stderr: "" });
  expect((await connect(result.verificationId)).json()).toMatchObject({ ok: false, failure: { kind: "stale" }, credentialStored: false });
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
});

it("completes actual HTTP CLI Verify and Connect without writing a credential file", async () => {
  candidate = { ...candidate, configuration: { ...candidate.configuration, authMode: "github-cli" }, credential: { method: "github-cli" } };
  const cliToken = canary();
  fixture.exec.mockImplementation(async (_command, args: string[]) => args[0] === "auth" ? { stdout: cliToken, stderr: "" } : { stdout: JSON.stringify({ permissions: { pull: true, push: false } }), stderr: "" });
  const verification = await verify();
  expect(verification.statusCode).toBe(200);
  const proof = verifyGitHubConnectionResponseSchema.parse(verification.json());
  expect(proof).toMatchObject({ ok: true, verifiedSource: "github-cli", operationalSource: "github-cli", githubEnabled: false, capabilities: { read: true, write: "unavailable" } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
  if (!proof.ok) throw new Error("Fixture CLI verification failed");
  const response = await connect(proof.verificationId);
  expect(response.statusCode).toBe(200);
  const connected = connectGitHubConnectionResponseSchema.parse(response.json());
  expect(connected).toMatchObject({ ok: true, credentialStored: false, publicationWarning: false, connection: { authMode: "github-cli", readOnly: true }, settings: { github: true }, credentials: expect.arrayContaining([expect.objectContaining({ source: "github-cli", configured: true, selected: true })]) });
  if (!connected.ok) throw new Error("Fixture CLI connection failed");
  expect(connected.connections).toEqual([connected.connection]);
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual(connected.connections);
  const safety = repository.listActivity(candidate.configuration.projectId).filter((event) => event.action === "settings.safetyUpdated");
  expect(safety).toHaveLength(1);
  expect(safety[0]).toMatchObject({ actorType: "human", actor: "local-user" });
  expect(vi.mocked(fs.rename)).not.toHaveBeenCalled();
  expect(await fs.stat(credentialFilePath()).then(() => true, () => false)).toBe(false);
  expect(fixture.fetch).not.toHaveBeenCalled();
  const onlyLocalAuthAndRepositoryRead = fixture.exec.mock.calls.every((call) => call[1]?.[0] === "auth" || JSON.stringify(call[1]) === JSON.stringify(["api", "repos/owner/repo"]));
  expect(onlyLocalAuthAndRepositoryRead).toBe(true);
  expect(JSON.stringify([proof, connected]).includes(cliToken)).toBe(false);
});

it("updates an existing connection through HTTP Verify and Connect without changing its identity or count", async () => {
  const existing = unitOfWork.run(human, ({ repository: tx }) => tx.createConnectorConnection(candidate.configuration));
  candidate = { ...candidate, connectionId: existing.id, configuration: { ...candidate.configuration, name: "Reviewed replacement", owner: "new-owner", repository: "new-repo", readOnly: false } };
  const id = await verifiedId();
  const response = await connect(id);
  expect(response.statusCode).toBe(200);
  const result = connectGitHubConnectionResponseSchema.parse(response.json());
  expect(result).toMatchObject({ ok: true, connection: { id: existing.id, name: "Reviewed replacement", owner: "new-owner", repository: "new-repo", readOnly: false }, settings: { github: true } });
  if (!result.ok) throw new Error("Fixture update failed");
  expect(result.connections).toEqual([result.connection]);
  expect(repository.getConnectorConnection(existing.id)).toEqual(result.connection);
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toHaveLength(1);
});

it("reconnects with GitHub already on without a second safety event and with the saved-connection notice", async () => {
  unitOfWork.run(human, ({ repository: tx }) => tx.updateSafetySettings(candidate.configuration.projectId, { github: true }));
  const before = repository.listActivity(candidate.configuration.projectId).filter((event) => event.action === "settings.safetyUpdated").length;
  fixture.fetch.mockResolvedValueOnce(reply());
  const proof = verifyGitHubConnectionResponseSchema.parse((await verify()).json());
  expect(proof).toMatchObject({ ok: true, githubEnabled: true, message: "Connection verified. Confirm Connect to save this connection." });
  if (!proof.ok) throw new Error("Fixture verification failed");
  expect(connectGitHubConnectionResponseSchema.parse((await connect(proof.verificationId)).json())).toMatchObject({ ok: true, settings: { github: true } });
  expect(repository.listActivity(candidate.configuration.projectId).filter((event) => event.action === "settings.safetyUpdated")).toHaveLength(before);
});

it("refuses cross-Project token finalization while the shared credential file write is pending", async () => {
  const first = candidate;
  const firstId = await verifiedId();
  const otherProject = (await post("/api/projects", { name: "Second connection fixture" })).json();
  const second: GitHubConnectionCandidate = { ...first, configuration: { ...first.configuration, projectId: otherProject.id }, credential: { method: "token", token: canary() } };
  candidate = second;
  const secondId = await verifiedId();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  let release!: () => void;
  vi.mocked(fs.rename).mockImplementationOnce(async (...args) => {
    await actual.rename(...args);
    await new Promise<void>((resolve) => { release = resolve; });
  });
  candidate = first;
  const pending = connect(firstId);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  candidate = second;
  expect((await connect(secondId)).json()).toMatchObject({ ok: false, credentialStored: false, databaseCommitted: false, failure: { kind: "stale" } });
  expect(repository.listConnectorConnections(otherProject.id)).toEqual([]);
  expect((await fs.readFile(credentialFilePath(), "utf8")).includes(first.credential.method === "token" ? first.credential.token : "missing")).toBe(true);
  release();
  expect((await pending).json()).toMatchObject({ ok: true, settings: { projectId: first.configuration.projectId, github: true } });
  expect((await connect(await verifiedId())).json()).toMatchObject({ ok: true, settings: { projectId: otherProject.id, github: true } });
});

it.each([
  ["github-cli", "account"], ["github-cli", "removal"], ["token", "account"], ["token", "removal"], ["token", "installation"]
] as const)("rejects %s operational CLI %s during the final local status await", async (method, drift) => {
  candidate = { ...candidate, configuration: { ...candidate.configuration, authMode: method }, credential: method === "token" ? candidate.credential : { method: "github-cli" } };
  const original = canary();
  fixture.exec.mockImplementation(async (_command, args: string[]) => {
    if (args[0] !== "auth") return { stdout: JSON.stringify({ permissions: { push: true } }), stderr: "" };
    if (drift === "installation") throw Object.assign(new Error("Fixture CLI absent"), { code: "ENOENT" });
    return { stdout: original, stderr: "" };
  });
  fixture.fetch.mockResolvedValueOnce(reply());
  const id = (await verify()).json().verificationId as string;
  expect(id).toBeTypeOf("string");
  let release!: () => void;
  vi.spyOn(credentials, "githubCredentialStatuses").mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { release = resolve; });
    return [{ provider: "github", source: "github-cli", configured: drift !== "installation", selected: drift !== "installation", message: "Captured earlier local status." }];
  });
  const pending = connect(id);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  if (drift === "removal") fixture.exec.mockRejectedValue(Object.assign(new Error("Fixture CLI absent"), { code: "ENOENT" }));
  else fixture.exec.mockResolvedValue({ stdout: canary(), stderr: "" });
  release();
  expect((await pending).json()).toMatchObject({ ok: false, credentialStored: method === "token", databaseCommitted: false, failure: { kind: "stale" } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
});

it.each(["candidate", "actor", "settings", "connection", "database"])("rejects a verified proof after %s changes", async (change) => {
  if (change === "connection") candidate.connectionId = unitOfWork.run(human, ({ repository: tx }) => tx.createConnectorConnection(candidate.configuration)).id;
  const id = await verifiedId();
  if (change === "candidate") candidate = { ...candidate, configuration: { ...candidate.configuration, name: "Changed" } };
  if (change === "settings") unitOfWork.run(human, ({ repository: tx }) => tx.updateSafetySettings(candidate.configuration.projectId, { agentMode: "propose" }));
  if (change === "connection") unitOfWork.run(human, ({ repository: tx }) => tx.updateConnectorConnection(candidate.connectionId!, { name: "Changed" }));
  if (change === "database") {
    const previous = handle.current;
    handle.current = openStoryMapperDb(":memory:");
    previous.$client.close();
  }
  if (change === "actor") await expect(connectGitHubConnection({ repository, unitOfWork }, { actorType: "human", actorId: "different" }, { candidate, verificationId: id, confirm: true })).rejects.toThrow("stale");
  else expect((await connect(id)).statusCode).toBe(409);
  expect(await fs.stat(credentialFilePath()).then(() => true, () => false)).toBe(false);
});

it("refuses duplicate pending verification and stale settings after a controlled provider await", async () => {
  let release!: (value: Response) => void;
  fixture.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const pending = verify();
  await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledTimes(1));
  expect((await verify()).statusCode).toBe(409);
  unitOfWork.run(human, ({ repository: tx }) => tx.updateSafetySettings(candidate.configuration.projectId, { agentMode: "propose" }));
  release(reply());
  expect((await pending).json()).toMatchObject({ ok: false, failure: { kind: "stale" } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
});

it("keeps the prior file/configuration/switch unchanged when atomic credential replacement fails", async () => {
  const id = await verifiedId();
  vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
  expect((await connect(id)).json()).toMatchObject({ ok: false, credentialStored: false, databaseCommitted: false, failure: { kind: "storage" } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
  expect((await connect(id)).statusCode).toBe(409);
  expect((await connect(await verifiedId())).json()).toMatchObject({ ok: true, credentialStored: true });
});

it("reports a retained credential file and rolls back connection and switch together on SQLite failure", async () => {
  const id = await verifiedId();
  handle.current.$client.exec("CREATE TRIGGER fail_enable BEFORE UPDATE ON project_settings BEGIN SELECT RAISE(ABORT, 'fixture database failure'); END");
  expect((await connect(id)).json()).toMatchObject({ ok: false, credentialStored: true, databaseCommitted: false, failure: { kind: "database", message: expect.stringContaining("credential was stored") } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
  expect(repository.listActivity(candidate.configuration.projectId).filter((event) => event.action === "settings.safetyUpdated")).toEqual([]);
  expect((await fs.readFile(credentialFilePath(), "utf8")).includes(candidate.credential.method === "token" ? candidate.credential.token : "missing")).toBe(true);
});

it("reports a stored credential but rejects changed settings after a controlled file await", async () => {
  const id = await verifiedId();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  let release!: () => void;
  vi.mocked(fs.rename).mockImplementationOnce(async (...args) => {
    await actual.rename(...args);
    await new Promise<void>((resolve) => { release = resolve; });
  });
  const pending = connect(id);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect((await connect(id)).statusCode).toBe(409);
  unitOfWork.run(human, ({ repository: tx }) => tx.updateSafetySettings(candidate.configuration.projectId, { agentMode: "propose" }));
  release();
  expect((await pending).json()).toMatchObject({ ok: false, credentialStored: true, databaseCommitted: false, failure: { kind: "stale" } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toEqual([]);
  expect(repository.getSafetySettings(candidate.configuration.projectId).github).toBe(false);
});

it("returns committed state if live publication fails after the SQLite commit", async () => {
  const id = await verifiedId();
  const stop = unitOfWork.subscribe(() => { throw new Error("fixture publication failure"); });
  vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  const response = (await connect(id)).json();
  stop();
  expect(response).toMatchObject({ ok: true, publicationWarning: true, settings: { github: true } });
  expect(repository.listConnectorConnections(candidate.configuration.projectId)).toHaveLength(1);
});

it("keeps actual verification/connect outputs, Activity, logs, SQLite, restore snapshot and archive free of candidate canaries", async () => {
  const secret = candidate.credential.method === "token" ? candidate.credential.token : "";
  fixture.fetch.mockResolvedValueOnce(reply(401, { message: secret }));
  const rejected = await verify();
  expect(rejected.json()).toMatchObject({ ok: false });
  fixture.fetch.mockResolvedValueOnce(reply());
  const verification = await verify();
  const connected = await connect(verification.json().verificationId);
  expect(connected.json()).toMatchObject({ ok: true });
  const projectId = candidate.configuration.projectId;
  const point = await post(`/api/human/projects/${projectId}/restore-points`, { class: "manual" });
  expect(point.statusCode).toBe(201);
  const archive = await exportProjectArchive(handle, projectId);
  const zip = await JSZip.loadAsync(archive.content);
  const outputs: Array<string | Buffer> = [rejected.body, verification.body, connected.body, JSON.stringify(repository.listActivity(projectId)), readFileSync(handle.current.$client.name), await fs.readFile(join(root, "logs", "storymapper.log")), readFileSync(join(root, "project.lsm", "snapshots", point.json().restorePoint.fileName))];
  for (const entry of Object.values(zip.files).filter((entry) => !entry.dir)) outputs.push(await entry.async("nodebuffer"));
  for (const output of outputs) expect(Buffer.from(output).includes(Buffer.from(secret)), "Candidate token must stay private").toBe(false);
  expect((await fs.readFile(credentialFilePath(), "utf8")).includes(secret)).toBe(true);
});

it("uses strict candidate/confirmation contracts without accepting unconsented or mismatched methods", () => {
  expect(verifyGitHubConnectionRequestSchema.safeParse({ candidate, consent: true }).success).toBe(true);
  expect(verifyGitHubConnectionRequestSchema.safeParse({ candidate, consent: true, token: canary() }).success).toBe(false);
  expect(verifyGitHubConnectionRequestSchema.safeParse({ candidate: { ...candidate, credential: { method: "github-cli" } }, consent: true }).success).toBe(false);
  expect(connectGitHubConnectionRequestSchema.safeParse({ candidate, verificationId: randomUUID(), confirm: false }).success).toBe(false);
});
