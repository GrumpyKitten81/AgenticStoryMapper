import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { CardLevel } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const actor = { actorType: "human", actorId: "placement-user" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-placement-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "storymapper.sqlite");
  const database = openStoryMapperDb(path);
  cleanup.push(() => { if (database.$client.open) database.$client.close(); });
  const repository = new StoryMapperRepository(new DatabaseHandle(database));
  const uow = new UnitOfWork(repository.handle);
  const map = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Placement readback" });
    return tx.createStoryMap({ projectId: project.id, name: "Placement" });
  });
  const reopen = () => {
    database.$client.close();
    const reopened = openStoryMapperDb(path);
    cleanup.push(() => { if (reopened.$client.open) reopened.$client.close(); });
    return new StoryMapperRepository(new DatabaseHandle(reopened)).listCards(map.id);
  };
  return { uow, map, reopen };
}

it.each<CardLevel>(["activity", "step", "note"])("persists same-role Move indexes among mixed %s siblings", (level) => {
  const { uow, map, reopen } = fixture();
  const expected = uow.run(actor, ({ repository: tx }) => {
    const parentId = level === "activity" ? null : tx.createCard({ storyMapId: map.id, level: "activity", title: "Parent" }).id;
    const create = (title: string, position: number, cardLevel = level) => tx.createCard({ storyMapId: map.id, parentId, level: cardLevel, title, position });
    const first = create("First", 3);
    const mixed = create("Other role", 4, level === "note" ? "step" : "note");
    const target = create("Target", 6);
    tx.moveCard(target.id, { parentId, position: 0 });
    expect(tx.listCards(map.id).filter((card) => card.parentId === parentId && card.level === level).map((card) => card.id)).toEqual([target.id, first.id]);
    tx.moveCard(target.id, { parentId, position: 1 });
    return { first, target, mixed, parentId };
  });
  const cards = reopen();
  expect(cards.filter((card) => card.parentId === expected.parentId && card.level === level).map((card) => [card.id, card.position])).toEqual([[expected.first.id, 0], [expected.target.id, 1]]);
  expect(cards.find((card) => card.id === expected.mixed.id)?.position).toBe(4);
});

it.each([null, "release"] as const)("appends contextual Stories with interleaved %s siblings and preserves explicit positions after reopen", (lane) => {
  const { uow, map, reopen } = fixture();
  const { parentId, releaseId } = uow.run(actor, ({ repository: tx }) => {
    const activity = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity" });
    const parent = tx.createCard({ storyMapId: map.id, parentId: activity.id, level: "step", title: "Step" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Delivery" });
    const releaseId = lane === null ? null : release.id;
    for (const position of [0, 3, 6]) tx.createCard({ storyMapId: map.id, parentId: parent.id, releaseId, level: "story", title: `Lane ${position}`, position });
    for (const position of [1, 4, 8]) tx.createCard({ storyMapId: map.id, parentId: parent.id, releaseId: lane === null ? release.id : null, level: "story", title: `Other ${position}`, position });
    tx.createCard({ storyMapId: map.id, parentId: parent.id, releaseId, level: "note", title: "Lane note", position: 9 });
    tx.createCard({ storyMapId: map.id, parentId: parent.id, releaseId, level: "story", title: "Appended", position: 7 });
    tx.createCard({ storyMapId: map.id, parentId: parent.id, releaseId, level: "story", title: "Authored", position: 2 });
    return { parentId: parent.id, releaseId };
  });
  const cards = reopen();
  expect(cards.filter((card) => card.parentId === parentId && card.releaseId === releaseId && card.level === "story").map((card) => card.title)).toEqual(["Lane 0", "Authored", "Lane 3", "Lane 6", "Appended"]);
  expect(cards.find((card) => card.title === "Appended")?.position).toBe(7);
  expect(cards.find((card) => card.title === "Authored")?.position).toBe(2);
});
