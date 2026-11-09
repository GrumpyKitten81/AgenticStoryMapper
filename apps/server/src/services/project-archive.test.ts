import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import type { ImportProjectArchiveResponse, Card } from "@storymapper/contracts";
import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync as readDirectory, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, openStoryMapperDb, openExistingStoryMapperDb, redactedTables, redactedActivityEntityTypes, listRestorePoints } from "@storymapper/db";
import { loadTestMigrationAssets } from "@storymapper/db/test-fixtures/migration-assets";
import { currentReleaseSchemaVersion, loadMigrationAssets, releaseSchemaVersion } from "@storymapper/db/migration-assets";
import { archiveBusinessRows, archiveDemoSecrets, populateArchiveDemo } from "@storymapper/db/fixtures/archive-demo";
import { importProjectArchiveResponseSchema, projectArchiveManifestSchema } from "@storymapper/contracts";
import { createRoutes } from "@storymapper/server/http/routes";
import { exportProjectArchive, importProjectArchive } from "@storymapper/server/services/project-archive";
import { ProjectOwnership } from "@storymapper/server/config/project-lock";
import { comparePlanStates } from "@storymapper/server/application/report/plan-state.use-cases";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

vi.mock("@storymapper/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storymapper/db")>();
  return { ...actual, openExistingStoryMapperDb: vi.fn(actual.openExistingStoryMapperDb) };
});

const actor = { actorType: "human", actorId: "archive-demo" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { vi.mocked(randomUUID).mockReset(); vi.mocked(randomUUID).mockImplementation((await vi.importActual<typeof import("node:crypto")>("node:crypto")).randomUUID); vi.mocked(readDirectory).mockReset(); vi.mocked(readDirectory).mockImplementation((await vi.importActual<typeof import("node:fs")>("node:fs")).readdirSync); vi.mocked(openExistingStoryMapperDb).mockReset(); vi.mocked(openExistingStoryMapperDb).mockImplementation((await vi.importActual<typeof import("@storymapper/db")>("@storymapper/db")).openExistingStoryMapperDb); for (const close of cleanup.splice(0).reverse()) await close(); });

function fixture(name = "Portable demo", owned = false) {
  const root = mkdtempSync(join(tmpdir(), "storymapper-archive-http-"));
  const directory = join(root, "demo.lsm");
  const path = join(directory, "storymapper.sqlite");
  const ownership = owned ? new ProjectOwnership(path, () => { throw new Error("Unexpected dead owner"); }) : undefined;
  const handle = new DatabaseHandle(openStoryMapperDb(path), ownership);
  const repository = new StoryMapperRepository(handle);
  const work = new UnitOfWork(handle);
  const project = work.run(actor, ({ repository }) => repository.createProjectWithGettingStarted({ name }));
  work.run(actor, ({ repository }) => initializeSampleFixture(repository, project.id));
  let server: FastifyInstance | undefined;
  cleanup.push(async () => { await server?.close(); if (handle.current.$client.open) handle.current.$client.close(); ownership?.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, directory, path, handle, repository, work, project, async server() {
    server = Fastify();
    await server.register(multipart);
    await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork: work, databasePath: path });
    return server;
  } };
}

async function changedArchive(content: Buffer, change: (zip: JSZip, manifest: Record<string, unknown>) => void): Promise<Buffer> {
  const zip = await JSZip.loadAsync(content);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as Record<string, unknown>;
  change(zip, manifest);
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

function upload(content: Buffer) {
  const boundary = "storymapper-archive-fixture";
  return { method: "POST" as const, url: "/api/projects/import", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="demo.zip"\r\nContent-Type: application/zip\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]) };
}

it("exports package-derived versions, portable files and one Project; hot-switches the API and routes further exports to that folder", async () => {
  const source = fixture();
  for (const folder of ["documents", "attachments", "exports", "snapshots", "logs"]) { mkdirSync(join(source.directory, folder)); writeFileSync(join(source.directory, folder, "demo.txt"), `${folder} demo`); }
  writeFileSync(join(source.directory, ".lock"), "excluded");
  writeFileSync(join(source.directory, ".port"), "excluded");
  const card = source.repository.getStoryMapSnapshot(source.repository.listStoryMaps(source.project.id)[0]!.id)!.cards[0]!;
  source.work.run(actor, ({ repository }) => {
    repository.createCardAttachment(card.id, { label: "Portable attachment", filePath: join(source.directory, "attachments", "demo.txt") });
    const content = "documents demo";
    const imported = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: source.project.id, title: "Demo source", type: "txt", content, fileHash: createHash("sha256").update(content).digest("hex"), filePath: join(source.directory, "documents", "demo.txt") });
    repository.createCardSourceLink(card.id, { kind: "chunk", chunkId: imported.chunks[0]!.id });
  });
  populateArchiveDemo(source.work, source.project.id, card.storyMapId, card.id);
  const business = archiveBusinessRows(source.handle.current);
  const businessActivity = source.repository.listActivity(source.project.id)
    .map((event) => {
      const { before, after, ...metadata } = event;
      return redactedActivityEntityTypes.some((type) => type === event.affectedEntityType) || [before, after].some((value) => value !== null && typeof value === "object" && ("kind" in value && value.kind === "github" || "system" in value && value.system === "github")) ? metadata : event;
    });
  const { before: _planBefore, after: planPayload, ...planActivityMetadata } = source.repository.listActivity(source.project.id).find((event) => event.affectedEntityType === "remotePushPlan")!;
  expect(planPayload).toMatchObject({ selection: { cardIds: [card.id] }, connectionId: expect.any(String), remoteEvidence: expect.any(Object) });
  for (const table of redactedTables) expect(source.handle.current.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 1 });
  source.work.run(actor, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Excluded demo" }));
  const exported = await exportProjectArchive(source.handle, source.project.id);
  const zip = await JSZip.loadAsync(exported.content);
  const manifest = projectArchiveManifestSchema.parse(JSON.parse(await zip.file("manifest.json")!.async("string")));
  expect(manifest).toMatchObject({ formatVersion: 1, appVersion: JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")).version, counts: { projects: 1 }, redactedTables: [...redactedTables], includedFolders: ["documents", "attachments", "exports"] });
  for (const entry of Object.values(zip.files).filter((entry) => !entry.dir)) {
    const bytes = await entry.async("nodebuffer");
    for (const secret of archiveDemoSecrets) expect(bytes.includes(Buffer.from(secret)), `${entry.name}: ${secret}`).toBe(false);
  }
  expect(manifest.schemaVersion).toMatch(/^release-sha256-[a-f0-9]{64}$/);
  expect(Object.keys(zip.files)).not.toEqual(expect.arrayContaining(["snapshots/", "logs/", ".lock", ".port"]));
  const target = fixture("Previously open demo");
  const server = await target.server();
  const response = await server.inject(upload(exported.content));
  expect(response.statusCode).toBe(200);
  const result = importProjectArchiveResponseSchema.parse(response.json());
  await exerciseExportsPackageDerivedVersionsPortableFilesAndOneProject(result, source, server, target, business, businessActivity, planActivityMetadata, card);
  const capabilities = (await server.inject("/api/human/project-archive-capabilities")).json().capabilities;
  expect(capabilities).toEqual([{ name: "project-archive.export", audience: "human", mcp: false }, { name: "project-archive.import", audience: "human", mcp: false }]);
  expect((await server.inject("/api/mcp/tools")).json().tools.some((tool: { name: string }) => /archive/i.test(tool.name) && /project/i.test(tool.name))).toBe(false);
});

it("preserves UUID-like Project IDs through HTTP export, import, re-export and second import", async () => {
  const guid = "00000000-0000-0000-0000-000000000001";
  const source = fixture();
  vi.mocked(randomUUID).mockReturnValueOnce(randomUUID()).mockReturnValueOnce(guid);
  const project = source.work.run(actor, ({ repository }) => repository.createProjectWithGettingStarted({ name: source.project.name }));
  expect(project.id).toBe(guid);
  const exported = await (await source.server()).inject(`/api/projects/export?projectId=${guid}`);
  expect(exported.statusCode).toBe(200);
  const target = fixture();
  const server = await target.server();
  const imported = await server.inject(upload(exported.rawPayload));
  expect(imported.statusCode).toBe(200);
  expect(importProjectArchiveResponseSchema.parse(imported.json()).projectId).toBe(guid);
  expect(target.repository.listProjects()[0]?.id).toBe(guid);
  const reexported = await server.inject(`/api/projects/export?projectId=${guid}`);
  expect(reexported.statusCode).toBe(200);
  const second = fixture();
  const importedAgain = await (await second.server()).inject(upload(reexported.rawPayload));
  expect(importedAgain.statusCode).toBe(200);
  expect(importProjectArchiveResponseSchema.parse(importedAgain.json()).projectId).toBe(guid);
  expect(second.repository.listProjects()[0]?.id).toBe(guid);
});

it("preserves scoped immutable Plan states through actual archive export, import, reopen and comparison", async () => {
  const source = fixture();
  const cut = source.work.run(actor, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: source.project.id, name: "Recorded archive map" });
    const release = repository.createRelease({ storyMapId: map.id, name: "Captured Release" });
    const moved = repository.createCard({ storyMapId: map.id, level: "story", title: "Moved Story", releaseId: release.id });
    const removed = repository.createCard({ storyMapId: map.id, level: "story", title: "Removed Story", releaseId: release.id });
    const before = repository.capturePlanState(map.id);
    repository.updateCard(moved.id, { releaseId: null, title: "After Story" });
    repository.deleteCard(removed.id, { strategy: "unassign" });
    const added = repository.createCard({ storyMapId: map.id, level: "story", title: "Added Story" });
    const after = repository.capturePlanState(map.id);
    repository.updateRelease(release.id, { name: "Today's Release" });
    const excluded = repository.createProject({ name: "Excluded captured Project" });
    const excludedMap = repository.createStoryMap({ projectId: excluded.id, name: "Excluded map" });
    const excludedState = repository.capturePlanState(excludedMap.id);
    return { map, release, moved, removed, added, before, after, excludedState };
  });
  const exported = await (await source.server()).inject(`/api/projects/export?projectId=${source.project.id}`);
  expect(exported.statusCode).toBe(200);
  const target = fixture("Prior Plan Project");
  const imported = await (await target.server()).inject(upload(exported.rawPayload));
  expect(imported.statusCode).toBe(200);
  const result = importProjectArchiveResponseSchema.parse(imported.json());
  const reopened = openExistingStoryMapperDb(join(result.localPath, "storymapper.sqlite"));
  try {
    const handle = new DatabaseHandle(reopened);
    const repository = new StoryMapperRepository(handle);
    expect(repository.getPlanState(cut.map.id, cut.before.id)).toEqual(cut.before);
    expect(repository.getPlanState(cut.map.id, cut.after.id)).toEqual(cut.after);
    expect(reopened.$client.prepare("SELECT id FROM plan_states ORDER BY id").all()).toEqual([cut.before.id, cut.after.id].sort().map((id) => ({ id })));
    expect(reopened.$client.prepare("SELECT id FROM plan_states WHERE id = ?").get(cut.excludedState.id)).toBeUndefined();
    const compared = comparePlanStates({ repository, unitOfWork: new UnitOfWork(handle) }, actor, cut.map.id, cut.before.id, cut.after.id);
    expect(compared).toMatchObject({ before: cut.before, after: cut.after, changes: expect.arrayContaining([
      { cardId: cut.moved.id, kind: "moved", beforeReleaseId: cut.release.id, afterReleaseId: null },
      { cardId: cut.removed.id, kind: "removed", beforeReleaseId: cut.release.id, afterReleaseId: null },
      { cardId: cut.added.id, kind: "added", beforeReleaseId: null, afterReleaseId: null }
    ]) });
    expect(compared.changes).toHaveLength(3);
    expect(compared.before.payload.releases[0]?.name).toBe("Captured Release");
    expect(repository.getCard(cut.moved.id)?.title).toBe("After Story");
  } finally { reopened.$client.close(); }
});

it.each([
  ["manifest", (zip: JSZip, manifest: Record<string, unknown>) => { delete manifest.schemaVersion; }, /Archive manifest is invalid/],
  ["format", (zip: JSZip, manifest: Record<string, unknown>) => { manifest.formatVersion = 99; }, /Supported versions: 1/],
  ["schema", (zip: JSZip, manifest: Record<string, unknown>) => { manifest.schemaVersion = "future-schema"; }, /release schema/],
  ["checksum", (zip: JSZip, manifest: Record<string, unknown>) => { manifest.databaseSha256 = "0".repeat(64); }, /checksum/],
  ["SQLite", (zip: JSZip, manifest: Record<string, unknown>) => { const bytes = Buffer.from("damaged SQLite"); zip.file("storymapper.sqlite", bytes); manifest.databaseSha256 = createHash("sha256").update(bytes).digest("hex"); }, /database/],
  ["runtime file", (zip: JSZip) => { zip.file("logs/unsafe.txt", "refused"); }, /Unexpected archive entry/],
  ["traversal", (zip: JSZip) => { zip.file("../escaped.txt", "refused"); }, /Unsafe archive entry/],
  ["Windows traversal", (zip: JSZip) => { zip.file("attachments/..\\escaped.txt", "refused"); }, /Unsafe archive entry/],
  ["symlink", (zip: JSZip) => { zip.file("attachments/escape", "../../outside", { unixPermissions: 0o120777 }); }, /Unsafe archive entry/],
  ["case collision", (zip: JSZip) => { zip.file("attachments/Collision.txt", "first"); zip.file("attachments/collision.txt", "second"); }, /Colliding archive entries/],
  ["Unicode collision", (zip: JSZip) => { zip.file("attachments/caf\u00e9.txt", "first"); zip.file("attachments/cafe\u0301.txt", "second"); }, /Colliding archive entries/],
  ["file/directory collision", (zip: JSZip) => { zip.file("attachments/collision", "file"); zip.file("attachments/collision/child.txt", "child"); }, /Colliding archive entries/]
])("rejects %s before publication without changing the old Project", async (_name, change, diagnostic) => {
  const source = fixture();
  mkdirSync(join(source.directory, "attachments"));
  const content = (await exportProjectArchive(source.handle, source.project.id)).content;
  const archive = await changedArchive(content, change);
  const target = fixture("Unchanged demo");
  const previous = target.handle.current;
  const server = await target.server();
  const response = await server.inject(upload(archive));
  expect(response.statusCode).toBe(400);
  expect(response.json().code).toBe("validation");
  expect(response.json().message).toMatch(diagnostic);
  if (_name === "SQLite") expect(response.json().message).toBe("Archive database is not a valid SQLite database.");
  expect(target.handle.current).toBe(previous);
  expect(target.repository.listProjects().map((project) => project.name)).toEqual(["Unchanged demo"]);
  expect(readdirSync(target.root)).toEqual(["demo.lsm"]);
});

it("drains admitted work before opening the import and rejects new API work while draining", async () => {
  const source = fixture();
  const target = fixture("Old drain demo");
  const server = await target.server();
  const previous = target.handle.current;
  expect(target.handle.enterRequest()).toBe(true);
  const importing = importProjectArchive((await exportProjectArchive(source.handle, source.project.id)).content, target.handle, actor);
  await new Promise<void>((resolve) => {
    const poll = () => { if (target.handle.restoring) resolve(); else setImmediate(poll); };
    poll();
  });
  expect(target.handle.current).toBe(previous);
  expect((await server.inject("/api/projects")).statusCode).toBe(503);
  target.handle.leaveRequest();
  await importing;
  expect(target.handle.current).not.toBe(previous);
  expect(previous.$client.open).toBe(false);
  expect(target.repository.listProjects()[0]?.id).toBe(source.project.id);
});

it.each([false, true])("refuses portable directory links (dangling: %s) and malformed archives without publishing partial data", async (dangling) => {
  const data = fixture();
  const linkedDirectory = join(data.root, "linked");
  mkdirSync(linkedDirectory);
  symlinkSync(linkedDirectory, join(data.directory, "attachments"), process.platform === "win32" ? "junction" : "dir");
  if (dangling) rmSync(linkedDirectory, { recursive: true });
  await expect(exportProjectArchive(data.handle, data.project.id)).rejects.toThrow("without symlinks");
  expect(readdirSync(data.directory).some((name) => name.startsWith("snapshot-"))).toBe(false);
  await expect(importProjectArchive(Buffer.from("not a ZIP"), data.handle, actor)).rejects.toThrow("could not be read");
  expect(readdirSync(data.root).sort()).toEqual(dangling ? ["demo.lsm"] : ["demo.lsm", "linked"]);
});

it.each(["foreign-key", "schema"])("rejects actual %s corruption even with a matching archive checksum", async (damage) => {
  const source = fixture();
  const zip = await JSZip.loadAsync((await exportProjectArchive(source.handle, source.project.id)).content);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  const path = join(source.root, "damaged.sqlite");
  writeFileSync(path, await zip.file("storymapper.sqlite")!.async("nodebuffer"));
  const changed = openStoryMapperDb(path);
  try {
    if (damage === "foreign-key") {
      changed.$client.pragma("foreign_keys = OFF");
      changed.$client.prepare("UPDATE cards SET story_map_id = 'missing-demo-map'").run();
    } else changed.$client.exec("CREATE TABLE future_schema_fixture (value TEXT)");
    changed.$client.pragma("wal_checkpoint(TRUNCATE)");
  } finally { changed.$client.close(); }
  const bytes = readFileSync(path);
  manifest.databaseSha256 = createHash("sha256").update(bytes).digest("hex");
  zip.file("storymapper.sqlite", bytes);
  zip.file("manifest.json", JSON.stringify(manifest));
  const target = fixture("Unchanged integrity demo");
  const previous = target.handle.current;
  await expect(importProjectArchive(await zip.generateAsync({ type: "nodebuffer" }), target.handle, actor)).rejects.toThrow(damage === "foreign-key" ? "foreign keys" : "schema");
  expect(target.handle.current).toBe(previous);
  expect(readdirSync(target.root)).toEqual(["demo.lsm"]);
});

it("removes a published candidate when reopen fails and leaves the old holder usable", async () => {
  const source = fixture();
  const target = fixture("Unchanged reopen demo", true);
  const previous = target.handle.current;
  vi.mocked(openExistingStoryMapperDb).mockImplementationOnce(() => { throw new Error("Candidate reopen failed"); });
  await expect(importProjectArchive((await exportProjectArchive(source.handle, source.project.id)).content, target.handle, actor)).rejects.toThrow("Candidate reopen failed");
  expect(target.handle.current).toBe(previous);
  expect(previous.$client.open).toBe(true);
  expect(readFileSync(join(target.directory, ".lock"), "utf8")).toContain(`"pid":${process.pid}`);
  expect(target.repository.listProjects()[0]?.name).toBe("Unchanged reopen demo");
  expect(readdirSync(target.root)).toEqual(["demo.lsm"]);
});

async function exerciseExportsPackageDerivedVersionsPortableFilesAndOneProject(result: ImportProjectArchiveResponse, source: ReturnType<typeof fixture>, server: FastifyInstance, target: ReturnType<typeof fixture>, business: Record<string, unknown[]>, businessActivity: { id: string; projectId: string | null; actor: string; actorType: "system" | "github" | "human" | "agent"; action: string; createdAt: string; seq?: number | undefined; undoneByRestore?: boolean | undefined; originClientId?: string | undefined; mcpSessionId?: string | undefined; affectedEntityType?: string | undefined; affectedEntityId?: string | undefined; externalCallId?: string | undefined; }[], planActivityMetadata: { id: string; projectId: string | null; actor: string; actorType: "system" | "github" | "human" | "agent"; action: string; createdAt: string; seq?: number | undefined; undoneByRestore?: boolean | undefined; originClientId?: string | undefined; mcpSessionId?: string | undefined; affectedEntityType?: string | undefined; affectedEntityId?: string | undefined; externalCallId?: string | undefined; }, card: Card) {
  expect(result).toMatchObject({ projectId: source.project.id, opened: true });
  expect((await server.inject("/api/projects")).json().projects.map((project: { name: string; }) => project.name)).toEqual(["Portable demo"]);
  expect((await server.inject("/health")).json().databasePath).toBe(join(result.localPath, "storymapper.sqlite"));
  expect(archiveBusinessRows(target.handle.current)).toEqual(business);
  for (const event of businessActivity) expect(target.repository.listActivity(source.project.id)).toContainEqual(event);
  const reviewEvent = target.repository.listActivity(source.project.id).find((event) => event.action === "cardReview.request");
  expect(reviewEvent).toMatchObject({ affectedEntityType: "cardReview", actor: "archive-review-fixture", actorType: "human" });
  expect(reviewEvent).not.toHaveProperty("before");
  expect(reviewEvent).not.toHaveProperty("after");
  expect(target.repository.listActivity(source.project.id)).toContainEqual(planActivityMetadata);
  for (const table of redactedTables) expect(target.handle.current.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
  expect(target.repository.getStoryMapSnapshot(card.storyMapId)?.sourceLinks).toHaveLength(2);
  expect(target.handle.current.$client.prepare("SELECT file_path FROM source_documents WHERE file_path LIKE 'inline://%'").all()).toEqual([{ file_path: "inline://portable-demo" }]);
  expect(target.repository.listCardHistoryPage(card.id, { limit: 20 }).versions.length).toBeGreaterThan(0);
  expect(target.repository.listCardAttachments(card.id)[0]?.filePath).toBe(join(result.localPath, "attachments", "demo.txt"));
  expect(target.repository.listActivity(source.project.id).some((event) => event.action === "project.archiveImported" && event.actorType === "human")).toBe(true);
  const again = await server.inject(`/api/projects/export?projectId=${source.project.id}`);
  expect(again.statusCode).toBe(200);
  expect(again.headers["content-disposition"]).toContain("imported-");
  expect(readFileSync(join(result.localPath, "exports", "demo.txt"), "utf8")).toBe("exports demo");
}

async function mutateDatabaseArchive(source: ReturnType<typeof fixture>, mutate: (database: ReturnType<typeof openStoryMapperDb>, manifest: ReturnType<typeof projectArchiveManifestSchema.parse>) => void): Promise<Buffer> {
  const zip = await JSZip.loadAsync((await exportProjectArchive(source.handle, source.project.id)).content);
  const manifest = projectArchiveManifestSchema.parse(JSON.parse(await zip.file("manifest.json")!.async("string")));
  const path = join(source.root, `mutation-${randomUUID()}.sqlite`);
  writeFileSync(path, await zip.file("storymapper.sqlite")!.async("nodebuffer"));
  const database = openStoryMapperDb(path);
  try { mutate(database, manifest); database.$client.pragma("wal_checkpoint(TRUNCATE)"); }
  finally { database.$client.close(); }
  const bytes = readFileSync(path);
  manifest.databaseSha256 = createHash("sha256").update(bytes).digest("hex");
  zip.file("storymapper.sqlite", bytes);
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function expectImportRefusal(archive: Buffer, diagnostic: RegExp, target = fixture("Unchanged refusal demo")): Promise<void> {
  const previousFile = join(target.directory, "previous-demo.txt");
  writeFileSync(previousFile, "Unchanged prior portable file");
  const previous = target.handle.current;
  const folders = readdirSync(target.root);
  const oldRows = previous.$client.prepare("SELECT * FROM projects").all();
  const oldTemplates = target.repository.listAiTemplates(target.project.id);
  const server = await target.server();
  const response = await server.inject(upload(archive));
  expect(response.statusCode).toBe(400);
  expect(response.json().code).toBe("validation");
  expect(response.json().message).toMatch(diagnostic);
  expect(target.handle.current).toBe(previous);
  expect(previous.$client.prepare("SELECT * FROM projects").all()).toEqual(oldRows);
  expect(target.repository.listAiTemplates(target.project.id)).toEqual(oldTemplates);
  expect(readFileSync(previousFile, "utf8")).toBe("Unchanged prior portable file");
  expect(readdirSync(target.root)).toEqual(folders);
}

it.each(["invalid Project ID", "missing settings", "self parent", "missing parent", "cross-map parent", "cyclic parents", "invalid parent level", "inline attachment", "Sync table", "Sync activity"])("refuses valid-schema archives with %s without changing the old runtime or folders", async (damage) => {
  const source = fixture();
  const card = source.repository.getStoryMapSnapshot(source.repository.listStoryMaps(source.project.id)[0]!.id)!.cards.find((card) => card.level === "activity")!;
  const secondMap = source.work.run(actor, ({ repository }) => repository.createStoryMap({ projectId: source.project.id, name: "Second demo map" }));
  const secondCard = source.work.run(actor, ({ repository }) => repository.createCard({ storyMapId: secondMap.id, level: "activity", title: "Second demo parent" }));
  const archive = await mutateDatabaseArchive(source, (database) => {
    const client = database.$client;
    if (damage === "invalid Project ID") {
      client.pragma("foreign_keys = OFF");
      for (const table of ["projects", "project_settings", "story_maps", "product_contexts", "personas", "workflow_statuses", "annotations", "story_templates", "ai_function_templates", "roadmaps", "source_documents", "connector_connections", "sync_runs", "change_sets", "activity_events"]) client.prepare(`UPDATE ${table} SET ${table === "projects" ? "id" : "project_id"} = 'invalid-demo-root' WHERE ${table === "projects" ? "id" : "project_id"} = ?`).run(source.project.id);
    } else if (damage === "missing settings") client.prepare("DELETE FROM project_settings").run();
    else if (damage === "inline attachment") client.prepare("INSERT INTO card_attachments (id, card_id, label, file_path, created_at) VALUES (?, ?, 'Invalid inline demo', 'inline://missing-demo', ?)").run(randomUUID(), card.id, new Date().toISOString());
    else if (damage === "Sync table") client.prepare("INSERT INTO connector_connections (id, project_id, provider, name, auth_mode, owner, created_at, updated_at) VALUES (?, ?, 'github', 'Unredacted connection', 'token', 'demo', ?, ?)").run(randomUUID(), source.project.id, new Date().toISOString(), new Date().toISOString());
    else if (damage === "Sync activity") client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, affected_entity_type, after_json, created_at, after_schema_version) VALUES (?, ?, 'demo', 'human', 'connectorConnection.created', 'connectorConnection', ?, ?, 1)").run(randomUUID(), source.project.id, JSON.stringify({ secret: "fixture-only-unredacted-demo" }), new Date().toISOString());
    else if (damage === "missing parent") client.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(randomUUID(), card.id);
    else if (damage === "cross-map parent") client.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(secondCard.id, card.id);
    else if (damage === "cyclic parents") {
      const step = source.repository.getStoryMapSnapshot(card.storyMapId)!.cards.find((card) => card.level === "step")!;
      client.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(step.id, card.id);
      client.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(card.id, step.id);
    } else client.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(card.id, damage === "self parent" ? card.id : source.repository.getStoryMapSnapshot(card.storyMapId)!.cards.find((card) => card.level === "story")!.id);
  });
  const diagnostic = damage === "invalid Project ID" ? /Project ID.*UUID/ : damage === "missing settings" ? /project_settings/ : damage === "inline attachment" ? /nonportable file reference/ : damage === "Sync table" ? /unredacted Sync table/ : damage === "Sync activity" ? /unredacted Sync activity/ : /invalid Card hierarchy/;
  await expectImportRefusal(archive, diagnostic);
});

it.each([
  ["arguments_json", "{"],
  ["examples_json", "["],
  ["arguments_json", JSON.stringify([{ name: "storyMapId", required: true }])],
  ["arguments_json", JSON.stringify([{ name: "evidence" }, { name: "evidence" }])],
  ["arguments_json", JSON.stringify([{ name: "evidence", required: "yes" }])],
  ["examples_json", JSON.stringify([42])],
  ["instructions", ""],
  ["id", "invalid prompt id"]
])("refuses invalid persisted template %s (%s) before switching runtime", async (column, value) => {
  const source = fixture();
  const template = source.repository.listAiTemplates(source.project.id)[0]!;
  const archive = await mutateDatabaseArchive(source, (database) => {
    database.$client.prepare(`UPDATE ai_function_templates SET ${column} = ? WHERE project_id = ? AND id = ?`).run(value, source.project.id, template.id);
  });
  await expectImportRefusal(archive, /[Ii]nvalid.*(AI template|ai_function_templates|JSON)/);
});

it("preserves edited template guidance and deleted defaults across HTTP archives and reopen", async () => {
  const source = fixture();
  const templates = source.repository.listAiTemplates(source.project.id);
  const deleted = templates[0]!.id;
  const edited = source.work.run(actor, ({ repository }) => {
    repository.deleteAiTemplate(source.project.id, deleted);
    return repository.updateAiTemplate(source.project.id, templates[1]!.id, {
      name: "Archive prompt", instructions: "Inspect the supplied evidence.\nPropose a ChangeSet.",
      arguments: [{ name: "evidence", description: "Quoted source evidence", required: true }, { name: "goal", required: false }],
      examples: ['Evidence: "source"\nGoal: clarify', "Another example"], outputSchemaName: "ChangeSet"
    });
  });
  const target = fixture("Prior template Project");
  const server = await target.server();
  const exported = await (await source.server()).inject(`/api/projects/export?projectId=${source.project.id}`);
  expect(exported.statusCode).toBe(200);
  const imported = await server.inject(upload(exported.rawPayload));
  expect(imported.statusCode).toBe(200);
  const result = importProjectArchiveResponseSchema.parse(imported.json());
  expect(target.repository.getAiTemplate(source.project.id, edited.id)).toEqual(edited);
  expect(target.repository.getAiTemplate(source.project.id, deleted)).toBeUndefined();
  const reopened = openExistingStoryMapperDb(join(result.localPath, "storymapper.sqlite"));
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(repository.getAiTemplate(source.project.id, edited.id)).toEqual(edited);
    expect(repository.getAiTemplate(source.project.id, deleted)).toBeUndefined();
    expect(repository.listAiTemplates(source.project.id)).toHaveLength(templates.length - 1);
  } finally { reopened.$client.close(); }
});

it.each(["documents", "attachments"])("refuses missing referenced %s entries while keeping the prior runtime and folder contents", async (folder) => {
  const source = fixture();
  mkdirSync(join(source.directory, folder));
  writeFileSync(join(source.directory, folder, "referenced-demo.txt"), "Portable demo file");
  source.work.run(actor, ({ repository }) => {
    if (folder === "documents") {
      const content = "Portable demo file";
      repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: source.project.id, title: "Referenced demo", type: "txt", content, fileHash: createHash("sha256").update(content).digest("hex"), filePath: join(source.directory, folder, "referenced-demo.txt") });
    }
    else repository.createCardAttachment(source.repository.getStoryMapSnapshot(source.repository.listStoryMaps(source.project.id)[0]!.id)!.cards[0]!.id, { label: "Referenced demo", filePath: join(source.directory, folder, "referenced-demo.txt") });
  });
  const archive = await changedArchive((await exportProjectArchive(source.handle, source.project.id)).content, (zip) => { zip.remove(`${folder}/referenced-demo.txt`); });
  await expectImportRefusal(archive, /missing a portable file/);
});

it("does not let extra live schema authorize an unsupported archive", async () => {
  const source = fixture();
  const target = fixture();
  const archive = await mutateDatabaseArchive(source, (database, manifest) => {
    database.$client.exec("CREATE TABLE extra_live_schema (value TEXT)");
    expect(manifest.schemaVersion).toMatch(/^release-sha256-/);
  });
  target.handle.current.$client.exec("CREATE TABLE extra_live_schema (value TEXT)");
  await expectImportRefusal(archive, /schema/, target);
});

it("creates a fresh runtime epoch for each repeated import of the same exported Project", async () => {
  const source = fixture();
  const originalEpoch = (source.handle.current.$client.prepare("SELECT epoch FROM project_settings").get() as { epoch: string }).epoch;
  const archive = (await exportProjectArchive(source.handle, source.project.id)).content;
  const zip = await JSZip.loadAsync(archive);
  const exportedPath = join(source.root, "exported-epoch.sqlite");
  writeFileSync(exportedPath, await zip.file("storymapper.sqlite")!.async("nodebuffer"));
  const exportedDatabase = openExistingStoryMapperDb(exportedPath);
  let exportedEpoch: string;
  try { exportedEpoch = (exportedDatabase.$client.prepare("SELECT epoch FROM project_settings").get() as { epoch: string }).epoch; }
  finally { exportedDatabase.$client.close(); }
  expect(exportedEpoch).toBe(originalEpoch);
  const target = fixture();
  const epochs = [exportedEpoch];
  for (let index = 0; index < 2; index++) {
    await importProjectArchive(archive, target.handle, actor);
    epochs.push((target.handle.current.$client.prepare("SELECT epoch FROM project_settings").get() as { epoch: string }).epoch);
  }
  expect(new Set(epochs).size).toBe(3);
});

it("keeps selected/shared references and unreferenced portable files while excluding files owned only by another Project", async () => {
  const source = fixture();
  mkdirSync(join(source.directory, "documents"));
  for (const name of ["excluded-demo.txt", "selected-demo.txt", "shared-demo.txt", "unreferenced-demo.txt"]) writeFileSync(join(source.directory, "documents", name), name);
  source.work.run(actor, ({ repository }) => {
    const excluded = repository.createProject({ name: "Excluded file owner" });
    for (const [projectId, files] of [[excluded.id, ["excluded-demo.txt", "shared-demo.txt"]], [source.project.id, ["selected-demo.txt", "shared-demo.txt"]]] as const) for (const file of files) repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(file), projectId, title: file, type: "txt", content: file, fileHash: createHash("sha256").update(file).digest("hex"), filePath: join(source.directory, "documents", file) });
  });
  const zip = await JSZip.loadAsync((await exportProjectArchive(source.handle, source.project.id)).content);
  expect(zip.file("documents/excluded-demo.txt")).toBeNull();
  for (const name of ["selected-demo.txt", "shared-demo.txt", "unreferenced-demo.txt"]) expect(await zip.file(`documents/${name}`)!.async("string")).toBe(name);
});

it("refuses inline attachment references on export and removes the temporary snapshot", async () => {
  const source = fixture();
  source.work.run(actor, ({ repository }) => repository.createCardAttachment(source.repository.getStoryMapSnapshot(source.repository.listStoryMaps(source.project.id)[0]!.id)!.cards[0]!.id, { label: "Invalid inline attachment", filePath: "inline://missing-demo" }));
  await expect(exportProjectArchive(source.handle, source.project.id)).rejects.toThrow("nonportable file reference");
  expect(readdirSync(source.directory).some((name) => name.startsWith("snapshot-"))).toBe(false);
});

it.each(["case", "Unicode", "file/directory"])("rejects %s export namespace collisions before completing the archive", async (kind) => {
  const source = fixture();
  mkdirSync(join(source.directory, "documents"));
  const first = kind === "Unicode" ? "caf\u00e9.txt" : "Collision.txt";
  const second = kind === "Unicode" ? "cafe\u0301.txt" : "collision.txt";
  writeFileSync(join(source.directory, "documents", first), "demo");
  const actual = (await vi.importActual<typeof import("node:fs")>("node:fs")).readdirSync;
  vi.mocked(readDirectory).mockImplementationOnce(((path: string, options: { withFileTypes: true }) => {
    const entries = actual(path, options);
    const file = entries[0]!;
    return [file, { name: second, isDirectory: () => kind === "file/directory", isSymbolicLink: () => false, isFile: () => kind !== "file/directory" }];
  }) as typeof readDirectory);
  await expect(exportProjectArchive(source.handle, source.project.id)).rejects.toThrow("Colliding archive entries");
  expect(readdirSync(source.directory).some((name) => name.startsWith("snapshot-"))).toBe(false);
});

it("migrates a supported older archive copy before adopting its target schema and fresh epoch", async () => {
  const source = fixture();
  const archive = (await exportProjectArchive(source.handle, source.project.id)).content;
  const originalBytes = Buffer.from(archive);
  const sourceBusiness = archiveBusinessRows(source.handle.current);
  const sourceEpoch = source.repository.getSafetySettings(source.project.id).epoch;
  const target = fixture("Previous active Project");
  const previous = target.handle.current;
  const assets = loadTestMigrationAssets();
  const result = await importProjectArchive(archive, target.handle, actor, assets);
  expect(archive).toEqual(originalBytes);
  expect(previous.$client.open).toBe(false);
  expect(target.repository.getSafetySettings(source.project.id).epoch).not.toBe(sourceEpoch);
  expect(target.handle.current.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'test_projects_name_idx'").get()).toEqual({ name: "test_projects_name_idx" });
  expect(target.handle.current.$client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({ count: loadMigrationAssets().length + 1 });
  expect(result.manifest.schemaVersion).not.toBe(currentReleaseSchemaVersion(assets));
  const importedBusiness = archiveBusinessRows(target.handle.current);
  expect(importedBusiness.cards).toEqual(sourceBusiness.cards);
  expect(target.repository.listProjects().map((project) => project.id)).toEqual([source.project.id]);
  expect(listRestorePoints(target.handle)).toEqual([]);
});

it.each(["count", "redaction"])("refuses older archive source %s before its pending migration can run", async (damage) => {
  const source = fixture();
  const archive = damage === "count"
    ? await changedArchive((await exportProjectArchive(source.handle, source.project.id)).content, (_zip, manifest) => { (manifest.counts as { cards: number }).cards += 1; })
    : await mutateDatabaseArchive(source, (database) => { database.$client.prepare("INSERT INTO connector_connections (id, project_id, provider, name, auth_mode, owner, created_at, updated_at) VALUES (?, ?, 'github', 'Unredacted source', 'token', 'demo', ?, ?)").run(randomUUID(), source.project.id, new Date().toISOString(), new Date().toISOString()); });
  const target = fixture("Unchanged source refusal");
  const previous = target.handle.current;
  const assets = loadTestMigrationAssets();
  const successor = assets[assets.length - 1]!;
  const failing = [...assets.slice(0, -1), { ...successor, sql: [...successor.sql, "INSERT INTO missing_test_migration_table VALUES (1)"] }];
  await expect(importProjectArchive(archive, target.handle, actor, failing)).rejects.toThrow(damage === "count" ? "manifest count" : "unredacted Sync table");
  expect(target.handle.current).toBe(previous);
  expect(target.repository.listProjects()[0]?.name).toBe("Unchanged source refusal");
  expect(readdirSync(target.root)).toEqual(["demo.lsm"]);
});

it("reports removed temporary migration snapshots truthfully when an older archive candidate migration fails", async () => {
  const source = fixture();
  const archive = (await exportProjectArchive(source.handle, source.project.id)).content;
  const target = fixture("Preserved archive failure state");
  const previous = target.handle.current;
  const assets = loadTestMigrationAssets();
  const successor = assets[assets.length - 1]!;
  const failing = [...assets.slice(0, -1), { ...successor, sql: [...successor.sql, "INSERT INTO missing_test_migration_table VALUES (1)"] }];
  await expect(importProjectArchive(archive, target.handle, actor, failing)).rejects.toMatchObject({
    message: expect.stringContaining("temporary candidate and its snapshots were removed"),
    details: undefined
  });
  expect(target.handle.current).toBe(previous);
  expect(target.repository.listProjects()[0]?.name).toBe("Preserved archive failure state");
  expect(readdirSync(target.root)).toEqual(["demo.lsm"]);
});

it.each(["prototype", "divergent journal", "future journal"])("refuses %s archive databases without adopting them", async (damage) => {
  const source = fixture();
  const archive = await mutateDatabaseArchive(source, (database) => {
    if (damage === "prototype") database.$client.exec("DROP TABLE __drizzle_migrations");
    else if (damage === "divergent journal") database.$client.prepare("UPDATE __drizzle_migrations SET hash = ?").run("0".repeat(64));
    else database.$client.prepare("INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)").run(loadMigrationAssets().length + 1, "0".repeat(64), Date.now());
  });
  const original = Buffer.from(archive);
  await expectImportRefusal(archive, /migration refused/);
  expect(archive).toEqual(original);
});

it.each(["empty", "missing epoch", "blank epoch"])("refuses a %s archive candidate while preserving input and active state", async (damage) => {
  const source = fixture();
  const archive = await mutateDatabaseArchive(source, (database, manifest) => {
    if (damage === "empty") {
      database.$client.pragma("foreign_keys = OFF");
      const tables = database.$client.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>;
      for (const { name } of tables) database.$client.exec(`DROP TABLE "${name}"`);
      manifest.schemaVersion = releaseSchemaVersion([]);
    } else if (damage === "missing epoch") database.$client.exec("DELETE FROM database_metadata");
    else database.$client.exec("UPDATE database_metadata SET epoch = ' '");
  });
  const before = Buffer.from(archive);
  await expectImportRefusal(archive, damage === "empty" ? /no authenticated release journal/ : /valid database epoch/);
  expect(archive).toEqual(before);
});
