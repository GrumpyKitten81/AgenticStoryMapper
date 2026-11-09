import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectorConnectionSchema, type ActorContext } from "@storymapper/contracts";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { validateConnectorConnection } from "@storymapper/server/application/connector/connector.use-cases";
import { storeGitHubCredential } from "@storymapper/server/application/connector/credential.use-cases";
import { credentialFilePath, readUserGitHubToken } from "@storymapper/server/services/credential-file";
import { githubCredentialStatuses, resolveGitHubAuth } from "@storymapper/server/services/credentials";

const fixture = vi.hoisted(() => ({ home: "", exec: vi.fn(), validate: vi.fn() }));
vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: () => ({ validateConnection: fixture.validate }) }));
vi.mock("node:os", async (original) => ({ ...await original<typeof import("node:os")>(), homedir: () => fixture.home }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: fixture.exec }) };
});
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename), lstat: vi.fn(actual.lstat), open: vi.fn(actual.open) };
});

const human = { actorType: "human", actorId: "credential-test" } as const;
const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId: randomUUID(), provider: "github", name: "test", authMode: "token", owner: "owner", repository: "repo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const absentCli = () => fixture.exec.mockRejectedValue(Object.assign(new Error("absent"), { code: "ENOENT" }));
const canary = () => randomUUID().replaceAll("-", "");

beforeEach(async () => {
  fixture.home = await fs.mkdtemp(join(realpathSync(tmpdir()), "storymapper-credentials-"));
  absentCli();
  fixture.validate.mockResolvedValue({ ok: true, message: "Verified." });
  vi.stubEnv("APPDATA", join(fixture.home, "app-data"));
  vi.stubEnv("GITHUB_TOKEN", "");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(fs.rename).mockReset().mockImplementation(actual.rename);
  vi.mocked(fs.lstat).mockReset().mockImplementation(actual.lstat);
  vi.mocked(fs.open).mockReset().mockImplementation(actual.open);
  fixture.exec.mockReset();
  fixture.validate.mockReset();
  await fs.rm(fixture.home, { recursive: true, force: true });
});

describe("GitHub source resolution", () => {
  registerReturnsSelectedSourceStatusForTheCredentialsActuallyResolved();

  registerRefusesExposedSelectedFilesWithoutEnvironmentFallThroughAnd();

  registerRefusesDifferentlyOwnedInsideHomeAncestorsWhileRetainingTrusted();

  it("selects CLI, then user file, then environment, irrespective of stored authMode", testSelectsCLIThenUserFileThenEnvironmentIrrespectiveOfStoredAuthMode);

  registerIgnoresUnusableLowerSourcesWhenCLIIsConfiguredAnd();

  it("recognizes only missing CLI executable or the documented missing-token result as absence", async () => {
    vi.stubEnv("GITHUB_TOKEN", canary());
    fixture.exec.mockRejectedValue({ code: 1, stderr: "no oauth token found for github.com\n" });
    expect((await resolveGitHubAuth(connection)).connection.authMode).toBe("token");
    for (const failure of [{ code: 1, stderr: canary() }, { code: "EACCES" }, { code: 1, killed: true, stderr: "no oauth token found for github.com" }]) {
      fixture.exec.mockRejectedValue(failure);
      await expect(resolveGitHubAuth(connection)).rejects.toThrow("Could not read local GitHub CLI credentials");
    }
  });

  it("refuses malformed, invalid and unreadable selected files instead of using environment", async () => {
    const token = canary();
    vi.stubEnv("GITHUB_TOKEN", token);
    await storeGitHubCredential(human, { token });
    for (const contents of [token, JSON.stringify({ token }), JSON.stringify({ github: { token: " " } })]) {
      await fs.writeFile(credentialFilePath(), contents);
      await expect(resolveGitHubAuth(connection)).rejects.toThrow(/Credential file.*(malformed JSON|invalid GitHub token data)/);
    }
    vi.mocked(fs.lstat).mockRejectedValueOnce(Object.assign(new Error(token), { code: "EACCES" }));
    await expect(resolveGitHubAuth(connection)).rejects.toThrow("access denied");
  });

  it("reports actionable absence and local availability without network-backed probes or secret output", async () => {
    await expect(resolveGitHubAuth(connection)).rejects.toThrow(credentialFilePath());
    const token = canary();
    await storeGitHubCredential(human, { token });
    const statuses = await githubCredentialStatuses();
    expect(statuses.map((status) => [status.source, status.configured])).toEqual([["github-cli", false], ["user-file", true], ["env", false]]);
    expect(JSON.stringify(statuses)).not.toContain(token);
    expect(fixture.exec.mock.calls.every((call) => call[1][1] === "token")).toBe(true);
    fixture.exec.mockRejectedValue({ code: 1, stderr: token, stdout: token, message: token });
    expect(JSON.stringify(await githubCredentialStatuses())).not.toContain(token);
  });
});

describe("human user credential storage", () => {
  registerUsesTheDisposableFixtureAPPDATAForWindowsStorageAnd();

  registerUsesAPPDATAStoryMapperOnWindowsAndRefusesAbsentOr();

  registerCreatesAndAtomicallyReplacesExactCredentialsOutsideProjectData();

  registerRefusesASWriterBeforeAnyFilesystemMutation();

  it("rejects invalid human token input without exposing it", async () => {
    const token = `${canary()} with whitespace`;
    await expect(storeGitHubCredential(human, { token })).rejects.toThrow("without whitespace");
    expect(await fs.readdir(fixture.home)).toEqual([]);
  });

  registerPreservesThePreviousFileAndRemovesTemporaryDataAfter();

  registerRefusesASTargetBeforeFollowingOrReplacingIt();

  it.skipIf(process.platform === "win32")("accepts a system symlink above the home directory", async () => {
    const root = fixture.home;
    await fs.mkdir(join(root, "real", "user"), { recursive: true });
    await fs.symlink(join(root, "real"), join(root, "home"));
    fixture.home = join(root, "home", "user");
    const token = canary();
    await storeGitHubCredential(human, { token });
    expect(await readUserGitHubToken()).toBe(token);
  });

  it("refuses symlink and shared-writable parent directories", async () => {
    const configDirectory = process.platform === "win32" ? process.env.APPDATA! : join(fixture.home, ".config");
    await fs.mkdir(join(fixture.home, "other"));
    await fs.symlink(join(fixture.home, "other"), configDirectory);
    await expect(storeGitHubCredential(human, { token: canary() })).rejects.toThrow("without symbolic links");
    expect(await fs.readdir(join(fixture.home, "other"))).toEqual([]);
    await fs.unlink(configDirectory);
    await fs.mkdir(configDirectory);
    await fs.chmod(configDirectory, 0o777);
    if (process.platform !== "win32") await expect(storeGitHubCredential(human, { token: canary() })).rejects.toThrow("writable by other users");
  });
});

function registerIgnoresUnusableLowerSourcesWhenCLIIsConfiguredAnd() {
  it("ignores unusable lower sources when CLI is configured and marks unusable selected sources as blocking", async () => {
    await storeGitHubCredential(human, { token: canary() });
    await fs.writeFile(credentialFilePath(), canary());
    vi.stubEnv("GITHUB_TOKEN", canary());
    fixture.exec.mockResolvedValue({ stdout: canary(), stderr: "" });
    expect((await resolveGitHubAuth(connection)).connection.authMode).toBe("github-cli");
    expect((await githubCredentialStatuses()).map((status) => status.selected)).toEqual([true, false, false]);
    absentCli();
    const statuses = await githubCredentialStatuses();
    expect(statuses[1]).toMatchObject({ configured: false, unusable: true, selected: false });
    expect(statuses[2]).toMatchObject({ configured: true, selected: false });
  });
}

function registerRefusesDifferentlyOwnedInsideHomeAncestorsWhileRetainingTrusted() {
  it.skipIf(process.platform === "win32")("refuses differently owned inside-home ancestors while retaining trusted outside-home ancestors", async () => {
    await storeGitHubCredential(human, { token: canary() });
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.lstat).mockImplementation(async (...args) => {
      const stat = await actual.lstat(...args);
      if (String(args[0]) === join(fixture.home, ".config")) Object.assign(stat, { uid: process.getuid!() + 1, mode: 0o40755 });
      return stat;
    });
    await expect(readUserGitHubToken()).rejects.toThrow("owned by the current user");
    await expect(storeGitHubCredential(human, { token: canary() })).rejects.toThrow("owned by the current user");
    expect(await fs.readdir(dirname(credentialFilePath()))).toEqual(["credentials.json"]);
    vi.mocked(fs.lstat).mockImplementation(async (...args) => {
      const stat = await actual.lstat(...args);
      if (String(args[0]) === dirname(fixture.home)) Object.assign(stat, { uid: process.getuid!() + 1 });
      return stat;
    });
    expect(await readUserGitHubToken()).toBeTruthy();
  });
}

function registerRefusesExposedSelectedFilesWithoutEnvironmentFallThroughAnd() {
  it.skipIf(process.platform === "win32")("refuses exposed selected files without environment fall-through and replaces them with 0600", async () => {
    const token = canary();
    await storeGitHubCredential(human, { token });
    vi.stubEnv("GITHUB_TOKEN", canary());
    await fs.chmod(credentialFilePath(), 0o644);
    await expect(resolveGitHubAuth(connection)).rejects.toThrow("restrict permissions to 0600");
    const statuses = await githubCredentialStatuses();
    expect(statuses.find((status) => status.source === "user-file")).toMatchObject({ configured: false, unusable: true });
    expect(statuses.some((status) => status.selected)).toBe(false);
    const replacement = canary();
    await storeGitHubCredential(human, { token: replacement });
    expect(await readUserGitHubToken()).toBe(replacement);
    expect((await fs.stat(credentialFilePath())).mode & 0o777).toBe(0o600);
  });
}

function registerReturnsSelectedSourceStatusForTheCredentialsActuallyResolved() {
  it("returns selected-source status for the credentials actually resolved after an intervening source change", async () => {
    const cliToken = canary();
    vi.stubEnv("GITHUB_TOKEN", canary());
    fixture.exec.mockRejectedValueOnce({ code: "ENOENT" }).mockResolvedValue({ stdout: cliToken, stderr: "" });
    const deps = { repository: { getSafetySettings: () => ({ github: true }) }, unitOfWork: { handle: { current: {} } } } as unknown as ApplicationDeps;
    const response = await validateConnectorConnection(deps, human, connection);
    expect(fixture.validate).toHaveBeenCalledWith(expect.objectContaining({ authMode: "github-cli" }), { cliToken, source: "github-cli" });
    expect(response.credentials.filter((status) => status.selected)).toEqual([expect.objectContaining({ source: "github-cli", configured: true, unusable: false })]);
    expect(JSON.stringify(response)).not.toContain(cliToken);
  });
}

function registerRefusesASTargetBeforeFollowingOrReplacingIt() {
  it.each(["symlink", "directory", "hardlink"])("refuses a %s target before following or replacing it", async (kind) => {
    const token = canary();
    await storeGitHubCredential(human, { token });
    const target = credentialFilePath();
    const other = join(fixture.home, "other");
    await fs.rename(target, other);
    if (kind === "symlink") await fs.symlink(other, target);
    if (kind === "directory") await fs.mkdir(target);
    if (kind === "hardlink") await fs.link(other, target);
    await expect(readUserGitHubToken()).rejects.toThrow("regular file");
    await expect(storeGitHubCredential(human, { token: canary() })).rejects.toThrow("regular file");
    expect(JSON.parse(await fs.readFile(other, "utf8")).github.token).toBe(token);
  });
}

function registerPreservesThePreviousFileAndRemovesTemporaryDataAfter() {
  it.each(["rename", "write"])("preserves the previous file and removes temporary data after %s failure", async (operation) => {
    const token = canary();
    await storeGitHubCredential(human, { token });
    const original = await fs.readFile(credentialFilePath(), "utf8");
    const failure = Object.assign(new Error(canary()), { code: "EIO" });
    if (operation === "rename") vi.mocked(fs.rename).mockRejectedValueOnce(failure);
    else {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
        const handle = await actual.open(...args);
        vi.spyOn(handle, "writeFile").mockRejectedValueOnce(failure);
        return handle;
      });
    }
    await expect(storeGitHubCredential(human, { token: canary() })).rejects.toThrow("filesystem operation failed");
    expect(await fs.readFile(credentialFilePath(), "utf8")).toBe(original);
    expect(await fs.readdir(dirname(credentialFilePath()))).toEqual(["credentials.json"]);
  });
}

function registerRefusesASWriterBeforeAnyFilesystemMutation() {
  it.each(["agent", "github", "system"])("refuses a %s writer before any filesystem mutation", async (actorType) => {
    const token = canary();
    await expect(storeGitHubCredential({ actorType, actorId: "untrusted" } as ActorContext, { token })).rejects.toThrow();
    expect(await fs.readdir(fixture.home)).toEqual([]);
    expect(fs.open).not.toHaveBeenCalled();
  });
}

function registerCreatesAndAtomicallyReplacesExactCredentialsOutsideProjectData() {
  it("creates and atomically replaces exact credentials outside Project data with POSIX 0600", async () => {
    const first = canary();
    const second = canary();
    expect(await storeGitHubCredential(human, { token: first })).toEqual({ ok: true, source: "user-file", location: process.platform === "win32" ? join(fixture.home, "app-data", "StoryMapper", "credentials.json") : join(fixture.home, ".config", "storymapper", "credentials.json") });
    expect(await readUserGitHubToken()).toBe(first);
    expect(await storeGitHubCredential(human, { token: second })).not.toHaveProperty("token");
    expect(JSON.parse(await fs.readFile(credentialFilePath(), "utf8"))).toEqual({ github: { token: second } });
    if (process.platform !== "win32") expect((await fs.stat(credentialFilePath())).mode & 0o777).toBe(0o600);
    expect(vi.mocked(fs.rename)).toHaveBeenCalledTimes(2);
  });
}

function registerUsesAPPDATAStoryMapperOnWindowsAndRefusesAbsentOr() {
  it("uses APPDATA/StoryMapper on Windows and refuses absent or relative APPDATA", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      Object.defineProperty(process, "platform", { value: "win32" });
      vi.stubEnv("APPDATA", join(fixture.home, "app-data"));
      expect(credentialFilePath()).toBe(join(fixture.home, "app-data", "StoryMapper", "credentials.json"));
      vi.stubEnv("APPDATA", "");
      expect(() => credentialFilePath()).toThrow("valid Windows APPDATA");
      vi.stubEnv("APPDATA", "relative");
      expect(() => credentialFilePath()).toThrow("valid Windows APPDATA");
    } finally { Object.defineProperty(process, "platform", originalPlatform); }
  });
}

function registerUsesTheDisposableFixtureAPPDATAForWindowsStorageAnd() {
  it("uses the disposable fixture APPDATA for Windows storage and reopens it", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      Object.defineProperty(process, "platform", { value: "win32" });
      const token = canary();
      const location = join(fixture.home, "app-data", "StoryMapper", "credentials.json");
      expect(process.env.APPDATA).toBe(join(fixture.home, "app-data"));
      expect(await storeGitHubCredential(human, { token })).toMatchObject({ location });
      expect(await readUserGitHubToken()).toBe(token);
      expect(await fs.readdir(fixture.home)).toEqual(["app-data"]);
    } finally { Object.defineProperty(process, "platform", originalPlatform); }
  });
}

async function testSelectsCLIThenUserFileThenEnvironmentIrrespectiveOfStoredAuthMode() {
  const fileToken = canary();
  const envToken = canary();
  await storeGitHubCredential(human, { token: fileToken });
  vi.stubEnv("GITHUB_TOKEN", envToken);
  vi.stubEnv("GH_TOKEN", canary());
  vi.stubEnv("GH_HOST", "other.example");
  const cliToken = canary();
  fixture.exec.mockResolvedValue({ stdout: cliToken, stderr: "" });
  expect(await resolveGitHubAuth(connection)).toEqual({ connection: { ...connection, authMode: "github-cli" }, auth: { cliToken, source: "github-cli" } });
  expect(fixture.exec).toHaveBeenLastCalledWith("gh", ["auth", "token", "--hostname", "github.com"], expect.objectContaining({ env: expect.objectContaining({ GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" }) }));
  const environment = fixture.exec.mock.calls.at(-1)![2].env;
  expect(environment.GH_TOKEN).toBeUndefined();
  expect(environment.GITHUB_TOKEN).toBeUndefined();
  absentCli();
  expect((await resolveGitHubAuth(connection)).auth.token).toBe(fileToken);
  await fs.unlink(credentialFilePath());
  expect((await resolveGitHubAuth({ ...connection, authMode: "github-cli" })).auth.token).toBe(envToken);
}
