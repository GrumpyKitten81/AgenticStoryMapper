// @vitest-environment jsdom // REQ Story 6.7
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { router } from "@storymapper/web/app/router";
import { cardId, viewUrl, projectId, mount } from "@storymapper/web/test-fixtures/card-detail";

vi.mock("@storymapper/web/app/live/useLiveUpdates", () => ({ useLiveUpdates: () => ({ connection: "connected" }) }));
vi.mock("@storymapper/web/features/restore-points/RestoreResultDialog", () => ({ RestoreResultDialog: () => null }));
vi.mock("@storymapper/web/features/restore-points/RestoreProgressDialog", () => ({ RestoreProgressDialog: () => null }));

const originalRoot = router.routeTree.options.component!;
afterEach(() => { router.routeTree.update({ component: originalRoot }); });

it("keeps actual RootLayout heading behind the modal across route changes and restores normal heading focus after closing", async () => {
  const { RootLayout } = await vi.importActual<typeof import("@storymapper/web/app/routes/RootLayout")>("@storymapper/web/app/routes/RootLayout");
  router.routeTree.update({ component: RootLayout });
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === "/health") return Promise.resolve(Response.json({ ok: true }));
    if (path === "/api/projects") return Promise.resolve(Response.json({ projects: [{ id: projectId, name: "Modal focus project" }] }));
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const modal = document.querySelector('[role="dialog"]')!;
  expect(document.querySelector("h1")?.id).toBe("workspace-heading");
  expect(document.activeElement).toBe(modal.querySelector("[data-dialog-heading]"));
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Root retained draft"));
  for (const view of ["planning", "tracking", "backlog", "discovery", "tree"]) {
    await act(async () => { await router.navigate({ to: viewUrl.replace(/tree$/, view), search: { card: cardId } }); });
    expect(document.querySelector('[role="dialog"]')).toBe(modal);
    expect(modal.contains(document.activeElement)).toBe(true);
    expect(editor.storage.markdown.getMarkdown()).toBe("Root retained draft");
  }
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  expect(confirmation.contains(document.activeElement)).toBe(true);
  await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Discard")!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => { await router.navigate({ to: viewUrl.replace(/tree$/, "planning") }); });
  expect(document.activeElement).toBe(document.querySelector("h1"));
});

it.each(["Save", "Discard"])("focuses the destination heading immediately after %s resumes a blocked departure", async (action) => {
  const { RootLayout } = await vi.importActual<typeof import("@storymapper/web/app/routes/RootLayout")>("@storymapper/web/app/routes/RootLayout");
  router.routeTree.update({ component: RootLayout });
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === "/health") return Promise.resolve(Response.json({ ok: true }));
    if (path === "/api/projects") return Promise.resolve(Response.json({ projects: [{ id: projectId, name: "Modal focus project" }] }));
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Draft before departure"));
  await act(async () => { void router.navigate({ to: "/projects/$projectId/github", params: { projectId } }); });
  const confirmation = document.querySelector('.card-close-confirm')!;
  await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === action)!.click());
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${projectId}/github`));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(document.querySelector("h1"));
});
