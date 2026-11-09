import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, restoreProject } from "@storymapper/db";
import { openExistingStoryMapperDb } from "@storymapper/db/connection";

vi.mock("@storymapper/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storymapper/db/connection")>();
  return { ...actual, openExistingStoryMapperDb: vi.fn(actual.openExistingStoryMapperDb) };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, rmSync: vi.fn(actual.rmSync), renameSync: vi.fn(actual.renameSync) };
});

const ACTOR = { actorType: "human", actorId: "restore-failure-fixture" } as const;
const close: Array<() => void> = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-restore-failure-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const project = uow.run(ACTOR, ({ repository: tx }) => tx.createProject({ name: "Restore failure fixture" }));
  const map = uow.run(ACTOR, ({ repository: tx }) => tx.createStoryMap({ projectId: project.id, name: "Restore failure map" }));
  const card = uow.run(ACTOR, ({ repository: tx }) => tx.createCard({ storyMapId: map.id, level: "activity", title: "Snapshot state" }));
  const point = createRestorePoint(handle, "manual");
  uow.run(ACTOR, ({ repository: tx }) => tx.updateCard(card.id, { title: "Protected live state" }));
  close.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { path, handle, uow, repository, project, card, point };
}

afterEach(() => { vi.restoreAllMocks(); for (const cleanup of close.splice(0).reverse()) cleanup(); });

describe("restore publication failure boundaries", () => {
  it.each(["swap", "reopen", "marker"] as const)("rolls back %s failure to the protected database and reopens a usable holder", async (failure) => {
    const data = fixture();
    const filesystem = await vi.importActual<typeof import("node:fs")>("node:fs");
    if (failure === "swap") {
      let failed = false;
      vi.mocked(renameSync).mockImplementation((source, destination) => {
        if (!failed && destination === data.path) { failed = true; throw Object.assign(new Error("swap EACCES"), { code: "EACCES" }); }
        filesystem.renameSync(source, destination);
      });
    }
    if (failure === "reopen") vi.mocked(openExistingStoryMapperDb).mockImplementationOnce(() => { throw new Database.SqliteError("reopen failure", "SQLITE_CANTOPEN"); });
    if (failure === "marker") {
      let failed = false;
      vi.mocked(rmSync).mockImplementation((path, options) => {
        if (!failed && path === `${data.path}.restoring.ready`) { failed = true; throw Object.assign(new Error("marker EACCES"), { code: "EACCES" }); }
        filesystem.rmSync(path, options);
      });
    }
    await expect(restoreProject(data.handle, data.project.id, data.point.fileName, ACTOR)).rejects.toThrow("original database was restored");
    expect(data.handle.current.$client.open).toBe(true);
    expect(data.handle.unavailableReason).toBeUndefined();
    expect(data.repository.getCard(data.card.id)?.title).toBe("Protected live state");
    expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toEqual([]);
    expect(existsSync(`${data.path}.restoring`)).toBe(false);
    data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "After failed restore" }));
    expect(data.repository.getCard(data.card.id)?.title).toBe("After failed restore");
  });

  it("stops serving if both restored and protected database reopening fail, and startup resolves the marker before normal reads", testStopsServingIfBothRestoredAndProtectedDatabaseReopeningFailAnd);

  it("retains the rollback when the first swap fails, rollback replacement succeeds, and rollback reopening fails", testRetainsTheRollbackWhenTheFirstSwapFailsRollbackReplacementSucceeds);
});

async function testStopsServingIfBothRestoredAndProtectedDatabaseReopeningFailAnd() {
  const data = fixture();
  vi.mocked(openExistingStoryMapperDb).mockImplementationOnce(() => { throw new Database.SqliteError("candidate reopen failure", "SQLITE_CANTOPEN"); })
    .mockImplementationOnce(() => { throw new Database.SqliteError("rollback reopen failure", "SQLITE_CANTOPEN"); });
  await expect(restoreProject(data.handle, data.project.id, data.point.fileName, ACTOR)).rejects.toThrow("Database access is stopped");
  expect(data.handle.unavailableReason).toContain("rollback failed");
  expect(data.handle.enterRequest()).toBe(false);
  expect(() => data.repository.getCard(data.card.id)).toThrow("Database access is stopped");
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Must not run" }))).toThrow("Database access is stopped");
  expect(existsSync(`${data.path}.restoring.ready`)).toBe(true);
  const logs: string[] = [];
  const reopened = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
  try {
    expect(reopened.$client.prepare("SELECT title FROM cards WHERE id = ?").get(data.card.id)).toEqual({ title: "Protected live state" });
    expect(logs).toEqual(["Interrupted project restore rolled back to the protected pre-restore point."]);
    expect(existsSync(`${data.path}.restoring.ready`)).toBe(false);
  } finally { reopened.$client.close(); }
}

async function testRetainsTheRollbackWhenTheFirstSwapFailsRollbackReplacementSucceeds() {
  const data = fixture();
  const filesystem = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(renameSync).mockImplementation((source, destination) => {
    if (source === `${data.path}.restoring` && destination === data.path) throw Object.assign(new Error("initial swap EACCES"), { code: "EACCES" });
    filesystem.renameSync(source, destination);
  });
  vi.mocked(openExistingStoryMapperDb).mockImplementationOnce(() => { throw new Database.SqliteError("rollback reopen failure", "SQLITE_CANTOPEN"); });
  await expect(restoreProject(data.handle, data.project.id, data.point.fileName, ACTOR)).rejects.toThrow("Database access is stopped");
  expect(existsSync(`${data.path}.restoring`)).toBe(true);
  expect(existsSync(`${data.path}.restoring.ready`)).toBe(true);
  expect(existsSync(`${data.path}.restoring.rollback`)).toBe(true);
  const logs: string[] = [];
  const recovered = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
  try {
    expect(recovered.$client.prepare("SELECT title FROM cards WHERE id = ?").get(data.card.id)).toEqual({ title: "Protected live state" });
    expect(recovered.$client.prepare("SELECT id FROM activity_events WHERE action = 'project.restored'").all()).toEqual([]);
    expect(logs).toEqual(["Interrupted project restore rolled back to the protected pre-restore point."]);
    expect(existsSync(`${data.path}.restoring`)).toBe(false);
    expect(existsSync(`${data.path}.restoring.ready`)).toBe(false);
    expect(existsSync(`${data.path}.restoring.rollback`)).toBe(false);
  } finally { recovered.$client.close(); }
}
