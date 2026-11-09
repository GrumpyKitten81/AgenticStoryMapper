import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { DomainError, storeGitHubCredentialResponseSchema, userCredentialFileSchema, type StoreGitHubCredentialRequest, type StoreGitHubCredentialResponse } from "@storymapper/contracts";

export function credentialFilePath(): string {
  if (process.platform !== "win32") return join(homedir(), ".config", "storymapper", "credentials.json");
  const appData = process.env.APPDATA;
  if (!appData || !isAbsolute(appData)) throw new DomainError("validation", "A valid Windows APPDATA directory is required for Agentic Story Mapper credentials.");
  return join(appData, "StoryMapper", "credentials.json");
}

function fileError(location: string, cause: string): DomainError {
  return new DomainError("validation", `Credential file ${location}: ${cause}`);
}

function fileSystemFailure(error: unknown, location: string): never {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string") throw fileError(location, code === "EACCES" || code === "EPERM" ? "access denied; check directory and file permissions." : "filesystem operation failed; check the location and permissions.");
  throw fileError(location, "could not safely access credentials.");
}

async function statIfPresent(path: string): Promise<Stats | undefined> {
  try { return await fs.lstat(path); } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    fileSystemFailure(error, path);
  }
}

async function checkParents(location: string, create: boolean): Promise<boolean> {
  const parent = dirname(resolve(location));
  let current = parse(parent).root;
  for (const segment of relative(current, parent).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    let stat = await statIfPresent(current);
    if (!stat && !create) return false;
    if (!stat) { await fs.mkdir(current, { mode: 0o700 }); stat = await fs.lstat(current); }
    const insideHome = current === resolve(homedir()) || current.startsWith(`${resolve(homedir())}${sep}`);
    if (stat.isSymbolicLink() && !insideHome && process.platform !== "win32") stat = await fs.stat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fileError(location, "parent must be a real directory, without symbolic links.");
    if (process.platform !== "win32" && (stat.mode & 0o022) && (insideHome || !(stat.mode & 0o1000))) throw fileError(location, "parent directory is writable by other users; restrict its permissions.");
    if ((insideHome || current === parent) && process.platform !== "win32" && stat.uid !== process.getuid?.()) throw fileError(location, "credential directory must be owned by the current user.");
  }
  return true;
}

async function checkTarget(location: string): Promise<boolean> {
  const stat = await statIfPresent(location);
  if (!stat) return false;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw fileError(location, "target must be a regular file without symbolic or hard links.");
  if (process.platform !== "win32" && stat.uid !== process.getuid?.()) throw fileError(location, "file must be owned by the current user.");
  return true;
}

export async function readUserGitHubToken(): Promise<string | undefined> {
  const location = credentialFilePath();
  try {
    if (!await checkParents(location, false) || !await checkTarget(location)) return undefined;
    const handle = await fs.open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
    let content: string;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1) throw fileError(location, "target must be a regular file.");
      if (process.platform !== "win32" && (stat.mode & 0o077)) throw fileError(location, "file is accessible by other users; restrict permissions to 0600 or replace it.");
      content = await handle.readFile("utf8");
    } finally { await handle.close(); }
    let data: unknown;
    try { data = JSON.parse(content); } catch { throw fileError(location, "malformed JSON; replace it with valid GitHub token data."); }
    const parsed = userCredentialFileSchema.safeParse(data);
    if (!parsed.success) throw fileError(location, "invalid GitHub token data; replace the file.");
    return parsed.data.github.token;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return fileSystemFailure(error, location);
  }
}

export async function writeUserGitHubToken(input: StoreGitHubCredentialRequest): Promise<StoreGitHubCredentialResponse> {
  const location = credentialFilePath();
  let temporary: string | undefined;
  try {
    await checkParents(location, true);
    await checkTarget(location);
    const candidate = join(dirname(location), `.credentials-${randomUUID()}.tmp`);
    const handle = await fs.open(candidate, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    temporary = candidate;
    try {
      if (process.platform !== "win32") await handle.chmod(0o600);
      await handle.writeFile(JSON.stringify({ github: input }), "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await checkParents(location, false);
    await checkTarget(location);
    await fs.rename(temporary, location);
    temporary = undefined;
    return storeGitHubCredentialResponseSchema.parse({ ok: true, source: "user-file", location });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return fileSystemFailure(error, location);
  } finally {
    if (temporary) {
      try { await fs.unlink(temporary); } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) fileSystemFailure(error, location);
      }
    }
  }
}
