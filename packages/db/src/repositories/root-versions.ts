import { eq, sql } from "drizzle-orm";
import { cards, personas, releases, roadmaps, storyMaps } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { trackLiveRoot, type LiveRoot } from "@storymapper/db/live-change-tracking";

const ROOTS = { cards, personas, releases, roadmaps, storyMaps };
const LIVE_ROOTS = { cards: "card", personas: "persona", releases: "release", roadmaps: "roadmap", storyMaps: "storyMap" } satisfies Record<keyof typeof ROOTS, LiveRoot>;
type Root = keyof typeof ROOTS;

export function createRootVersion(this: StoryMapperRepository<"transaction">, root: Root, id: string): void {
  this.assertWritable();
  this.context.transaction!.createdRoots.add(`${root}:${id}`);
  trackLiveRoot(this.db, this.context.transaction!, LIVE_ROOTS[root], id);
}

export function bumpRootVersion(this: StoryMapperRepository<"transaction">, root: Root, id: string): void {
  this.assertWritable();
  const transaction = this.context.transaction!;
  const key = `${root}:${id}`;
  if (transaction.createdRoots.has(key) || transaction.bumpedRoots.has(key)) return;
  const table = ROOTS[root];
  this.db.update(table).set({ version: sql`${table.version} + 1` }).where(eq(table.id, id)).run();
  transaction.bumpedRoots.add(key);
  trackLiveRoot(this.db, transaction, LIVE_ROOTS[root], id);
}
