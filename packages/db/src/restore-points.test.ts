import { performance } from "node:perf_hooks";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restorePointClassSchema, type RestorePoint } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, UnitOfWork, createRestorePoint, listRestorePoints, developmentSchemaVersion, restorePointDirectory, runProtectedMigration } from "@storymapper/db";
import { retainRestorePointFiles } from "@storymapper/db/restore-point-files";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";

const ACTOR = { actorType: "human", actorId: "restore-fixture" } as const;
const cleanup: Array<() => void> = [];

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync), renameSync: vi.fn(actual.renameSync) };
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-restore-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Restore fixture", localPath: join(directory, "metadata-is-not-storage") }));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, databasePath, handle, unitOfWork, project, snapshots: join(directory, "snapshots") };
}

function readPoint(data: ReturnType<typeof fixture>, point: RestorePoint, query: string): unknown {
  const snapshot = new Database(resolveSqlitePath(join(data.snapshots, point.fileName)), { readonly: true });
  try {
    expect(snapshot.pragma("integrity_check", { simple: true })).toBe("ok");
    return snapshot.prepare(query).all();
  } finally {
    snapshot.close();
  }
}

function resizePoint(data: ReturnType<typeof fixture>, point: RestorePoint, bytes: number): string {
  const name = point.fileName.replace(`__${point.sizeBytes}__`, `__${bytes}__`);
  const file = join(data.snapshots, point.fileName);
  truncateSync(file, bytes);
  renameSync(file, join(data.snapshots, name));
  return name;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) close();
});

describe("complete persisted restore points", () => {
  it("captures committed WAL and all Projects without archive redaction, with its authenticated release schema identity", testCapturesCommittedWALAndAllProjectsWithoutArchiveRedactionWithIts);

  it("uniquely orders all four classes with the same clock and preserves metadata after reopen", testUniquelyOrdersAllFourClassesWithTheSameClockAndPreserves);

  registerDoesNotListFinalizedLookingFilesWhoseEmbeddedSize();

  registerRetainsTheLatestSPublicationWithPreChangeContents();

  it("isolates inventories and per-class retention for colocated databases", testIsolatesInventoriesAndPerClassRetentionForColocatedDatabases);

  it("removes an actual SQLite failure artifact, retains prior protected points and releases the gate", testRemovesAnActualSQLiteFailureArtifactRetainsPriorProtectedPointsAnd);

  it("surfaces real filesystem failures and leaves prior points intact", () => {
    const data = fixture();
    const prior = createRestorePoint(data.handle, "pre-migration");
    rmSync(join(data.snapshots, ".gitignore"));
    mkdirSync(join(data.snapshots, ".gitignore"));
    expect(() => createRestorePoint(data.handle, "pre-migration")).toThrow(/EISDIR/);
    expect(listRestorePoints(data.handle)).toEqual([prior]);
    expect(readdirSync(data.snapshots).filter((name) => name.startsWith(".restore-"))).toEqual([]);
  });

  it("cleans a failed atomic rename and only supersedes a protected point after successful publication", testCleansAFailedAtomicRenameAndOnlySupersedesAProtectedPoint);

  it("uses only the current holder's database and storage directory", testUsesOnlyTheCurrentHolderSDatabaseAndStorageDirectory);

  it("finishes snapshot creation alone with 1,000 actual Cards within the 2-second tolerance", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      const map = repository.createStoryMap({ projectId: data.project.id, name: "Timing" });
      for (let index = 0; index < 1000; index++) repository.createCard({ storyMapId: map.id, level: "story", title: `Card ${index}` });
    });
    const started = performance.now();
    const point = createRestorePoint(data.handle, "manual");
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThanOrEqual(2000);
    expect(readPoint(data, point, "SELECT count(*) AS count FROM cards")).toEqual([{ count: 1000 }]);
  });
});

describe("fixed restore point retention", () => {
  it("enforces the 1 GiB cap by deleting the oldest of three 400 MiB manual points", () => {
    const data = fixture();
    const points = Array.from({ length: 3 }, () => createRestorePoint(data.handle, "manual"));
    const names = points.map((point) => resizePoint(data, point, 400 * 1024 ** 2));
    retainRestorePointFiles(data.snapshots, points[0]!.fileName.split("__")[0]!);
    const remaining = listRestorePoints(data.handle);
    expect(remaining.map((point) => point.fileName)).toEqual(names.slice(1).reverse());
    expect(remaining.reduce((sum, point) => sum + point.sizeBytes, 0)).toBe(800 * 1024 ** 2);
    expect(readdirSync(data.snapshots)).not.toContain(names[0]);
  });

  it("enforces a database's byte cap without deleting a colocated database's last manual point", testEnforcesADatabaseSByteCapWithoutDeletingAColocatedDatabase);

  it("keeps the newest ten per class before enforcing the aggregate cap", () => {
    const data = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
    for (const pointClass of restorePointClassSchema.options) {
      const points = Array.from({ length: 12 }, () => createRestorePoint(data.handle, pointClass));
      expect(listRestorePoints(data.handle).filter((point) => point.class === pointClass)).toEqual(points.slice(-10).reverse());
    }
    expect(listRestorePoints(data.handle)).toHaveLength(40);
  });

  it("deletes oldest eligible sparse files but preserves the last of each class and newest protected classes beyond the cap", testDeletesOldestEligibleSparseFilesButPreservesTheLastOfEach);

  it("reports a real unlink failure after publication instead of silently claiming retention succeeded", async () => {
    const data = fixture();
    for (let index = 0; index < 10; index++) createRestorePoint(data.handle, "manual");
    const oldest = listRestorePoints(data.handle).at(-1)!;
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(unlinkSync).mockImplementationOnce((path) => {
      rmSync(path);
      mkdirSync(path);
      actual.unlinkSync(path);
    });
    let failure: unknown;
    try { createRestorePoint(data.handle, "manual"); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "internal", message: "Restore point published, but retention failed.", details: { retainedRestorePoint: expect.any(String), retainedPreparedEffects: [] }, cause: { code: expect.stringMatching(/EISDIR|EPERM/) } });
    expect(listRestorePoints(data.handle)).toHaveLength(10);
    expect(readdirSync(data.snapshots)).toContain(oldest.fileName);
    expect(readdirSync(data.snapshots).filter((name) => name.startsWith(".restore-"))).toEqual([]);
    expect(() => data.unitOfWork.run(ACTOR, () => undefined)).not.toThrow();
  });
});

describe("protected migrations and a common synchronous gate", () => {
  it("publishes pre-change content before a real synchronous fixture migration and rolls back failed migration data", testPublishesPreChangeContentBeforeARealSynchronousFixtureMigrationAnd);

  it("prevents migration from starting when snapshot fails", () => {
    const data = fixture();
    writeFileSync(data.snapshots, "directory blocked");
    const migrate = vi.fn();
    expect(() => runProtectedMigration(data.handle, migrate)).toThrow(/EEXIST/);
    expect(migrate).not.toHaveBeenCalled();
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Gate released" }))).not.toThrow();
  });

  it("rejects snapshot/migration inside UoW and UoW/snapshot inside migration, then releases before afterCommit", testRejectsSnapshotMigrationInsideUoWAndUoWSnapshotInsideMigrationThen);

  it("rejects a reentrant UoW during actual snapshot creation without preventing later work", () => {
    const data = fixture();
    const prepare = data.handle.current.$client.prepare.bind(data.handle.current.$client);
    vi.spyOn(data.handle.current.$client, "prepare").mockImplementation((sql) => {
      if (sql === "VACUUM INTO ?") expect(() => data.unitOfWork.run(ACTOR, () => undefined)).toThrow("cannot reenter");
      return prepare(sql);
    });
    const point = createRestorePoint(data.handle, "manual");
    expect(listRestorePoints(data.handle)).toEqual([point]);
    expect(() => data.unitOfWork.run(ACTOR, () => undefined)).not.toThrow();
  });

  it("rejects asynchronous migrations before invocation, including bound functions with an awaited late write", async () => {
    const data = fixture();
    const migration = async (database: typeof data.handle.current) => {
      started();
      await Promise.resolve();
      database.$client.prepare("UPDATE projects SET name = ?").run("Unsupported async");
    };
    const started = vi.fn();
    expect(() => runProtectedMigration(data.handle, migration as unknown as () => void)).toThrow("Migration callbacks must be synchronous");
    expect(() => runProtectedMigration(data.handle, migration.bind(null) as unknown as () => void)).toThrow("Migration callbacks must be synchronous");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).not.toHaveBeenCalled();
    expect(listRestorePoints(data.handle)).toEqual([]);
    expect(data.handle.current.$client.prepare("SELECT name FROM projects").get()).toEqual({ name: "Restore fixture" });
    expect(() => createRestorePoint(data.handle, "manual")).not.toThrow();
  });
});

function registerRetainsTheLatestSPublicationWithPreChangeContents() {
  it.each(["manual", "pre-migration"] as const)("retains the latest %s publication with pre-change contents after clock rollback and reopen", (pointClass) => {
    const data = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
    for (let index = 0; index < 10; index++) createRestorePoint(data.handle, pointClass);
    data.handle.current.$client.prepare("UPDATE projects SET name = ?").run("Before backwards-clock migration");
    vi.setSystemTime(new Date("2025-10-04T12:00:00.000Z"));
    let latest: RestorePoint;
    if (pointClass === "manual") latest = createRestorePoint(data.handle, pointClass);
    else latest = runProtectedMigration(data.handle, (database) => {
      const point = listRestorePoints(data.handle)[0]!;
      expect(readPoint(data, point, "SELECT name FROM projects")).toEqual([{ name: "Before backwards-clock migration" }]);
      database.$client.prepare("UPDATE projects SET name = ?").run("After backwards-clock migration");
      return point;
    });
    expect(latest.createdAt).toBe("2025-10-04T12:00:00.000Z");
    expect(listRestorePoints(data.handle)).toHaveLength(10);
    expect(listRestorePoints(data.handle)[0]).toEqual(latest);
    expect(readPoint(data, latest, "SELECT name FROM projects")).toEqual([{ name: "Before backwards-clock migration" }]);
    data.handle.current.$client.close();
    data.handle.current = openStoryMapperDb(data.databasePath);
    expect(listRestorePoints(data.handle)[0]).toEqual(latest);
    vi.setSystemTime(new Date("2024-10-04T12:00:00.000Z"));
    const reopened = createRestorePoint(data.handle, pointClass);
    expect(listRestorePoints(data.handle)[0]).toEqual(reopened);
    expect(listRestorePoints(data.handle)).toHaveLength(10);
  });
}

function registerDoesNotListFinalizedLookingFilesWhoseEmbeddedSize() {
  it("does not list finalized-looking files whose embedded size or timestamp contradicts the file", () => {
    const data = fixture();
    const point = createRestorePoint(data.handle, "manual");
    const bytes = readFileSync(join(data.snapshots, point.fileName));
    const parts = point.fileName.split("__");
    const wrongSize = [...parts.slice(0, 5), String(point.sizeBytes + 1), ...parts.slice(6)].join("__");
    const impossibleDate = [parts[0], parts[1], parts[2]!.replace(/^([0-9]{4})-[0-9]{2}-/u, "$1-13-"), "00000009", ...parts.slice(4)].join("__");
    writeFileSync(join(data.snapshots, wrongSize), bytes);
    writeFileSync(join(data.snapshots, impossibleDate), bytes);
    expect(listRestorePoints(data.handle)).toEqual([point]);
    expect(createRestorePoint(data.handle, "manual").fileName.split("__")[3]).toBe("00000002");
  });
}

function testCapturesCommittedWALAndAllProjectsWithoutArchiveRedactionWithIts() {
  const data = fixture();
  data.handle.current.$client.pragma("wal_autocheckpoint = 0");
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Second Project" }));
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.createConnectorConnection({ projectId: data.project.id, name: "Retained connector", provider: "github", owner: "local-owner", repository: "local-repository", authMode: "token" }));
  expect(statSync(`${data.databasePath}-wal`).size).toBeGreaterThan(0);
  const point = createRestorePoint(data.handle, "manual");
  expect(point).toMatchObject({ class: "manual", scope: "local-database", schemaVersion: developmentSchemaVersion(data.handle.current) });
  expect(point.fileName).toContain(point.schemaVersion);
  expect(point.fileName).toContain(`__${point.sizeBytes}__`);
  expect(statSync(join(data.snapshots, point.fileName)).size).toBe(point.sizeBytes);
  expect(readPoint(data, point, "SELECT name FROM projects ORDER BY name")).toEqual([{ name: "Restore fixture" }, { name: "Second Project" }]);
  expect(readPoint(data, point, "SELECT name, owner, repository FROM connector_connections")).toEqual([{ name: "Retained connector", owner: "local-owner", repository: "local-repository" }]);
  expect(readFileSync(join(data.snapshots, ".gitignore"), "utf8")).toBe("*\n!.gitignore\n");
  expect(readdirSync(data.directory)).not.toContain("metadata-is-not-storage");
  const firstVersion = point.schemaVersion;
  runProtectedMigration(data.handle, (database) => database.$client.exec("CREATE TABLE migration_fixture (value TEXT)"));
  expect(() => developmentSchemaVersion(data.handle.current)).toThrow("inconsistent schema");
  data.handle.current.$client.exec("DROP TABLE migration_fixture");
  expect(developmentSchemaVersion(data.handle.current)).toBe(firstVersion);
}

function testUniquelyOrdersAllFourClassesWithTheSameClockAndPreserves() {
  const data = fixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
  const points = restorePointClassSchema.options.map((pointClass) => createRestorePoint(data.handle, pointClass));
  expect(new Set(points.map((point) => point.fileName)).size).toBe(4);
  expect(listRestorePoints(data.handle)).toEqual([...points].reverse());
  writeFileSync(join(data.snapshots, "partial.sqlite.tmp"), "partial");
  writeFileSync(join(data.snapshots, "unknown.sqlite"), "unknown");
  mkdirSync(join(data.snapshots, points[0]!.fileName.replace("manual", "pre-apply")));
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.databasePath);
  expect(listRestorePoints(data.handle)).toEqual([...points].reverse());
  expect(developmentSchemaVersion(data.handle.current)).toBe(points[0]!.schemaVersion);
}

function testIsolatesInventoriesAndPerClassRetentionForColocatedDatabases() {
  const data = fixture();
  const other = new DatabaseHandle(openStoryMapperDb(join(data.directory, "another.sqlite")));
  cleanup.push(() => other.current.$client.close());
  new UnitOfWork(other).run(ACTOR, ({ repository }) => repository.createProject({ name: "Colocated Project" }));
  const otherPoints = ["manual", "pre-migration", "pre-restore"].map((pointClass) => createRestorePoint(other, pointClass as RestorePoint["class"]));
  expect(readPoint(data, otherPoints[0]!, "SELECT name FROM projects")).toEqual([{ name: "Colocated Project" }]);
  for (const pointClass of ["manual", "pre-migration", "pre-restore"] as const) {
    for (let index = 0; index < 12; index++) createRestorePoint(data.handle, pointClass);
  }
  expect(listRestorePoints(other)).toEqual([...otherPoints].reverse());
  expect(listRestorePoints(data.handle)).toHaveLength(30);
  expect(listRestorePoints(data.handle).some((point) => otherPoints.some((otherPoint) => point.fileName === otherPoint.fileName))).toBe(false);
  other.current.$client.close();
  other.current = openStoryMapperDb(join(data.directory, "another.sqlite"));
  expect(listRestorePoints(other)).toEqual([...otherPoints].reverse());
}

function testRemovesAnActualSQLiteFailureArtifactRetainsPriorProtectedPointsAnd() {
  const data = fixture();
  const prior = createRestorePoint(data.handle, "pre-restore");
  const prepare = data.handle.current.$client.prepare.bind(data.handle.current.$client);
  vi.spyOn(data.handle.current.$client, "prepare").mockImplementation((sql) => {
    const statement = prepare(sql);
    if (sql === "VACUUM INTO ?") {
      const run = statement.run.bind(statement);
      vi.spyOn(statement, "run").mockImplementation((path) => {
        writeFileSync(String(path), "occupied destination");
        return run(path);
      });
    }
    return statement;
  });
  expect(() => createRestorePoint(data.handle, "pre-restore")).toThrow("file is not a database");
  expect(listRestorePoints(data.handle)).toEqual([prior]);
  expect(readdirSync(data.snapshots).filter((name) => name.startsWith(".restore-"))).toEqual([]);
  vi.restoreAllMocks();
  expect(createRestorePoint(data.handle, "manual").class).toBe("manual");
  expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "After failure" }))).not.toThrow();
}

async function testCleansAFailedAtomicRenameAndOnlySupersedesAProtectedPoint() {
  const data = fixture();
  const prior = createRestorePoint(data.handle, "pre-restore");
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  let destination: string | undefined;
  vi.mocked(renameSync).mockImplementationOnce((source, target) => {
    destination = String(target);
    mkdirSync(target);
    actual.renameSync(source, target);
  });
  expect(() => createRestorePoint(data.handle, "pre-restore")).toThrow(process.platform === "win32" ? /EPERM/ : /EISDIR|ENOTDIR/);
  expect(listRestorePoints(data.handle)).toEqual([prior]);
  expect(readdirSync(data.snapshots).filter((name) => name.startsWith(".restore-"))).toEqual([]);
  rmSync(destination!, { recursive: true });
  const successor = createRestorePoint(data.handle, "pre-restore");
  expect(listRestorePoints(data.handle)).toEqual([successor, prior]);
}

function testUsesOnlyTheCurrentHolderSDatabaseAndStorageDirectory() {
  const data = fixture();
  const replacement = fixture();
  const old = data.handle.current;
  data.handle.current = replacement.handle.current;
  try {
    const point = createRestorePoint(data.handle, "manual");
    expect(restorePointDirectory(data.handle.current)).toBe(replacement.snapshots);
    expect(listRestorePoints(data.handle)).toEqual([point]);
    expect(readPoint(replacement, point, "SELECT id FROM projects")).toEqual([{ id: replacement.project.id }]);
  } finally { data.handle.current = old; }
  expect(listRestorePoints(data.handle)).toEqual([]);
}

function testEnforcesADatabaseSByteCapWithoutDeletingAColocatedDatabase() {
  const data = fixture();
  const other = new DatabaseHandle(openStoryMapperDb(join(data.directory, "another.sqlite")));
  cleanup.push(() => other.current.$client.close());
  const protectedPoint = createRestorePoint(other, "manual");
  const protectedName = resizePoint(data, protectedPoint, 700 * 1024 ** 2);
  const points = Array.from({ length: 3 }, () => createRestorePoint(data.handle, "manual"));
  const names = points.map((point) => resizePoint(data, point, 400 * 1024 ** 2));
  retainRestorePointFiles(data.snapshots, points[0]!.fileName.split("__")[0]!);
  expect(listRestorePoints(data.handle).map((point) => point.fileName)).toEqual(names.slice(1).reverse());
  expect(listRestorePoints(other)).toMatchObject([{ fileName: protectedName, sizeBytes: 700 * 1024 ** 2 }]);
  expect(readdirSync(data.snapshots)).toContain(protectedName);
}

function testDeletesOldestEligibleSparseFilesButPreservesTheLastOfEach() {
  const data = fixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
  const old = createRestorePoint(data.handle, "manual");
  const largeOld = resizePoint(data, old, 600 * 1024 ** 2);
  const manual = createRestorePoint(data.handle, "manual");
  const migration = createRestorePoint(data.handle, "pre-migration");
  const restore = createRestorePoint(data.handle, "pre-restore");
  const apply = createRestorePoint(data.handle, "pre-apply");
  const protectedNames = [manual, migration, restore, apply].map((point) => resizePoint(data, point, 400 * 1024 ** 2));
  retainRestorePointFiles(data.snapshots, old.fileName.split("__")[0]!);
  expect(readdirSync(data.snapshots)).not.toContain(largeOld);
  expect(listRestorePoints(data.handle).map((point) => point.fileName)).toEqual(protectedNames.reverse());
  expect(listRestorePoints(data.handle).reduce((sum, point) => sum + point.sizeBytes, 0)).toBeGreaterThan(1024 ** 3);
}

function testPublishesPreChangeContentBeforeARealSynchronousFixtureMigrationAnd() {
  const data = fixture();
  runProtectedMigration(data.handle, (database) => {
    expect(listRestorePoints(data.handle)[0]?.class).toBe("pre-migration");
    database.$client.prepare("UPDATE projects SET name = ?").run("Migrated");

  });
  const point = listRestorePoints(data.handle)[0]!;
  expect(readPoint(data, point, "SELECT name FROM projects")).toEqual([{ name: "Restore fixture" }]);
  expect(data.handle.current.$client.prepare("SELECT name FROM projects").get()).toEqual({ name: "Migrated" });
  expect(() => runProtectedMigration(data.handle, (database) => {
    database.$client.prepare("UPDATE projects SET name = ?").run("Rolled back");
    database.$client.exec("CREATE TABLE rollback_fixture (value TEXT)");
    throw new Error("fixture migration failed");
  })).toThrow("fixture migration failed");
  expect(data.handle.current.$client.prepare("SELECT name FROM projects").get()).toEqual({ name: "Migrated" });
  expect(data.handle.current.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'rollback_fixture'").get()).toBeUndefined();
  expect(createRestorePoint(data.handle, "manual").class).toBe("manual");
}

function testRejectsSnapshotMigrationInsideUoWAndUoWSnapshotInsideMigrationThen() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, () => {
    expect(() => createRestorePoint(data.handle, "manual")).toThrow("cannot reenter");
    expect(() => runProtectedMigration(data.handle, () => undefined)).toThrow("cannot reenter");
  });
  runProtectedMigration(data.handle, () => {
    expect(() => data.unitOfWork.run(ACTOR, () => undefined)).toThrow("cannot reenter");
    expect(() => createRestorePoint(data.handle, "manual")).toThrow("cannot reenter");
  });
  const notified = vi.fn(() => createRestorePoint(data.handle, "manual"));
  new UnitOfWork(data.handle, notified).run(ACTOR, () => undefined);
  expect(notified).toHaveBeenCalledOnce();
  data.handle.exclusive("snapshot fixture", () => expect(() => data.unitOfWork.run(ACTOR, () => undefined)).toThrow("cannot reenter"));
  expect(() => data.handle.exclusive("failing fixture", () => { throw new Error("gate failure"); })).toThrow("gate failure");
  expect(() => data.unitOfWork.run(ACTOR, () => undefined)).not.toThrow();
}
