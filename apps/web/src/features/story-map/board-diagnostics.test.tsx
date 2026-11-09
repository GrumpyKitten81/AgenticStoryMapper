// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import { DiscoveryMatrix } from "@storymapper/web/features/story-map/components/DiscoveryMatrix";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { useStoryMapBoardState, type StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { useTreeCollapseStore } from "@storymapper/web/app/stores/tree-collapse-store";

vi.mock("@storymapper/web/features/github-sync/GitHubSyncPanel", () => ({ GitHubSyncPanel: () => null }));

const timestamp = "2026-10-17T00:00:00.000Z";
const uuid = (index: number) => `61000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const mapId = uuid(1001);
const snapshot = storyMapSnapshotSchema.parse({
  storyMap: { id: mapId, projectId: uuid(1002), version: 1, name: "1,000 legal Cards", createdAt: timestamp, updatedAt: timestamp },
  cards: Array.from({ length: 1000 }, (_, index) => ({ id: uuid(index + 1), storyMapId: mapId, key: `DIAG-${index + 1}`, version: 1, parentId: index === 0 ? null : index === 1 ? uuid(1) : uuid(2), level: index === 0 ? "activity" : index === 1 ? "step" : "story", title: index === 0 ? "Activity" : index === 1 ? "Step" : `Fixture ${index - 2}`, position: index > 1 ? index - 2 : 0, color: index % 2 ? "custom" : "all", description: "", releaseId: null, status: "todo", creationOrigin: "manual", provenance: "manual", createdAt: timestamp, updatedAt: timestamp })),
  releases: [], cardDependencies: [], sourceLinks: [], githubLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
});
let state: StoryMapBoardState;
function Fixture() {
  state = useStoryMapBoardState(snapshot);
  return <div data-story-map-board tabIndex={-1}><BoardToolbar state={state} /><DiscoveryMatrix state={state} zoom={1} onSelectCard={() => {}} /></div>;
}
async function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

function sourceBuildProvenance() {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const roots = ["apps/server", "apps/web", "packages", "scripts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"];
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...roots], { cwd: repositoryRoot, encoding: "utf8" }).split("\0").filter(Boolean).sort();
  const files = [...new Set(paths)].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(resolve(repositoryRoot, path))).digest("hex") }));
  return { revision, sourceSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), sourceFileCount: files.length, roots, algorithm: "SHA256 of JSON sorted unique {path,sha256(file bytes)} for git ls-files --cached --others --exclude-standard -z; includes actual staged/unstaged/untracked source bytes" };
}

it("records raw selection/collapse/search/color input through committed complete Discovery DOM", async () => {
  const { root, client, tiles, host, capture, functional, provenance, samples } = exerciseRecordsRawSelectionCollapseSearchColorInputThroughCommitted();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>));
    expect(tiles()).toHaveLength(1000);
    await act(async () => host.querySelector<HTMLButtonElement>('.board-search-row [aria-pressed]')!.click());
    for (let run = 0; run < 3; run++) {
      let start = performance.now();
      await act(async () => host.querySelector<HTMLInputElement>(`input[aria-label="Select DIAG-3, Fixture 0"]`)!.click());
      capture("toggle selection DIAG-3", run, "DOM click through React commit of selected Card and toolbar status", start, 100);
      expect(state.selectedIds.has(uuid(3))).toBe(run % 2 === 0);
      expect(host.querySelector<HTMLInputElement>('input[aria-label="Select DIAG-3, Fixture 0"]')!.checked).toBe(run % 2 === 0);
      for (const action of ["Collapse Step", "Expand Step"]) {
        start = performance.now();
        await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${action}"]`)!.click());
        capture(action, run, "DOM click through React commit of hierarchy visibility and grid", start, 100);
        expect(tiles().filter((tile) => !tile.closest("[hidden]")).length).toBe(action.startsWith("Collapse") ? 2 : 1000);
      }
      for (const [label, value, matches, visible] of [["Search cards", "Fixture 99", 9, 11], ["Search cards", "", 1000, 1000], ["Color category", "value:custom", 500, 501], ["Color category", "all", 1000, 1000]] as const) {
        start = performance.now();
        await change(host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!, value);
        capture(`${label}=${value}`, run, "DOM input/change through React commit of complete Discovery tiles and match status", start, 300);
        expect(state.filtered.matchingCardIds.size).toBe(matches);
        expect(host.textContent).toContain(`${matches} matches / 1000 cards`);
        expect(tiles()).toHaveLength(1000);
        expect(tiles().filter((tile) => !tile.closest("[hidden]")).length).toBe(visible);
      }
    }
    functional.completed = true;
    functional.success = true;
  } finally {
    const evidence = fileURLToPath(new URL("../../../../../evidence/story-6-10", import.meta.url));
    mkdirSync(evidence, { recursive: true });
    writeFileSync(`${evidence}/web-board-diagnostics-${Date.now()}.json`, `${JSON.stringify({ measuredAt: new Date().toISOString(), fixture: "fixed deterministic IDs/timestamps/values; 1000 Cards:1 Activity+1 Step+998 Stories; real state/BoardToolbar/DiscoveryMatrix/CardTiles/DndContext", environment: { node: process.version, platform: process.platform, architecture: process.arch, osRelease: release(), cpu: cpus()[0]?.model, runner: "Vitest source transform / React development / jsdom", build: "unbundled TypeScript source", nativePaint: false }, coldWarm: "cold is first action of each kind on fresh mounted fixture; warm is repeated operation; no OS cache eviction", timingAcceptanceGate: false, functional, provenance, samples }, null, 2)}\n`);
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    useTreeCollapseStore.setState({ collapsedByMap: {} });
  }
}, 60000);

function exerciseRecordsRawSelectionCollapseSearchColorInputThroughCommitted() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() { } disconnect() { } });
  notifyManager.setScheduler(queueMicrotask);
  useTreeCollapseStore.setState({ collapsedByMap: {} });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const provenance = sourceBuildProvenance();
  const functional = { completed: false, success: false };
  const samples: Array<{ action: string; phase: string; boundary: string; milliseconds: number; referenceMilliseconds: number; matches: number; renderedTiles: number; visibleTiles: number; }> = [];
  const tiles = () => [...host.querySelectorAll<HTMLButtonElement>("button[data-card-id]")];
  const capture = (action: string, run: number, boundary: string, start: number, referenceMilliseconds: number) => {
    const milliseconds = performance.now() - start;
    const rendered = tiles();
    samples.push({ action, phase: run === 0 ? "cold-first-action-on-fresh-mounted-fixture" : `warm-${run}`, boundary, milliseconds, referenceMilliseconds, matches: state.filtered.matchingCardIds.size, renderedTiles: rendered.length, visibleTiles: rendered.filter((tile) => !tile.closest("[hidden]")).length });
  };
  return { root, client, tiles, host, capture, functional, provenance, samples };
}
