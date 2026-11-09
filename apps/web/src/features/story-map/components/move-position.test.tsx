// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { button, mount, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

it.each(["activity", "step", "note"] as const)("uses same-role Move indexes for %s among mixed siblings", async (level) => {
  const activityId = state.snapshot.cards[0]!.id;
  const parentId = level === "activity" ? null : activityId;
  const targetId = randomUUID();
  const sameRoleId = randomUUID();
  const target = { ...state.snapshot.cards[0]!, id: targetId, key: "LSM-20", title: "Mixed target", parentId, level, position: 6 };
  const other = { ...target, id: sameRoleId, key: "LSM-21", title: "Earlier same role", position: 3 };
  const mixed = { ...target, id: randomUUID(), key: "LSM-22", level: level === "note" ? "step" as const : "note" as const, title: "Other role", position: 1 };
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards.filter((card) => card.level !== level || card.parentId !== parentId), other, mixed, target] };
  const requests: Array<{ path: string; body: unknown }> = [];
  const transport = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) !== `/api/cards/${targetId}/move`) return transport(path, init);
    requests.push({ path: String(path), body: JSON.parse(String(init?.body)) });
    return Response.json({ ...target, position: 1 });
  });
  await mount(viewUrl.replace(/tree$/, "discovery"), "Mixed target");
  const primary = state.host.querySelector<HTMLButtonElement>(`button[data-card-id="${targetId}"]`)!;
  await act(async () => { primary.focus(); primary.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true })); });
  const dialog = document.querySelector('[role="dialog"]')!;
  const positions = dialog.querySelector<HTMLSelectElement>('[aria-label="Position"]')!;
  expect([...positions.options].map((option) => option.value)).toEqual(["0", "1"]);
  expect(positions.value).toBe("1");
  await act(async () => button("Move Card").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(requests.at(-1)).toMatchObject({ path: `/api/cards/${targetId}/move`, body: { position: 1 } });
});

it("keeps Story Move positions global across Release lanes and sibling Notes", async () => {
  const story = state.snapshot.cards[2]!;
  const storyId = story.id;
  const releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards,
    { ...story, id: randomUUID(), key: "LSM-30", title: "Other Release", releaseId, position: 1 },
    { ...story, id: randomUUID(), key: "LSM-31", title: "Sibling Note", level: "note", position: 2 }
  ] };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const primary = state.host.querySelector<HTMLButtonElement>(`button[data-card-id="${storyId}"]`)!;
  await act(async () => { primary.focus(); primary.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true })); });
  const positions = document.querySelector<HTMLSelectElement>('[role="dialog"] [aria-label="Position"]')!;
  expect([...positions.options].map((option) => option.value)).toEqual(["0", "1", "2"]);
});
