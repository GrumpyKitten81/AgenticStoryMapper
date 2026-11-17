// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { fireEvent, getByRole } from "@testing-library/dom";
import { beforeEach, expect, it, vi } from "vitest";
import { copyStrings } from "@storymapper/web/ui-strings/copy";
import { cardId, mount, state, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

it("copies the visible title draft and the saved renamed title without saving or opening another view", async () => {
  await mount(`${viewUrl}?card=${cardId}`);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const input = getByRole(dialog, "textbox", { name: "Title" }) as HTMLInputElement;
  const copy = getByRole(dialog, "button", { name: copyStrings.cardTitle }) as HTMLButtonElement;
  expect(copy.title).toBe(copyStrings.cardTitle);
  copy.focus();
  expect(document.activeElement).toBe(copy);
  await act(async () => copy.click());
  expect(writeText).toHaveBeenLastCalledWith("Create traceable story cards");
  expect(state.savedPatch).toBeUndefined();
  expect(dialog.contains(copy)).toBe(true);

  await act(async () => fireEvent.change(input, { target: { value: "Renamed draft" } }));
  await act(async () => copy.click());
  expect(writeText).toHaveBeenLastCalledWith("Renamed draft");
  expect(state.savedPatch).toBeUndefined();
  await act(async () => getByRole(dialog, "button", { name: "Save" }).click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ title: "Renamed draft" }));
  await act(async () => copy.click());
  expect(writeText).toHaveBeenLastCalledWith("Renamed draft");
  const status = copy.parentElement!.querySelector('[role="status"]')!;
  expect(status.textContent).toBe(copyStrings.copied);
  const announcement = status.firstElementChild;
  await act(async () => copy.click());
  expect(status.textContent).toBe(copyStrings.copied);
  expect(status.firstElementChild).not.toBe(announcement);
});

it("copies canonical URLs from GitHub and Sources, then follows changed and removed links", async () => {
  const externalRefId = randomUUID();
  const sourceId = randomUUID();
  const firstUrl = "https://github.com/fixture/repo/issues/7";
  const nextUrl = "https://github.com/fixture/repo/issues/8";
  state.snapshot.githubLinks = [{ id: externalRefId, cardId, repo: "fixture/repo", issueNumber: 7, url: firstUrl, syncState: "synced" }];
  state.snapshot.sourceLinks = [{ kind: "github", id: sourceId, cardId, externalRefId, repoFullName: "fixture/repo", issueNumber: 7, url: firstUrl }];
  await mount(`${viewUrl}?card=${cardId}`);
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-label^="Copy GitHub Issue link"]')];
  expect(buttons()).toHaveLength(2);
  for (const button of buttons()) {
    expect(button.title).toBe(button.getAttribute("aria-label"));
    await act(async () => button.click());
    expect(writeText).toHaveBeenLastCalledWith(firstUrl);
  }
  expect(document.querySelectorAll('[role="dialog"] a[href="https://github.com/fixture/repo/issues/7"]')).toHaveLength(2);

  const sourceLink = state.snapshot.sourceLinks[0]!;
  if (sourceLink.kind !== "github") throw new Error("Expected GitHub source link");
  state.snapshot = { ...state.snapshot, githubLinks: [{ ...state.snapshot.githubLinks[0]!, issueNumber: 8, url: nextUrl }], sourceLinks: [{ ...sourceLink, issueNumber: 8, url: nextUrl }] };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", state.snapshot.storyMap.id] }); });
  expect(buttons()).toHaveLength(2);
  for (const button of buttons()) {
    await act(async () => button.click());
    expect(writeText).toHaveBeenLastCalledWith(nextUrl);
  }

  state.snapshot = { ...state.snapshot, githubLinks: [] };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", state.snapshot.storyMap.id] }); });
  expect(buttons()).toHaveLength(1);
  await act(async () => buttons()[0]!.click());
  expect(writeText).toHaveBeenLastCalledWith(nextUrl);

  state.snapshot = { ...state.snapshot, sourceLinks: [] };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", state.snapshot.storyMap.id] }); });
  expect(buttons()).toHaveLength(0);
});

it("announces clipboard permission failures without saving or navigating", async () => {
  writeText.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  await mount(`${viewUrl}?card=${cardId}`);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await act(async () => getByRole(dialog, "button", { name: copyStrings.cardTitle }).click());
  expect(dialog.querySelector('[role="status"]')?.textContent).toContain(copyStrings.copyFailed);
  expect(state.savedPatch).toBeUndefined();
  expect(dialog.isConnected).toBe(true);
});
