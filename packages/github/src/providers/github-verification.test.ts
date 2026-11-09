import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectorConnectionSchema, type WorkItemAuthMode } from "@storymapper/contracts";
import { GitHubProvider } from "@storymapper/github";

const fixture = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: fixture.exec }) };
});

const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId: randomUUID(), provider: "github", name: "Verification", authMode: "token", owner: "fixture-owner", repository: "fixture-repo", createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" });
const metadata = { full_name: "fixture-owner/fixture-repo", html_url: "https://github.com/fixture-owner/fixture-repo" };
let token: string;
let fetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  token = randomUUID().replaceAll("-", "");
  fetch = vi.fn(async () => { throw new Error("Unexpected external request in verification fixture"); });
  vi.stubGlobal("fetch", fetch);
  fixture.exec.mockRejectedValue(new Error("Unexpected CLI command in verification fixture"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

function verify(authMode: WorkItemAuthMode) {
  return new GitHubProvider().validateConnection({ ...connection, authMode }, authMode === "token" ? { token } : { cliToken: token });
}

it.each(["token", "github-cli"] as const)("reads repository permissions through %s without a write probe or credential substitution", async (authMode) => {
  const repo = { ...metadata, permissions: { pull: true, push: false } };
  fetch.mockResolvedValue(Response.json(repo));
  fixture.exec.mockResolvedValue({ stdout: JSON.stringify(repo), stderr: "" });
  vi.stubEnv("GH_TOKEN", randomUUID());
  vi.stubEnv("GITHUB_TOKEN", randomUUID());
  const result = await verify(authMode);
  expect(result).toMatchObject({ ok: true, capabilities: { read: true, write: "unavailable" } });
  expect(result.capabilities?.limitation).toMatch(/does not verify future Issue, Milestone or issue-type writes/);
  expect(JSON.stringify(result)).not.toContain(token);
  if (authMode === "token") {
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/fixture-owner/fixture-repo");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", headers: { authorization: `token ${token}` } });
    expect(fixture.exec).not.toHaveBeenCalled();
  } else {
    expect(fixture.exec).toHaveBeenCalledOnce();
    const [command, args, options] = fixture.exec.mock.calls[0]!;
    expect(command).toBe("gh");
    expect(args).toEqual(["api", "repos/fixture-owner/fixture-repo"]);
    expect(options.env.GH_TOKEN === token).toBe(true);
    expect(options.env.GH_HOST).toBe("github.com");
    expect(options.env.GITHUB_TOKEN).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  }
});

it.each([
  { permissions: { push: true }, expected: "available" },
  { permissions: { push: false }, expected: "unavailable" },
  { permissions: undefined, expected: "unknown" }
])("reports permission evidence truthfully for $expected write access", async ({ permissions, expected }) => {
  fetch.mockResolvedValue(Response.json({ ...metadata, permissions }));
  expect(await verify("token")).toMatchObject({ ok: true, capabilities: { read: true, write: expected } });
});

it.each(["token", "github-cli"] as const)("normalizes %s HTTP failures without raw output", async (authMode) => {
  for (const [status, kind] of [[401, "credentials"], [403, "repository"], [404, "repository"], [429, "rate-limit"], [500, "provider"]] as const) {
    fetch.mockImplementation(async () => Response.json({ message: token }, { status }));
    fixture.exec.mockRejectedValue(Object.assign(new Error(token), { stderr: `${token} (HTTP ${status})`, stdout: token, code: 1 }));
    const result = await verify(authMode);
    expect(result).toMatchObject({ ok: false, failure: { kind, nextAction: expect.any(String) } });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.message).not.toMatch(/deleted/i);
    expect(result.capabilities).toBeUndefined();
  }
});

it.each(["token", "github-cli"] as const)("recognizes %s rate-limited403 and offline failures", async (authMode) => {
  fetch.mockImplementation(async () => Response.json({ message: token }, { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
  fixture.exec.mockRejectedValue(Object.assign(new Error(token), { stderr: `gh: API rate limit exceeded ${token} (HTTP 403)`, code: 1 }));
  expect(await verify(authMode)).toMatchObject({ ok: false, failure: { kind: "rate-limit" } });
  fetch.mockRejectedValue(new TypeError(token));
  fixture.exec.mockRejectedValue(Object.assign(new Error(token), { stderr: `error connecting to api.github.com ${token}`, code: 1 }));
  const result = await verify(authMode);
  expect(result).toMatchObject({ ok: false, failure: { kind: "network" } });
  expect(JSON.stringify(result)).not.toContain(token);
});

it.each(["token", "github-cli"] as const)("refuses missing selected %s credentials before transport", async (authMode) => {
  expect(await new GitHubProvider().validateConnection({ ...connection, authMode }, {})).toMatchObject({ ok: false, failure: { kind: "credentials" } });
  expect(fetch).not.toHaveBeenCalled();
  expect(fixture.exec).not.toHaveBeenCalled();
});
