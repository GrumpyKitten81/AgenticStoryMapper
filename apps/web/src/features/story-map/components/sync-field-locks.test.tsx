import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
// @vitest-environment jsdom // REQ Story 7.6
import { randomUUID } from "node:crypto";
import { act, createElement, Fragment } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getByRole } from "@testing-library/dom";
import { connectorConnectionSchema, personaSchema, releaseSchema, syncConflictSchema, type SyncConflict } from "@storymapper/contracts";
import { expect, it, vi } from "vitest";
import { ReleaseDateFields } from "@storymapper/web/features/releases";
import { ReleaseKanban } from "@storymapper/web/features/releases";
import { ReleaseEditor } from "@storymapper/web/features/releases";
import { SyncFieldLocksProvider } from "@storymapper/web/features/github-sync";
import { state, cardId, storyMapId, projectId, viewUrl, button, mount } from "@storymapper/web/test-fixtures/card-detail";
import { panelStrings, storyMapStrings } from "@storymapper/ui-strings";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { githubStatusStrings } from "@storymapper/web/ui-strings/github-status";

function linkAndConflicts(fields: SyncConflict["field"][], releaseSource: "milestone" | "iteration" = "milestone") {
  const externalRefId = randomUUID();
  const connectionId = randomUUID();
  state.connections = [connectorConnectionSchema.parse({ id: connectionId, projectId, provider: "github", name: "Actual conflict connection", owner: "fixture", repository: "repo", authMode: "token", labelsAsAnnotations: true, releaseSource, statusMapping: [{ localStatus: "active", remoteState: "open", labels: ["workflow"] }], createdAt: state.snapshot.cards[0]!.createdAt, updatedAt: state.snapshot.cards[0]!.updatedAt })];
  state.snapshot.remoteWorkItemLinks = [{ id: randomUUID(), externalRefId, connectionId, cardId, provider: "github", remoteId: "7", remoteNumber: 7, url: "https://github.com/fixture/repo/issues/7", labels: [], parentOverrideLocal: false, syncState: "conflict" }];
  state.syncConflicts = fields.map((field) => syncConflictSchema.parse({ id: randomUUID(), externalRefId, connectionId, cardId, field, localValue: "Local", remoteValue: "Remote", syncRunId: randomUUID(), createdAt: state.snapshot.cards[0]!.createdAt }));
}

async function edit(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("locks disputed Card fields and managed Annotations while saving only unrelated edits", async () => {
  linkAndConflicts(["title", "description", "status", "milestone", "labels"]);
  state.snapshot.annotations = [{ id: randomUUID(), projectId, storyMapId, name: "Managed annotation", icon: "tag", color: "red", position: 0 }];
  state.snapshot.personas = [personaSchema.parse({ id: randomUUID(), projectId, storyMapId, name: "Independent persona", role: "Reader", version: 1 })];
  await mount(`${viewUrl}?card=${cardId}`);
  const dialog = document.querySelector('[role="dialog"]')!;
  const title = dialog.querySelector<HTMLInputElement>('input')!;
  expect(title.disabled).toBe(true);
  expect([...dialog.querySelectorAll("select")].filter((select) => select.disabled)).toHaveLength(3);
  expect(dialog.querySelector<HTMLSelectElement>('[aria-label="Apply map-level description template"]')?.disabled).toBe(true);
  expect(dialog.querySelector(".tiptap")?.getAttribute("contenteditable")).toBe("false");
  expect(button(storyMapStrings.archive).disabled).toBe(false);
  expect(button("Managed annotation").disabled).toBe(true);
  expect(button("Independent persona").disabled).toBe(false);
  expect(dialog.textContent).toContain(syncConflictStrings.lock(syncConflictStrings.fields.title));
  await edit(dialog.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Independent owner");
  await act(async () => button(storyMapStrings.save).click());
  expect(state.savedPatch).toMatchObject({ assignee: "Independent owner" });
  expect(Object.keys(state.savedPatch!)).toEqual(["assignee", "baseVersion"]);
});

it("retains a dirty disputed draft when health adds a field lock and an independent field saves", async () => {
  linkAndConflicts([]);
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await edit(title, "Retained unsaved title");
  linkAndConflicts(["title"]);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: state.syncConflicts }));
  expect(title.disabled).toBe(true);
  expect(title.value).toBe("Retained unsaved title");
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Independent owner");
  await act(async () => button(storyMapStrings.save).click());
  expect(state.savedPatch?.title).toBeUndefined();
  expect(title.value).toBe("Retained unsaved title");
  expect(button(storyMapStrings.save).disabled).toBe(true);
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Second owner");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === storyMapStrings.save)!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(title.value).toBe("Retained unsaved title");
});

it("explains field locks on tiles while leaving unrelated priority and color controls usable", async () => {
  linkAndConflicts(["title", "status"]);
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const tile = document.querySelector(`[data-live-card-id="${cardId}"]`)!;
  expect(tile.textContent).toContain(syncConflictStrings.lock(syncConflictStrings.fields.title));
  expect(tile.textContent).toContain(syncConflictStrings.lock(syncConflictStrings.fields.status));
  for (const button of tile.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')) expect(button.disabled).toBe(false);
});

it.each(["repository", "project"] as const)("explains synced %s status ownership without claiming an open conflict", async (kind) => {
  linkAndConflicts([]);
  const source = kind === "project" ? { kind, projectId: "project-node", fieldId: "status-field", projectName: "Delivery project" } : { kind };
  const link = state.snapshot.remoteWorkItemLinks[0]!;
  link.syncState = "synced";
  link.statusEvidence = { source, issueState: "open", membership: "present", optionId: "open", name: "Open" };
  const ownership = githubStatusStrings.ownership(kind === "project" ? "Delivery project" : githubStatusStrings.repository);
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const tile = document.querySelector(`[data-live-card-id="${cardId}"]`)!;
  expect(tile.textContent).toContain(ownership);
  expect(tile.textContent).not.toContain("open GitHub sync conflict");
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="${storyMapStrings.selectCard(card.key, card.title)}"]`)!.click());
  const bar = document.querySelector(`[aria-label="${storyMapStrings.bulkActions}"]`)!;
  const bulkStatus = bar.querySelector<HTMLSelectElement>(`[aria-label="${storyMapStrings.status}"]`)!;
  expect(bulkStatus.disabled).toBe(true);
  expect(bulkStatus.title).toBe(ownership);
  expect(bar.textContent).toContain(ownership);
  expect(bar.textContent).not.toContain("open GitHub sync conflict");
  await act(async () => tile.querySelector<HTMLButtonElement>(`[data-card-id="${cardId}"]`)!.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector<HTMLSelectElement>(`select[title="${ownership}"]`)!.disabled).toBe(true);
  expect(dialog.textContent).not.toContain("open GitHub sync conflict");
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(ReleaseKanban, { cards: state.snapshot.cards, remoteWorkItemLinks: state.snapshot.remoteWorkItemLinks, releases: [], workflowStatuses: state.snapshot.workflowStatuses, dependencyKeys: {}, storyMapId, estimationUnit: "points" }) }))));
  const trackingStatus = document.querySelector<HTMLSelectElement>(`[aria-label="${panelStrings.cardStatus(card.key)}"]`)!;
  expect(trackingStatus.disabled).toBe(true);
  expect(trackingStatus.title).toBe(ownership);
  expect(document.getElementById(trackingStatus.getAttribute("aria-describedby")!)?.textContent).toBe(ownership);
  expect(state.syncConflicts).toEqual([]);
});

it("keeps filters accessible and clearable after navigating from Discovery to Tree", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${storyMapStrings.toggleSearch}"]`)!.click());
  await act(async () => getByRole(document.body, "button", { name: new RegExp(`^${storyMapStrings.filters}$`) }).click());
  await act(async () => {
    const statuses = document.querySelector<HTMLSelectElement>(`[aria-label="${storyMapStrings.allStatuses}"]`)!;
    statuses.value = [...statuses.options].find((option) => option.textContent === "todo")!.value;
    statuses.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    const mode = document.querySelector<HTMLSelectElement>(`[aria-label="${githubStatusStrings.selectionMode}"]`)!;
    mode.value = "exclude";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => document.querySelector<HTMLAnchorElement>(`a[href="${viewUrl}"]`)!.click());
  const tree = document.querySelector(".tree-workspace")!;
  expect(document.querySelectorAll(".board-toolbar")).toHaveLength(1);
  expect(tree.querySelectorAll(".tree-row")).toHaveLength(0);
  expect(tree.textContent).toContain(storyMapStrings.searchMatches(0, state.snapshot.cards.length));
  await act(async () => getByRole(document.body, "button", { name: new RegExp(`^${storyMapStrings.filters}$`) }).click());
  expect(tree.querySelector(`[aria-label="${githubStatusStrings.selectionMode}"]`)).not.toBeNull();
  await act(async () => button(storyMapStrings.clear).click());
  expect(tree.querySelectorAll(".tree-row")).toHaveLength(state.snapshot.cards.length);
});

it.each(["planning", "backlog", "slices"] as const)("keeps only the required dim ancestor context in filtered %s", async (view) => {
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, status: "Selected" } : card);
  await mount(viewUrl.replace(/tree$/, view));
  await act(async () => getByRole(document.body, "button", { name: new RegExp(`^${storyMapStrings.filters}$`) }).click());
  await act(async () => {
    const statuses = document.querySelector<HTMLSelectElement>(`[aria-label="${storyMapStrings.allStatuses}"]`)!;
    statuses.value = [...statuses.options].find((option) => option.textContent === "Selected")!.value;
    statuses.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const ancestors = document.querySelector(`[aria-label="${githubStatusStrings.ancestorContext}"]`);
  if (view === "planning") {
    expect(document.querySelectorAll(".swimlane-activity-cell.filter-context, .swimlane-step-cell.filter-context")).toHaveLength(2);
    expect(ancestors).toBeNull();
  } else {
    expect(ancestors?.querySelectorAll("button")).toHaveLength(view === "backlog" ? 1 : 2);
    if (view === "backlog") {
      expect(document.querySelectorAll(".backlog-group-heading.filter-context")).toHaveLength(1);
      await act(async () => { const group = getByRole(document.body, "combobox", { name: new RegExp(`^${storyMapStrings.groupBy}$`) }) as HTMLSelectElement; group.value = "status"; group.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(document.querySelector(`[aria-label="${githubStatusStrings.ancestorContext}"]`)?.querySelectorAll("button")).toHaveLength(2);
      expect(document.querySelectorAll(".backlog-group-heading.filter-context")).toHaveLength(0);
    }
  }
});

it("locks shared Release metadata and inline rename while keeping the local start date editable", async () => {
  linkAndConflicts(["milestone"]);
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId, version: 1, name: "Disputed delivery", goal: "Shared goal", position: 0, startDate: null, releaseDate: null, released: false });
  state.snapshot.releases = [release];
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: release.id } : card);
  const calls: unknown[] = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/releases/${release.id}` && init?.method === "PATCH") {
      const input: unknown = JSON.parse(String(init.body));
      calls.push(input);
      return Promise.resolve(Response.json({ ...release, startDate: "2026-10-20", version: 2 }));
    }
    return originalFetch(path, init);
  }));
  await mount(viewUrl.replace(/tree$/, "discovery"));
  expect(document.querySelector<HTMLButtonElement>(`[aria-label="${storyMapStrings.renameRelease(release.name)}"]`)!.disabled).toBe(true);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(ReleaseEditor, { release, storyMapId, onClose: vi.fn() }) }))));
  expect(document.querySelector<HTMLInputElement>('[aria-label="Release name"]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Release goal"]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLInputElement>('[aria-label="Release date"]')!.disabled).toBe(true);
  const start = document.querySelector<HTMLInputElement>('[aria-label="Start date"]')!;
  expect(start.disabled).toBe(false);
  await edit(start, "2026-10-20");
  await act(async () => button(storyMapStrings.save).click());
  expect(calls).toEqual([{ startDate: "2026-10-20", baseVersion: 1 }]);
});

it("blocks only disputed bulk fields while leaving independent bulk estimates available", async () => {
  linkAndConflicts(["status", "milestone", "labels"]);
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="${storyMapStrings.selectCard(card.key, card.title)}"]`)!.click());
  const bar = document.querySelector(`[aria-label="${storyMapStrings.bulkActions}"]`)!;
  for (const label of [storyMapStrings.status, storyMapStrings.release]) expect(bar.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!.disabled).toBe(true);
  expect(bar.textContent).toContain(syncConflictStrings.lock(syncConflictStrings.fields.status));
  expect(bar.querySelector<HTMLSelectElement>(`[aria-label="${storyMapStrings.status}"]`)!.title).toBe(syncConflictStrings.lock(syncConflictStrings.fields.status));
  expect(bar.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.disabled).toBe(false);
  expect([...bar.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === storyMapStrings.archive)!.disabled).toBe(false);
});

it("ignores late Card Save adoption after Restore and retains the draft", async () => {
  linkAndConflicts([]);
  useLiveInteractionStore.setState({ epoch: "before-restore", restorePending: false });
  let finish!: (response: Response) => void;
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}` && init?.method === "PATCH" ? new Promise<Response>((resolve) => { finish = resolve; }) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await edit(title, "Retained pre-Restore title");
  await act(async () => button(storyMapStrings.save).click());
  await act(async () => useLiveInteractionStore.setState({ epoch: "after-restore", restorePending: false }));
  await act(async () => finish(Response.json({ ...state.snapshot.cards.find((card) => card.id === cardId)!, title: "Stale saved response", version: 9 })));
  expect(title.value).toBe("Retained pre-Restore title");
  expect(button(storyMapStrings.save).disabled).toBe(false);
  expect(state.snapshot.cards.find((card) => card.id === cardId)!.title).not.toBe("Stale saved response");
});

it.each([
  ["milestone", "current"], ["iteration", "current"],
  ["milestone", "acknowledged"], ["iteration", "acknowledged"],
  ["milestone", "local"], ["milestone", "remote"]
] as const)("uses %s field locks for the %s disputed Release target", async (source, target) => {
  linkAndConflicts(["milestone"], source);
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId, version: 1, name: "Disputed target", goal: "Editable iteration goal", position: 0, startDate: null, releaseDate: null, released: false });
  state.snapshot.releases = [release];
  if (target === "current") state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: release.id } : card);
  if (target === "acknowledged") {
    const values = { titleHash: "title", bodyHash: "body", statusLabels: [], annotationLabels: [], releaseMetadata: null, milestone: null };
    state.snapshot.remoteWorkItemLinks[0]!.baseline = { pendingReleaseAssignment: false, acknowledgedLocal: { ...values, releaseId: release.id }, observedRemote: values };
  }
  if (target === "local" || target === "remote") {
    const externalId = "https://github.com/fixture/repo/milestone/8";
    state.snapshot.externalRefs = [{ id: randomUUID(), entityType: "release", entityId: release.id, system: "github", externalId, scopeId: storyMapId, syncedVersion: 1, createdAt: state.snapshot.cards[0]!.createdAt }];
    state.syncConflicts[0]![target === "local" ? "localValue" : "remoteValue"] = { assignment: externalId, metadata: { name: release.name, startDate: null, releaseDate: null } };
  }
  const calls: Array<Record<string, unknown>> = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/releases/${release.id}` && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(patch);
      return Promise.resolve(Response.json({ ...release, ...patch, version: 2 }));
    }
    return originalFetch(path, init);
  }));
  await mount(viewUrl);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(Fragment, null, createElement(ReleaseEditor, { release, storyMapId, onClose: vi.fn() }), createElement(ReleaseDateFields, { release, storyMapId })) }))));
  const input = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  expect(input(panelStrings.releaseName).disabled).toBe(true);
  expect(input(panelStrings.releaseDate).disabled).toBe(true);
  expect(input(panelStrings.releaseGoal).disabled).toBe(source === "milestone");
  expect(input(panelStrings.releaseStartDate).disabled).toBe(source === "iteration");
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(source === "milestone");
  expect(input(panelStrings.startDateLabel(release.name)).disabled).toBe(source === "iteration");
  expect(input(panelStrings.releaseDateLabel(release.name)).disabled).toBe(true);
  if (source === "iteration") {
    const goal = input(panelStrings.releaseGoal) as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(goal, "Independent goal"); goal.dispatchEvent(new Event("input", { bubbles: true })); });
  } else await edit(input(panelStrings.releaseStartDate) as HTMLInputElement, "2026-10-20");
  await act(async () => button(storyMapStrings.save).click());
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(source === "iteration" ? { goal: "Independent goal", released: false, baseVersion: 1 } : { startDate: "2026-10-20", baseVersion: 1 });
});

function scopedAnnotations() {
  const managed = { id: randomUUID(), projectId, storyMapId, name: "Managed annotation", icon: "tag", color: "red", position: 0 };
  const unmanaged = { ...managed, id: randomUUID(), storyMapId: null, name: "workflow" };
  state.snapshot.annotations = [managed, unmanaged, { ...managed, id: randomUUID(), storyMapId: randomUUID() }];
  return { managed, unmanaged };
}

it("permits unmanaged modal Annotation assignments under the actual conflict connection", async () => {
  linkAndConflicts(["labels"]);
  const { managed, unmanaged } = scopedAnnotations();
  const requests: string[] = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/cards/${cardId}/annotations/${unmanaged.id}` && init?.method === "POST") {
      requests.push(path);
      return Promise.resolve(Response.json({ link: { id: randomUUID(), cardId, annotationId: unmanaged.id } }));
    }
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  expect(button(managed.name).disabled).toBe(true);
  expect(button(unmanaged.name).disabled).toBe(false);
  await act(async () => button(unmanaged.name).click());
  expect(requests).toEqual([`/api/cards/${cardId}/annotations/${unmanaged.id}`]);
});

it("keeps unmanaged bulk Annotation options usable while refusing managed choices", async () => {
  linkAndConflicts(["labels"]);
  const { managed, unmanaged } = scopedAnnotations();
  const requests: Array<{ patch: { addAnnotationId?: string } }> = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === "/api/cards/bulk" && init?.method === "PATCH") { requests.push(JSON.parse(String(init.body))); return Promise.resolve(Response.json({ cards: state.snapshot.cards })); }
    return originalFetch(path, init);
  }));
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="${storyMapStrings.selectCard(card.key, card.title)}"]`)!.click());
  const bar = document.querySelector(`[aria-label="${storyMapStrings.bulkActions}"]`)!;
  const select = bar.querySelector<HTMLSelectElement>(`[aria-label="${storyMapStrings.addAnnotation}"]`)!;
  expect(select.disabled).toBe(false);
  expect([...select.options].find((option) => option.value === managed.id)!.disabled).toBe(true);
  expect([...select.options].find((option) => option.value === unmanaged.id)!.disabled).toBe(false);
  await act(async () => { select.value = managed.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select.value).toBe("");
  await act(async () => { select.value = unmanaged.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => [...bar.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === storyMapStrings.apply)!.click());
  expect(requests).toHaveLength(1);
  expect(requests[0]!.patch).toEqual({ addAnnotationId: unmanaged.id });
});

it("adopts an untouched newly locked Card field on Keep mine without sending it after unlock", async () => {
  linkAndConflicts([]);
  const originalFetch = fetch;
  let first = true;
  const patches: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/cards/${cardId}` && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push(patch);
      if (first) {
        first = false;
        state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Canonical title", version: 2 } : card);
        return Promise.resolve(Response.json({ code: "conflict", message: "Changed", conflicts: [{ entity: "card", id: cardId, baseVersion: 1, currentVersion: 2, current: state.snapshot.cards.find((card) => card.id === cardId) }] }, { status: 409 }));
      }
    }
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "My owner");
  await act(async () => button(storyMapStrings.save).click());
  linkAndConflicts(["title"]);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: state.syncConflicts }));
  await act(async () => button("Keep mine").click());
  expect(title.value).toBe("Canonical title");
  expect(patches[1]!.title).toBeUndefined();
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: [] }));
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Later owner");
  await act(async () => button(storyMapStrings.save).click());
  expect(patches[2]).toMatchObject({ assignee: "Later owner", baseVersion: 2 });
  expect(patches[2]!.title).toBeUndefined();
});

it("preserves edits typed during a Card save while adopting untouched canonical values", async () => {
  linkAndConflicts([]);
  let finish!: (response: Response) => void;
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}` && init?.method === "PATCH" ? new Promise<Response>((resolve) => { finish = resolve; }) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Saved owner");
  await act(async () => button(storyMapStrings.save).click());
  await edit(title, "Typed during save");
  const saved = { ...state.snapshot.cards.find((card) => card.id === cardId)!, title: "Canonical title", assignee: "Saved owner", estimate: 8, version: 2 };
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? saved : card);
  await act(async () => finish(Response.json(saved)));
  expect(title.value).toBe("Typed during save");
  expect(document.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe("8");
});

it.each([false, true])("merges Release editor retry with dirty disputed name=%s and adopts untouched omitted fields", async (dirtyName) => {
  linkAndConflicts([]);
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId, version: 1, name: "Initial Release", goal: "Initial goal", position: 0, startDate: null, releaseDate: null });
  const current = { ...release, version: 2, name: "Canonical Release", goal: "Canonical goal" };
  state.snapshot.releases = [current];
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: release.id } : card);
  const patches: Array<Record<string, unknown>> = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/releases/${release.id}` && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push(patch);
      if (patches.length === 1) return Promise.resolve(Response.json({ code: "conflict", message: "Changed", conflicts: [{ entity: "release", id: release.id, baseVersion: 1, currentVersion: 2, current }] }, { status: 409 }));
      return Promise.resolve(Response.json({ ...current, ...patch, version: patches.length + 1 }));
    }
    return originalFetch(path, init);
  }));
  await mount(viewUrl);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(ReleaseEditor, { release, storyMapId, onClose: vi.fn() }) }))));
  const field = (label: string) => document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  if (dirtyName) await edit(field(panelStrings.releaseName), "My disputed Release");
  await edit(field(panelStrings.releaseStartDate), "2026-10-20");
  await act(async () => button(storyMapStrings.save).click());
  linkAndConflicts(["milestone"]);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: state.syncConflicts }));
  await act(async () => button("Keep mine").click());
  expect(patches[1]).toEqual({ startDate: "2026-10-20", baseVersion: 2 });
  expect(field(panelStrings.releaseName).value).toBe(dirtyName ? "My disputed Release" : current.name);
  expect(document.querySelector<HTMLTextAreaElement>(`[aria-label="${panelStrings.releaseGoal}"]`)!.value).toBe(current.goal);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: [] }));
  await edit(field(panelStrings.releaseStartDate), "2026-10-21");
  await act(async () => button(storyMapStrings.save).click());
  expect(patches[2]).toMatchObject({ name: dirtyName ? "My disputed Release" : current.name, goal: current.goal, startDate: "2026-10-21", baseVersion: 3 });
});

it.each([false, true])("merges Release date retry with dirty disputed date=%s and preserves exact later intent", async (dirtyDate) => {
  linkAndConflicts([]);
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId, version: 1, name: "Initial Release", position: 0, startDate: "2026-10-01", releaseDate: "2026-11-01" });
  const current = { ...release, version: 2, releaseDate: "2026-12-01" };
  state.snapshot.releases = [current];
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: release.id } : card);
  const patches: Array<Record<string, unknown>> = [];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/releases/${release.id}` && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push(patch);
      if (patches.length === 1) return Promise.resolve(Response.json({ code: "conflict", message: "Changed", conflicts: [{ entity: "release", id: release.id, baseVersion: 1, currentVersion: 2, current }] }, { status: 409 }));
      return Promise.resolve(Response.json({ ...current, ...patch, version: patches.length + 1 }));
    }
    return originalFetch(path, init);
  }));
  await mount(viewUrl);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(ReleaseDateFields, { release, storyMapId }) }))));
  const start = document.querySelector<HTMLInputElement>(`[aria-label="${panelStrings.startDateLabel(release.name)}"]`)!;
  const date = document.querySelector<HTMLInputElement>(`[aria-label="${panelStrings.releaseDateLabel(release.name)}"]`)!;
  await edit(dirtyDate ? date : start, dirtyDate ? "2027-01-01" : "2026-10-20");
  linkAndConflicts(["milestone"]);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: state.syncConflicts }));
  await act(async () => button("Keep mine").click());
  expect(patches[1]).toEqual({ startDate: dirtyDate ? release.startDate : "2026-10-20", baseVersion: 2 });
  expect(date.value).toBe(dirtyDate ? "2027-01-01" : current.releaseDate);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: [] }));
  await edit(start, "2026-10-21");
  expect(patches[2]).toEqual({ startDate: "2026-10-21", releaseDate: dirtyDate ? "2027-01-01" : current.releaseDate, baseVersion: 3 });
});

it("disables both Card Save actions when every dirty field becomes locked and restores them after unlock", async () => {
  linkAndConflicts([]);
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await edit(title, "My disputed title");
  expect(button(storyMapStrings.save).disabled).toBe(false);
  linkAndConflicts(["title"]);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: state.syncConflicts }));
  expect(button(storyMapStrings.save).disabled).toBe(true);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  const confirmSave = [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === storyMapStrings.save)!;
  expect(confirmSave.disabled).toBe(true);
  expect(confirmation.textContent).toContain(syncConflictStrings.lock(syncConflictStrings.fields.title));
  expect(title.value).toBe("My disputed title");
  await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === storyMapStrings.cancel)!.click());
  await edit(document.querySelector<HTMLInputElement>('input[placeholder="Unassigned"]')!, "Independent owner");
  expect(button(storyMapStrings.save).disabled).toBe(false);
  await act(async () => button(storyMapStrings.save).click());
  expect(state.savedPatch?.assignee).toBe("Independent owner");
  expect(state.savedPatch?.title).toBeUndefined();
  expect(button(storyMapStrings.save).disabled).toBe(true);
  await act(async () => state.client.setQueryData(["work-item-sync-health", storyMapId], { openConflicts: [] }));
  expect(title.disabled).toBe(false);
  expect(title.value).toBe("My disputed title");
  expect(button(storyMapStrings.save).disabled).toBe(false);
});

it.each(["status", "milestone"] as const)("describes the disabled Tracking %s select with persistent visible lock text", async (field) => {
  linkAndConflicts([field]);
  await mount(viewUrl);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(SyncFieldLocksProvider, { snapshot: state.snapshot, children: createElement(ReleaseKanban, { cards: state.snapshot.cards, releases: [], workflowStatuses: state.snapshot.workflowStatuses, dependencyKeys: {}, storyMapId, estimationUnit: "points" }) }))));
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  const control = document.querySelector<HTMLSelectElement>(`[aria-label="${field === "status" ? panelStrings.cardStatus(card.key) : panelStrings.cardRelease(card.key)}"]`)!;
  expect(control.disabled).toBe(true);
  const explanation = document.getElementById(control.getAttribute("aria-describedby")!);
  expect(explanation?.textContent).toBe(syncConflictStrings.lock(syncConflictStrings.fields[field]));
  expect(explanation?.hidden).toBe(false);
  expect(explanation?.closest('[hidden]')).toBeNull();
  await act(async () => { control.value = field === "status" ? "active" : ""; control.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(state.savedPatch).toBeUndefined();
});

it("keeps saved template estimate editable while description conflict and GitHub-owned status stay locked", async () => {
  linkAndConflicts(["description"]);
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  card.description = "Locked source description"; card.estimate = 2;
  state.snapshot.storyTemplates = [{ id: randomUUID(), projectId, storyMapId, name: "Editable defaults", descriptionTemplate: "Must not replace locked text", defaultStatus: "active", defaultEstimate: 8, position: 0 }];
  await mount(`${viewUrl}?card=${cardId}`);
  const neutral = document.querySelector<HTMLSelectElement>('[aria-label="Apply map-level description template"]')!;
  const saved = document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!;
  expect(neutral.disabled).toBe(true); expect(saved.disabled).toBe(false);
  await act(async () => { saved.value = state.snapshot.storyTemplates[0]!.id; saved.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(document.querySelector(".tiptap")?.textContent).toBe("Locked source description");
  await act(async () => button(storyMapStrings.save).click());
  await vi.waitFor(() => expect(state.savedPatch).toEqual({ estimate: 8, baseVersion: card.version }));
  expect(state.snapshot.cards.find((card) => card.id === cardId)).toMatchObject({ description: "Locked source description", status: "todo", estimate: 8 });
});
