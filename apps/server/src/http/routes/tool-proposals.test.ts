import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildServer } from "@storymapper/server/server";
import { openExistingStoryMapperDb } from "@storymapper/db";
import { rejectSqliteWrite } from "@storymapper/db/test-fixtures/sqlite-write-failure";
import { changeSetSchema } from "@storymapper/contracts";
import type { ActivityResponse, ChangeSet, GitHubBoardIssue, StoryMapSnapshot, RoadmapDetails, ConnectorConnection } from "@storymapper/contracts";

const run = promisify(execFile);
const installedPython = process.env.STORYMAPPER_TEST_PYTHON;
const runPython = (args: string[]) => run("uv", ["run", "--no-project", "--isolated", "--no-config", "--python", installedPython ?? "3.12", ...(installedPython ? [] : ["--managed-python"]), "--offline", "python", ...args], { env: { ...process.env, UV_CONFIG_FILE: undefined } });
const ROOT = resolve(import.meta.dirname, "../../../../..");
const originalDatabasePath = process.env.STORYMAPPER_DB_PATH;
let directory: string;
let server: FastifyInstance;
let origin: string;
let projectId: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "storymapper-tools-"));
  process.env.STORYMAPPER_DB_PATH = join(directory, "data", "storymapper.sqlite");
  server = await buildServer({ development: true, runtimeConfig: { host: "127.0.0.1", port: 4317, allowRemoteHost: false } });
  const projectResponse = await server.inject({ url: "/api/projects", headers: { host: "127.0.0.1:4317" } });
  projectId = projectResponse.json().projects[0].id;
  origin = await server.listen({ port: 0, host: "127.0.0.1" });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  if (originalDatabasePath === undefined) delete process.env.STORYMAPPER_DB_PATH;
  else process.env.STORYMAPPER_DB_PATH = originalDatabasePath;
  rmSync(directory, { recursive: true, force: true });
});

async function request<T>(path: string, payload?: unknown, method = payload === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(`${origin}${path}`, { method, headers: payload === undefined ? {} : { "content-type": "application/json" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBeLessThan(300);
  return body as T;
}

async function apply(id: string): Promise<ChangeSet> {
  await request(`/api/changesets/${id}/approve`, {});
  return (await request<{ changeSet: ChangeSet }>(`/api/changesets/${id}/apply`, {})).changeSet;
}

function issue(number: number, issueType: string | null, parentNumber: number | null = null): GitHubBoardIssue {
  return { repository: "fixture/repository", number, title: `TASK-${number}: Fixture ${number}`, body: `Body ${number}`, state: "open", url: `https://github.com/fixture/repository/issues/${number}`,
    labels: ["status:active"], assignee: "fixture", milestone: "Release", issueType, parentRepository: parentNumber ? "fixture/repository" : null, parentNumber };
}

async function proposal(issues: GitHubBoardIssue[], extra: Record<string, unknown> = {}): Promise<ChangeSet> {
  return changeSetSchema.parse((await request<{ changeSet: ChangeSet }>("/api/tool-proposals/github-board", { projectId, storyMapName: "Imported fixture", boardUrl: "https://github.com/orgs/fixture/projects/1/views/1", issues, ...extra })).changeSet);
}

async function assertConflictActivity(before: ActivityResponse, changeSetId: string): Promise<void> {
  const after = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const added = after.activityEvents.filter((event) => !before.activityEvents.some((previous) => previous.id === event.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ action: "changeSet.conflict", affectedEntityId: changeSetId });
  expect(after.activityEvents.filter((event) => event.id !== added[0]!.id)).toEqual(before.activityEvents);
}

async function importedSnapshot(): Promise<StoryMapSnapshot> {
  const maps = await request<{ storyMaps: Array<{ id: string; name: string }> }>(`/api/story-maps?projectId=${projectId}`);
  return request(`/api/story-maps/${maps.storyMaps.find((map) => map.name === "Imported fixture")!.id}`);
}

it("separates proposals from application, preserves board parents and baselines, and reconciles without moving local organization", async () => {
  const issues = [issue(1, "Epic"), issue(2, "Feature", 1), issue(3, null, 2), issue(4, null)];
  const changeSet = await proposal(issues);
  expect(changeSet.source).toBe("import");
  expect((await request<{ storyMaps: Array<{ name: string }> }>("/api/story-maps")).storyMaps.some((map) => map.name === "Imported fixture")).toBe(false);
  const refused = await fetch(`${origin}/api/changesets/${changeSet.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(refused.status).toBe(409);
  await request(`/api/changesets/${changeSet.id}/approve`, {});
  await request(`/api/settings/safety?projectId=${projectId}`, { agentMode: "propose" }, "PATCH");
  const agent = await fetch(`${origin}/api/mcp/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ApplyChangeSet", input: { changeSetId: changeSet.id, approvalToken: "human-approved" } }) });
  expect(agent.status).toBe(403);
  expect(await agent.json()).toMatchObject({ code: "protected" });
  await apply(changeSet.id);
  const snapshot = await importedSnapshot();
  const cards = new Map(snapshot.cards.map((card) => [card.title, card]));
  expect(cards.get("Fixture 2")!.parentId).toBe(cards.get("Fixture 1")!.id);
  expect(cards.get("Fixture 3")!.parentId).toBe(cards.get("Fixture 2")!.id);
  expect(snapshot.remoteWorkItemLinks).toHaveLength(4);
  expect(snapshot.githubLinks).toHaveLength(4);
  expect(snapshot.remoteWorkItemLinks.find((link) => link.remoteNumber === 3)).toMatchObject({ titleHash: createHash("sha256").update(issues[2]!.title).digest("hex"), bodyHash: createHash("sha256").update(issues[2]!.body).digest("hex"), syncState: "synced" });
  const moved = cards.get("Fixture 3")!;
  await request(`/api/cards/${moved.id}/move`, { parentId: null, position: 0, baseVersion: moved.version });
  const changed = { ...issues[2]!, body: "Changed body", assignee: null, milestone: null };
  await apply((await proposal([issues[0]!, issues[1]!, changed, issue(5, null, 2)], { storyMapId: snapshot.storyMap.id, removeCardIds: [cards.get("Fixture 4")!.id] })).id);
  const synced = await importedSnapshot();
  expect(synced.cards.find((card) => card.id === moved.id)).toMatchObject({ parentId: null, description: "Changed body" });
  expect(synced.cards.some((card) => card.id === cards.get("Fixture 4")!.id)).toBe(false);
  expect(synced.remoteWorkItemLinks.find((link) => link.remoteNumber === 3)).toMatchObject({ parentOverrideLocal: true });
  expect(synced.remoteWorkItemLinks).toHaveLength(4);
  expect(snapshot.githubLinks.find((link) => link.issueNumber === 3)!.milestone).toBe("Release");
  expect(synced.githubLinks.find((link) => link.issueNumber === 3)!.milestone ?? null).toBeNull();
  expect(synced.cards.find((card) => card.title === "Fixture 5")!.parentId).toBe(cards.get("Fixture 2")!.id);
});

it("rejects source drift and foreign removals before applying a scoped proposal", async () => {
  await apply((await proposal([issue(1, null)])).id);
  const snapshot = await importedSnapshot();
  const pending = await proposal([issue(1, null)], { storyMapId: snapshot.storyMap.id });
  await request(`/api/cards/${snapshot.cards[0]!.id}`, { title: "Changed after proposal", baseVersion: snapshot.cards[0]!.version }, "PATCH");
  const before = await importedSnapshot();
  await request(`/api/changesets/${pending.id}/approve`, {});
  const response = await fetch(`${origin}/api/changesets/${pending.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(response.status).toBe(409);
  expect((await importedSnapshot()).cards).toEqual(before.cards);
  const foreignMap = await request<{ id: string }>("/api/story-maps", { projectId, name: "Foreign map" });
  const foreign = await request<{ id: string }>("/api/cards", { storyMapId: foreignMap.id, level: "activity", title: "Foreign" });
  const invalid = await fetch(`${origin}/api/tool-proposals/github-board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, storyMapName: "Imported fixture", boardUrl: "https://github.com/orgs/fixture/projects/1", issues: [], storyMapId: snapshot.storyMap.id, removeCardIds: [foreign.id] }) });
  expect(invalid.status).toBe(400);
});

it("verifies the real GitHub board reader pagination, filtering and failure behavior", async () => {
  const result = await runPython(["-m", "unittest", "discover", "-s", join(ROOT, "tools"), "-p", "test_github_board_import.py"]);
  expect(result.stderr).toContain("Ran 8 tests");
  expect(result.stderr.trim()).toMatch(/OK$/);
});

it("runs the actual Python import and copy commands over HTTP with separate application", async () => {
  const fixturePath = join(directory, "board.json");
  writeFileSync(fixturePath, JSON.stringify({ issues: [{ repository: "fixture/repository", number: 1, title: "Fixture issue", body: "Fixture body", state: "OPEN", url: "https://github.com/fixture/repository/issues/1", labels: [], assignee: null, milestone: null, milestone_due_on: null, issue_type: null, parent_repository: null, parent_number: null }] }));
  const command = await runPython([join(ROOT, "tools/fixtures/board_fixture.py"), fixturePath, "--url", origin, "--board-owner", "fixture", "--board-number", "1", "--project-id", projectId, "--story-map-name", "Imported fixture", "--execute"]);
  const pending = JSON.parse(command.stdout).changeSet as ChangeSet;
  expect(pending.status).toBe("proposed");
  await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", pending.id]);
  const source = await importedSnapshot();
  const casingFixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  casingFixture.issues[0].repository = "Fixture/Repository";
  writeFileSync(fixturePath, JSON.stringify(casingFixture));
  const casingSync = JSON.parse((await runPython([join(ROOT, "tools/fixtures/board_fixture.py"), fixturePath, "--url", origin, "--board-owner", "fixture", "--board-number", "1", "--project-id", projectId, "--story-map-name", "Imported fixture", "--sync", "--execute"])).stdout);
  expect(casingSync.syncPlan).toMatchObject({ toUpdate: 1, toAdd: 0, toRemoveClosed: 0, removalUnresolved: 0 });
  await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", casingSync.changeSet.id]);
  expect((await importedSnapshot()).githubLinks.map((link) => link.id)).toEqual(source.githubLinks.map((link) => link.id));
  casingFixture.issues[0].repository = "fixture/repository";
  writeFileSync(fixturePath, JSON.stringify(casingFixture));
  const copy = await runPython([join(ROOT, "tools/copy_story_map.py"), "Imported fixture", "Copied fixture", "--url", origin, "--project-id", projectId]);
  const copyProposal = JSON.parse(copy.stdout).changeSet as ChangeSet;
  await runPython([join(ROOT, "tools/copy_story_map.py"), "--url", origin, "--apply-change-set", copyProposal.id]);
  const copied = await request<StoryMapSnapshot>(`/api/story-maps/${copyProposal.operations[0]!.entityId}`);
  expect(copied.cards.map((card) => [card.title, card.level, card.position, card.key]).sort()).toEqual(source.cards.map((card) => [card.title, card.level, card.position, card.key]).sort());
  expect(copied.cards.every((card) => !source.cards.some((original) => original.id === card.id))).toBe(true);
  expect(copied.cards.find((card) => card.level === "story")!.parentId).toBe(copied.cards.find((card) => card.level === "step")!.id);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  expect(activity.activityEvents.some((entry) => entry.action === "changeSet.approved")).toBe(true);
  expect(activity.activityEvents.some((entry) => entry.action === "changeSet.applied")).toBe(true);
  const syncFixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  syncFixture.issues[0].number = 2;
  syncFixture.issues[0].title = "Added fixture issue";
  syncFixture.issues[0].url = "https://github.com/fixture/repository/issues/2";
  syncFixture.states = { "fixture/repository#1": "CLOSED" };
  writeFileSync(fixturePath, JSON.stringify(syncFixture));
  const syncArgs = [join(ROOT, "tools/fixtures/board_fixture.py"), fixturePath, "--url", origin, "--board-owner", "fixture", "--board-number", "1", "--project-id", projectId, "--story-map-name", "Imported fixture", "--sync"];
  const dryRun = JSON.parse((await runPython(syncArgs)).stdout);
  expect(dryRun.syncPlan).toMatchObject({ toAdd: 1, toRemoveClosed: 1 });
  expect((await importedSnapshot()).githubLinks[0]!.issueNumber).toBe(1);
  const syncProposal = JSON.parse((await runPython([...syncArgs, "--execute"])).stdout).changeSet as ChangeSet;
  await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", syncProposal.id]);
  expect((await importedSnapshot()).githubLinks.map((link) => link.issueNumber)).toEqual([2]);
}, 30_000);

it("keeps the complete tools and skill inventory free of direct SQLite opens or database copies", () => {
  for (const directory of ["tools", ".agents/skills", ".claude/skills"]) {
    const root = join(ROOT, directory);
    for (const path of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (!path.endsWith(".py") && !path.endsWith("SKILL.md")) continue;
      expect(readFileSync(join(root, path), "utf8"), join(directory, path)).not.toMatch(/sqlite3|better-sqlite3|copy2|copyfile|STORYMAPPER_DB_PATH|backup_database/);
    }
  }
});

it("copies customization, release, source, attachment and Roadmap relationships with remapped owned references", async () => {
  const map = await request<{ id: string }>("/api/story-maps", { projectId, name: "Complete source" });
  const release = await request<{ id: string }>("/api/releases", { storyMapId: map.id, name: "Release", released: true });
  const activity = await request<{ id: string }>("/api/cards", { storyMapId: map.id, level: "activity", title: "Activity" });
  const step = await request<{ id: string }>("/api/cards", { storyMapId: map.id, level: "step", parentId: activity.id, title: "Step" });
  const card = await request<{ id: string }>("/api/cards", { storyMapId: map.id, level: "story", parentId: step.id, releaseId: release.id, title: "Story" });
  const persona = await request<{ id: string }>("/api/personas", { projectId, storyMapId: map.id, name: "Persona", role: "User", goals: ["Goal"] });
  const annotation = await request<{ id: string }>("/api/annotations", { projectId, storyMapId: map.id, name: "Annotation" });
  await request(`/api/cards/${card.id}/personas/${persona.id}`, {});
  await request(`/api/cards/${card.id}/annotations/${annotation.id}`, {});
  await request("/api/workflow-statuses", { projectId, storyMapId: map.id, name: "Review", group: "active" });
  await request("/api/story-templates", { projectId, storyMapId: map.id, name: "Template", descriptionTemplate: "Template description" });
  await request("/api/product-context", { projectId, storyMapId: map.id, purpose: "Purpose" }, "PATCH");
  const source = await request<{ chunks: Array<{ id: string }> }>("/api/source-documents/import", { projectId, title: "Source", type: "txt", content: "Source text" });
  await request(`/api/cards/${card.id}/source-links`, { kind: "chunk", chunkId: source.chunks[0]!.id, confidence: 0.8 });
  await request(`/api/cards/${card.id}/attachments`, { label: "Fixture attachment", filePath: "fixture.txt", mimeType: "text/plain", size: 7 });
  const roadmap = await request<{ id: string }>("/api/roadmaps", { projectId, storyMapId: map.id, name: "Roadmap" });
  const column = await request<{ id: string }>("/api/roadmap-columns", { roadmapId: roadmap.id, name: "Column" });
  const lane = await request<{ id: string }>("/api/roadmap-swimlanes", { roadmapId: roadmap.id, name: "Lane" });
  const roadmapCard = await request<{ id: string }>("/api/roadmap-cards", { roadmapId: roadmap.id, columnId: column.id, swimlaneId: lane.id, title: "Roadmap card", labels: ["Label"] });
  await request("/api/roadmap-references", { roadmapCardId: roadmapCard.id, targetType: "card", targetId: card.id });
  await request("/api/roadmap-references", { roadmapCardId: roadmapCard.id, targetType: "release", targetId: release.id });
  const pending = (await request<{ changeSet: ChangeSet }>("/api/tool-proposals/copy-story-map", { sourceStoryMapId: map.id, targetName: "Complete target" })).changeSet;
  await apply(pending.id);
  const copied = await request<StoryMapSnapshot>(`/api/story-maps/${pending.operations[0]!.entityId}`);
  const copiedCard = copied.cards.find((entry) => entry.title === "Story")!;
  expect(copiedCard.releaseId).toBe(copied.releases[0]!.id);
  expect(copied.cardPersonas[0]).toMatchObject({ cardId: copiedCard.id, personaId: copied.personas[0]!.id });
  expect(copied.cardAnnotations[0]).toMatchObject({ cardId: copiedCard.id, annotationId: copied.annotations[0]!.id });
  expect(copied.workflowStatuses.some((status) => status.name === "Review")).toBe(true);
  expect(copied.storyTemplates[0]!.name).toBe("Template");
  expect(copied.productContext!.purpose).toBe("Purpose");
  expect(copied.sourceLinks[0]).toMatchObject({ cardId: copiedCard.id, chunkId: source.chunks[0]!.id });
  expect(copied.cardAttachments[0]!.cardId).toBe(copiedCard.id);
  const details = await request<RoadmapDetails>(`/api/roadmaps/${copied.roadmaps[0]!.id}`);
  expect(details.cards[0]).toMatchObject({ columnId: details.columns.find((entry) => entry.name === "Column")!.id, swimlaneId: details.swimlanes.find((entry) => entry.name === "Lane")!.id });
  expect(details.references.map((reference) => reference.targetId).sort()).toEqual([copiedCard.id, copied.releases[0]!.id].sort());
  const history = await request<{ versions: Array<{ version: number }> }>(`/api/cards/${copiedCard.id}/history`);
  expect(history.versions[0]!.version).toBe(1);
});

it("rolls back maps, connectors, Cards, histories and audit rows after an actual mid-application database refusal", async () => {
  const restoreFailure = rejectSqliteWrite(process.env.STORYMAPPER_DB_PATH!, (sql, bindings) => /^insert into "cards"/i.test(sql) && bindings.includes("Reject fixture"), "fixture write rejected");
  const pending = await proposal([issue(1, null), { ...issue(2, null), title: "Reject fixture" }]);
  await request(`/api/changesets/${pending.id}/approve`, {});
  const mapsBefore = await request("/api/story-maps");
  const connectorsBefore = await request(`/api/connectors/connections?projectId=${projectId}`);
  const activityBefore = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const response = await fetch(`${origin}/api/changesets/${pending.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(response.status).toBe(500);
  restoreFailure();
  expect(await request("/api/story-maps")).toEqual(mapsBefore);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(connectorsBefore);
  expect(await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`)).toEqual(activityBefore);
});

it("captures cleanup scope, refuses newly added maps, then replaces only the selected Project atomically", async () => {
  const otherProject = await request<{ id: string }>("/api/projects", { name: "Untouched Project" });
  const otherMap = await request<{ id: string }>("/api/story-maps", { projectId: otherProject.id, name: "Untouched map" });
  const otherCard = await request<{ id: string }>("/api/cards", { storyMapId: otherMap.id, level: "activity", title: "Untouched Card" });
  await request("/api/releases", { storyMapId: otherMap.id, name: "Untouched Release" });
  await request("/api/story-templates", { projectId: otherProject.id, storyMapId: otherMap.id, name: "Untouched template" });
  const roadmap = await request<{ id: string }>("/api/roadmaps", { projectId: otherProject.id, storyMapId: otherMap.id, name: "Untouched Roadmap" });
  const column = await request<{ id: string }>("/api/roadmap-columns", { roadmapId: roadmap.id, name: "Untouched column" });
  const roadmapCard = await request<{ id: string }>("/api/roadmap-cards", { roadmapId: roadmap.id, columnId: column.id, title: "Untouched Roadmap Card" });
  await request("/api/roadmap-references", { roadmapCardId: roadmapCard.id, targetType: "card", targetId: otherCard.id });
  let otherMaps = await request<{ storyMaps: Array<{ id: string }> }>(`/api/story-maps?projectId=${otherProject.id}`);
  for (const map of otherMaps.storyMaps) await request("/api/product-context", { projectId: otherProject.id, storyMapId: map.id, purpose: "Untouched purpose" }, "PATCH");
  otherMaps = await request<{ storyMaps: Array<{ id: string }> }>(`/api/story-maps?projectId=${otherProject.id}`);
  const otherSnapshots = await Promise.all(otherMaps.storyMaps.map((map) => request<StoryMapSnapshot>(`/api/story-maps/${map.id}`)));
  const otherRoadmap = await request<RoadmapDetails>(`/api/roadmaps/${roadmap.id}`);
  await apply((await proposal([issue(1, null)])).id);
  const cleanup = await proposal([issue(2, null)], { cleanup: true });
  expect(cleanup.operations[0]!.after).toMatchObject({ preview: { cleanup: expect.arrayContaining([
    expect.objectContaining({ id: (await importedSnapshot()).storyMap.id, name: "Imported fixture", inventory: expect.objectContaining({ storyMaps: 1, cards: 3, githubLinks: 1, remoteWorkItemLinks: 1 }) })
  ]) } });
  const mapsToDelete = (await request<{ storyMaps: Array<{ id: string; name: string }> }>(`/api/story-maps?projectId=${projectId}`)).storyMaps;
  const preview = (cleanup.operations[0]!.after as { preview: { cleanup: Array<{ id: string; name: string }> } }).preview;
  expect(preview.cleanup.map(({ id, name }) => ({ id, name }))).toEqual(mapsToDelete.map(({ id, name }) => ({ id, name })));
  await request("/api/story-maps", { projectId, name: "Added after cleanup proposal" });
  await request(`/api/changesets/${cleanup.id}/approve`, {});
  const before = await request("/api/story-maps");
  const refused = await fetch(`${origin}/api/changesets/${cleanup.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(refused.status).toBe(409);
  expect(await request("/api/story-maps")).toEqual(before);
  await apply((await proposal([issue(2, null)], { cleanup: true })).id);
  const maps = await request<{ storyMaps: Array<{ id: string }> }>(`/api/story-maps?projectId=${projectId}`);
  expect(maps.storyMaps).toHaveLength(1);
  expect((await importedSnapshot()).githubLinks.map((link) => link.issueNumber)).toEqual([2]);
  expect(await request(`/api/story-maps?projectId=${otherProject.id}`)).toEqual(otherMaps);
  expect(await Promise.all(otherMaps.storyMaps.map((map) => request<StoryMapSnapshot>(`/api/story-maps/${map.id}`)))).toEqual(otherSnapshots);
  expect(await request(`/api/roadmaps/${roadmap.id}`)).toEqual(otherRoadmap);
});

it("refuses applied proposal replay without creating another map", async () => {
  const pending = await proposal([issue(1, null)]);
  await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", pending.id]);
  const before = await request("/api/story-maps");
  await expect(runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", pending.id])).rejects.toThrow("HTTP 409");
  expect(await request("/api/story-maps")).toEqual(before);
});

it("unassigns surviving Stories when a board Feature is removed and preserves their history and sibling positions", async () => {
  await apply((await proposal([issue(1, "Epic"), issue(2, "Feature", 1), issue(3, null, 2), issue(4, null, 2)])).id);
  const before = await importedSnapshot();
  const feature = before.cards.find((card) => card.title === "Fixture 2")!;
  const surviving = before.cards.filter((card) => card.parentId === feature.id);
  const removal = await proposal([issue(1, "Epic"), issue(3, null, 2), issue(4, null, 2)], { storyMapId: before.storyMap.id, removeCardIds: [feature.id] });
  await apply(removal.id);
  const after = await importedSnapshot();
  expect(after.cards.some((card) => card.id === feature.id)).toBe(false);
  for (const card of surviving) {
    expect(after.cards.find((entry) => entry.id === card.id)).toMatchObject({ parentId: null });
    const history = await request<{ versions: Array<{ snapshot: { parentId: string | null } }> }>(`/api/cards/${card.id}/history`);
    expect(history.versions[0]!.snapshot.parentId).toBeNull();
    expect(history.versions.some((version) => version.snapshot.parentId === feature.id)).toBe(true);
  }
  const siblings = after.cards.filter((card) => card.parentId === null).sort((left, right) => left.position - right.position);
  expect(siblings.map((card) => card.position)).toEqual(siblings.map((_, index) => index));
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const operationEvents = activity.activityEvents.filter((entry) => entry.action === "changeSet.operation.applied" && entry.affectedEntityId === removal.operations[0]!.operationId);
  expect(operationEvents).toHaveLength(1);
  expect(activity.activityEvents.filter((entry) => entry.action === "card.rehomed")).toEqual([]);
});

it("keeps canonical connector and issue identities across casing-only sync and numeric import order", async () => {
  await apply((await proposal([issue(10, null), issue(2, null)])).id);
  const before = await importedSnapshot();
  const stories = before.cards.filter((card) => card.level === "story").sort((left, right) => left.position - right.position);
  expect(stories.map((card) => card.title)).toEqual(["Fixture 2", "Fixture 10"]);
  const connections = await request<{ connections: ConnectorConnection[] }>(`/api/connectors/connections?projectId=${projectId}`);
  const changed = [issue(10, null), issue(2, null)].map((entry) => ({ ...entry, repository: "Fixture/Repository" }));
  await apply((await proposal(changed, { storyMapId: before.storyMap.id })).id);
  const after = await importedSnapshot();
  expect(after.cards.map((card) => card.id).sort()).toEqual(before.cards.map((card) => card.id).sort());
  expect(after.githubLinks.map((link) => link.id).sort()).toEqual(before.githubLinks.map((link) => link.id).sort());
  expect(after.remoteWorkItemLinks.map((link) => link.id).sort()).toEqual(before.remoteWorkItemLinks.map((link) => link.id).sort());
  expect((await request<{ connections: ConnectorConnection[] }>(`/api/connectors/connections?projectId=${projectId}`)).connections).toEqual(connections.connections);
});

it("rejects a prefix-only title before persisting any proposal or data", async () => {
  const maps = await request("/api/story-maps");
  const proposals = await request<{ changeSets: ChangeSet[] }>(`/api/changesets?projectId=${projectId}`);
  const connectors = await request(`/api/connectors/connections?projectId=${projectId}`);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const response = await fetch(`${origin}/api/tool-proposals/github-board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, storyMapName: "Invalid", boardUrl: "https://github.com/orgs/fixture/projects/1", issues: [issue(2, null), { ...issue(1, null), title: "TASK-1:" }] }) });
  expect(response.status).toBe(400);
  expect(await request("/api/story-maps")).toEqual(maps);
  expect(await request(`/api/changesets?projectId=${projectId}`)).toEqual(proposals);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(connectors);
  expect(await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`)).toEqual(activity);
});

it("previews existing connector read-only changes and refuses initial-import connector drift atomically", async () => {
  const { connection } = await request<{ connection: ConnectorConnection }>("/api/connectors/connections", { projectId, provider: "github", name: "Reviewed repository", authMode: "token", owner: "Fixture", repository: "Repository", readOnly: false });
  const pending = await proposal([issue(1, null)]);
  expect(pending.operations[0]!.after).toMatchObject({ preview: { connectors: [{ repository: "fixture/repository", existingId: connection.id,
    before: { projectId, provider: "github", owner: "Fixture", repository: "Repository", readOnly: false }, after: { readOnly: true }
  }] } });
  await request(`/api/connectors/connections/${connection.id}`, { owner: "Other" }, "PATCH");
  await request(`/api/changesets/${pending.id}/approve`, {});
  const maps = await request("/api/story-maps");
  const connections = await request(`/api/connectors/connections?projectId=${projectId}`);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const refused = await fetch(`${origin}/api/changesets/${pending.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(refused.status).toBe(409);
  expect(await request("/api/story-maps")).toEqual(maps);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(connections);
  await assertConflictActivity(activity, pending.id);
  const absent = await proposal([issue(1, null)]);
  await request("/api/connectors/connections", { projectId, provider: "github", name: "New repository", authMode: "token", owner: "fixture", repository: "repository" });
  await request(`/api/changesets/${absent.id}/approve`, {});
  const newConnections = await request(`/api/connectors/connections?projectId=${projectId}`);
  const changed = await fetch(`${origin}/api/changesets/${absent.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(changed.status).toBe(409);
  expect(await request("/api/story-maps")).toEqual(maps);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(newConnections);
});

it("previews the exact copy inventory and refuses changed templates and Roadmap children", async () => {
  const map = await request<{ id: string }>("/api/story-maps", { projectId, name: "Reviewed source" });
  const template = await request<{ id: string }>("/api/story-templates", { projectId, storyMapId: map.id, name: "Original template" });
  const roadmap = await request<{ id: string }>("/api/roadmaps", { projectId, storyMapId: map.id, name: "Reviewed Roadmap" });
  const column = await request<{ id: string }>("/api/roadmap-columns", { roadmapId: roadmap.id, name: "Original column" });
  const pending = (await request<{ changeSet: ChangeSet }>("/api/tool-proposals/copy-story-map", { sourceStoryMapId: map.id, targetName: "Reviewed target" })).changeSet;
  expect(pending.operations[0]!.after).toMatchObject({ preview: { source: { id: map.id, name: "Reviewed source" }, target: { id: pending.operations[0]!.entityId, name: "Reviewed target" },
    inventory: { storyMaps: 1, cards: 0, storyTemplates: 1, roadmaps: 1, roadmapColumns: 4, roadmapCards: 0, roadmapReferences: 0 }
  } });
  expect((pending.operations[0]!.after as { preview: { inventory: Record<string, number> } }).preview.inventory).toEqual({
    storyMaps: 1, releases: 0, cards: 0, personas: 0, workflowStatuses: 0, annotations: 0, storyTemplates: 1, productContexts: 0,
    roadmaps: 1, cardPersonas: 0, cardAnnotations: 0, cardDependencies: 0, cardSourceLinks: 0, cardGithubEvidence: 0, externalRefs: 0, cardAttachments: 0, roadmapColumns: 4,
    roadmapSwimlanes: 1, roadmapCards: 0, roadmapReferences: 0
  });
  await request(`/api/story-templates/${template.id}`, { name: "Changed template" }, "PATCH");
  await request(`/api/changesets/${pending.id}/approve`, {});
  const refused = await fetch(`${origin}/api/changesets/${pending.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(refused.status).toBe(409);
  const second = (await request<{ changeSet: ChangeSet }>("/api/tool-proposals/copy-story-map", { sourceStoryMapId: map.id, targetName: "Reviewed target" })).changeSet;
  await server.close();
  const database = openExistingStoryMapperDb(process.env.STORYMAPPER_DB_PATH!);
  database.$client.prepare("UPDATE roadmap_columns SET name = ? WHERE id = ?").run("Changed column", column.id);
  database.$client.close();
  server = await buildServer({ development: true, runtimeConfig: { host: "127.0.0.1", port: 4317, allowRemoteHost: false } });
  origin = await server.listen({ port: 0, host: "127.0.0.1" });
  await request(`/api/changesets/${second.id}/approve`, {});
  const childDrift = await fetch(`${origin}/api/changesets/${second.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(childDrift.status).toBe(409);
  expect((await request<{ storyMaps: Array<{ name: string }> }>("/api/story-maps")).storyMaps.some((entry) => entry.name === "Reviewed target")).toBe(false);
});

it("previews identified sync removals and only normalized actual overwritten fields with bounded descriptions", async () => {
  await apply((await proposal([issue(1, null), issue(2, null), issue(3, null)])).id);
  const before = await importedSnapshot();
  const overwritten = before.cards.find((card) => card.title === "Fixture 1")!;
  expect(overwritten.assignee).toBe("fixture");
  const removed = before.cards.find((card) => card.title === "Fixture 2")!;
  const pending = await proposal([{ ...issue(1, null), title: "TASK-1: Reviewed title", body: "x".repeat(1200), state: "closed", assignee: null }, issue(3, null)], {
    storyMapId: before.storyMap.id, removeCardIds: [removed.id]
  });
  const preview = (pending.operations[0]!.after as { preview: { sync: unknown } }).preview.sync;
  expect(preview).toEqual({
    removals: [{ id: removed.id, key: removed.key, title: removed.title }],
    overwrites: [{ id: overwritten.id, key: overwritten.key, title: overwritten.title, fields: {
      title: { before: "Fixture 1", after: "Reviewed title" },
      description: { before: "Body 1", after: { value: "x".repeat(500), truncated: true, length: 1200 } },
      status: { before: "Open", after: "Closed" }, assignee: { before: "fixture", after: null }
    } }]
  });
  expect((await importedSnapshot()).cards).toEqual(before.cards);
  await apply(pending.id);
  const after = await importedSnapshot();
  const updated = after.cards.find((card) => card.id === overwritten.id)!;
  expect(updated).toMatchObject({ title: "Reviewed title", description: "x".repeat(1200), status: "Closed" });
  expect(updated).not.toHaveProperty("assignee");
  expect(after.cards.some((card) => card.id === removed.id)).toBe(false);
});

it.each(["Fixture/Repository", "other/repository"])("rejects a second canonical Issue binding on one Card for repository %s before proposal persistence", async (repository) => {
  await apply((await proposal([issue(1, null)])).id);
  const snapshot = await importedSnapshot();
  const card = snapshot.cards.find((entry) => entry.title === "Fixture 1")!;
  const before = await importedSnapshot();
  const proposals = await request(`/api/changesets?projectId=${projectId}`);
  const connectors = await request(`/api/connectors/connections?projectId=${projectId}`);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const response = await fetch(`${origin}/api/github/links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: card.id, repo: repository, issueNumber: 2, url: `https://github.com/${repository}/issues/2` }) });
  expect(response.status).toBe(409);
  expect((await importedSnapshot()).cards).toEqual(before.cards);
  expect((await importedSnapshot()).githubLinks).toEqual(before.githubLinks);
  expect((await importedSnapshot()).remoteWorkItemLinks).toEqual(before.remoteWorkItemLinks);
  expect(await request(`/api/changesets?projectId=${projectId}`)).toEqual(proposals);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(connectors);
  expect(await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`)).toEqual(activity);
});

it("rejects malformed and half-supplied parent identities atomically at HTTP validation", async () => {
  const maps = await request("/api/story-maps");
  const proposals = await request(`/api/changesets?projectId=${projectId}`);
  const connectors = await request(`/api/connectors/connections?projectId=${projectId}`);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  for (const parent of [
    { parentRepository: "invalid", parentNumber: 1 }, { parentRepository: "fixture /repository", parentNumber: 1 },
    { parentRepository: "fixture/repository", parentNumber: null }, { parentRepository: null, parentNumber: 1 }
  ]) {
    const response = await fetch(`${origin}/api/tool-proposals/github-board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      projectId, storyMapName: "Invalid parent", boardUrl: "https://github.com/orgs/fixture/projects/1", issues: [issue(1, "Epic"), { ...issue(2, null), ...parent }]
    }) });
    expect(response.status).toBe(400);
  }
  expect(await request("/api/story-maps")).toEqual(maps);
  expect(await request(`/api/changesets?projectId=${projectId}`)).toEqual(proposals);
  expect(await request(`/api/connectors/connections?projectId=${projectId}`)).toEqual(connectors);
  expect(await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`)).toEqual(activity);
});

it("rejects duplicate removal IDs atomically and plans actual Python canonical Issue removal", async () => {
  await apply((await proposal([issue(1, null)])).id);
  const snapshot = await importedSnapshot();
  const card = snapshot.cards.find((entry) => entry.title === "Fixture 1")!;
  const before = await importedSnapshot();
  const proposals = await request(`/api/changesets?projectId=${projectId}`);
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const refused = await fetch(`${origin}/api/tool-proposals/github-board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    projectId, storyMapName: "Imported fixture", storyMapId: before.storyMap.id, boardUrl: "https://github.com/orgs/fixture/projects/1", issues: [], removeCardIds: [card.id, card.id]
  }) });
  expect(refused.status).toBe(400);
  expect((await importedSnapshot()).cards).toEqual(before.cards);
  expect((await importedSnapshot()).githubLinks).toEqual(before.githubLinks);
  expect((await importedSnapshot()).remoteWorkItemLinks).toEqual(before.remoteWorkItemLinks);
  expect(await request(`/api/changesets?projectId=${projectId}`)).toEqual(proposals);
  expect(await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`)).toEqual(activity);
  const fixturePath = join(directory, "multi-link-closed.json");
  writeFileSync(fixturePath, JSON.stringify({ issues: [], states: { "fixture/repository#1": "CLOSED", "fixture/repository#2": "CLOSED" } }));
  const output = JSON.parse((await runPython([join(ROOT, "tools/fixtures/board_fixture.py"), fixturePath, "--url", origin, "--board-owner", "fixture", "--board-number", "1", "--project-id", projectId, "--story-map-name", "Imported fixture", "--sync", "--execute"])).stdout);
  expect(output.syncPlan.toRemoveClosed).toBe(1);
  expect(output.changeSet.operations[0].after.input.removeCardIds).toEqual([card.id]);
  expect((await importedSnapshot()).cards).toEqual(before.cards);
  await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", output.changeSet.id]);
  expect((await importedSnapshot()).cards.some((entry) => entry.id === card.id)).toBe(false);
  expect((await importedSnapshot()).githubLinks).toHaveLength(0);
});

it("persists distinct executed map identities while preserving approved operations in Python output", async () => {
  const identifiers: string[] = [];
  for (const number of [1, 2]) {
    const pending = await proposal([issue(number, null)]);
    const approvedInput = pending.operations[0]!.after;
    const output = JSON.parse((await runPython([join(ROOT, "tools/github_board_import.py"), "--url", origin, "--apply-change-set", pending.id])).stdout);
    const applied = output.changeSet as ChangeSet;
    const operation = applied.operations[0]!;
    const entityIds = applied.execution!.operationResults[0]!.entityIds;
    const inventory = await request<{ storyMaps: Array<{ id: string }> }>(`/api/story-maps?projectId=${projectId}`);
    const mapId = inventory.storyMaps.find((entry) => entityIds.includes(entry.id))!.id;
    const map = await request<StoryMapSnapshot>(`/api/story-maps/${mapId}`);
    expect(mapId).not.toBe(pending.operations[0]!.entityId);
    expect(operation).toEqual(pending.operations[0]);
    expect(operation.after).toEqual(approvedInput);
    expect(map.storyMap).toMatchObject({ id: mapId, name: "Imported fixture" });
    expect(map.githubLinks.map((link) => link.issueNumber)).toEqual([number]);
    const persisted = await request<{ changeSets: ChangeSet[] }>(`/api/changesets?projectId=${projectId}`);
    expect(persisted.changeSets.find((entry) => entry.id === pending.id)!.operations).toEqual(applied.operations);
    identifiers.push(mapId);
  }
  expect(new Set(identifiers).size).toBe(2);
});

it("refuses a deleted reviewed copy source through the existing create-new-proposal conflict without writes", async () => {
  const source = await request<{ id: string; version: number }>("/api/story-maps", { projectId, name: "Reviewed deleted source" });
  await request("/api/cards", { storyMapId: source.id, level: "activity", title: "Reviewed deleted Card" });
  const pending = (await request<{ changeSet: ChangeSet }>("/api/tool-proposals/copy-story-map", { sourceStoryMapId: source.id, targetName: "Must not be copied" })).changeSet;
  await request(`/api/changesets/${pending.id}/approve`, {});
  await request(`/api/story-maps/${source.id}?baseVersion=${source.version}`, {}, "DELETE");
  const maps = await request("/api/story-maps");
  const activity = await request<ActivityResponse>(`/api/activity?projectId=${projectId}&limit=100`);
  const proposals = await request<{ changeSets: ChangeSet[] }>(`/api/changesets?projectId=${projectId}`);
  const response = await fetch(`${origin}/api/changesets/${pending.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "conflict", conflicts: [{ entity: "storyMap", id: source.id, reason: "fingerprint", operationId: pending.operations[0]!.operationId, index: 0, current: null, message: "Story Map changed after the proposal; create a new proposal." }] });
  expect(await request("/api/story-maps")).toEqual(maps);
  expect(await request(`/api/changesets?projectId=${projectId}`)).toEqual({ changeSets: proposals.changeSets.map((proposal) => {
    if (proposal.id !== pending.id) return proposal;
    const { approval: _approval, ...unchanged } = proposal;
    return { ...unchanged, status: "conflict" };
  }) });
  await assertConflictActivity(activity, pending.id);
});

it("runs the actual Python copy command against a redirect and refuses without any destination request", async () => {
  let destinationRequests = 0;
  const destination = createServer((_request, response) => { destinationRequests += 1; response.end("{}"); });
  await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
  const address = destination.address();
  if (!address || typeof address === "string") throw new Error("Missing destination listener");
  let sourceRequests = 0;
  const redirect = createServer((_request, response) => {
    sourceRequests += 1;
    response.writeHead(302, { location: `http://127.0.0.1:${address.port}/api/projects` });
    response.end();
  });
  await new Promise<void>((resolve) => redirect.listen(0, "127.0.0.1", resolve));
  try {
    const source = redirect.address();
    if (!source || typeof source === "string") throw new Error("Missing redirect listener");
    await expect(runPython([join(ROOT, "tools/copy_story_map.py"), "Source", "Target", "--url", `http://127.0.0.1:${source.port}`, "--project-id", projectId])).rejects.toThrow("Agentic Story Mapper redirects are refused");
    expect(sourceRequests).toBe(1);
    expect(destinationRequests).toBe(0);
  } finally {
    await Promise.all([new Promise<void>((resolve) => redirect.close(() => resolve())), new Promise<void>((resolve) => destination.close(() => resolve()))]);
  }
});

it("persists and removes typed Card origin notes through HTTP without interpreting paths", async () => {
  const map = await request<{ id: string }>("/api/story-maps", { projectId, name: "Origin notes" });
  const card = await request<{ id: string; version: number; creationOrigin: string; provenance: string }>("/api/cards", { storyMapId: map.id, level: "story", title: "Origin" });
  expect(card).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
  const result = await request<{ link: { id: string; note: string } }>(`/api/cards/${card.id}/source-links`, { kind: "note", note: "  /unopened/source.txt  " });
  expect(result.link.note).toBe("/unopened/source.txt");
  const read = () => request<StoryMapSnapshot>(`/api/story-maps/${map.id}`);
  const before = await read();
  expect(before.cards[0]).toMatchObject({ creationOrigin: "manual", provenance: "linked" });
  const invalid = await fetch(`${origin}/api/cards/${card.id}/source-links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "note", note: "   " }) });
  expect(invalid.status).toBe(400);
  expect((await read()).cards[0]!.version).toBe(before.cards[0]!.version);
  await request(`/api/cards/${card.id}/source-links`, { kind: "note", id: result.link.id }, "DELETE");
  expect((await read()).cards[0]).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
});
