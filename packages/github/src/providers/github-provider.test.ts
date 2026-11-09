import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { connectorConnectionSchema, type SyncPlanItem } from "@storymapper/contracts";
import { GitHubProvider, githubCliEnvironment } from "@storymapper/github";

const fixture = vi.hoisted(() => ({ exec: vi.fn(), cliToken: "", auth: vi.fn(), get: vi.fn(), graphql: vi.fn(), create: vi.fn(), update: vi.fn(), milestones: vi.fn(), request: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: fixture.exec }) };
});
vi.mock("@octokit/rest", () => ({ Octokit: class {
  constructor(options: unknown) { fixture.auth(options); }
  repos = { get: fixture.get };
  request = fixture.request;
  graphql = fixture.graphql;
  issues = { create: fixture.create, update: fixture.update, listMilestones: fixture.milestones };
} }));

const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId: randomUUID(), provider: "github", name: "test", authMode: "github-cli", owner: "owner", repository: "repo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const issue = { number: 3, title: "Issue", body: "body", state: "open", labels: [], url: "https://github.com/owner/repo/issues/3", html_url: "https://github.com/owner/repo/issues/3", type: { name: "Task" } };
const item = { cardId: randomUUID(), action: "create", title: "Issue", body: "body", labels: [], remoteState: "open", githubIssueType: "Task" } as unknown as SyncPlanItem;
const canary = () => randomUUID().replaceAll("-", "");

beforeEach(() => {
  fixture.cliToken = canary();
  vi.stubEnv("GH_TOKEN", canary());
  vi.stubEnv("GITHUB_TOKEN", canary());
  vi.stubEnv("GH_ENTERPRISE_TOKEN", canary());
  vi.stubEnv("GITHUB_ENTERPRISE_TOKEN", canary());
  vi.stubEnv("GH_HOST", "other.example");
  vi.stubEnv("GH_DEBUG", "api");
  vi.stubEnv("DEBUG", "*");
  fixture.request.mockResolvedValue({ data: issue });
  fixture.exec.mockImplementation(async (_command, args: string[]) => {
    if (args[0] === "api" && args[1] === "graphql") return { stdout: JSON.stringify({ data: args.some((argument) => argument.includes("issue(number:")) ? { repository: { issue: { ...issue, labels: { nodes: [] } } } } : { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }) };
    if (args[0] === "api" && args[1] === "--method" && args[2] === "GET" && args[3]?.includes("/labels?")) return { stdout: "[]" };
    if (args[0] === "issue" && args[1] === "create") return { stdout: issue.url };
    return { stdout: JSON.stringify(issue) };
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

async function testLoadsProjectEvidenceSequentially() {
    const source = { kind: "project" as const, projectId: "delivery", projectName: "Delivery", fieldId: "status" };
    const page = (nodes: unknown[], next: string | null = null) => ({ nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } });
    let active = 0, maximum = 0, memberships = 0;
    fixture.graphql.mockImplementation(async (query: string, variables: { cursor?: string | null; number?: number }) => {
      if (query.includes("search(query:")) return { search: page([1, 2].map((number) => ({ ...issue, number, labels: page([]), assignees: { nodes: [] } }))) };
      if (query.includes("... on ProjectV2{")) return { node: { fields: page([{ id: "status", name: "Delivery stage", options: [{ id: "review", name: "In Review" }] }]) } };
      active++; maximum = Math.max(maximum, active); memberships++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { repository: { issue: { projectItems: variables.cursor ? page([{ id: `item-${variables.number}`, project: { id: source.projectId }, fieldValues: page([{ field: { id: "status" }, optionId: "review", name: "In Review" }]) }]) : page([], "next") } } };
    });
    const result = await new GitHubProvider().listRemoteItems({ ...connection, authMode: "token", statusSource: source }, { token: fixture.cliToken });
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.statusEvidence?.name === "In Review")).toBe(true);
    expect(memberships).toBe(4);
    expect(maximum).toBe(1);
}

describe("resolved GitHub authentication boundaries", () => {
  it("loads paginated Project evidence sequentially at the provider transport boundary", testLoadsProjectEvidenceSequentially);
  it("retains the selected CLI credential when inherited credentials and CLI configuration change between calls", testRetainsTheSelectedCLICredentialWhenInheritedCredentialsAndCLIConfiguration);

  registerRefusesHostQualifiedOrPathLikeRepositoryIdentityJ();

  registerPreservesASelectedCredentialWriteFailureWithoutASecond();

  registerRefusesImplicitMilestoneEffectsBeforeAnyProviderCall();

  registerRejectsPartialIssueSearchesRatherThanAcceptingIncompleteIdentity();

  registerRejectsSuccessfulSSearchPagesWithAMissingContinuation();

  it("pins github.com and removes inherited credentials, debug, prompting and update traffic on every CLI subprocess", testPinsGithubComAndRemovesInheritedCredentialsDebugPromptingAndUpdate);

  registerDoesNotMutateTheSuppliedEnvironment();

  registerUsesOnlyTheResolvedTokenAndNeverRunsCLI();

  registerSanitizesTokenProviderHTTPSFailuresWithoutLeakingHeaders();

  registerReturnsExplicitUnavailableForAMissingIssueAndStill();

  it("retains masked404 as unavailable and never treats mixed provider failures as absence", async () => {
    const provider = new GitHubProvider();
    const configured = { ...connection, authMode: "token" as const };
    fixture.graphql.mockRejectedValueOnce({ status: 404 });
    await expect(provider.getRemoteItem(configured, { token: canary() }, "3")).resolves.toEqual({ status: "unavailable" });
    for (const status of [401, 403, 429, 500]) {
      fixture.graphql.mockRejectedValueOnce({ status });
      await expect(provider.getRemoteItem(configured, { token: canary() }, "3")).rejects.toThrow(/^GitHub /);
    }
    fixture.graphql.mockRejectedValueOnce({ errors: [{ type: "NOT_FOUND", path: ["repository", "issue"] }, { type: "FORBIDDEN", path: ["repository", "issue", "labels"] }] });
    await expect(provider.getRemoteItem(configured, { token: canary() }, "3")).rejects.toThrow("GitHub request failed");
  });

  it("sanitizes raw CLI errors on validation, reads and writes without falling back to token mode", async () => {
    const secret = canary();
    fixture.exec.mockRejectedValue(Object.assign(new Error(secret), { stdout: secret, stderr: secret, cmd: secret }));
    const provider = new GitHubProvider();
    const result = await provider.validateConnection(connection, { cliToken: fixture.cliToken });
    expect(result).toMatchObject({ ok: false, failure: { kind: "provider", message: "GitHub request failed." }, message: "GitHub request failed. Check the selected credentials, repository access and GitHub availability, then Verify again." });
    await expect(provider.getRemoteItem(connection, { cliToken: fixture.cliToken }, "3")).rejects.toThrow("GitHub request failed");
    await expect(provider.createOrUpdateRemoteItem(connection, { cliToken: fixture.cliToken }, item)).rejects.toThrow("GitHub request failed");
    expect(fixture.auth).not.toHaveBeenCalled();
  });
});

function registerReturnsExplicitUnavailableForAMissingIssueAndStill() {
  it("returns explicit unavailable for a missing issue and still sanitizes other read failures in both modes", async () => {
    const provider = new GitHubProvider();
    fixture.exec.mockRejectedValue(Object.assign(new Error("failed"), { stderr: "GraphQL: Could not resolve to an Issue with the number of 3. (repository.issue)" }));
    await expect(provider.getRemoteItem(connection, { cliToken: fixture.cliToken }, "3")).resolves.toEqual({ status: "unavailable" });
    fixture.exec.mockRejectedValue(Object.assign(new Error("failed"), { stderr: "GraphQL: Could not resolve to a Repository with the name owner/repo." }));
    await expect(provider.getRemoteItem(connection, { cliToken: fixture.cliToken }, "3")).rejects.toThrow("GitHub request failed");
    const configured = { ...connection, authMode: "token" as const };
    fixture.graphql.mockRejectedValue(Object.assign(new Error("failed"), { errors: [{ type: "NOT_FOUND", path: ["repository", "issue"] }] }));
    await expect(provider.getRemoteItem(configured, { token: canary() }, "3")).resolves.toEqual({ status: "unavailable" });
    fixture.graphql.mockRejectedValue(Object.assign(new Error("failed"), { errors: [{ type: "NOT_FOUND", path: ["repository"] }] }));
    await expect(provider.getRemoteItem(configured, { token: canary() }, "3")).rejects.toThrow("GitHub request failed");
  });
}

function registerSanitizesTokenProviderHTTPSFailuresWithoutLeakingHeaders() {
  it.each([401, 403, 404, 429, 500])("sanitizes token-provider HTTP %s failures without leaking headers, bodies or tokens", async (status) => {
    const token = canary();
    const failure = Object.assign(new Error(token), { status, request: { headers: { authorization: `token ${token}` }, body: token }, response: { data: token } });
    fixture.get.mockRejectedValue(failure);
    fixture.graphql.mockRejectedValue(failure);
    fixture.create.mockRejectedValue(failure);
    fixture.request.mockRejectedValue(failure);
    const provider = new GitHubProvider();
    const configured = { ...connection, authMode: "token" as const };
    const result = await provider.validateConnection(configured, { token });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(token);
    for (const request of [() => provider.listRemoteItems(configured, { token }), () => provider.createOrUpdateRemoteItem(configured, { token }, item)]) {
      await expect(request()).rejects.toThrow(/^GitHub /);
      try { await request(); } catch (error) {
        expect(JSON.stringify(error)).not.toContain(token);
        expect(String(error)).not.toContain(token);
        expect(error).not.toHaveProperty("request");
      }
    }
    expect(fixture.exec).not.toHaveBeenCalled();
  });
}

function registerUsesOnlyTheResolvedTokenAndNeverRunsCLI() {
  it("uses only the resolved token and never runs CLI when token mode was selected", async () => {
    const token = canary();
    fixture.get.mockResolvedValue({ data: { full_name: "owner/repo", html_url: "https://github.com/owner/repo" } });
    const result = await new GitHubProvider().validateConnection({ ...connection, authMode: "token" }, { token });
    expect(result.ok).toBe(true);
    expect(fixture.auth).toHaveBeenCalledWith({ auth: token });
    expect(fixture.exec).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(token);
  });
}

function registerDoesNotMutateTheSuppliedEnvironment() {
  it("does not mutate the supplied environment", () => {
    const environment = { GH_TOKEN: canary(), GH_HOST: "other.example", gh_token: canary(), gh_host: "other.example", gh_prompt_disabled: "0", HOME: "/disposable" };
    const clean = githubCliEnvironment(environment);
    expect(clean.GH_TOKEN).toBeUndefined();
    expect(clean.gh_token).toBeUndefined();
    expect(clean.gh_host).toBeUndefined();
    expect(clean.gh_prompt_disabled).toBeUndefined();
    expect(environment.GH_TOKEN).toBeTruthy();
    expect(clean.HOME).toBe(environment.HOME);
  });
}

function registerRejectsSuccessfulSSearchPagesWithAMissingContinuation() {
  it.each(["github-cli", "token"] as const)("rejects successful %s search pages with a missing continuation cursor", async (authMode) => {
    const search = { nodes: [issue], pageInfo: { hasNextPage: true, endCursor: null } };
    fixture.exec.mockResolvedValueOnce({ stdout: JSON.stringify({ data: { search } }) });
    fixture.graphql.mockResolvedValueOnce({ search });
    await expect(new GitHubProvider().listRemoteItems({ ...connection, authMode }, { cliToken: fixture.cliToken, token: canary() })).rejects.toThrow("GitHub request failed");
    expect(authMode === "github-cli" ? fixture.exec : fixture.graphql).toHaveBeenCalledTimes(1);
    expect(fixture.create).not.toHaveBeenCalled();
  });
}

function registerRejectsPartialIssueSearchesRatherThanAcceptingIncompleteIdentity() {
  it("rejects partial Issue searches rather than accepting incomplete identity evidence", async () => {
    fixture.exec.mockRejectedValueOnce({ stdout: JSON.stringify({ data: { search: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } } }, errors: [{ type: "FORBIDDEN" }] }) });
    await expect(new GitHubProvider().listRemoteItems(connection, { cliToken: fixture.cliToken })).rejects.toThrow("GitHub request failed");
    fixture.graphql.mockRejectedValueOnce({ data: { search: { nodes: [issue] } }, errors: [{ type: "FORBIDDEN" }] });
    await expect(new GitHubProvider().listRemoteItems({ ...connection, authMode: "token" }, { token: canary() })).rejects.toThrow("GitHub request failed");
  });
}

function registerRefusesImplicitMilestoneEffectsBeforeAnyProviderCall() {
  it("refuses implicit Milestone effects before any provider call", async () => {
    for (const authMode of ["github-cli", "token"] as const) {
      await expect(new GitHubProvider().createOrUpdateRemoteItem({ ...connection, authMode }, { cliToken: fixture.cliToken, token: canary() }, { ...item, milestone: "Release" })).rejects.toThrow("GitHub request failed");
    }
    expect(fixture.exec).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();
  });
}

function registerPreservesASelectedCredentialWriteFailureWithoutASecond() {
  it("preserves a selected-credential write failure without a second transport", async () => {
    const secret = canary();
    fixture.request.mockRejectedValue(Object.assign(new Error(secret), { status: 401 }));
    await expect(new GitHubProvider().createOrUpdateRemoteItem({ ...connection, authMode: "token" }, { token: secret }, { ...item, remoteId: "3" })).rejects.toThrow("GitHub rejected the selected credentials");
    expect(fixture.exec).not.toHaveBeenCalled();
  });
}

function registerRefusesHostQualifiedOrPathLikeRepositoryIdentityJ() {
  it.each([
    { owner: "other.example/owner" }, { owner: "https://github.com/owner" },
    { repository: "other.example/owner/repo" }, { repository: "owner/repo" },
    { owner: "owner:host" }, { repository: ".." }
  ])("refuses host-qualified or path-like repository identity %j before any external call", async (invalid) => {
    const candidate = { ...connection, ...invalid };
    expect(connectorConnectionSchema.safeParse(candidate).success).toBe(false);
    const provider = new GitHubProvider();
    for (const authMode of ["github-cli", "token"] as const) {
      const configured = { ...candidate, authMode };
      const auth = { cliToken: fixture.cliToken, token: canary() };
      for (const call of [() => provider.validateConnection(configured, auth), () => provider.listRemoteItems(configured, auth), () => provider.getRemoteItem(configured, auth, "3"), () => provider.createOrUpdateRemoteItem(configured, auth, item)]) await expect(call()).rejects.toThrow("plain names without a hostname or path");
    }
    expect(fixture.exec).not.toHaveBeenCalled();
    expect(fixture.auth).not.toHaveBeenCalled();
  });
}

async function testRetainsTheSelectedCLICredentialWhenInheritedCredentialsAndCLIConfiguration() {
  const selected = fixture.cliToken;
  const provider = new GitHubProvider();
  await provider.validateConnection(connection, { cliToken: selected });
  vi.stubEnv("GH_TOKEN", canary());
  vi.stubEnv("GITHUB_TOKEN", canary());
  vi.stubEnv("GH_CONFIG_DIR", "/different-disposable-cli-config");
  vi.stubEnv("GH_HOST", "other.example");
  await provider.getRemoteItem(connection, { cliToken: selected }, "3");
  expect(fixture.exec.mock.calls.every((call) => call[2].env.GH_TOKEN === selected && call[2].env.GH_HOST === "github.com")).toBe(true);
  expect(fixture.exec.mock.calls.some((call) => call[1][0] === "auth")).toBe(false);
  expect(fixture.auth).not.toHaveBeenCalled();
}

async function testPinsGithubComAndRemovesInheritedCredentialsDebugPromptingAndUpdate() {
  const provider = new GitHubProvider();
  expect(await provider.validateConnection(connection, { cliToken: fixture.cliToken })).toMatchObject({ ok: true });
  await provider.listRemoteItems(connection, { cliToken: fixture.cliToken });
  await provider.createOrUpdateRemoteItem(connection, { cliToken: fixture.cliToken }, item);
  await provider.createOrUpdateRemoteItem(connection, { cliToken: fixture.cliToken }, { ...item, remoteId: "3" });
  await provider.getRemoteItem(connection, { cliToken: fixture.cliToken }, "3");
  expect(fixture.exec.mock.calls.length).toBeGreaterThanOrEqual(5);
  for (const [command, args, options] of fixture.exec.mock.calls) {
    expect(command).toBe("gh");
    expect(args).not.toEqual(["auth", "status"]);
    expect(options.env).toMatchObject({ GH_TOKEN: fixture.cliToken, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1", GIT_TERMINAL_PROMPT: "0" });
    for (const name of ["GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_DEBUG", "DEBUG"]) expect(options.env[name]).toBeUndefined();
  }
}
