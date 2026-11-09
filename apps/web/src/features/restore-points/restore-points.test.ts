// @vitest-environment jsdom // REQ restore point Activity interactions
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestorePoint, RestoreProjectResult } from "@storymapper/contracts";
import { restorePointStrings as strings } from "@storymapper/ui-strings";
import { router } from "../../app/router";
import { useAnnouncementStore } from "../../app/stores/announcement-store";
import { useActiveStoryMapStore } from "../../app/stores/active-story-map-store";
import { readRestoreResult, readSavedRestoreState, reloadRestoredApp } from "@storymapper/web/features/restore-points/restore-result";
import { formatLocalDateTime } from "@storymapper/web/app/format-date-time";
import { restorePointPresentation as presentation } from "@storymapper/web/features/restore-points/restore-point-presentation";

vi.mock("@storymapper/web/features/restore-points/restore-result", async (importOriginal) => ({
  ...await importOriginal<typeof import("@storymapper/web/features/restore-points/restore-result")>(),
  reloadRestoredApp: vi.fn()
}));
vi.mock("@storymapper/web/app/live/live-stream", () => ({
  startLiveStream: (callbacks: { state: (state: "connected") => void }) => {
    callbacks.state("connected");
    return () => {};
  }
}));

const projectId = randomUUID();
const point: RestorePoint = {
  fileName: "manual.sqlite", class: "manual", createdAt: "2026-10-04T12:00:00.000Z", sizeBytes: 4096,
  schemaVersion: `release-sha256-${"a".repeat(64)}`, scope: "local-database"
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let points: RestorePoint[];
let createResponse: (() => Promise<Response>) | undefined;
let listResponse: (() => Response) | undefined;
let createCalls: number;
let restoreCalls: number;
let restoreResponse: (() => Promise<Response>) | undefined;
let activityEvents: Array<{ id: string; action: string; createdAt: string; undoneByRestore: boolean; after?: unknown }>;
let epoch: string;
let liveProjectId: string;
let outcomeUnavailable: "503" | "transport" | undefined;
const result: RestoreProjectResult = {
  restorePoint: point, preRestorePoint: { ...point, class: "pre-restore", fileName: "pre-restore.sqlite" },
  epoch: randomUUID(), githubLinks: [{ url: "https://github.com/example/project/issues/42", provider: "github", kind: "canonical" },
    { url: "https://github.com/example/project/issues/43", provider: "github", kind: "canonical" }],
  attachmentsRetained: true, undoneActivityEvents: 3, undoneChangeSets: 2
};

function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll("button")].find((element) => element.textContent === text);
  expect(result, text).toBeDefined();
  return result!;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function mount(search = "") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  router.update({ history: createMemoryHistory({ initialEntries: [`/projects/${projectId}/audit${search}`] }) });
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
    await router.load();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector(".sidebar a[href$='/audit']")?.textContent).toBe("Activity");
  });
}

async function openRestorePoints() {
  await act(async () => { button(strings.title).focus(); button(strings.title).click(); });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.textContent).toContain(strings.scope);
    expect(host.textContent).not.toContain(strings.loading);
  });
}

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  useActiveStoryMapStore.setState({ activeProjectId: projectId, activeStoryMapId: undefined, lastActiveProjectId: undefined, lastActiveStoryMapId: undefined });
  useAnnouncementStore.setState({ status: "", alert: "" });
  points = [];
  sessionStorage.clear();
  vi.mocked(reloadRestoredApp).mockClear();
  restoreCalls = 0;
  activityEvents = [];
  epoch = randomUUID();
  liveProjectId = projectId;
  outcomeUnavailable = undefined;
  restoreResponse = undefined;
  createCalls = 0;
  createResponse = undefined;
  listResponse = undefined;
  resetRestorePointFixtureState();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  client?.clear();
  host?.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("production Activity restore points", () => {
  it("opens the linked exact Agent restore point without restoring and keeps the existing confirmation", testOpensTheLinkedExactAgentRestorePointWithoutRestoringAndKeeps);

  registerReportsAPrunedLinkedRestorePointWithoutSelectingAnother();

  it("does not POST when the required local attempt record cannot be saved", testDoesNotPOSTWhenTheRequiredLocalAttemptRecordCannotBe);

  it("reloads after successful restore even when result storage fails, then recovers the durable Activity result", testReloadsAfterSuccessfulRestoreEvenWhenResultStorageFailsThenRecovers);

  registerShowsMalformedSavedJSONExplicitlyWithoutCrashingTheRoot();

  registerReconcilesALostSuccessfulResponseSAfterReloadWithout();

  registerPermitsEditingAndAnExplicitRetryAfterSWhen();

  registerKeepsUnavailableSOutcomesBlockedUntilASuccessfulBaseline();

  it("keeps an unconfirmed outcome blocked and permits Activity rechecking without resending restore", testKeepsAnUnconfirmedOutcomeBlockedAndPermitsActivityRecheckingWithoutResending);
  it("shows preserved later Activity Events as undone without changing their action", async () => {
    activityEvents = [{ id: randomUUID(), action: "changeset.applied", createdAt: point.createdAt, undoneByRestore: true }];
    await mount();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(host.querySelector("ol li")?.textContent).toContain("changeset.applied");
      expect(host.querySelector("ol li")?.textContent).toContain(strings.undone);
    });
  });
  it("confirms global undo/protection, contains pending focus and persists the result for the reloaded root", testConfirmsGlobalUndoProtectionContainsPendingFocusAndPersistsTheResult);

  it("reports a refused restore concretely, releases the progress dialog and allows retry", testReportsARefusedRestoreConcretelyReleasesTheProgressDialogAndAllows);
  it("mounts production navigation and persistent live regions, creates via native button and retains metadata across reload", testMountsProductionNavigationAndPersistentLiveRegionsCreatesViaNativeButton);

  it("disables duplicate actions while pending and announces the retained concrete server cause without a partial row", testDisablesDuplicateActionsWhilePendingAndAnnouncesTheRetainedConcreteServer);

  it("refreshes the visible published point after a retention failure and preserves truthful server wording", testRefreshesTheVisiblePublishedPointAfterARetentionFailureAndPreserves);

  it("keeps creation pending across Activity panel remounts, blocks another POST and permits retry after settlement", testKeepsCreationPendingAcrossActivityPanelRemountsBlocksAnotherPOSTAnd);

  it("announces a concrete list failure through the same always-mounted root alert", async () => {
    listResponse = () => json({ message: "EACCES: permission denied, scandir snapshots" }, 500);
    await mount();
    const alert = host.querySelector('[role="alert"]');
    await openRestorePoints();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(alert?.textContent).toBe(strings.listFailed("EACCES: permission denied, scandir snapshots"));
    });
    expect(host.querySelector('[role="alert"]')).toBe(alert);
  });
});

it("defines one global surface-token focus rule and input/editor boundary tokens", () => {
  const css = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  expect(css.match(/:focus-visible/g)).toHaveLength(1);
  expect(css).toMatch(/--focus-ring-light: var\(--color-primary\);/);
  expect(css).toMatch(/--focus-ring-dark: var\(--color-surface\);/);
  expect(css).toMatch(/--border-input: #7a877f;/);
  expect(css).toMatch(/:root :focus-visible\s*\{\s*outline: 2px solid var\(--focus-ring\);\s*outline-offset: 2px;/);
  expect(css).toMatch(/box-shadow: 0 0 0 2px var\(--focus-ring-dark\), 0 0 0 6px var\(--focus-ring-light\);/);
  expect(css.match(/:root\s*\{[^}]*--focus-ring: var\(--focus-ring-light\)/g)).toHaveLength(1);
  expect(css).not.toContain("outline: none");
  expect(css).toMatch(/\.sidebar\s*\{[^}]*--focus-ring: var\(--focus-ring-dark\)/);
  expect(css).toMatch(/button,\s*\.button-link\s*\{[^}]*--focus-ring: var\(--focus-ring-dark\)/);
  expect(css).toMatch(/button.secondary,\s*\.button-link.secondary\s*\{[^}]*--focus-ring: var\(--focus-ring-light\)/);
  expect(css).toMatch(/:root input,\s*:root select,\s*:root textarea,\s*:root \.tiptap\s*\{[^}]*--focus-ring: var\(--focus-ring-light\);\s*border-color: var\(--border-input\)/);
});

function resetRestorePointFixtureState() {
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/human/projects/${projectId}/restore`) {
      restoreCalls++;
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ fileName: point.fileName, confirm: true });
      return restoreResponse ? restoreResponse() : json(result);
    }
    if (path === `/api/human/projects/${projectId}/restore-points`) {
      if (init?.method === "POST") {
        createCalls++;
        expect(JSON.parse(String(init.body))).toEqual({ class: "manual" });
        if (createResponse) return createResponse();
        points = [point];
        return json({ restorePoint: point }, 201);
      }
      return listResponse ? listResponse() : json({ restorePoints: points });
    }
    if (path === "/api/projects") return json({ projects: [{ id: liveProjectId, name: "DOM fixture" }] });
    if (path === "/health") return json({ ok: true });
    if (path === "/api/credentials/status") return json({ credentials: [] });
    if (path === `/api/human/projects/${projectId}/restore-activity`) {
      if (outcomeUnavailable === "transport") throw new TypeError("Server connection unavailable");
      return outcomeUnavailable === "503" ? json({ message: "Project restore is in progress" }, 503) : json({ activityEvents: activityEvents.filter((event) => event.action === "project.restored").map(({ id, action, undoneByRestore, after }) => ({ id, action, undoneByRestore, after })) });
    }
    if (path.startsWith("/api/activity?")) return json({ activityEvents: activityEvents.map(({ id, action, createdAt, undoneByRestore }) => ({ id, action, createdAt, undoneByRestore, projectId, scope: "project", actor: "local-user", actorType: "human" })), nextCursor: null });
    if (path === `/api/settings/safety?projectId=${liveProjectId}`) return json({ settings: { projectId: liveProjectId, agentMode: "apply", github: false, epoch, updatedAt: "2026-10-19T00:00:00.000Z" } });
    if (path === `/api/settings/safety?projectId=${projectId}`) return json({ message: "Project has no live settings" }, 404);
    if (path === `/api/reports/source-coverage?projectId=${projectId}`) return json({ coverageRatio: 0 });
    throw new Error(`Unexpected restore point DOM request: ${path}`);
  }));
  host = document.createElement("div");
  document.body.append(host);
}

function registerKeepsUnavailableSOutcomesBlockedUntilASuccessfulBaseline() {
  it.each(["503", "transport"] as const)("keeps unavailable %s outcomes blocked until a successful baseline-epoch check, without another restore POST", async (failure) => {
    points = [point];
    restoreResponse = async () => { throw new TypeError("Restore response unavailable"); };
    await mount();
    await openRestorePoints();
    await act(async () => button(strings.restore).click());
    await act(async () => button(strings.confirmRestore).click());
    await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
    outcomeUnavailable = failure;
    await act(async () => root.unmount());
    client.clear();
    await mount();
    await vi.waitFor(async () => {
      await act(async () => { });
      expect(button(strings.checkOutcome).disabled).toBe(false);
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("outcome could not be checked");
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).not.toContain(strings.unchangedTitle);
    expect(dialog.textContent).not.toContain(strings.continueEditing);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(host.inert).toBe(true);
    expect(readSavedRestoreState().attempt).toBeDefined();
    outcomeUnavailable = undefined;
    await act(async () => button(strings.checkOutcome).click());
    await vi.waitFor(async () => {
      await act(async () => { });
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.unchangedTitle);
    });
    await act(async () => button(strings.continueEditing).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.inert).toBe(false);
    expect(restoreCalls).toBe(1);
  });
}

function registerPermitsEditingAndAnExplicitRetryAfterSWhen() {
  it.each(["lost-before-publication", "rolled-back-500"])("permits editing and an explicit retry after %s when available APIs confirm the baseline epoch", async (failure) => {
    points = [point];
    const beforeEpoch = epoch;
    restoreResponse = async () => {
      if (failure === "rolled-back-500") return json({ message: "Project restore failed and the original database was restored" }, 500);
      throw new TypeError("Request did not reach the server");
    };
    await mount();
    await openRestorePoints();
    await act(async () => button(strings.restore).click());
    await act(async () => button(strings.confirmRestore).click());
    await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
    expect(readSavedRestoreState().attempt?.epoch).toBe(beforeEpoch);
    await act(async () => root.unmount());
    client.clear();
    await mount();
    await vi.waitFor(async () => {
      await act(async () => { });
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.unchangedTitle);
      expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.unchangedTitle);
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.unchangedDescription);
    expect(restoreCalls).toBe(1);
    await act(async () => button(strings.continueEditing).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.inert).toBe(false);
    expect(readSavedRestoreState()).toEqual({});
    await openRestorePoints();
    expect(button(strings.restore).disabled).toBe(false);
    await act(async () => button(strings.restore).click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(strings.confirmTitle);
    expect(restoreCalls).toBe(1);
    await act(async () => button(strings.cancel).click());
  });
}

function registerReconcilesALostSuccessfulResponseSAfterReloadWithout() {
  it.each(["transport", "502", "malformed"])("reconciles a lost successful response (%s) after reload without announcing a confirmed failure", async (responseFailure) => {
    points = [point];
    const oldEventId = randomUUID();
    const oldEpoch = epoch;
    activityEvents = [{ id: oldEventId, action: "project.restored", createdAt: point.createdAt, undoneByRestore: false, after: { ...result, epoch: oldEpoch } }];
    restoreResponse = async () => {
      epoch = result.epoch;
      liveProjectId = randomUUID();
      activityEvents.push({ id: randomUUID(), action: "project.restored", createdAt: point.createdAt, undoneByRestore: false, after: result });
      if (responseFailure === "502") return json({ message: "Gateway lost the completed response" }, 502);
      if (responseFailure === "malformed") return new Response("{", { headers: { "content-type": "application/json" } });
      throw new TypeError("Connection closed before response");
    };
    await mount();
    await openRestorePoints();
    await act(async () => button(strings.restore).click());
    await act(async () => button(strings.confirmRestore).click());
    await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
    expect(readSavedRestoreState().attempt).toEqual({ projectId, fileName: point.fileName, epoch: oldEpoch, eventIds: [oldEventId] });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(strings.unknownResponse(""));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.outcomeUnknownTitle);
    await act(async () => root.unmount());
    client.clear();
    await mount();
    await vi.waitFor(async () => {
      await act(async () => { });
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.restoredTitle);
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.undoneCounts(3, 2));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.restoredTitle);
    expect(restoreCalls).toBe(1);
  });
}

function registerShowsMalformedSavedJSONExplicitlyWithoutCrashingTheRoot() {
  it("shows malformed saved JSON explicitly without crashing the root", async () => {
    sessionStorage.setItem("storymapper.restore-result", "{");
    await mount();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.savedDataIssueTitle);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Saved restoration data could not be read");
    expect(host.querySelector(".sidebar")).not.toBeNull();
    await act(async () => button(strings.done).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(readSavedRestoreState()).toEqual({});
  });
}

function registerReportsAPrunedLinkedRestorePointWithoutSelectingAnother() {
  it("reports a pruned linked restore point without selecting another point or restoring", async () => {
    points = [point];
    await mount("?restorePoint=pruned.sqlite");
    await vi.waitFor(async () => {
      await act(async () => { });
      expect(host.textContent).toContain(presentation.requestedUnavailable);
    });
    expect(document.activeElement?.hasAttribute("data-restore-point")).not.toBe(true);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    const notice = host.querySelector(".restore-point-selection")!;
    expect(notice.querySelector('[role="alert"]')?.textContent).not.toContain("pruned.sqlite");
    expect(notice.querySelector("details")?.open).toBe(false);
    expect(notice.querySelector("details")?.textContent).toContain("pruned.sqlite");
    expect(restoreCalls).toBe(0);
  });
}

async function testOpensTheLinkedExactAgentRestorePointWithoutRestoringAndKeeps() {
  const other = { ...point, fileName: "other.sqlite", createdAt: "2026-10-04T13:00:00.000Z" };
  points = [other, point];
  await mount(`?restorePoint=${point.fileName}`);
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.activeElement?.getAttribute("data-restore-point")).toBe(point.fileName);
  });
  expect(host.textContent).toContain(presentation.requestedPoint);
  expect(host.querySelector('.restore-point-selection [role="status"]')?.textContent).not.toContain(point.fileName);
  expect(restoreCalls).toBe(0);
  const row = host.querySelector<HTMLLIElement>(`[data-restore-point="${point.fileName}"]`)!;
  await act(async () => row.querySelector("button")!.click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(strings.confirmDescription);
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  expect(confirmation.querySelector("p:not([id])")?.textContent).toContain("Manually created");
  expect(confirmation.textContent).toContain(formatLocalDateTime(point.createdAt));
  expect(confirmation.querySelector("details")?.open).toBe(false);
  expect(confirmation.querySelector(".button-row")).not.toBeNull();
  expect(restoreCalls).toBe(0);
}

async function testDoesNotPOSTWhenTheRequiredLocalAttemptRecordCannotBe() {
  points = [point];
  await mount();
  await openRestorePoints();
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "storymapper.restore-attempt") throw new DOMException("Storage is unavailable", "SecurityError");
    setItem.call(this, key, value);
  });
  await act(async () => button(strings.restore).click());
  await act(async () => button(strings.confirmRestore).click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(strings.attemptStorageFailed("Storage is unavailable"));
  });
  expect(restoreCalls).toBe(0);
  expect(reloadRestoredApp).not.toHaveBeenCalled();
  expect(button(strings.restore).disabled).toBe(false);
}

async function testReloadsAfterSuccessfulRestoreEvenWhenResultStorageFailsThenRecovers() {
  points = [point];
  restoreResponse = async () => {
    epoch = result.epoch;
    activityEvents = [{ id: randomUUID(), action: "project.restored", createdAt: point.createdAt, undoneByRestore: false, after: result }];
    return json(result);
  };
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "storymapper.restore-result") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    setItem.call(this, key, value);
  });
  await mount();
  await openRestorePoints();
  await act(async () => button(strings.restore).click());
  await act(async () => button(strings.confirmRestore).click());
  await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
  expect(readSavedRestoreState().attempt).toBeDefined();
  expect(readRestoreResult()).toBeUndefined();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(strings.resultStorageFailed("Storage quota exceeded"));
  await act(async () => root.unmount());
  client.clear();
  await mount();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.restoredTitle);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(result.preRestorePoint.fileName);
  });
  expect(restoreCalls).toBe(1);
  await act(async () => button(strings.done).click());
  expect(readSavedRestoreState()).toEqual({});
}

async function testKeepsAnUnconfirmedOutcomeBlockedAndPermitsActivityRecheckingWithoutResending() {
  points = [point];
  restoreResponse = async () => { epoch = result.epoch; throw new TypeError("Connection closed before response"); };
  await mount();
  await openRestorePoints();
  await act(async () => button(strings.restore).click());
  await act(async () => button(strings.confirmRestore).click());
  await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
  await act(async () => root.unmount());
  client.clear();
  await mount();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(button(strings.checkOutcome).disabled).toBe(false);
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    dialog.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(host.inert).toBe(true);
  epoch = result.epoch;
  activityEvents.push({ id: randomUUID(), action: "project.restored", createdAt: point.createdAt, undoneByRestore: false, after: result });
  await act(async () => button(strings.checkOutcome).click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.restoredTitle);
  });
  expect(restoreCalls).toBe(1);
}

async function testConfirmsGlobalUndoProtectionContainsPendingFocusAndPersistsTheResult() {
  points = [point];
  let resolve!: (response: Response) => void;
  restoreResponse = () => new Promise<Response>((done) => { resolve = done; });
  await mount();
  await openRestorePoints();
  const trigger = button(strings.restore);
  await act(async () => { trigger.focus(); trigger.click(); });
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(strings.confirmDescription);
  expect(document.activeElement).toBe(button(strings.cancel));
  await act(async () => button(strings.cancel).click());
  expect(restoreCalls).toBe(0);
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => { button(strings.confirmRestore).click(); button(strings.confirmRestore).click(); });
  expect(restoreCalls).toBe(1);
  const progress = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(progress.textContent).toContain(strings.restoringDescription);
  expect(document.activeElement).toBe(progress);
  await act(async () => {
    progress.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    progress.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(document.querySelector('[role="dialog"]')).toBe(progress);
  expect(button(strings.create).disabled).toBe(true);
  await act(async () => button(strings.activityLog).click());
  expect(host.textContent).not.toContain(strings.scope);
  expect(document.querySelector('[role="dialog"]')).toBe(progress);
  expect(document.activeElement).toBe(progress);
  await act(async () => resolve(json(result)));
  await vi.waitFor(() => expect(reloadRestoredApp).toHaveBeenCalledOnce());
  expect(readRestoreResult()).toEqual(result);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(strings.restoringTitle);
  await act(async () => root.unmount());
  client.clear();
  await mount();
  const completed = document.querySelector('[role="dialog"]')!;
  expect(completed.textContent).toContain(result.preRestorePoint.fileName);
  expect(completed.textContent).toContain(strings.attachmentsRetained);
  expect(completed.textContent).toContain(strings.undoneCounts(3, 2));
  expect([...completed.querySelectorAll("a")].map((link) => link.href)).toEqual(result.githubLinks.map((link) => link.url));
  expect(document.activeElement).toBe(completed.querySelector("h2"));
  expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.restoredTitle);
  await act(async () => button(strings.done).click());
  expect(readRestoreResult()).toBeUndefined();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
}

async function testReportsARefusedRestoreConcretelyReleasesTheProgressDialogAndAllows() {
  points = [point];
  restoreResponse = async () => json({ message: "Restore point schema does not match the current development schema" }, 400);
  await mount();
  await openRestorePoints();
  await act(async () => { button(strings.restore).focus(); button(strings.restore).click(); });
  await act(async () => button(strings.confirmRestore).click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(strings.restoreFailed("Restore point schema does not match the current development schema"));
  });
  expect(reloadRestoredApp).not.toHaveBeenCalled();
  expect(readRestoreResult()).toBeUndefined();
  expect(button(strings.restore).disabled).toBe(false);
  expect(document.activeElement).toBe(button(strings.restore));
}

async function testMountsProductionNavigationAndPersistentLiveRegionsCreatesViaNativeButton() {
  await mount();
  const status = host.querySelector('[role="status"]');
  const alert = host.querySelector('[role="alert"]');
  expect(status?.getAttribute("aria-live")).toBe("polite");
  expect(alert?.getAttribute("aria-live")).toBe("assertive");
  await openRestorePoints();
  await act(async () => { button(strings.create).focus(); button(strings.create).click(); });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.created);
    expect(host.textContent).toContain(point.schemaVersion);
  });
  expect(host.querySelector('[role="status"]')).toBe(status);
  expect(host.querySelector('[role="alert"]')).toBe(alert);
  expect(host.textContent).toContain("4 KiB");
  expect(host.querySelector("time")?.textContent).toBe(formatLocalDateTime(point.createdAt));
  const row = host.querySelector<HTMLLIElement>(".restore-point-list li")!;
  expect(row.querySelector("strong")?.textContent).toBe("Manually created");
  const details = row.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.textContent).toContain(point.fileName);
  expect(details.textContent).toContain(point.schemaVersion);
  expect(details.textContent).toContain(point.createdAt);
  expect(details.textContent).toContain(point.class);
  await act(async () => details.querySelector("summary")!.click());
  expect(details.open).toBe(true);
  row.focus();
  expect(document.activeElement).toBe(row);
  await act(async () => root.unmount());
  client.clear();
  await mount();
  await openRestorePoints();
  expect(host.textContent).toContain(point.schemaVersion);
  await act(async () => button(strings.activityLog).click());
  expect(host.textContent).toContain("Export");
  expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.created);
}

async function testDisablesDuplicateActionsWhilePendingAndAnnouncesTheRetainedConcreteServer() {
  let resolve!: (response: Response) => void;
  createResponse = () => new Promise<Response>((done) => { resolve = done; });
  await mount();
  await openRestorePoints();
  await act(async () => { button(strings.create).click(); button(strings.create).click(); });
  const pending = button(strings.creating);
  expect(pending.disabled).toBe(true);
  await act(async () => pending.click());
  expect(createCalls).toBe(1);
  await act(async () => resolve(json({ message: "SQLITE_FULL: database or disk is full" }, 500)));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(strings.createFailed("SQLITE_FULL: database or disk is full"));
    expect(button(strings.create).disabled).toBe(false);
  });
  expect(button(strings.create).disabled).toBe(false);
  expect(host.querySelectorAll(".restore-point-list li")).toHaveLength(0);
  await act(async () => button(strings.activityLog).click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("SQLITE_FULL");
  await openRestorePoints();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("SQLITE_FULL");
}

async function testRefreshesTheVisiblePublishedPointAfterARetentionFailureAndPreserves() {
  createResponse = async () => {
    points = [point];
    return json({ message: "Restore point published, but retention failed: EACCES: unlink older snapshot" }, 500);
  };
  await mount();
  await openRestorePoints();
  await act(async () => button(strings.create).click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(strings.createFailed("Restore point published, but retention failed: EACCES: unlink older snapshot"));
    expect(host.textContent).toContain(point.schemaVersion);
    expect(button(strings.create).disabled).toBe(false);
  });
  expect(host.querySelectorAll(".restore-point-list li")).toHaveLength(1);
  expect(host.querySelector('[role="alert"]')?.textContent).not.toContain("could not be created");
}

async function testKeepsCreationPendingAcrossActivityPanelRemountsBlocksAnotherPOSTAnd() {
  let resolve!: (response: Response) => void;
  createResponse = () => new Promise<Response>((done) => { resolve = done; });
  await mount();
  await openRestorePoints();
  await act(async () => { button(strings.create).click(); button(strings.create).click(); });
  expect(createCalls).toBe(1);
  await act(async () => button(strings.activityLog).click());
  await openRestorePoints();
  expect(button(strings.creating).disabled).toBe(true);
  await act(async () => button(strings.creating).click());
  expect(createCalls).toBe(1);
  await act(async () => resolve(json({ message: "SQLITE_FULL: database or disk is full" }, 500)));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(button(strings.create).disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("SQLITE_FULL");
  });
  createResponse = undefined;
  await act(async () => button(strings.create).click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(createCalls).toBe(2);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(strings.created);
    expect(host.textContent).toContain(point.schemaVersion);
  });
}
