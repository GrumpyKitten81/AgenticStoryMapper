// @vitest-environment jsdom // REQ UX-DR1
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@storymapper/web/components/Dialog";

let root: Root;
let host: HTMLDivElement;
let opener: HTMLButtonElement;
let board: HTMLDivElement;

function key(value: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true });
  document.activeElement!.dispatchEvent(event);
  return event;
}

function button(name: string): HTMLButtonElement {
  return [...document.querySelectorAll("button")].find((item) => item.textContent === name)!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  opener = document.createElement("button");
  opener.textContent = "Open";
  board = document.createElement("div");
  board.dataset.storyMapBoard = "";
  board.tabIndex = -1;
  document.body.append(host, opener, board);
  opener.focus();
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("shared Dialog", () => {
  it("hands the first Escape from a marked editor descendant to its owning heading", testHandsTheFirstEscapeFromAMarkedEditorDescendantToIts);

  it("focuses the existing heading when container progress becomes a completed dialog, and the container when it becomes progress again", testFocusesTheExistingHeadingWhenContainerProgressBecomesACompletedDialog);

  registerDoesNotMoveFocusOutOfANestedTop();

  it("moves pending focus to the container and blocks Escape/backdrop while preserving containment", testMovesPendingFocusToTheContainerAndBlocksEscapeBackdropWhile);
  it("names and describes the dialog, contains keyboard and programmatic focus, and restores prior inert state", testNamesAndDescribesTheDialogContainsKeyboardAndProgrammaticFocusAnd);

  registerWrapsShiftTabFromTheCheckedRadioInsteadOf();

  it("focuses Cancel and sends Escape and backdrop only to the topmost layer", testFocusesCancelAndSendsEscapeAndBackdropOnlyToTheTopmost);

  it("restores focus to a replacement same-Card button, then the board when the Card disappears", testRestoresFocusToAReplacementSameCardButtonThenTheBoard);

  registerKeepsNewlyAddedBackgroundContentInertAndRestoresIt();

  registerRestoresFocusAfterReactRemovesTheOpenerAndDialog();

  it("focuses the board after closing a deep-linked modal without an opener", async () => {
    opener.blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => root.render(createElement(Dialog, { title: "Card", cardId: "card-a", onClose: vi.fn() })));
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(board);
  });

  it("contains Tab when pending disables every action", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(createElement(Dialog, { title: "Delete Card", alert: true, onClose },
      createElement("button", { "data-dialog-cancel": true }, "Cancel"))));
    expect(document.activeElement).toBe(button("Cancel"));
    await act(async () => root.render(createElement(Dialog, { title: "Delete Card", alert: true, onClose },
      createElement("button", { "data-dialog-cancel": true, disabled: true }, "Cancel"))));
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("[data-dialog-heading]"));
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("[data-dialog-heading]"));
  });
});

function registerRestoresFocusAfterReactRemovesTheOpenerAndDialog() {
  it.each([false, true])("restores focus after React removes the opener and dialog in one commit (replacement: %s)", async (retainTile) => {
    function RemovedCard() {
      const [open, setOpen] = useState(false);
      const [removed, setRemoved] = useState(false);
      return createElement("div", null,
        open ? createElement(Dialog, { title: "Park Card", alert: true, cardId: "card-a", onClose: () => setOpen(false) },
          createElement("button", { "data-dialog-cancel": true }, "Cancel"),
          createElement("button", { onClick: () => { setRemoved(true); setOpen(false); } }, "Commit")) : null,
        removed ? null : createElement("button", { onClick: () => setOpen(true) }, "Park opener"),
        removed && retainTile ? createElement("button", { "data-card-id": "card-a" }, "Replacement tile") : null);
    }
    await act(async () => root.render(createElement(RemovedCard)));
    const trigger = button("Park opener");
    trigger.focus();
    await act(async () => trigger.click());
    await act(async () => button("Commit").click());
    expect(trigger.isConnected).toBe(false);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(retainTile ? button("Replacement tile") : board);
    expect(host.inert).toBe(false);
  });
}

function registerKeepsNewlyAddedBackgroundContentInertAndRestoresIt() {
  it("keeps newly added background content inert and restores it on close", async () => {
    await act(async () => root.render(createElement(Dialog, { title: "Card", onClose: vi.fn() })));
    const background = document.createElement("button");
    await act(async () => document.body.append(background));
    expect(background.inert).toBe(true);
    await act(async () => root.render(null));
    expect(background.inert).toBe(false);
  });
}

function registerWrapsShiftTabFromTheCheckedRadioInsteadOf() {
  it("wraps Shift+Tab from the checked radio instead of leaving the dialog", async () => {
    const radio = (value: string, checked: boolean) => createElement("input", { type: "radio", name: "strategy", value, checked, onChange: vi.fn(), "aria-label": value });
    await act(async () => root.render(createElement(Dialog, { title: "Park", alert: true, onClose: vi.fn() },
      radio("left", false), radio("right", false), radio("unassign", true), createElement("button", { "data-dialog-cancel": true }, "Cancel"))));
    const checked = document.querySelector<HTMLInputElement>('input[value="unassign"]')!;
    checked.focus();
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("Cancel"));
    key("Tab");
    expect(document.activeElement).toBe(checked);
  });
}

function registerDoesNotMoveFocusOutOfANestedTop() {
  it("does not move focus out of a nested top layer when the outer initial-focus mode changes", async () => {
    const renderNested = (initialFocus: "container" | "heading") => root.render(createElement(Dialog, { title: "Outer", initialFocus, onClose: vi.fn() },
      createElement(Dialog, { title: "Inner", alert: true, onClose: vi.fn() }, createElement("button", { "data-dialog-cancel": true }, "Cancel"))));
    await act(async () => renderNested("container"));
    const cancel = button("Cancel");
    expect(document.activeElement).toBe(cancel);
    await act(async () => renderNested("heading"));
    expect(document.activeElement).toBe(cancel);
    await act(async () => renderNested("container"));
    expect(document.activeElement).toBe(cancel);
  });
}

async function testHandsTheFirstEscapeFromAMarkedEditorDescendantToIts() {
  const onClose = vi.fn();
  await act(async () => root.render(createElement(Dialog, { title: "Editor owner", onClose },
    createElement("div", { contentEditable: true, tabIndex: 0, "data-dialog-editor-escape": "" }, createElement("strong", null, "Formatted text")))));
  const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
  editor.focus();
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => editor.querySelector("strong")!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(document.querySelector("[data-dialog-heading]"));
  await act(async () => key("Escape"));
  expect(onClose).toHaveBeenCalledOnce();
}

async function testFocusesTheExistingHeadingWhenContainerProgressBecomesACompletedDialog() {
  const onClose = vi.fn();
  await act(async () => root.render(createElement(Dialog, { title: "Checking outcome", initialFocus: "container", dismissible: false, onClose })));
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.activeElement).toBe(dialog);
  await act(async () => root.render(createElement(Dialog, { title: "Restoration complete", initialFocus: "heading", onClose }, createElement("button", null, "Done"))));
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(dialog.hasAttribute("tabindex")).toBe(false);
  expect(document.activeElement).toBe(dialog.querySelector("[data-dialog-heading]"));
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(button("Done"));
  await act(async () => root.render(createElement(Dialog, { title: "Checking outcome", initialFocus: "container", dismissible: false, onClose })));
  expect(document.activeElement).toBe(dialog);
  expect(key("Escape").defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
}

async function testMovesPendingFocusToTheContainerAndBlocksEscapeBackdropWhile() {
  const onClose = vi.fn();
  await act(async () => root.render(createElement(Dialog, { title: "Restore", alert: true, onClose },
    createElement("button", { "data-dialog-cancel": true }, "Cancel"))));
  expect(document.activeElement).toBe(button("Cancel"));
  await act(async () => root.render(createElement(Dialog, { title: "Restoring", dismissible: false, initialFocus: "container", onClose })));
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.activeElement).toBe(dialog);
  expect(key("Escape").defaultPrevented).toBe(true);
  dialog.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(onClose).not.toHaveBeenCalled();
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(dialog);
  opener.focus();
  expect(document.activeElement).toBe(dialog);
  expect(host.inert).toBe(true);
}

async function testNamesAndDescribesTheDialogContainsKeyboardAndProgrammaticFocusAnd() {
  const previouslyInert = document.createElement("div");
  previouslyInert.inert = true;
  previouslyInert.setAttribute("inert", "");
  document.body.append(previouslyInert);
  await act(async () => root.render(createElement(Dialog, { title: "Card title", description: "Card details", onClose: vi.fn() },
    createElement("button", null, "First"), createElement("button", { disabled: true }, "Disabled"), createElement("button", null, "Last"))));
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Card title");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Card details");
  expect(document.activeElement).toBe(dialog.querySelector("h2"));
  expect(host.inert).toBe(true);
  expect(opener.inert).toBe(true);
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(button("First"));
  key("Tab", true);
  expect(document.activeElement).toBe(button("Last"));
  key("Tab");
  expect(document.activeElement).toBe(button("First"));
  opener.focus();
  expect(document.activeElement).toBe(button("First"));
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
  expect(host.inert).toBe(false);
  expect(opener.hasAttribute("inert")).toBe(false);
  expect(previouslyInert.inert).toBe(true);
  expect(previouslyInert.hasAttribute("inert")).toBe(true);
}

async function testFocusesCancelAndSendsEscapeAndBackdropOnlyToTheTopmost() {
  const closeOuter = vi.fn();
  function Nested() {
    const [open, setOpen] = useState(false);
    return createElement(Dialog, { title: "Card", onClose: closeOuter },
      createElement("button", { onClick: () => setOpen(true) }, "Close card"),
      open ? createElement(Dialog, { title: "Unsaved changes", description: "Save or discard?", alert: true, onClose: () => setOpen(false) },
        createElement("button", null, "Discard"), createElement("button", { "data-dialog-cancel": true, onClick: () => setOpen(false) }, "Cancel")) : null);
  }
  await act(async () => root.render(createElement(Nested)));
  const trigger = button("Close card");
  trigger.focus();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(document.activeElement).toBe(button("Cancel"));
  const layers = [...document.querySelectorAll<HTMLElement>(".dialog-layer")];
  expect(layers[0]!.inert).toBe(true);
  expect(layers[1]!.inert).toBe(false);
  layers[0]!.querySelector(".dialog-backdrop-hit-area")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(closeOuter).not.toHaveBeenCalled();
  await act(async () => key("Escape"));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(closeOuter).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  trigger.focus();
  await act(async () => trigger.click());
  await act(async () => document.querySelector('[role="alertdialog"]')!.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => key("Escape"));
  expect(closeOuter).toHaveBeenCalledOnce();
}

async function testRestoresFocusToAReplacementSameCardButtonThenTheBoard() {
  opener.dataset.cardId = "card-a";
  await act(async () => root.render(createElement(Dialog, { title: "Card", cardId: "card-a", onClose: vi.fn() })));
  const replacement = document.createElement("button");
  replacement.dataset.cardId = "card-a";
  opener.replaceWith(replacement);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(replacement);
  await act(async () => root.render(createElement(Dialog, { title: "Card", cardId: "card-a", onClose: vi.fn() })));
  replacement.remove();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(board);
}
