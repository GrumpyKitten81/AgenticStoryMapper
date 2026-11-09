// @vitest-environment jsdom // REQ FR-15
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DescriptionEditor } from "@storymapper/web/features/story-map/components/DescriptionEditor";

let host: HTMLDivElement;
let root: Root;
const change = vi.fn<(value: string) => void>();
const render = (value: string) => act(async () => root.render(<DescriptionEditor value={value} onChange={change} />));
const editor = () => host.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  change.mockClear();
  vi.unstubAllGlobals();
});

it("loads supported Markdown and synchronizes unfocused props without emitting a user edit", async () => {
  const initial = "## ***Heading***\n\n- One\n- Two";
  await render(initial);
  expect(host.querySelector("h2 strong em")?.textContent).toBe("Heading");
  expect(editor().storage.markdown.getMarkdown()).toBe(initial);
  const instance = editor();
  change.mockClear();
  const next = "## Updated\n\n**Bold** and *italic*";
  await render(next);
  expect(editor()).toBe(instance);
  expect(editor().storage.markdown.getMarkdown()).toBe(next);
  expect(change).not.toHaveBeenCalled();
  await render(next);
  expect(change).not.toHaveBeenCalled();
});

it("keeps the Tiptap 3 StarterKit additions disabled to preserve the existing schema", async () => {
  await render("");
  const names = editor().extensionManager.extensions.map(({ name }) => name);
  for (const disabled of ["link", "underline", "listKeymap", "trailingNode"]) expect(names).not.toContain(disabled);
});

it("retains the focused draft when a different prop arrives", async () => {
  await render("Initial");
  await act(async () => {
    editor().view.dom.focus();
    editor().commands.selectAll();
    editor().commands.insertContent("Typed draft");
  });
  expect(editor().isFocused).toBe(true);
  expect(change).toHaveBeenLastCalledWith("Typed draft");
  change.mockClear();
  await render("Incoming snapshot");
  expect(editor().storage.markdown.getMarkdown()).toBe("Typed draft");
  expect(change).not.toHaveBeenCalled();
});

it("serializes an actual rich HTML paste to the existing exact Markdown representation", async () => {
  await render("");
  change.mockClear();
  await act(async () => {
    expect(editor().view.pasteHTML("<h2><strong><em>Pasted heading</em></strong></h2><ul><li>One</li><li>Two</li></ul>", new Event("paste") as ClipboardEvent)).toBe(true);
  });
  const markdown = "## ***Pasted heading***\n\n- One\n- Two";
  expect(change).toHaveBeenLastCalledWith(markdown);
  expect(editor().storage.markdown.getMarkdown()).toBe(markdown);
  expect(host.querySelector("h2 strong em")?.textContent).toBe("Pasted heading");
  expect([...host.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["One", "Two"]);
});
