import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import JSZip from "jszip";
import { loadMigrationAssets } from "@storymapper/db";
import { ZodError } from "zod";
import { ArchiveValidationError, archiveDevelopmentSchemaVersion, migrateArchiveDatabase, validateArchiveSource, createRedactedSnapshot, openExistingStoryMapperDb, prepareImportedDatabase, validateArchiveDatabase, RestoreValidationError, type DatabaseHandle } from "@storymapper/db";
import { DomainError, actorContextSchema, projectArchiveManifestSchema, type ActorContext, type ImportProjectArchiveResponse, type ProjectArchiveExport } from "@storymapper/contracts";

import { APP_VERSION } from "@storymapper/server/app-version";
const DATABASE_FILE_NAME = "storymapper.sqlite";
const PORTABLE_FOLDERS = ["documents", "attachments", "exports"] as const;

export class ProjectArchiveError extends DomainError {
  constructor(message: string, options?: ErrorOptions) {
    super("validation", message);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
interface ArchiveNamespaceEntry { name: string; directory: boolean; }

export async function exportProjectArchive(handle: DatabaseHandle, projectId: string): Promise<ProjectArchiveExport> {
  const projectDir = dirname(handle.current.$client.name);
  const snapshot = handle.exclusive("Project archive export", () => createRedactedSnapshot(handle.current.$client.name, projectId));
  try {
    const zip = new JSZip();
    const namespace = new Map<string, ArchiveNamespaceEntry>();
    const excludedFiles = new Set(snapshot.excludedFiles.map(portableNameKey));
    const supportedSchema = archiveDevelopmentSchemaVersion();
    if (snapshot.schemaVersion !== supportedSchema) throw new ProjectArchiveError(`Unsupported Project schema version ${snapshot.schemaVersion}. Supported versions: ${supportedSchema}.`);
    zip.file(DATABASE_FILE_NAME, readFileSync(snapshot.snapshotPath));
    const includedFolders: string[] = [];
    for (const folder of PORTABLE_FOLDERS) {
      const folderPath = join(projectDir, folder);
      const folderState = lstatSync(folderPath, { throwIfNoEntry: false });
      if (folderState) {
        if (!folderState.isDirectory()) throw new ProjectArchiveError(`Portable folder ${folder} must be a directory without symlinks.`);
        zip.folder(folder);
        registerNamespace(namespace, folder, true);
        addFolderToZip(zip, folderPath, folder, namespace, excludedFiles);
        includedFolders.push(folder);
      }
    }
    const manifest = projectArchiveManifestSchema.parse({
      formatVersion: 1, schemaVersion: snapshot.schemaVersion, exportedAt: new Date().toISOString(), appVersion: APP_VERSION,
      databaseFileName: DATABASE_FILE_NAME, databaseSha256: snapshot.databaseSha256, dataClassification: "business-data",
      redactedTables: snapshot.redactedTables, redactedRowCount: snapshot.redactedRowCount, counts: snapshot.counts, includedFolders
    });
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    return { fileName: `${basename(projectDir)}.zip`, content: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) };
  } finally { rmSync(snapshot.snapshotPath, { force: true }); }
}

export async function importProjectArchive(archive: Buffer, handle: DatabaseHandle, actor: ActorContext, assets: ReturnType<typeof loadMigrationAssets> = loadMigrationAssets()): Promise<ImportProjectArchiveResponse> {
  if (actorContextSchema.parse(actor).actorType !== "human") throw new ProjectArchiveError("Project archive import is human-only.");
  const previous = handle.current;
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true }).catch((error: unknown) => {
    if (error instanceof Error) throw new ProjectArchiveError("Archive could not be read.", { cause: error });
    throw error;
  });
  const manifest = await readManifest(zip);
  if (manifest.formatVersion !== 1) throw new ProjectArchiveError(`Unsupported archive format version ${manifest.formatVersion}. Supported versions: 1.`);
  const namespace = new Map<string, ArchiveNamespaceEntry>();
  for (const entry of Object.values(zip.files)) {
    validateEntry(entry, manifest.includedFolders);
    registerNamespace(namespace, entry.dir ? entry.name.slice(0, -1) : entry.name, entry.dir);
  }
  const databaseEntry = zip.file(DATABASE_FILE_NAME);
  if (!databaseEntry) throw new ProjectArchiveError(`Archive is missing ${DATABASE_FILE_NAME}.`);
  const database = await databaseEntry.async("nodebuffer");
  if (createHash("sha256").update(database).digest("hex") !== manifest.databaseSha256) throw new ProjectArchiveError("Archive database checksum does not match the manifest.");
  const projectRoot = dirname(dirname(previous.$client.name));
  const staging = mkdtempSync(join(projectRoot, ".import-"));
  const localPath = join(projectRoot, `imported-${randomUUID()}.lsm`);
  let published = false;
  try {
    await extractArchive(zip, staging);
    const projectId = prepareArchiveCandidate(handle, staging, localPath, manifest, actor, assets);
    await handle.restore(() => handle.exclusive("Project archive import", () => {
      if (handle.current !== previous) throw new ProjectArchiveError("The open Project changed while the archive was being validated. Retry the import.");
      renameSync(staging, localPath);
      published = true;
      switchDatabase(handle, localPath, assets);
    }));
    return { localPath, projectId, opened: true, manifest };
  } catch (error) {
    if (error instanceof RestoreValidationError || error instanceof ArchiveValidationError) throw new ProjectArchiveError(error.message, { cause: error });
    if (error instanceof ZodError) throw new ProjectArchiveError("Archive database contains invalid business data.", { cause: error });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
    if (published && handle.current === previous) rmSync(localPath, { recursive: true, force: true });
  }
}

function prepareArchiveCandidate(handle: DatabaseHandle, staging: string, localPath: string, manifest: ReturnType<typeof projectArchiveManifestSchema.parse>, actor: ActorContext, assets: ReturnType<typeof loadMigrationAssets>): string {
  const path = join(staging, DATABASE_FILE_NAME);
  validateArchiveSource(path, manifest, assets);
  const release = handle.ownership?.acquire(path);
  try {
    migrateArchiveCandidate(path, assets);
    const projectId = validateArchiveDatabase(path, manifest, assets);
    prepareImportedDatabase(path, localPath, projectId, actor, assets);
    return projectId;
  } finally { release?.(); }
}

function migrateArchiveCandidate(path: string, assets: ReturnType<typeof loadMigrationAssets>): void {
  try { migrateArchiveDatabase(path, assets); }
  catch (error) {
    if (error instanceof DomainError) throw new ProjectArchiveError("Archive candidate migration failed; the current Project and original archive are unchanged. The temporary candidate and its snapshots were removed.", { cause: error });
    throw error;
  }
}

function switchDatabase(handle: DatabaseHandle, localPath: string, assets: ReturnType<typeof loadMigrationAssets>): void {
  const previousPath = handle.current.$client.name;
  const path = join(localPath, DATABASE_FILE_NAME);
  const release = handle.ownership?.acquire(path);
  let candidate: ReturnType<typeof openExistingStoryMapperDb> | undefined;
  try {
    candidate = openExistingStoryMapperDb(path, assets);
    handle.current.$client.pragma("wal_checkpoint(TRUNCATE)");
    handle.current.$client.close();
    handle.current = candidate;
  } catch (error) { candidate?.$client.close(); release?.(); throw error; }
  try { handle.ownership?.releasePrevious(previousPath); }
  catch (error) {
    const failure = new ProjectArchiveError("The new Project was opened, but previous ownership cleanup failed. The runtime is unavailable.", { cause: error });
    handle.markUnavailable(failure.message);
    throw failure;
  }
}

async function extractArchive(zip: JSZip, staging: string): Promise<void> {
  for (const entry of Object.values(zip.files)) {
    const path = join(staging, entry.name);
    if (entry.dir) mkdirSync(path, { recursive: true });
    else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, await entry.async("nodebuffer")); }
  }
}

async function readManifest(zip: JSZip) {
  const entry = zip.file("manifest.json");
  if (!entry) throw new ProjectArchiveError("Archive is missing manifest.json.");
  try { return projectArchiveManifestSchema.parse(JSON.parse(await entry.async("string"))); }
  catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) throw new ProjectArchiveError("Archive manifest is invalid.", { cause: error });
    throw error;
  }
}

function validateEntry(entry: JSZip.JSZipObject, includedFolders: string[]): void {
  const originalName = "unsafeOriginalName" in entry ? entry.unsafeOriginalName : entry.name;
  const name = entry.dir ? entry.name.slice(0, -1) : entry.name;
  const segments = name.split("/");
  const mode = Number(entry.unixPermissions ?? 0);
  if (originalName !== entry.name || !isPortableName(name) || ((mode >>> 12) & 15) === 10) throw new ProjectArchiveError(`Unsafe archive entry: ${entry.name}.`);
  if (name === "manifest.json" || name === DATABASE_FILE_NAME) {
    if (entry.dir) throw new ProjectArchiveError(`Archive entry must be a file: ${entry.name}.`);
    return;
  }
  if (!includedFolders.includes(segments[0]!) || (!entry.dir && segments.length < 2)) throw new ProjectArchiveError(`Unexpected archive entry: ${entry.name}.`);
}

function isPortableName(name: string): boolean {
  return !/[\\\x00-\x1f:*?"<>|]/.test(name) && name.split("/").every((part) =>
    part !== "" && part !== "." && part !== ".." && part !== ".lock" && part !== ".port" &&
    !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

function portableNameKey(name: string): string { return name.normalize("NFC").toLowerCase(); }

function registerNamespace(namespace: Map<string, ArchiveNamespaceEntry>, name: string, directory: boolean): void {
  const segments = name.split("/");
  for (let index = 1; index <= segments.length; index++) {
    const path = segments.slice(0, index).join("/");
    const isDirectory = index < segments.length || directory;
    const key = portableNameKey(path);
    const previous = namespace.get(key);
    if (previous && (previous.name !== path || previous.directory !== isDirectory)) throw new ProjectArchiveError(`Colliding archive entries: ${previous.name} and ${path}.`);
    namespace.set(key, { name: path, directory: isDirectory });
  }
}

function addFolderToZip(zip: JSZip, absoluteFolder: string, zipFolder: string, namespace: Map<string, ArchiveNamespaceEntry>, excludedFiles: Set<string>): void {
  for (const entry of readdirSync(absoluteFolder, { withFileTypes: true })) {
    const absoluteEntry = join(absoluteFolder, entry.name);
    const zipEntry = `${zipFolder}/${entry.name}`;
    if (excludedFiles.has(portableNameKey(zipEntry))) continue;
    if (entry.isSymbolicLink() || !isPortableName(zipEntry)) throw new ProjectArchiveError(`Unsafe portable file: ${zipEntry}.`);
    registerNamespace(namespace, zipEntry, entry.isDirectory());
    if (entry.isDirectory()) { zip.folder(zipEntry); addFolderToZip(zip, absoluteEntry, zipEntry, namespace, excludedFiles); }
    else if (entry.isFile()) zip.file(zipEntry, readFileSync(absoluteEntry));
    else throw new ProjectArchiveError(`Unsupported portable file: ${zipEntry}.`);
  }
}
