// @vitest-environment jsdom // REQ Story 7.2 actual connection consumer
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByLabelText, getByRole, queryByRole } from "@testing-library/dom";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { connectorConnectionSchema, safetySettingsSchema, verifyGitHubConnectionResponseSchema, connectGitHubConnectionResponseSchema, type ConnectorConnection, type SafetySettings, type VerifyGitHubConnectionResponse } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appStrings, githubConnectStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { SafetySwitchStrip } from "@storymapper/web/features/safety";
import { GitHubConnectionsPanel } from "@storymapper/web/features/github-sync/GitHubConnectionsPanel";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { githubStatusStrings } from "@storymapper/web/ui-strings/github-status";

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => createElement("a", {}, children) }));
const projectId = randomUUID();
const now = "2026-10-19T10:00:00.000Z";
const settings = safetySettingsSchema.parse({ projectId, github: false, updatedAt: now });
const verified: VerifyGitHubConnectionResponse = { ok: true, verificationId: randomUUID(), verifiedSource: "candidate-token", operationalSource: "github-cli", capabilities: { read: true, write: "unknown", limitation: "Repository read does not guarantee Issue or Milestone writes." }, githubEnabled: false, message: strings.offNotice };
let client: QueryClient;
let root: Root;
let host: HTMLElement;
let posts: Array<{ path: string; body: Record<string, unknown> }>;
let reply: (path: string) => unknown | Promise<unknown>;
let canary: string;
let savedConnections: ConnectorConnection[];
let savedSettings: SafetySettings;
let safetyReadFails: boolean;
let getRequests: string[];

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function button(name: string) { return getByRole(document.body, "button", { name }) as HTMLButtonElement; }
async function click(name: string) { await act(async () => { fireEvent.click(button(name)); }); }
async function field(name: string, value: string) { await act(async () => { fireEvent.change(getByLabelText(queryByRole(document.body, "dialog") ?? document.body, name, { exact: true }), { target: { value } }); }); }
async function mount(id = projectId) { await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement("div", {}, createElement(SafetySwitchStrip, { projectId: id }), createElement(GitHubConnectionsPanel, { projectId: id })))); }); }
async function openToken() {
  await mount(); await click(strings.open);
  await field(strings.method, "token");
  await field(strings.token, canary);
  await field(panelStrings.owner, "fixture");
  await field(panelStrings.repository, "repository");
  await act(async () => { fireEvent.click(getByLabelText(document.body, strings.consent)); });
}
async function verify() { await click(strings.verify); expect(document.body.textContent).toContain(strings.offNotice); }
function connectResponse() {
  const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId, provider: "github", authMode: "token", name: panelStrings.gitHubRepo, owner: "fixture", repository: "repository", readOnly: true, createdAt: now, updatedAt: now });
  return { ok: true, connection, connections: [connection], settings: { ...settings, github: true }, credentials: [], credentialStored: true, publicationWarning: false };
}
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise<unknown>((done) => { resolve = done; }); return { resolve, promise }; }

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useLiveInteractionStore.setState({ epoch: randomUUID(), restoreRevision: 0, restorePending: false });
  savedConnections = []; savedSettings = settings; safetyReadFails = false; getRequests = [];
  posts = []; canary = randomUUID(); reply = (path) => path.endsWith("verify") ? verified : connectResponse();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(["safety-settings", projectId], { settings });
  client.setQueryData(["connector-connections", projectId], { connections: [] });
  client.setQueryData(["credential-status"], { credentials: [] });
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") { posts.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> }); const value = await reply(path); return json(path.endsWith("status-projects") ? value : path.endsWith("verify") ? verifyGitHubConnectionResponseSchema.parse(value) : connectGitHubConnectionResponseSchema.parse(value)); }
    getRequests.push(path);
    if (path.startsWith("/api/settings/safety")) { if (safetyReadFails) throw new TypeError("fixture settings unavailable"); return json({ settings: path.endsWith(projectId) ? savedSettings : { ...settings, projectId: new URL(path, "http://127.0.0.1").searchParams.get("projectId") } }); }
    if (path.startsWith("/api/connectors/connections?")) return json({ connections: path.endsWith(projectId) ? savedConnections : [] });
    if (path === "/api/credentials/status") return json({ credentials: [{ source: "github-cli", message: "CLI fixture available." }] });
    throw new Error(`Unexpected test request: ${path}`);
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

it("wraps the credential path without imposing a minimum width on the connection form", async () => {
  const message = "Credentials are stored in /fixture/local-project/credentials.json";
  client.setQueryData(["credential-status"], { credentials: [{ provider: "github", source: "user-file", configured: true, message }] });
  const style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style);
  try {
    await mount();
    const notice = host.querySelector(".github-connection-form > .privacy-notice")!;
    expect(notice.textContent).toBe(message);
    expect(getComputedStyle(notice).minWidth).toBe("0");
    expect(getComputedStyle(notice).overflowWrap).toBe("anywhere");
  } finally { style.remove(); }
});

it("discovers and explicitly selects a Project field, saves it, and preserves it on reopening", async () => {
  const selected = { kind: "project" as const, projectId: "delivery", projectName: "Delivery · Delivery stage", fieldId: "workflow" };
  reply = (path) => {
    if (path.endsWith("status-projects")) return { projects: [{ id: selected.projectId, name: selected.projectName, fieldId: selected.fieldId }] };
    if (path.endsWith("verify")) return verified;
    const result = connectResponse(); result.connection.statusSource = selected; savedConnections = [result.connection]; savedSettings = result.settings;
    return { ...result, connections: savedConnections };
  };
  await openToken();
  await click(githubStatusStrings.loadProjects);
  await field(githubStatusStrings.source, JSON.stringify([selected.projectId, selected.fieldId]));
  await verify();
  expect((posts.find((post) => post.path.endsWith("verify"))!.body.candidate as { configuration: ConnectorConnection }).configuration.statusSource).toEqual(selected);
  await click(strings.connect);
  await click(strings.open);
  const select = getByLabelText(queryByRole(document.body, "dialog")!, githubStatusStrings.source) as HTMLSelectElement;
  expect(select.value).toBe(JSON.stringify([selected.projectId, selected.fieldId]));
  expect(select.selectedOptions[0]!.textContent).toBe(selected.projectName);
});

it.each(["owner", "repository", "auth", "project"] as const)("clears discovered alternatives without implicitly changing the selected source after a %s scope change", async (scope) => {
  const selected = { id: "chosen", name: "Chosen Project · Stage", fieldId: "stage" };
  const selection = JSON.stringify([selected.id, selected.fieldId]);
  reply = (path) => path.endsWith("status-projects") ? { projects: [selected, { id: "alternative", name: "Stale alternative · Stage", fieldId: "other" }] } : verified;
  await openToken(); await click(githubStatusStrings.loadProjects);
  await field(githubStatusStrings.source, selection);
  if (scope === "project") { await mount(randomUUID()); if (!queryByRole(document.body, "dialog")) await click(strings.open); }
  else await field(scope === "auth" ? strings.method : scope === "owner" ? panelStrings.owner : panelStrings.repository, scope === "auth" ? "github-cli" : "changed");
  const select = getByLabelText(queryByRole(document.body, "dialog")!, githubStatusStrings.source) as HTMLSelectElement;
  expect(select.value).toBe(scope === "project" ? "repository" : selection);
  expect([...select.options].map((option) => option.value)).toEqual(scope === "project" ? ["repository"] : ["repository", selection]);
  if (scope !== "project") {
    await click(githubStatusStrings.loadProjects);
    expect(posts.filter((post) => post.path.endsWith("status-projects")).at(-1)!.body.statusSource).toEqual({ kind: "project", projectId: selected.id, projectName: selected.name, fieldId: selected.fieldId });
  }
});

it("ignores stale discovery responses while preserving an explicitly selected Project and field", async () => {
  const pending = deferred();
  let reads = 0;
  reply = () => ++reads === 1 ? { projects: [{ id: "chosen", name: "Chosen Project · Stage", fieldId: "stage" }, { id: "alternative", name: "Stale alternative · Stage", fieldId: "other" }] } : pending.promise;
  await openToken(); await click(githubStatusStrings.loadProjects);
  const selection = JSON.stringify(["chosen", "stage"]);
  await field(githubStatusStrings.source, selection);
  await click(githubStatusStrings.loadProjects);
  await field(panelStrings.owner, "changed-owner");
  await act(async () => pending.resolve({ projects: [{ id: "old", name: "Old Project · Stage", fieldId: "stage" }] }));
  const select = getByLabelText(queryByRole(document.body, "dialog")!, githubStatusStrings.source) as HTMLSelectElement;
  expect(select.value).toBe(selection);
  expect([...select.options].map((option) => option.value)).toEqual(["repository", selection]);
});

it("uses consented candidate Verify then separate Connect, preserves defaults and adopts authoritative caches", async () => {
  await openToken();
  expect(document.querySelector(".safety-pill")!.getAttribute("aria-label")).toContain(appStrings.safetySwitchState(appStrings.githubSwitch, appStrings.off));
  expect(posts).toHaveLength(0);
  expect(queryByRole(document.body, "button", { name: panelStrings.saveNew })).toBeNull();
  expect(queryByRole(document.body, "button", { name: panelStrings.enable })).toBeNull();
  await verify();
  expect(posts).toHaveLength(1);
  const candidate = posts[0]!.body.candidate as { configuration: Record<string, unknown>; credential: unknown };
  expect(candidate.credential).toEqual({ method: "token", token: canary });
  expect(candidate.configuration).toMatchObject({ projectId, readOnly: true, defaultLabel: "local-story-map", releaseSource: "milestone", iterationFieldName: "Iteration", labelsAsAnnotations: false, typeMapping: [{ match: "epic", level: "activity" }, { match: "feature", level: "step" }] });
  expect(client.getQueryData(["safety-settings", projectId])).toEqual({ settings });
  expect(document.body.textContent).toContain(strings.operationalSource("github-cli"));
  expect(document.body.textContent).toContain(strings.writeCapability("unknown"));
  await click(strings.connect);
  expect(posts.map((post) => post.path)).toEqual(["/api/connectors/github/verify", "/api/connectors/github/connect"]);
  expect(client.getQueryData(["safety-settings", projectId])).toEqual({ settings: { ...settings, github: true } });
  expect((client.getQueryData(["connector-connections", projectId]) as { connections: unknown[] }).connections).toHaveLength(1);
  expect(client.getQueryData(["credential-status"])).toEqual({ credentials: [] });
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(document.querySelector(".safety-pill")!.getAttribute("aria-label")).toContain(appStrings.safetySwitchState(appStrings.githubSwitch, appStrings.on));
  expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain(canary);
  expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(canary);
});

it("adopts the new connection as the panel selection after Connect", async () => {
  await openToken(); await verify(); await click(strings.connect);
  const [saved] = (client.getQueryData(["connector-connections", projectId]) as { connections: ConnectorConnection[] }).connections;
  expect((getByRole(document.body, "combobox", { name: strings.connectionSelection }) as HTMLSelectElement).value).toBe(saved!.id);
  expect(document.body.textContent).toContain(strings.connected);
});

it("shows the already-enabled notice instead of the off notice when GitHub is on", async () => {
  const enabled = { ...settings, github: true };
  savedSettings = enabled; client.setQueryData(["safety-settings", projectId], { settings: enabled });
  reply = (path) => path.endsWith("verify") ? { ...verified, githubEnabled: true, message: strings.verified } : connectResponse();
  await openToken(); await click(strings.verify);
  expect(document.body.textContent).toContain(strings.verified);
  expect(document.body.textContent).not.toContain(strings.offNotice);
});

it("requires consent and retains actionable errors and drafts after failure and Cancel/reopen", async () => {
  await mount(); await click(strings.open);
  expect((getByLabelText(document.body, panelStrings.owner) as HTMLInputElement).value).toBe("");
  expect(button(strings.verify).disabled).toBe(true);
  await click(panelStrings.cancel); await openToken();
  reply = () => ({ ok: false, failure: { kind: "repository", message: "Repository unavailable or permission denied.", nextAction: "Check the owner, repository and access." } });
  await click(strings.verify);
  expect(getByRole(document.body, "alert").textContent).toContain("Check the owner, repository and access.");
  await click(panelStrings.cancel); await click(strings.open);
  expect((getByLabelText(document.body, strings.token) as HTMLInputElement).value).toBe(canary);
  expect((getByLabelText(document.body, panelStrings.owner) as HTMLInputElement).value).toBe("fixture");
  expect(getByRole(document.body, "alert").textContent).toContain("Repository unavailable");
  expect(button(strings.connect).disabled).toBe(true);
});

it("guides CLI login externally and Recheck stays local without Verify or persistence", async () => {
  await mount(); await click(strings.open);
  expect(document.body.textContent).toContain(strings.cliHint);
  await click(strings.recheck);
  expect(document.body.textContent).toContain("CLI fixture available.");
  expect(posts).toHaveLength(0);
  await field(panelStrings.owner, "fixture"); await field(panelStrings.repository, "repository");
  await act(async () => { fireEvent.click(getByLabelText(document.body, strings.consent)); });
  await click(strings.verify);
  expect((posts[0]!.body.candidate as { credential: unknown }).credential).toEqual({ method: "github-cli" });
});

it("refuses same-event double Verify and Connect", async () => {
  await openToken();
  await act(async () => { button(strings.verify).click(); button(strings.verify).click(); });
  expect(posts).toHaveLength(1);
  await act(async () => { button(strings.connect).click(); button(strings.connect).click(); });
  expect(posts.filter((post) => post.path.endsWith("connect"))).toHaveLength(1);
});

it.each(["input", "method", "close", "restore", "settings", "project"])("ignores a late Verify after %s changes", async (change) => {
  await openToken(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.verify);
  if (change === "input") await field(panelStrings.repository, "other-repository");
  if (change === "method") await field(strings.method, "github-cli");
  if (change === "close") { await click(panelStrings.cancel); await click(strings.open); }
  if (change === "restore") await act(async () => useLiveInteractionStore.getState().recordEpoch(randomUUID()));
  if (change === "settings") await act(async () => client.setQueryData(["safety-settings", projectId], { settings: { ...settings, agentMode: "propose" } }));
  if (change === "project") await mount(randomUUID());
  await act(async () => { waiting.resolve(verified); });
  expect(document.body.textContent).not.toContain(strings.offNotice);
  expect(button(strings.connect).disabled).toBe(true);
  expect(posts).toHaveLength(1);
});

it("refuses Connect synchronously after settings or epoch changes before rerender", async () => {
  await openToken(); await verify();
  await act(async () => { client.setQueryData(["safety-settings", projectId], { settings: { ...settings, agentMode: "propose" } }); button(strings.connect).click(); });
  expect(posts).toHaveLength(1);
  await verify();
  await act(async () => { useLiveInteractionStore.getState().recordEpoch(randomUUID()); button(strings.connect).click(); });
  expect(posts.filter((post) => post.path.endsWith("connect"))).toHaveLength(0);
});

it("reports retained credential file effects when Connect rolls back and requires Verify again", async () => {
  await openToken(); await verify();
  reply = () => ({ ok: false, failure: { kind: "database", message: "Connection could not be saved.", nextAction: "Verify again." }, credentialStored: true, databaseCommitted: false });
  await click(strings.connect);
  expect(getByRole(document.body, "alert").textContent).toContain(strings.storedAfterFailure);
  expect(button(strings.connect).disabled).toBe(true);
  expect((getByLabelText(document.body, panelStrings.owner) as HTMLInputElement).value).toBe("fixture");
  expect(client.getQueryData(["safety-settings", projectId])).toEqual({ settings });
});

it("retains token and settings drafts when the credential file cannot be saved", async () => {
  await openToken(); await verify();
  reply = () => ({ ok: false, failure: { kind: "storage", message: "The credential file could not be saved.", nextAction: "Check file permissions, then Verify again before Connect." }, credentialStored: false, databaseCommitted: false });
  await click(strings.connect);
  expect(getByRole(document.body, "alert").textContent).toBe("The credential file could not be saved. Check file permissions, then Verify again before Connect.");
  expect(getByRole(document.body, "alert").textContent).not.toContain(strings.storedAfterFailure);
  expect(button(strings.connect).disabled).toBe(true);
  expect(button(strings.verify).disabled).toBe(false);
  expect((getByLabelText(document.body, strings.token) as HTMLInputElement).value === canary).toBe(true);
  expect((getByLabelText(document.body, panelStrings.owner) as HTMLInputElement).value).toBe("fixture");
  expect((getByLabelText(document.body, panelStrings.repository) as HTMLInputElement).value).toBe("repository");
  expect(client.getQueryData(["safety-settings", projectId])).toEqual({ settings });
  expect(client.getQueryData(["connector-connections", projectId])).toEqual({ connections: [] });
  expect(client.getQueryData(["credential-status"])).toEqual({ credentials: [] });
});

it.each(["input", "method", "close", "restore", "settings", "project"])("ignores a late Connect after %s changes and never adopts stale caches", async (change) => {
  await openToken(); await verify(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.connect);
  if (change === "input") await field(panelStrings.repository, "changed");
  if (change === "method") await field(strings.method, "github-cli");
  if (change === "close") { await click(panelStrings.cancel); await click(strings.open); }
  if (change === "restore") await act(async () => { useLiveInteractionStore.getState().recordEpoch(randomUUID()); });
  if (change === "settings") await act(async () => client.setQueryData(["safety-settings", projectId], { settings: { ...settings, agentMode: "propose" } }));
  if (change === "project") await mount(randomUUID());
  await act(async () => { waiting.resolve(connectResponse()); });
  expect((client.getQueryData(["safety-settings", projectId]) as { settings: { github: boolean } }).settings.github).toBe(false);
  expect(client.getQueryData(["connector-connections", projectId])).toEqual({ connections: [] });
  expect(queryByRole(document.body, "dialog")).not.toBeNull();
});

it("uses shared keyboard focus containment and returns focus to the opener on Escape", async () => {
  await mount(); const opener = button(strings.open); opener.focus(); await click(strings.open);
  expect(document.activeElement?.textContent).toBe(strings.title);
  await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true }); });
  expect(getByRole(document.body, "dialog").contains(document.activeElement)).toBe(true);
  await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Escape" }); });
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it.each(["credentials", "repository", "rate-limit", "network"])("retains token and actionable %s Verify failures", async (kind) => {
  await openToken();
  reply = () => ({ ok: false, failure: { kind, message: `Sanitized ${kind} failure.`, nextAction: "Correct the cause and Verify again." } });
  await click(strings.verify);
  expect(getByRole(document.body, "alert").textContent).toBe(`Sanitized ${kind} failure. Correct the cause and Verify again.`);
  expect((getByLabelText(document.body, strings.token) as HTMLInputElement).value).toBe(canary);
  expect(button(strings.connect).disabled).toBe(true);
});

it("invalidates verified proof on a same-event field change before Connect can run", async () => {
  await openToken(); await verify();
  await act(async () => { fireEvent.change(getByLabelText(document.body, panelStrings.repository), { target: { value: "changed" } }); button(strings.connect).click(); });
  expect(posts).toHaveLength(1);
});

it("keeps committed cache results and displays a post-commit publication warning", async () => {
  await openToken(); await verify();
  reply = () => ({ ...connectResponse(), publicationWarning: true });
  await click(strings.connect);
  expect(getByRole(document.body, "alert").textContent).toContain(strings.publicationWarning);
  expect((client.getQueryData(["safety-settings", projectId]) as { settings: { github: boolean } }).settings.github).toBe(true);
  expect(button(strings.connect).disabled).toBe(true);
});

it("retains keyboard focus while editing existing type and status mappings", async () => {
  await openToken();
  const input = document.querySelector<HTMLInputElement>(".type-mapping-row input")!;
  input.focus();
  await act(async () => { fireEvent.change(input, { target: { value: "epics" } }); });
  expect(document.activeElement).toBe(input);
});

it.each(["owner", "repository", "token"])("rejects malformed nonblank %s locally with actionable guidance and no secret cache", async (kind) => {
  await openToken();
  await field(kind === "owner" ? panelStrings.owner : kind === "repository" ? panelStrings.repository : strings.token, kind === "token" ? `${canary} invalid` : "invalid/value");
  await click(strings.verify);
  expect(getByRole(document.body, "alert").textContent).toBe(strings.malformed);
  expect(posts).toHaveLength(0);
  expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(canary);
});

it("rechecks failed local safety reads without provider access or losing the draft", async () => {
  await openToken(); await field(panelStrings.name, "Retained draft");
  safetyReadFails = true;
  await act(async () => { await client.refetchQueries({ queryKey: ["safety-settings", projectId] }); });
  expect(getByRole(document.body, "alert").textContent).toBe(strings.safetyUnavailable);
  expect(button(strings.recheckSafety).disabled).toBe(false);
  const previousReads = getRequests.length;
  safetyReadFails = false;
  await click(strings.recheckSafety);
  expect(getRequests.slice(previousReads)).toEqual([`/api/settings/safety?projectId=${projectId}`]);
  expect(posts).toHaveLength(0);
  expect((getByLabelText(document.body, panelStrings.name) as HTMLInputElement).value).toBe("Retained draft");
  expect(button(strings.verify).disabled).toBe(false);
});

it("reloads the dialog draft from the saved connection after the panel updates it", async () => {
  const existing = connectResponse().connection;
  client.setQueryData(["connector-connections", projectId], { connections: [existing] });
  await mount();
  await act(async () => client.setQueryData(["connector-connections", projectId], { connections: [{ ...existing, owner: "renamed-owner", updatedAt: "2026-10-19T11:00:00.000Z" }] }));
  await click(strings.open);
  expect((getByLabelText(getByRole(document.body, "dialog"), panelStrings.owner) as HTMLInputElement).value).toBe("renamed-owner");
});

it("reconnects the selected saved connection by stable id and preserves deliberate New selection", async () => {
  const existing = connectResponse().connection;
  client.setQueryData(["connector-connections", projectId], { connections: [existing] });
  await mount(); await click(strings.open);
  expect((getByLabelText(getByRole(document.body, "dialog"), panelStrings.owner) as HTMLInputElement).value).toBe(existing.owner);
  await field(strings.token, canary);
  await act(async () => { fireEvent.click(getByLabelText(getByRole(document.body, "dialog"), strings.consent)); });
  await verify();
  expect((posts[0]!.body.candidate as { connectionId: string }).connectionId).toBe(existing.id);
  await click(panelStrings.cancel);
  await field(strings.connectionSelection, "");
  await act(async () => client.setQueryData(["connector-connections", projectId], { connections: [{ ...existing, updatedAt: "2026-10-19T11:00:00.000Z" }] }));
  expect((getByLabelText(document.body, strings.connectionSelection) as HTMLSelectElement).value).toBe("");
  await click(strings.open);
  expect((getByLabelText(document.body, panelStrings.owner) as HTMLInputElement).value).toBe("");
});

it("refreshes authoritative origin state after late Connect without replacing the edited draft", async () => {
  await openToken(); await verify(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.connect); await field(panelStrings.repository, "new-draft");
  const committed = connectResponse(); savedConnections = committed.connections; savedSettings = committed.settings;
  await act(async () => { waiting.resolve(committed); });
  expect(client.getQueryData(["connector-connections", projectId])).toEqual({ connections: savedConnections });
  expect(client.getQueryData(["safety-settings", projectId])).toEqual({ settings: savedSettings });
  expect((getByLabelText(document.body, panelStrings.repository) as HTMLInputElement).value).toBe("new-draft");
  expect(document.body.textContent).toContain(strings.lateCommitted);
  expect(button(strings.reviewSaved).disabled).toBe(false);
  expect(button(strings.connect).disabled).toBe(true);
});

it("refreshes credential status and retains a late stored-file notice across same-scope Cancel/reopen", async () => {
  await openToken(); await verify(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.connect); await click(panelStrings.cancel);
  await act(async () => { waiting.resolve({ ok: false, failure: { kind: "database", message: "Save failed.", nextAction: "Verify again." }, credentialStored: true, databaseCommitted: false }); });
  await click(strings.open);
  expect(document.body.textContent).toContain(strings.lateStored);
  expect(getRequests).toContain("/api/credentials/status");
  expect((getByLabelText(document.body, strings.token) as HTMLInputElement).value).toBe(canary);
});

it("reviews uncertain Connect outcomes and reuses a saved matching id before another confirmation", async () => {
  await openToken(); await verify();
  const committed = connectResponse(); savedConnections = committed.connections; savedSettings = committed.settings;
  reply = () => { throw new TypeError("fixture response lost"); };
  await click(strings.connect);
  expect(document.body.textContent).toContain(strings.uncertain);
  expect(button(strings.connect).disabled).toBe(true);
  const connectPosts = posts.filter((post) => post.path.endsWith("connect")).length;
  await click(strings.reviewSaved);
  expect(document.body.textContent).toContain(strings.recovered(`${committed.connection.name} (${committed.connection.owner}/${committed.connection.repository})`));
  reply = () => verified;
  await verify();
  expect((posts.at(-1)!.body.candidate as { connectionId: string }).connectionId).toBe(committed.connection.id);
  expect(posts.filter((post) => post.path.endsWith("connect"))).toHaveLength(connectPosts);
});

it("keeps uncertain creation blocked when two saved connections match until a human selects one", async () => {
  await openToken(); await verify();
  const committed = connectResponse();
  const other = { ...committed.connection, id: randomUUID() };
  savedConnections = [committed.connection, other]; savedSettings = committed.settings;
  reply = () => { throw new TypeError("fixture response lost"); };
  await click(strings.connect);
  expect(document.body.textContent).toContain(strings.ambiguousSaved);
  expect(button(strings.connect).disabled).toBe(true);
  await click(strings.reviewSaved);
  expect(document.body.textContent).toContain(strings.ambiguousSaved);
  expect(button(strings.connect).disabled).toBe(true);
  expect(queryByRole(document.body, "button", { name: strings.verify })).toBeNull();
  expect(posts.filter((post) => post.path.endsWith("verify"))).toHaveLength(1);
  expect(posts.filter((post) => post.path.endsWith("connect"))).toHaveLength(1);
  expect(client.getQueryData(["connector-connections", projectId])).toEqual({ connections: savedConnections });
  await click(panelStrings.cancel);
  await field(strings.connectionSelection, other.id);
  await click(strings.open); await field(strings.token, canary);
  await act(async () => { fireEvent.click(getByLabelText(document.body, strings.consent)); });
  reply = () => verified; await verify();
  expect((posts.at(-1)!.body.candidate as { connectionId: string }).connectionId).toBe(other.id);
});

it("clears ordinary error and CLI messages when the actual Project changes", async () => {
  await mount(); await click(strings.open); await click(strings.recheck);
  expect(document.body.textContent).toContain("CLI fixture available.");
  await field(panelStrings.owner, "fixture"); await field(panelStrings.repository, "repository");
  await act(async () => { fireEvent.click(getByLabelText(document.body, strings.consent)); });
  reply = () => ({ ok: false, failure: { kind: "credentials", message: "Credentials rejected.", nextAction: "Recheck credentials." } });
  await click(strings.verify);
  await mount(randomUUID());
  expect(document.body.textContent).not.toContain("CLI fixture available.");
  expect(document.body.textContent).not.toContain("Credentials rejected.");
});

it("keeps uncertain creation blocked when reconciliation fails and permits an explicit local review retry", async () => {
  await openToken(); await verify();
  const committed = connectResponse(); savedConnections = committed.connections; savedSettings = committed.settings;
  safetyReadFails = true; reply = () => { throw new TypeError("fixture response lost"); };
  await click(strings.connect);
  expect(document.body.textContent).toContain(strings.recoveryFailed);
  expect(button(strings.connect).disabled).toBe(true);
  const previousPosts = posts.length;
  safetyReadFails = false;
  await click(strings.reviewSaved);
  expect(posts).toHaveLength(previousPosts);
  expect(document.body.textContent).toContain(strings.recovered(`${committed.connection.name} (${committed.connection.owner}/${committed.connection.repository})`));
  reply = () => verified; await verify();
  expect((posts.at(-1)!.body.candidate as { connectionId: string }).connectionId).toBe(committed.connection.id);
});

it("reconciles the captured origin Project without displaying its notice or enabling the current Project", async () => {
  await openToken(); await verify(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.connect);
  const otherProjectId = randomUUID(); await mount(otherProjectId);
  const committed = connectResponse(); savedConnections = committed.connections; savedSettings = committed.settings;
  await act(async () => { waiting.resolve(committed); });
  expect((client.getQueryData(["safety-settings", projectId]) as { settings: SafetySettings }).settings.github).toBe(true);
  expect((client.getQueryData(["safety-settings", otherProjectId]) as { settings: SafetySettings }).settings.github).toBe(false);
  expect(document.body.textContent).not.toContain(strings.lateCommitted);
  expect(document.querySelector(".safety-pill")!.getAttribute("aria-label")).toContain(appStrings.safetySwitchState(appStrings.githubSwitch, appStrings.off));
});

it("refuses reconciliation cache adoption if Restore changes epoch while authoritative reads are pending", async () => {
  await openToken(); await verify(); const waiting = deferred(); reply = () => waiting.promise;
  await click(strings.connect); await field(panelStrings.repository, "retained-new-draft");
  const read = deferred(); const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => path.startsWith("/api/settings/safety") && !init?.method ? json(await read.promise) : originalFetch(path, init));
  const committed = connectResponse(); savedConnections = committed.connections;
  await act(async () => { waiting.resolve(committed); });
  await act(async () => { const epoch = randomUUID(); useLiveInteractionStore.getState().recordEpoch(epoch); useLiveInteractionStore.getState().finishEpoch(epoch); client.setQueryData(["connector-connections", projectId], { connections: [] }); });
  await act(async () => { read.resolve({ settings: committed.settings }); });
  expect((client.getQueryData(["safety-settings", projectId]) as { settings: SafetySettings }).settings.github).toBe(false);
  expect(client.getQueryData(["connector-connections", projectId])).toEqual({ connections: [] });
  expect((getByLabelText(document.body, panelStrings.repository) as HTMLInputElement).value).toBe("retained-new-draft");
  expect(button(strings.connect).disabled).toBe(true);
});

it("clears prior credential errors and CLI status when selecting a different saved connection", async () => {
  const first = { ...connectResponse().connection, authMode: "github-cli" as const };
  const second = { ...first, id: randomUUID(), name: "Second connection", repository: "second" };
  client.setQueryData(["connector-connections", projectId], { connections: [first, second] });
  await mount(); await click(strings.open); await click(strings.recheck);
  await act(async () => { fireEvent.click(getByLabelText(getByRole(document.body, "dialog"), strings.consent)); });
  reply = () => ({ ok: false, failure: { kind: "credentials", message: "First connection rejected.", nextAction: "Recheck credentials." } });
  await click(strings.verify); await click(panelStrings.cancel);
  await field(strings.connectionSelection, second.id); await click(strings.open);
  expect(document.body.textContent).not.toContain("First connection rejected.");
  expect(document.body.textContent).not.toContain("CLI fixture available.");
  expect((getByLabelText(getByRole(document.body, "dialog"), panelStrings.repository) as HTMLInputElement).value).toBe("second");
});
