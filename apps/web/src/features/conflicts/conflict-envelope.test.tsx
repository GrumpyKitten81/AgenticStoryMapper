// @vitest-environment jsdom // REQ Story 7.6
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { connectorConnectionSchema, syncConflictSchema } from "@storymapper/contracts";
import { collectOperationConflicts } from "@storymapper/core";
import { id, createdAt, op, snapshot, supply } from "@storymapper/core/changesets/fixtures/remaining-operation-resolution-fixture";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReleaseEditor } from "@storymapper/web/features/releases";
import { ReleaseDateFields } from "@storymapper/web/features/releases";
import { ConflictAlert } from "@storymapper/web/features/conflicts/ConflictAlert";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ epoch: undefined, restorePending: false, restoreRevision: 0 });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it.each(["editor", "dates"] as const)("renders actual collected dependent Card sync and Release version entries in the %s consumer", async (consumer) => {
  const state = snapshot();
  const initial = { ...state.releases[0]! };
  state.releases[0]!.version = 2;
  state.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", createdAt, updatedAt: createdAt })];
  const sync = syncConflictSchema.parse({ id: id(62), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), field: "milestone", localValue: "Reviewed local Release", remoteValue: "Reviewed GitHub Milestone", createdAt });
  state.syncConflicts = [sync];
  const conflicts = collectOperationConflicts(state, [op({ entity: "release", op: "update", entityId: initial.id, baseVersion: initial.version, after: { releaseDate: "2026-12-01" } })], supply());
  expect(conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "card", reason: "sync", current: sync }), expect.objectContaining({ entity: "release", currentVersion: 2 })]));
  const request = vi.fn(async () => Response.json({ code: "conflict", message: "Reviewed objects changed", conflicts }, { status: 409 }));
  vi.stubGlobal("fetch", request);
  await act(async () => root.render(<QueryClientProvider client={client}>{consumer === "editor" ? <ReleaseEditor release={initial} storyMapId={id(2)} onClose={vi.fn()} /> : <ReleaseDateFields release={initial} storyMapId={id(2)} />}</QueryClientProvider>));
  const input = document.querySelectorAll<HTMLInputElement>('input[type="date"]')[1]!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-12-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (consumer === "editor") await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(request).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain("Keep mine");
  expect(document.body.textContent).toContain("Reviewed local Release");
  expect(document.body.textContent).toContain("Reviewed GitHub Milestone");
  expect(document.body.textContent).toContain("Release is locked");
});

it("keeps an unmatched ConflictError visible instead of hiding its message", async () => {
  const error = new ConflictError("Dependent root changed; review again", [{ entity: "card", id: id(3), reason: "version", baseVersion: 1, currentVersion: 2, current: {} }]);
  await act(async () => root.render(<ConflictAlert error={error} entityId={id(4)} name="Release" onReload={vi.fn()} onKeepMine={vi.fn()} />));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(error.message);
});

it("renders simultaneous actual collected Card title and version disputes through the HTTP API", async () => {
  const state = snapshot();
  const card = state.cards[0]!;
  card.version = 2;
  const sync = syncConflictSchema.parse({ id: id(62), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: card.id, field: "title", localValue: "Reviewed local title", remoteValue: "Reviewed GitHub title", createdAt });
  state.syncConflicts = [sync];
  const conflicts = collectOperationConflicts(state, [op({ entity: "card", op: "update", entityId: card.id, baseVersion: 1, after: { title: "My edit" } })], supply());
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "conflict", message: "Reviewed objects changed", conflicts }, { status: 409 })));
  const error: unknown = await api.updateCard(card.id, { title: "My edit" }, 1).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(ConflictError);
  await act(async () => root.render(<ConflictAlert error={error} entityId={card.id} name={card.key} onReload={vi.fn()} onKeepMine={vi.fn()} />));
  expect(host.textContent).toContain("Keep mine");
  expect(host.textContent).toContain("Reviewed local title");
  expect(host.textContent).toContain("Reviewed GitHub title");
});
