import { retireGitHubSync } from "@storymapper/core/changesets/github-identity";
import { parseWorkItemLocator, isWorkItemProvider, type ChangeOperation } from "@storymapper/contracts";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, mapOwner, projectOwner, referenceId, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { ownedCard, changedCard, finalizeCard, remainingReference, remainingTarget } from "@storymapper/core/changesets/remaining-context";

export function resolveAttachment(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "attachment" }>;
  if (operation.op === "create") {
    const card = changedCard(context, operation.after.cardId);
    bumpVersion(context, card);
    context.state.attachments.push({ ...operation.after, id: allocatedId(context), cardId: card.id, createdAt: context.supply.createdAt });
  } else {
    const id = remainingTarget(context, "attachment");
    const attachment = context.state.attachments.find((entry) => entry.id === id)!;
    bumpVersion(context, changedCard(context, attachment.cardId));
    context.state.attachments = context.state.attachments.filter((entry) => entry.id !== id);
  }
}

export function resolveGithubLink(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "githubExternalRef" }>;
  const id = operation.op === "create" ? allocatedId(context) : remainingTarget(context, "githubExternalRef");
  const stored = context.state.externalRefs.find((ref) => ref.id === id && isWorkItemProvider(ref.system));
  const previous = stored && structuredClone(stored);
  if (operation.op !== "create" && !previous) refuse(context, "Canonical GitHub reference is missing.");
  const affected = new Set(context.state.sourceLinks.filter((entry) => entry.kind === "github" && entry.externalRefId === id).map((entry) => entry.cardId));
  if (previous) {
    referenceOwner(context, previous.entityType, previous.entityId, previous.scopeId);
    if (previous.entityType === "card") affected.add(previous.entityId);
  }
  if (operation.op === "delete") {
    context.state.externalRefs = context.state.externalRefs.filter((ref) => ref.id !== id);
    context.state.sourceLinks = context.state.sourceLinks.filter((ref) => ref.kind !== "github" || ref.externalRefId !== id);
    retireGitHubSync(context.state, id);
  } else {
    const after = operation.after;
    const entityId = remainingReference(context, after.entityType, after.entityId);
    const scopeId = referenceId(context, "storyMap", after.scopeId);
    const version = referenceOwner(context, after.entityType, entityId, scopeId, !previous);
    const locator = parseWorkItemLocator(after.provider ?? "github", after.externalId)!;
    if (previous && previous.entityType === after.entityType && previous.entityId === entityId && previous.scopeId === scopeId && previous.system === (after.provider ?? "github") && previous.externalId === after.externalId) return;
    if (previous && context.state.storyMaps.find((map) => map.id === previous.scopeId)?.projectId !== context.state.storyMaps.find((map) => map.id === scopeId)?.projectId) refuse(context, "GitHub reference cannot move to another Project.");
    if (context.state.externalRefs.some((ref) => ref.id !== id && ref.system === (after.provider ?? "github") && (ref.entityType === after.entityType && ref.entityId === entityId || ref.scopeId === scopeId && ref.externalId === after.externalId))) refuse(context, "GitHub identity is already bound in this scope.", "conflict");
    const { provider: _provider, ...fields } = after;
    const value = { ...fields, id, entityId, scopeId, system: after.provider ?? "github", externalId: after.externalId, syncedVersion: version, createdAt: previous?.createdAt ?? context.supply.createdAt };
    if (stored) Object.assign(stored, value); else context.state.externalRefs.push(value);
    if (after.entityType === "card") affected.add(entityId);
    if (previous && (previous.system !== (after.provider ?? "github") || previous.externalId !== after.externalId || previous.entityType !== after.entityType || previous.entityId !== entityId)) retireGitHubSync(context.state, id);
    for (const ref of context.state.sourceLinks) if (ref.kind === "github" && ref.externalRefId === id) {
      if (locator.resource !== "issues") refuse(context, "Attached GitHub evidence requires an Issue.");
      ref.repoFullName = locator.repo; ref.issueNumber = locator.number; ref.url = locator.url;
      if (after.provider) ref.provider = after.provider; else delete ref.provider;
    }
    if (after.entityType === "release") bumpVersion(context, context.state.releases.find((release) => release.id === entityId)!);
  }
  if (previous?.entityType === "release") bumpVersion(context, context.state.releases.find((release) => release.id === previous.entityId)!);
  for (const cardId of affected) finalizeCard(context, ownedCard(context, cardId));
}

export function resolveExternalRef(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "externalRef" }>;
  if (operation.op === "delete") {
    const id = remainingTarget(context, "externalRef");
    const ref = context.state.externalRefs.find((row) => row.id === id)!;
    if (isWorkItemProvider(ref.system)) refuse(context, "The github reference system is reserved.");
    referenceOwner(context, ref.entityType, ref.entityId, ref.scopeId);
    context.state.externalRefs = context.state.externalRefs.filter((row) => row.id !== id);
    return;
  }
  const after = operation.after;
  const id = remainingReference(context, after.entityType, after.entityId);
  const scopeId = context.state.projects.some((project) => project.id === after.scopeId) ? after.scopeId : referenceId(context, "storyMap", after.scopeId);
  const version = referenceOwner(context, after.entityType, id, scopeId);
  const existing = context.state.externalRefs.find((ref) => ref.entityType === after.entityType && ref.entityId === id && ref.system === after.system);
  if (existing) { if (existing.externalId !== after.externalId) refuse(context, "Entity has another external reference for this system.", "conflict"); return; }
  if (context.state.externalRefs.some((ref) => ref.entityType === after.entityType && ref.scopeId === scopeId && ref.system === after.system && ref.externalId === after.externalId)) refuse(context, "External reference is already bound in this scope.", "conflict");
  const refId = allocatedId(context);
  context.state.externalRefs.push({ ...after, scopeId, entityId: id, id: refId, syncedVersion: version, createdAt: context.supply.createdAt });
  context.publishedRefIds.add(refId);
}

function referenceOwner(context: ResolutionContext, entity: "card" | "release" | "persona", id: string, scopeId: string, validateBaseline = true): number {
  const row = entity === "card" ? context.state.cards.find((entry) => entry.id === id)! : entity === "release" ? context.state.releases.find((entry) => entry.id === id)! : context.state.personas.find((entry) => entry.id === id)!;
  const scope = row.storyMapId ?? ("projectId" in row ? row.projectId : undefined);
  if (scope !== scopeId) refuse(context, "External reference scope disagrees with owner.");
  if (entity === "card") cardOwner(context, id); else if (row.storyMapId) mapOwner(context, row.storyMapId); else projectOwner(context, scopeId);
  if (validateBaseline) assertBaseline(context, row.version, id);
  return row.version;
}
