import type { FastifyInstance } from "fastify";
import type { StoryMap } from "@storymapper/contracts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cpus, release } from "node:os";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { storyMapSnapshotSchema, type Card } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

function sourceBuildProvenance() {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const roots = ["apps/server", "apps/web", "packages", "scripts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"];
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...roots], { cwd: repositoryRoot, encoding: "utf8" }).split("\0").filter(Boolean).sort();
  const files = [...new Set(paths)].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(resolve(repositoryRoot, path))).digest("hex") }));
  return { revision, sourceSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), sourceFileCount: files.length, roots, algorithm: "SHA256 of JSON sorted unique {path,sha256(file bytes)} for git ls-files --cached --others --exclude-standard -z; includes actual staged/unstaged/untracked source bytes" };
}

it("records raw full-snapshot read and committed versioned mutation diagnostics for a legal 1,000-Card map", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-board-diagnostics-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const { server, unitOfWork, rows, samples, functional, provenance } = exerciseRecordsRawFullSnapshotReadAndCommittedVersionedMutation(handle);
  try {
    await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: path });
    await server.ready();
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const response = await server.inject({ method: "GET", url: `/api/story-maps/${rows.map.id}` });
      const milliseconds = performance.now() - start;
      samples.push({ boundary: "Fastify inject GET full map through serialized response", phase: run === 0 ? "cold-first-read" : `warm-${run}`, milliseconds, referenceMilliseconds: 150 });
      expect(response.statusCode).toBe(200);
      const snapshot = storyMapSnapshotSchema.parse(response.json());
      expect(snapshot.cards).toHaveLength(1000);
      expect(snapshot.cards.filter((card) => card.level === "story").every((card) => card.parentId === rows.step.id)).toBe(true);
    }
    const savedCards: Card[] = [];
    await exerciseRecordsRawFullSnapshotReadAndCommittedVersionedMutation2(repository, rows, server, samples, savedCards, handle, path, functional);
  } finally {
    const evidence = fileURLToPath(new URL("../../../../../evidence/story-6-10/", import.meta.url));
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, `server-board-diagnostics-${Date.now()}.json`), `${JSON.stringify({ measuredAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, architecture: process.arch, osRelease: release(), cpu: cpus()[0]?.model, runner: "Vitest source transform; Fastify inject; real SQLite WAL", build: "TypeScript source, no native socket/network", nativePaint: false }, fixture: { cards: 1000, activities: 1, steps: 1, stories: 998, values: "fixed labels/positions; generated repository UUIDs/timestamps", storage: "fresh temporary SQLite database" }, coldWarm: "cold is first operation on fresh fixture, not OS cache eviction; warm is subsequent operation", timingAcceptanceGate: false, functional, provenance, durability: "functional assertions verify mutation samples after database close/reopen outside timers; suite failures remain failures", samples }, null, 2)}\n`);
    await server.close();
    if (handle.current.$client.open) handle.current.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);

async function exerciseRecordsRawFullSnapshotReadAndCommittedVersionedMutation2(repository: StoryMapperRepository<"root">, rows: { map: StoryMap; activity: Card; step: Card; stories: Card[]; }, server: FastifyInstance, samples: { boundary: string; phase: string; milliseconds: number; referenceMilliseconds: number; version?: number; }[], savedCards: Card[], handle: DatabaseHandle, path: string, functional: { completed: boolean; success: boolean; }) {
  for (let run = 0; run < 3; run++) {
    const current = repository.getCard(rows.stories[run]!.id)!;
    const title = `Committed diagnostic ${run}`;
    const start = performance.now();
    const response = await server.inject({ method: "PATCH", url: `/api/cards/${current.id}`, payload: { title, baseVersion: current.version } });
    const milliseconds = performance.now() - start;
    samples.push({ boundary: "Fastify inject versioned PATCH through SQLite commit and serialized response", phase: run === 0 ? "cold-first-mutation" : `warm-${run}`, milliseconds, referenceMilliseconds: 30, version: current.version + 1 });
    expect(response.statusCode).toBe(200);
    const saved = response.json<Card>();
    expect(saved).toMatchObject({ id: current.id, title, version: current.version + 1 });
    savedCards.push(saved);
  }
  await server.close();
  handle.current.$client.close();
  handle.current = openStoryMapperDb(path);
  for (const card of savedCards) {
    expect(repository.getCard(card.id)).toEqual(card);
    expect(repository.listCardHistory(card.id).map((entry) => entry.version)).toEqual([1, 2]);
    expect(repository.listCardHistory(card.id)[1]).toMatchObject({ actorType: "human", actor: "local-user", snapshot: { title: card.title, version: 2 } });
  }
  expect(handle.current.$client.pragma("foreign_key_check")).toEqual([]);
  functional.completed = true;
  functional.success = true;
}

function exerciseRecordsRawFullSnapshotReadAndCommittedVersionedMutation(handle: DatabaseHandle) {
  const unitOfWork = new UnitOfWork(handle);
  const actor = { actorType: "human", actorId: "board-diagnostics" } as const;
  const rows = unitOfWork.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Board diagnostic fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "1,000 legal Cards" });
    const activity = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity", position: 0 });
    const step = tx.createCard({ storyMapId: map.id, parentId: activity.id, level: "step", title: "Step", position: 0 });
    const stories = Array.from({ length: 998 }, (_, index) => tx.createCard({ storyMapId: map.id, parentId: step.id, level: "story", title: `Fixture ${index}`, position: index }));
    return { map, activity, step, stories };
  });
  const server = Fastify();
  const provenance = sourceBuildProvenance();
  const functional = { completed: false, success: false };
  const samples: Array<{ boundary: string; phase: string; milliseconds: number; referenceMilliseconds: number; version?: number; }> = [];
  return { server, unitOfWork, rows, samples, functional, provenance };
}
