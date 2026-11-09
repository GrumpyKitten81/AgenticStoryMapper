import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";
import { previewChangeSet } from "@storymapper/server/application/changeset/preview-changeset.use-cases";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const human = { actorType: "human", actorId: "local-ui" } as const;
const cleanup: Array<() => void> = [];
afterEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(readFileSync).mockReset().mockImplementation(actual.readFileSync);
  cleanup.splice(0).reverse().forEach((close) => close());
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "source-permission-"));
  const filePath = join(directory, "reviewed.txt");
  const content = "Reviewed inline source.";
  writeFileSync(filePath, content);
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const proposal = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Executor" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    return repository.createChangeSet({ id: randomUUID(), projectId: project.id, title: "Reviewed source", source: "human", createdAt: new Date().toISOString(), operations: [
      { operationId: "independent-card", op: "create", entity: "card", after: { storyMapId: map.id, title: "Activity", level: "activity" } },
      { operationId: "reviewed-source", op: "import", entity: "sourceDocument", after: { projectId: project.id, title: "Reviewed source", type: "txt", filePath, fileHash: createHash("sha256").update(content).digest("hex") } }
    ] });
  });
  return { database, directory, filePath, unitOfWork, repository, proposal };
}

function failNextRead(filePath: string, code: string): Error {
  const failure = Object.assign(new Error(`Injected ${code}: ${filePath}`), { code });
  vi.mocked(readFileSync).mockImplementationOnce(() => { throw failure; });
  return failure;
}

it.each(["EACCES", "EPERM"])("reports %s as an actionable source conflict and applies no partial domain or history writes", (code) => {
  const f = fixture();
  expect(previewChangeSet(f, human, f.proposal.id).conflicts).toEqual([]);
  approveChangeSet(f, human, f.proposal.id);
  const before = f.repository.getOperationSnapshot(f.proposal.projectId);
  failNextRead(f.filePath, code);
  const preview = previewChangeSet(f, human, f.proposal.id);
  expect(vi.mocked(readFileSync)).toHaveBeenLastCalledWith(f.filePath, "utf8");
  expect(preview).toMatchObject({ canApprove: false, canApply: false, conflicts: [{ operationId: "reviewed-source", index: 1, entity: "sourceDocument", reason: "source", message: "Reviewed source content is no longer available; create a new proposal." }] });
  expect(f.repository.getOperationSnapshot(f.proposal.projectId)).toEqual(before);
  failNextRead(f.filePath, code);
  expect(() => applyChangeSet(f, human, f.proposal.id)).toThrow("conflicts with newer changes");
  expect(vi.mocked(readFileSync)).toHaveBeenLastCalledWith(f.filePath, "utf8");
  expect(f.repository.getOperationSnapshot(f.proposal.projectId)).toEqual(before);
  expect(f.repository.getChangeSet(f.proposal.id)?.status).toBe("conflict");
  expect(f.database.$client.prepare("SELECT COUNT(*) AS count FROM card_versions").get()).toEqual({ count: 0 });
  expect(f.repository.listActivity(f.proposal.projectId).filter((row) => ["changeSet.applied", "changeSet.operation.applied"].includes(row.action))).toEqual([]);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["EACCES", "EPERM"])("allows independent approved work when the %s source operation is excluded", (code) => {
  const f = fixture();
  failNextRead(f.filePath, code);
  const preview = previewChangeSet(f, human, f.proposal.id, ["independent-card"]);
  expect(preview).toMatchObject({ conflicts: [], selectedOperationIds: ["independent-card"], canApprove: true });
  approveChangeSet(f, human, f.proposal.id, ["independent-card"]);
  const applied = applyChangeSet(f, human, f.proposal.id).changeSet;
  expect(applied.execution?.selectedOperationIds).toEqual(["independent-card"]);
  const snapshot = f.repository.getOperationSnapshot(f.proposal.projectId);
  expect(snapshot.cards).toHaveLength(1);
  expect(snapshot.sourceDocuments).toEqual([]);
  expect(snapshot.sourceChunks).toEqual([]);
  expect(vi.mocked(readFileSync)).not.toHaveBeenCalledWith(f.filePath, "utf8");
});

it("propagates unexpected EIO failures from preview and Apply without changing domain state", () => {
  const f = fixture();
  approveChangeSet(f, human, f.proposal.id);
  const before = f.repository.getOperationSnapshot(f.proposal.projectId);
  const previewFailure = failNextRead(f.filePath, "EIO");
  expect(() => previewChangeSet(f, human, f.proposal.id)).toThrow(previewFailure);
  const applyFailure = failNextRead(f.filePath, "EIO");
  expect(() => applyChangeSet(f, human, f.proposal.id)).toThrow(applyFailure);
  expect(f.repository.getOperationSnapshot(f.proposal.projectId)).toEqual(before);
  expect(f.repository.getChangeSet(f.proposal.id)?.status).toBe("approved");
  expect(f.database.$client.prepare("SELECT COUNT(*) AS count FROM card_versions").get()).toEqual({ count: 0 });
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});
