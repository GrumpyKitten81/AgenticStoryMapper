import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface LockRecord { pid: number; processStartTime: string; owner: string }
const PROCESS_START_TIME = new Date(startTime(process.pid)).toISOString();

function readLock(path: string): LockRecord {
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error("Invalid Project ownership metadata; ownership cannot be proved.", { cause: error });
    throw error;
  }
  if (!value || typeof value !== "object" || !("pid" in value) || !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0 || !("processStartTime" in value) || typeof value.processStartTime !== "string" || !Number.isFinite(Date.parse(value.processStartTime)) || !("owner" in value) || typeof value.owner !== "string" || !value.owner) throw new Error("Invalid Project ownership metadata; ownership cannot be proved.");
  return value as LockRecord;
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    if (error instanceof Error && "code" in error && error.code === "EPERM") return true;
    throw error;
  }
}

function startTime(pid: number): number {
  const windows = process.platform === "win32";
  const executable = windows ? "powershell.exe" : "ps";
  const args = windows
    ? ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o')`]
    : ["-p", String(pid), "-o", "lstart="];
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true });
  const observed = typeof result.stdout === "string" ? Date.parse(result.stdout.trim()) : NaN;
  if (result.error || result.status !== 0 || !Number.isFinite(observed)) throw new Error(`Unable to verify process start time for PID ${pid}; refusing ownership takeover.`, { cause: result.error });
  return observed;
}

function isSameProcess(record: LockRecord): boolean {
  return alive(record.pid) && Math.abs(startTime(record.pid) - Date.parse(record.processStartTime)) <= 1_500;
}

function removeClaimMetadata(path: string): void {
  try { unlinkSync(path); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") throw new Error("Project acquisition metadata removal failed; refusing to proceed.", { cause: error });
    throw error;
  }
}

function claimOwnership(directory: string, record: LockRecord): () => void {
  const path = join(directory, ".lock.claim");
  for (;;) {
    const { candidate, metadata } = createClaimCandidate(directory, record);
    try { renameSync(candidate, path); }
    catch (error) {
      removeClaimMetadata(metadata);
      rmdirSync(candidate);
      if (!(error instanceof Error) || !("code" in error) || !["EEXIST", "ENOTEMPTY", "EPERM"].includes(String(error.code))) throw error;
      let files: string[];
      try { files = readdirSync(path); }
      catch (readError) {
        if (readError instanceof Error && "code" in readError && readError.code === "ENOENT") continue;
        throw readError;
      }
      if (files.length === 0) {
        try { rmdirSync(path); }
        catch (removeError) {
          if (removeError instanceof Error && "code" in removeError && ["ENOENT", "ENOTEMPTY"].includes(String(removeError.code))) continue;
          throw removeError;
        }
        continue;
      }
      if (files.length !== 1 || !/^[a-f0-9-]{36}$/.test(files[0]!)) throw new Error("Invalid Project acquisition metadata; ownership cannot be proved.");
      const previousMetadata = join(path, files[0]!);
      let previous: LockRecord;
      try { previous = readLock(previousMetadata); }
      catch (readError) {
        if (readError instanceof Error && "code" in readError && readError.code === "ENOENT") continue;
        throw readError;
      }
      if (previous.owner !== files[0]) throw new Error("Invalid Project acquisition owner identity.");
      if (isSameProcess(previous)) throw new Error(`Project acquisition is owned by PID ${previous.pid}, process start time ${previous.processStartTime}.`);
      try { removeClaimMetadata(previousMetadata); }
      catch (unlinkError) {
        if (unlinkError instanceof Error && "code" in unlinkError && unlinkError.code === "ENOENT") continue;
        throw unlinkError;
      }
      try { rmdirSync(path); }
      catch (removeError) {
        if (removeError instanceof Error && "code" in removeError && ["ENOENT", "ENOTEMPTY"].includes(String(removeError.code))) continue;
        throw removeError;
      }
      continue;
    }
    return claimRelease(path, record);
  }
}

export function acquireProjectLock(databasePath: string, logTakeover: (record: LockRecord) => void): () => void {
  const directory = dirname(resolve(databasePath));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, ".lock");
  const record: LockRecord = { pid: process.pid, processStartTime: PROCESS_START_TIME, owner: randomUUID() };
  const releaseClaim = claimOwnership(directory, record);
  try {
    let previous: LockRecord | undefined;
    try { previous = readLock(path); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
    if (previous) {
      if (isSameProcess(previous)) throw new Error(`Project is owned by PID ${previous.pid}, process start time ${previous.processStartTime}.`);
      const portPath = join(directory, ".port");
      try {
        const port = JSON.parse(readFileSync(portPath, "utf8")) as { owner?: unknown };
        if (port?.owner !== previous.owner) throw new Error("Runtime discovery ownership differs from the dead Project owner; refusing takeover.");
        unlinkSync(portPath);
      } catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
      unlinkSync(path);
    }
    writeFileSync(path, JSON.stringify(record), { flag: "wx" });
    if (previous) {
      try { logTakeover(previous); }
      catch (error) { unlinkSync(path); throw error; }
    }
  } finally { releaseClaim(); }
  return () => {
    const releaseCleanupClaim = claimOwnership(directory, record);
    try {
      const current = readLock(path);
      if (current.owner !== record.owner) throw new Error("Project ownership changed; refusing to remove another runtime's lock.");
      unlinkSync(path);
    } finally { releaseCleanupClaim(); }
  };
}

export class ProjectOwnership {
  readonly #locks = new Map<string, () => void>();
  readonly #startup: string;
  readonly owner: string;
  constructor(databasePath: string, readonly logTakeover: (record: LockRecord) => void) {
    this.#startup = dirname(resolve(databasePath));
    this.acquire(databasePath);
    this.owner = readLock(join(this.#startup, ".lock")).owner;
  }
  acquire(databasePath: string): () => void {
    const directory = dirname(resolve(databasePath));
    if (this.#locks.has(directory)) throw new Error("This runtime already owns the Project directory.");
    const release = acquireProjectLock(databasePath, this.logTakeover);
    this.#locks.set(directory, release);
    return () => { release(); this.#locks.delete(directory); };
  }
  releasePrevious(databasePath: string): void {
    const directory = dirname(resolve(databasePath));
    if (directory === this.#startup) return;
    this.#locks.get(directory)?.();
    this.#locks.delete(directory);
  }
  close(): void {
    const errors: unknown[] = [];
    for (const release of this.#locks.values()) { try { release(); } catch (error) { errors.push(error); } }
    this.#locks.clear();
    if (errors.length) throw new AggregateError(errors, "Project ownership cleanup failed.");
  }
}

function createClaimCandidate(directory: string, record: LockRecord): { candidate: string; metadata: string } {
    const candidate = join(directory, `.lock.claim-${record.owner}`);
    mkdirSync(candidate);
    const metadata = join(candidate, record.owner);
    try { writeFileSync(metadata, JSON.stringify(record), { flag: "wx" }); }
    catch (error) {
      try { unlinkSync(metadata); }
      catch (cleanupError) {
        if (!(cleanupError instanceof Error) || !("code" in cleanupError) || cleanupError.code !== "ENOENT") throw cleanupError;
      }
      rmdirSync(candidate);
      throw error;
    }
  return { candidate, metadata };
}

function claimRelease(path: string, record: LockRecord): () => void {
  const ownedMetadata = join(path, record.owner);
  return () => {
      removeClaimMetadata(ownedMetadata);
      try { rmdirSync(path); }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error) || !["ENOENT", "ENOTEMPTY"].includes(String(error.code))) throw error;
      }
    };
}
