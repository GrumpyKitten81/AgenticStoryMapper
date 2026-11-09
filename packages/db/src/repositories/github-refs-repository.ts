import { parseStoredJson } from "@storymapper/db/versioned-json";
import { toSyncConflict, toRelease } from "@storymapper/db/repositories/row-mappers";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { DomainError, parseGitHubLocator, workItemProviderSchema, type CreateGitHubLinkRequest, type ExternalRef, type GitHubLink, type UpdateGitHubLinkRequest } from "@storymapper/contracts";
import { projectGitHubRefs } from "@storymapper/core";
import { cardGithubEvidence, cards, releases, storyMaps, externalRefs, remoteWorkItemLinks, syncConflicts } from "@storymapper/db/schema";
import { affectedGithubCards, finalizeEvidenceCards } from "@storymapper/db/repositories/source-evidence-repository";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"transaction">;

export function listGitHubLinksForStoryMap(this: Repository, storyMapId: string): GitHubLink[] {
  if (!this.isStoryMapVisible(storyMapId)) return [];
  return projectGitHubRefs(this.db.select().from(externalRefs).where(and(eq(externalRefs.scopeId, storyMapId), inArray(externalRefs.system, workItemProviderSchema.options))).orderBy(sql`${externalRefs}.rowid`).all(), this.listRemoteWorkItemLinksForStoryMap(storyMapId));
}

export function getGitHubLink(this: Repository, id: string): GitHubLink | undefined {
  const ref = this.db.select().from(externalRefs).where(and(eq(externalRefs.id, id), inArray(externalRefs.system, workItemProviderSchema.options))).get();
  if (!ref) return undefined;
  const state = this.db.select().from(remoteWorkItemLinks).where(eq(remoteWorkItemLinks.externalRefId, id)).get();
  return projectGitHubRefs([ref], state ? [{ ...state, labels: parseStoredJson("remote_work_item_links", "labels_json", state.labelsJson, state.labelsSchemaVersion), titleHash: state.titleHash ?? undefined, bodyHash: state.bodyHash ?? undefined, remoteState: state.remoteState ?? undefined, issueType: state.issueType ?? undefined, managedLabels: parseStoredJson("remote_work_item_links", "managed_labels_json", state.managedLabelsJson, state.managedLabelsSchemaVersion) as string[], lastSyncedAt: state.lastSyncedAt ?? undefined, syncState: state.syncState as GitHubLink["syncState"] }] : [])[0];
}

export function createGitHubLink(this: Repository, input: CreateGitHubLinkRequest): GitHubLink {
  this.assertWritable();
  const ref = storeWorkItemReference(this, canonicalRef(this, input));
  return this.getGitHubLink(ref.id)!;
}

export function storeWorkItemReference(repository: Repository, ref: ExternalRef): ExternalRef {
  const existing = repository.db.select().from(externalRefs).where(and(eq(externalRefs.entityType, ref.entityType), eq(externalRefs.entityId, ref.entityId), eq(externalRefs.system, ref.system))).get();
  if (existing) {
    if (existing.externalId !== ref.externalId) throw new DomainError("conflict", "Entity already has a different GitHub reference.");
    return existing;
  }
  assertUnique(repository, ref);
  repository.db.insert(externalRefs).values(ref).run();
  finalizeOwners(repository, [ref], []);
  repository.logActivity(projectId(repository, ref), "externalRef.created", "externalRef", ref.id, undefined, ref);
  return ref;
}

export function updateGitHubLink(this: Repository, id: string, input: UpdateGitHubLinkRequest): GitHubLink | undefined {
  this.assertWritable();
  const reference = this.db.select().from(externalRefs).where(eq(externalRefs.id, id)).get();
  if (reference && reference.system !== "github") throw new DomainError("validation", "Only GitHub references can be updated through the GitHub boundary.");
  const before = this.getGitHubLink(id);
  if (!before) return undefined;
  const previous = this.db.select().from(externalRefs).where(eq(externalRefs.id, id)).get()!;
  const merged = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
  if (input.cardId) merged.releaseId = undefined;
  if (input.releaseId) merged.cardId = undefined;
  if (input.url) {
    const locator = parseGitHubLocator(input.url);
    if (!locator) throw new DomainError("validation", "GitHub reference requires a canonical locator.");
    merged.repo = input.repo ?? locator.repo;
    merged.issueNumber = input.issueNumber ?? (locator.resource === "issues" ? locator.number : undefined);
  }
  const next = { ...canonicalRef(this, merged, previous), id, createdAt: previous.createdAt };
  if (parseGitHubLocator(next.externalId)!.resource !== "issues" && this.db.select().from(cardGithubEvidence).where(eq(cardGithubEvidence.externalRefId, id)).get()) throw new DomainError("validation", "Attached GitHub source evidence requires an Issue.");
  if (projectId(this, previous) !== projectId(this, next)) throw new DomainError("validation", "GitHub reference cannot move to another Project.");
  assertUnique(this, next, id);
  if (previous.entityType === next.entityType && previous.entityId === next.entityId && previous.scopeId === next.scopeId && previous.externalId === next.externalId) return before;
  const affected = affectedGithubCards(this, id);
  this.db.update(externalRefs).set(next).where(eq(externalRefs.id, id)).run();
  if (previous.externalId !== next.externalId || previous.entityType !== next.entityType || previous.entityId !== next.entityId) {
    retireSyncConflicts(this, previous);
    this.db.delete(remoteWorkItemLinks).where(eq(remoteWorkItemLinks.externalRefId, id)).run();
    finalizeOwners(this, [previous, next], affected);
  }
  this.logActivity(projectId(this, next), "externalRef.updated", "externalRef", id, previous, next);
  return this.getGitHubLink(id)!;
}

export function deleteGitHubLink(this: Repository, id: string): boolean {
  this.assertWritable();
  const ref = this.db.select().from(externalRefs).where(and(eq(externalRefs.id, id), inArray(externalRefs.system, workItemProviderSchema.options))).get();
  if (!ref) return false;
  const affected = affectedGithubCards(this, id);
  retireSyncConflicts(this, ref);
  this.db.delete(externalRefs).where(eq(externalRefs.id, id)).run();
  finalizeOwners(this, [ref], affected);
  this.logActivity(projectId(this, ref), "externalRef.detached", "externalRef", id, ref, undefined);
  return true;
}

function canonicalRef(repository: Repository, input: CreateGitHubLinkRequest, previous?: ExternalRef): ExternalRef {
  if (Boolean(input.cardId) === Boolean(input.releaseId)) throw new DomainError("validation", "Exactly one Card or Release must own a GitHub reference.");
  const locator = parseGitHubLocator(input.url);
  if (!locator || locator.repo !== input.repo.toLowerCase() || input.issueNumber !== undefined && (locator.resource !== "issues" || locator.number !== input.issueNumber)) throw new DomainError("validation", "GitHub reference locator, repository and number must agree.");
  const entityType = input.cardId ? "card" : "release";
  const entityId = (input.cardId ?? input.releaseId)!;
  const retained = previous?.entityType === entityType && previous.entityId === entityId;
  const owner = retained ? entityType === "card" ? repository.db.select().from(cards).where(eq(cards.id, entityId)).get() : repository.db.select().from(releases).where(eq(releases.id, entityId)).get() : entityType === "card" ? repository.getCard(entityId) : repository.getRelease(entityId);
  if (!owner) throw new DomainError("not_found", "GitHub reference owner not found.");
  return { id: randomUUID(), entityType, entityId, system: "github", externalId: locator.url, scopeId: owner.storyMapId, syncedVersion: owner.version, createdAt: new Date().toISOString() };
}

function assertUnique(repository: Repository, ref: ExternalRef, except?: string): void {
  const conflict = repository.db.select().from(externalRefs).where(and(eq(externalRefs.system, ref.system),
    or(and(eq(externalRefs.entityType, ref.entityType), eq(externalRefs.entityId, ref.entityId)), and(eq(externalRefs.scopeId, ref.scopeId), eq(externalRefs.externalId, ref.externalId))),
    ...(except ? [ne(externalRefs.id, except)] : []))).get();
  if (conflict) throw new DomainError("conflict", "GitHub identity is already bound in this scope.");
}

function projectId(repository: Repository, ref: ExternalRef): string {
  return repository.db.select().from(storyMaps).where(eq(storyMaps.id, ref.scopeId)).get()!.projectId;
}

function finalizeOwners(repository: Repository, refs: ExternalRef[], cardIds: string[]): void {
  finalizeEvidenceCards(repository, [...cardIds, ...refs.filter((ref) => ref.entityType === "card").map((ref) => ref.entityId)]);
  for (const id of new Set(refs.filter((ref) => ref.entityType === "release").map((ref) => ref.entityId))) {
    const before = toRelease(repository.db.select().from(releases).where(eq(releases.id, id)).get()!);
    repository.bumpRootVersion("releases", id);
    const after = toRelease(repository.db.select().from(releases).where(eq(releases.id, id)).get()!);
    repository.logActivity(repository.db.select().from(storyMaps).where(eq(storyMaps.id, after.storyMapId)).get()!.projectId, "release.sourceEvidence.updated", "release", id, before, after);
  }
}

function retireSyncConflicts(repository: Repository, ref: ExternalRef): void {
  if (ref.entityType !== "card") return;
  const obsolete = repository.db.select().from(syncConflicts).where(and(eq(syncConflicts.status, "open"), eq(syncConflicts.externalRefId, ref.id))).all();
  for (const row of obsolete) {
    repository.db.delete(syncConflicts).where(eq(syncConflicts.id, row.id)).run();
    repository.logActivity(projectId(repository, ref), "syncConflict.retired", "syncConflict", row.id, toSyncConflict(row), { reason: "identity-changed", externalRefId: ref.id });
  }
}
