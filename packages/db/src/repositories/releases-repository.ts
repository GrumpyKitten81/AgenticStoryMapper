import { workItemProviderSchema } from "@storymapper/contracts";
import { placeRelease } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { inArray, and, asc, eq } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { CreateReleaseRequest, Release, StoryMapReportData, UpdateReleaseRequest } from "@storymapper/contracts";
import { ReleasePositionError } from "@storymapper/db/repositories/repository-errors";
import { compact } from "@storymapper/db/repositories/repository-values";
import { toCard, toRelease } from "@storymapper/db/repositories/row-mappers";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { affectedGithubCards, finalizeEvidenceCards } from "@storymapper/db/repositories/source-evidence-repository";
import { cards, externalRefs, releases, remoteWorkItemLinks, storyMaps } from "@storymapper/db/schema";

export function listReleases(this: StoryMapperRepository<"transaction">, storyMapId: string): Release[] {
    this.context.database;
    if (!this.isStoryMapVisible(storyMapId)) return [];
    return this.db
      .select()
      .from(releases)
      .where(eq(releases.storyMapId, storyMapId))
      .orderBy(asc(releases.position))
      .all()
      .map(toRelease);
  }

export function createRelease(this: StoryMapperRepository<"transaction">, input: CreateReleaseRequest): Release {
    this.assertWritable();
    const storyMap = this.getStoryMapOrThrow(input.storyMapId);
    const release: Release = {
      version: 1,
      id: randomUUID(),
      storyMapId: input.storyMapId,
      name: input.name,
      goal: input.goal ?? "",
      position: input.position ?? this.nextReleasePosition(input.storyMapId),
      startDate: input.startDate ?? null,
      releaseDate: input.releaseDate ?? null,
      released: input.released ?? false
    };

    this.db.insert(releases).values(release).run();
    this.createRootVersion("releases", release.id);
    this.logActivity(storyMap.projectId, "release.created", "release", release.id, undefined, release);
    return release;
  }

export function updateRelease(this: StoryMapperRepository<"transaction">, releaseId: string, input: UpdateReleaseRequest): Release | undefined {
    this.assertWritable();
    const before = this.getRelease(releaseId);
    if (!before) {
      return undefined;
    }

    if (input.position !== undefined) {
      this.moveRelease(before, input);
    } else {
      this.db.update(releases).set(compact(input)).where(eq(releases.id, releaseId)).run();
    }
    this.bumpRootVersion("releases", releaseId);
    const after = this.getRelease(releaseId);
    if (!after) {
      return undefined;
    }

    const storyMap = this.getStoryMapOrThrow(after.storyMapId);
    this.logActivity(storyMap.projectId, "release.updated", "release", releaseId, before, after);
    return after;
  }

export function moveRelease(this: StoryMapperRepository<"transaction">, release: Release, input: UpdateReleaseRequest): void {
    this.assertWritable();
    const releasesInOrder = this.listReleases(release.storyMapId).filter((entry) => entry.id !== release.id);
    const targetPosition = input.position;
    if (targetPosition === undefined || targetPosition > releasesInOrder.length) {
      throw new ReleasePositionError("Release position is outside the release lanes.");
    }

    this.db.update(releases).set(compact(input)).where(eq(releases.id, release.id)).run();
    for (const entry of placeRelease([...releasesInOrder, release], release, targetPosition)) {
      this.db.update(releases).set({ position: entry.position }).where(eq(releases.id, entry.id)).run();
      this.bumpRootVersion("releases", entry.id);
    }
  }

export function deleteRelease(this: StoryMapperRepository<"transaction">, releaseId: string): boolean {
    this.assertWritable();
    const row = this.db.select().from(releases).where(eq(releases.id, releaseId)).get();
    if (!row) return false;
    const before = toRelease(row);

    const now = new Date().toISOString();
    const affectedCards = this.db.select().from(cards).where(eq(cards.releaseId, releaseId)).all().map(toCard);
    this.db.update(cards).set({ releaseId: null, updatedAt: now }).where(eq(cards.releaseId, releaseId)).run();
    for (const card of affectedCards) {
      const after = toCard(this.db.select().from(cards).where(eq(cards.id, card.id)).get()!);
      this.writeCardVersion(after);
      this.logActivity(this.db.select().from(storyMaps).where(eq(storyMaps.id, card.storyMapId)).get()!.projectId, "card.updated", "card", card.id, card, after);
    }
    const evidenceOwners = this.db.select().from(externalRefs).where(and(eq(externalRefs.entityType, "release"), eq(externalRefs.entityId, releaseId), inArray(externalRefs.system, workItemProviderSchema.options))).all().flatMap((link) => affectedGithubCards(this, link.id));
    this.deleteExternalRefsForEntity("release", releaseId);
    finalizeEvidenceCards(this, evidenceOwners);
    this.bumpRootVersion("releases", releaseId);
    this.db.delete(releases).where(eq(releases.id, releaseId)).run();
    const storyMap = this.db.select().from(storyMaps).where(eq(storyMaps.id, before.storyMapId)).get()!;
    this.logActivity(storyMap.projectId, "release.deleted", "release", releaseId, before, undefined);
    return true;
  }

export function getStoryMapReportData(this: StoryMapperRepository<"transaction">, storyMapId: string): StoryMapReportData | undefined {
  this.context.database;
  if (!this.isStoryMapVisible(storyMapId)) return undefined;
  return { storyMapId, releases: this.listReleases(storyMapId), cards: this.listCards(storyMapId), sourceLinkedCardIds: this.listSourceLinksForStoryMap(storyMapId).filter((link) => link.kind === "chunk").map((link) => link.cardId), githubLinkedCardIds: this.listGitHubLinksForStoryMap(storyMapId).flatMap((link) => link.cardId ? [link.cardId] : []) };
}

export function getRelease(this: StoryMapperRepository<"transaction">, releaseId: string): Release | undefined {
    this.context.database;
    const row = this.db.select().from(releases).where(eq(releases.id, releaseId)).get();
    return row && this.isStoryMapVisible(row.storyMapId) ? toRelease(row) : undefined;
  }

export function assertReleaseAllowed(this: StoryMapperRepository<"transaction">, storyMapId: string, releaseId?: string | null): void {
    this.context.database;
    if (!releaseId) return;
    const release = this.getRelease(releaseId);
    if (!release) throw new DomainError("not_found", `Release ${releaseId} not found.`);
    if (release.storyMapId !== storyMapId) throw new DomainError("validation", `Release ${releaseId} belongs to another story map.`);
  }

export function nextReleasePosition(this: StoryMapperRepository<"transaction">, storyMapId: string): number {
    this.context.database;
    return this.listReleases(storyMapId).length;
  }
