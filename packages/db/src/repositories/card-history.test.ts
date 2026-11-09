import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cardHistoryQuerySchema, type ActorContext, type CardHistoryEntry } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-history-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const actor: ActorContext = { actorType: "human", actorId: "history-reader" };
  const { map, card } = unitOfWork.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "History fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const card = tx.createCard({ storyMapId: map.id, level: "activity", title: "Initial" });
    return { map, card };
  });
  return { handle, repository, unitOfWork, actor, map, card };
}

describe("bounded Card history", () => {
  it("compares saved predecessors across pages, preserves attribution and keeps ascending internal reads", () => {
    const data = fixture();
    data.unitOfWork.run({ actorType: "agent", actorId: "editor-host", mcpSessionId: "history-session" }, ({ repository }) => repository.updateCard(data.card.id, { title: "Agent title", description: "Description before" }));
    data.unitOfWork.run({ actorType: "github", actorId: "github-connector" }, ({ repository }) => repository.updateCard(data.card.id, { description: "Description after" }));
    const first = data.repository.listCardHistoryPage(data.card.id, { limit: 1 });
    expect(first).toMatchObject({ nextCursor: 3, versions: [{ version: 3, actorType: "github", changedFields: ["description"], previousSnapshot: { title: "Agent title", description: "Description before" } }] });
    const second = data.repository.listCardHistoryPage(data.card.id, { limit: 1, beforeVersion: first.nextCursor! });
    expect(second.versions[0]).toMatchObject({ version: 2, actorType: "agent", actor: "editor-host", mcpSessionId: "history-session", previousSnapshot: { title: "Initial" } });
    const last = data.repository.listCardHistoryPage(data.card.id, { limit: 1, beforeVersion: second.nextCursor! });
    expect(last).toMatchObject({ nextCursor: null, versions: [{ version: 1, previousSnapshot: null, changedFields: ["created"] }] });
    expect(data.repository.listCardHistory(data.card.id).map((row) => row.version)).toEqual([1, 2, 3]);
  });

  it("returns bounded pages through 200 real saved versions without omissions", testReturnsBoundedPagesThrough200RealSavedVersionsWithoutOmissions);

  it("uses the immediate stored predecessor even with gaps and exposes owned-only revisions", () => {
    const data = fixture();
    data.unitOfWork.run({ actorType: "system", actorId: "attachment-owner" }, ({ repository }) => repository.createCardAttachment(data.card.id, { label: "Spec", filePath: "spec.md" }));
    expect(data.repository.listCardHistoryPage(data.card.id, { limit: 1 }).versions[0]).toMatchObject({ version: 2, changedFields: [], previousSnapshot: { version: 1 } });
    data.unitOfWork.run({ actorType: "agent", actorId: "gap-editor" }, ({ repository }) => repository.updateCard(data.card.id, { title: "After gap" }));
    data.handle.current.$client.prepare("DELETE FROM card_versions WHERE card_id = ? AND version = 2").run(data.card.id);
    expect(data.repository.listCardHistoryPage(data.card.id, { limit: 1 }).versions[0]).toMatchObject({ version: 3, changedFields: ["title"], previousSnapshot: { version: 1, title: "Initial" } });
  });

  it("treats an absent optional field as equal to null but reports a cleared value", testTreatsAnAbsentOptionalFieldAsEqualToNullButReports);

  it("coalesces history rows under the bumped version, handles empty history and hides removed owners", () => {
    const data = fixture();
    data.unitOfWork.run(data.actor, ({ repository }) => repository.updateCard(data.card.id, { title: "Coalesced" }));
    expect(data.repository.listCardHistoryPage(data.card.id, { limit: 20 }).versions).toMatchObject([{ version: 2, snapshot: { title: "Coalesced" }, previousSnapshot: null }]);
    expect(data.repository.listCardHistoryPage(randomUUID(), { limit: 20 })).toEqual({ versions: [], nextCursor: null });
    data.unitOfWork.run(data.actor, ({ repository }) => repository.deleteStoryMap(data.map.id));
    expect(data.repository.listCardHistoryPage(data.card.id, { limit: 20 })).toEqual({ versions: [], nextCursor: null });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { beforeVersion: 0 }, { beforeVersion: "abc" }, { beforeVersion: "" }, { beforeVersion: 1.5 }, { limit: 20, surprise: true }])("rejects invalid shared query %j", (query) => {
    expect(cardHistoryQuerySchema.safeParse(query).success).toBe(false);
  });
});

function testReturnsBoundedPagesThrough200RealSavedVersionsWithoutOmissions() {
  const data = fixture();
  for (let version = 2; version <= 200; version++) data.unitOfWork.run({ actorType: "system", actorId: `saved-version-${version}` }, ({ repository }) => repository.updateCard(data.card.id, { title: `Saved title ${version}` }));
  const entries: CardHistoryEntry[] = [];
  let beforeVersion: number | undefined;
  do {
    const page = data.repository.listCardHistoryPage(data.card.id, { limit: 20, ...(beforeVersion === undefined ? {} : { beforeVersion }) });
    expect(page.versions).toHaveLength(20);
    entries.push(...page.versions);
    beforeVersion = page.nextCursor ?? undefined;
  } while (beforeVersion !== undefined);
  expect(entries.map((entry) => entry.version)).toEqual(Array.from({ length: 200 }, (_, index) => 200 - index));
  expect(entries.slice(0, -1).every((entry, index) => entry.previousSnapshot?.version === entries[index + 1]!.version)).toBe(true);
  expect(entries.at(-1)?.previousSnapshot).toBeNull();
}

function testTreatsAnAbsentOptionalFieldAsEqualToNullButReports() {
  const data = fixture();
  data.unitOfWork.run({ actorType: "system", actorId: "attachment-owner" }, ({ repository }) => repository.createCardAttachment(data.card.id, { label: "Spec", filePath: "spec.md" }));
  const rewrite = (version: number, assignee: string | null | undefined) => {
    const row = data.handle.current.$client.prepare("SELECT snapshot_json AS json FROM card_versions WHERE card_id = ? AND version = ?").get(data.card.id, version) as { json: string };
    const { assignee: _stored, ...snapshot } = JSON.parse(row.json) as Record<string, unknown>;
    data.handle.current.$client.prepare("UPDATE card_versions SET snapshot_json = ? WHERE card_id = ? AND version = ?").run(JSON.stringify(assignee === undefined ? snapshot : { ...snapshot, assignee }), data.card.id, version);
  };
  rewrite(1, undefined);
  rewrite(2, null);
  expect(data.repository.listCardHistoryPage(data.card.id, { limit: 1 }).versions[0]).toMatchObject({ version: 2, changedFields: [] });
  expect(data.repository.listCardHistory(data.card.id).at(-1)).toMatchObject({ version: 2, changedFields: [] });
  rewrite(1, "Ada");
  expect(data.repository.listCardHistoryPage(data.card.id, { limit: 1 }).versions[0]).toMatchObject({ version: 2, changedFields: ["assignee"] });
}
