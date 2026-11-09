import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { acquireProjectLock } from "@storymapper/server/config/project-lock";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync), rmdirSync: vi.fn(actual.rmdirSync) };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

afterEach(async () => {
  const filesystem = await vi.importActual<typeof import("node:fs")>("node:fs");
  const processes = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  vi.mocked(unlinkSync).mockReset().mockImplementation(filesystem.unlinkSync);
  vi.mocked(rmdirSync).mockReset().mockImplementation(filesystem.rmdirSync);
  vi.mocked(spawnSync).mockReset().mockImplementation(processes.spawnSync);
});

it("preserves a replacement claim published between owner unlink and directory removal", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-claim-release-"));
  const claim = join(directory, ".lock.claim");
  const replacement = randomUUID();
  const removeDirectory = vi.mocked(rmdirSync);
  const original = removeDirectory.getMockImplementation()!;
  removeDirectory.mockImplementationOnce((target) => {
    writeFileSync(join(claim, replacement), "replacement ownership");
    return original(target);
  });
  try {
    expect(acquireProjectLock(join(directory, "storymapper.sqlite"), vi.fn())).toBeTypeOf("function");
    expect(readFileSync(join(claim, replacement), "utf8")).toBe("replacement ownership");
    expect(existsSync(join(directory, ".lock"))).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const inspection of [
  { status: null, stdout: undefined, error: Object.assign(new Error("inspection unavailable"), { code: "ENOENT" }) },
  { status: 1, stdout: "" },
  { status: 0, stdout: "invalid process timestamp" }
]) it("refuses unverified live ownership when process inspection fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-inspection-refusal-"));
  const owner = randomUUID();
  const lock = JSON.stringify({ pid: process.ppid, owner, processStartTime: new Date().toISOString() });
  const port = JSON.stringify({ host: "127.0.0.1", port: 4317, owner });
  writeFileSync(join(directory, ".lock"), lock);
  writeFileSync(join(directory, ".port"), port);
  vi.mocked(spawnSync).mockReturnValue(inspection as unknown as ReturnType<typeof spawnSync>);
  try {
    expect(() => acquireProjectLock(join(directory, "storymapper.sqlite"), vi.fn())).toThrow("Unable to verify process start time");
    expect(readFileSync(join(directory, ".lock"), "utf8")).toBe(lock);
    expect(readFileSync(join(directory, ".port"), "utf8")).toBe(port);
    expect(existsSync(join(directory, "storymapper.sqlite"))).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("refuses a denied acquisition-metadata deletion explicitly, retaining its cause and files without retry", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-claim-refusal-"));
  const path = join(directory, "storymapper.sqlite");
  const claim = join(directory, ".lock.claim");
  const owner = randomUUID();
  const metadata = join(claim, owner);
  const dead = spawnSync(process.execPath, ["--version"]);
  expect(dead.status).toBe(0);
  const content = JSON.stringify({ pid: dead.pid, owner, processStartTime: new Date().toISOString() });
  mkdirSync(claim);
  writeFileSync(metadata, content);
  const denied = Object.assign(new Error("Private filesystem diagnostic"), { code: "EPERM" });
  const remove = vi.mocked(unlinkSync).mockImplementation((target) => {
    if (target === metadata) throw denied;
    rmSync(target);
  });
  const takeover = vi.fn();
  try {
    expect(() => acquireProjectLock(path, takeover)).toThrow(expect.objectContaining({
      message: "Project acquisition metadata removal failed; refusing to proceed.", cause: denied
    }));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(String(remove.mock.calls.at(-1)?.[0])).toBe(metadata);
    expect(takeover).not.toHaveBeenCalled();
    expect(readFileSync(metadata, "utf8")).toBe(content);
    expect(existsSync(join(directory, ".lock"))).toBe(false);
    expect(existsSync(path)).toBe(false);
  } finally { remove.mockClear(); rmSync(directory, { recursive: true, force: true }); }
});

it("reclaims an empty partial acquisition claim left before owner metadata was published", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-partial-claim-"));
  const claim = join(directory, ".lock.claim");
  mkdirSync(claim);
  try {
    const release = acquireProjectLock(join(directory, "storymapper.sqlite"), vi.fn());
    expect(existsSync(join(directory, ".lock"))).toBe(true);
    release();
    expect(existsSync(claim)).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("treats a reused PID with a different process start time as stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-reused-pid-"));
  const owner = randomUUID();
  const lock = JSON.stringify({ pid: process.pid, processStartTime: new Date(Date.now() - 60_000).toISOString(), owner });
  const port = JSON.stringify({ host: "127.0.0.1", port: 4317, owner });
  writeFileSync(join(directory, ".lock"), lock);
  writeFileSync(join(directory, ".port"), port);
  try {
    const takeover = vi.fn();
    const release = acquireProjectLock(join(directory, "storymapper.sqlite"), takeover);
    expect(takeover).toHaveBeenCalledWith(JSON.parse(lock));
    expect(JSON.parse(readFileSync(join(directory, ".lock"), "utf8")).owner).not.toBe(owner);
    expect(existsSync(join(directory, ".port"))).toBe(false);
    release();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("does not reclaim a dead lock while the runtime discovery record belongs to another owner", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-foreign-port-"));
  const dead = spawnSync(process.execPath, ["--version"]);
  expect(dead.status).toBe(0);
  const owner = randomUUID();
  const lock = JSON.stringify({ pid: dead.pid, processStartTime: new Date().toISOString(), owner });
  const port = JSON.stringify({ host: "127.0.0.1", port: 4317, owner: "replacement-owner" });
  writeFileSync(join(directory, ".lock"), lock);
  writeFileSync(join(directory, ".port"), port);
  try {
    expect(() => acquireProjectLock(join(directory, "storymapper.sqlite"), vi.fn())).toThrow("Runtime discovery ownership differs from the dead Project owner; refusing takeover.");
    expect(readFileSync(join(directory, ".lock"), "utf8")).toBe(lock);
    expect(readFileSync(join(directory, ".port"), "utf8")).toBe(port);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
