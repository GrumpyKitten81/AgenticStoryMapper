import { DomainError, remoteWorkItemIdentity, canonicalWorkItemId, parseWorkItemLocator, workItemScopeMatches, type ActorContext, type Card, type ConnectorConnection, type RemoteWorkItemLink, type ResolveSyncConflictRequest, type ResolveSyncConflictResponse, type SyncConflict, type SyncPlan } from "@storymapper/contracts";
import { agentAccessEnabled, buildGitHubIssueBody, managedLabelDiff, replaceSyncStatusLabels, stripGitHubIssueFooter } from "@storymapper/core";
import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import type { RemoteWorkItem } from "@storymapper/github";
import { requireEntity } from "@storymapper/server/application/validation";
import { changedFieldsForRemote, managedAnnotationMappings, annotationLabelsForCard, remoteBaseline, syncBaseline, withLiveRelease } from "@storymapper/server/services/sync-merge";
import { issueLabelsForCard, releaseNameForCard, stateForStatus } from "@storymapper/server/services/sync-values";
import { sameJsonValue } from "@storymapper/core/changesets/json-equality";

export interface ConflictResolutionContext {
  conflict: SyncConflict;
  connection: ConnectorConnection;
  card: Card;
  link: RemoteWorkItemLink;
  storyMapName: string;
  releaseName: string | undefined;
  annotationLabels: string[];
  managedAnnotationLabels: string[];
  database: UnitOfWork["handle"]["current"];
}

export function prepareConflictResolution(repository: StoryMapperRepository, unitOfWork: UnitOfWork, conflictId: string, input: Pick<ResolveSyncConflictRequest, "storyMapId" | "resolution">): ConflictResolutionContext {
  const conflict = requireEntity(repository.getSyncConflict(conflictId), "Sync conflict");
  if (conflict.field === "status" && input.resolution === "local") throw new DomainError("validation", "GitHub owns this Card status. Resolve this conflict with the remote value.");
  const connection = requireEntity(repository.getConnectorConnection(conflict.connectionId), "Connector connection");
  if (connection.readOnly && input.resolution === "local") throw new DomainError("disabled", "Connection is read-only; GitHub writes are disabled.");
  if (!conflict.cardId || !conflict.remoteId) throw new DomainError("validation", "Conflict is not linked to a card and remote issue.");
  const card = requireEntity(repository.getCardDetails(conflict.cardId), "Card");
  if (card.storyMapId !== input.storyMapId || conflict.status !== "open") throw new DomainError("conflict", "Sync conflict is not open in this Story map.");
  if (!["title", "description", "status", "labels", "milestone"].includes(conflict.field)) throw new DomainError("validation", "Unsupported sync conflict field.");
  const link = requireEntity(repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId).find((candidate) => candidate.externalRefId === conflict.externalRefId && candidate.connectionId === connection.id && candidate.remoteId === conflict.remoteId && candidate.cardId === card.id), "Remote work item link");
  const ref = repository.listExternalRefsForStoryMap(input.storyMapId).find((row) => row.id === link.externalRefId);
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  if (!locator || !workItemScopeMatches(locator, connection)) throw new DomainError("conflict", "Sync conflict canonical identity and connection disagree.");
  return { conflict, connection, card, link, annotationLabels: annotationLabelsForCard(repository, connection, card), managedAnnotationLabels: managedAnnotationMappings(repository, connection, card.storyMapId).map((row) => row.name), storyMapName: requireEntity(repository.getStoryMapSnapshot(card.storyMapId), "Story map").storyMap.name, releaseName: releaseNameForCard(repository, card.storyMapId, card.releaseId), database: unitOfWork.handle.current };
}

export function assertReviewedConflict(repository: StoryMapperRepository, context: ConflictResolutionContext, reviewed: ResolveSyncConflictRequest["reviewed"], remote: RemoteWorkItem): void {
  let remoteLocator;
  try { remoteLocator = remoteWorkItemIdentity(context.connection, remote); }
  catch (error) {
    if (!(error instanceof DomainError) || error.code !== "validation") throw error;
    throw new DomainError("conflict", "Remote conflict identity changed during preparation.");
  }
  const linkedRef = repository.listExternalRefsForStoryMap(context.card.storyMapId).find((row) => row.id === context.link.externalRefId);
  if (!linkedRef || canonicalWorkItemId(context.connection.provider, remoteLocator) !== linkedRef.externalId || remote.remoteId !== context.link.remoteId) throw new DomainError("conflict", "Remote conflict identity changed during preparation.");
  const current = changedFieldsForRemote(repository, context.connection, context.card, context.link, remote)[context.conflict.field];
  if (sameJsonValue(current.localValue, reviewed.localValue) && sameJsonValue(current.remoteValue, reviewed.remoteValue)) return;
  throw new DomainError("conflict", "Sync conflict values changed. Review the current values and submit a new choice.", undefined, [{ entity: "card", id: context.card.id, reason: "fingerprint", operationId: context.conflict.id, index: 0, current: { ...context.conflict, localValue: current.localValue, remoteValue: current.remoteValue }, message: "Review current local and remote values before choosing again." }]);
}

export function revalidateConflictResolution(repository: StoryMapperRepository, unitOfWork: UnitOfWork, context: ConflictResolutionContext, actor: ActorContext): void {
  if (context.database !== unitOfWork.handle.current) throw new DomainError("conflict", "Database changed during remote preparation.");
  const { conflict, connection, card, link } = context;
  if (!repository.listStoryMaps().some((map) => map.id === card.storyMapId)) throw new DomainError("conflict", "Story map disappeared during remote preparation.");
  const current = { conflict: repository.getSyncConflict(conflict.id), connection: repository.getConnectorConnection(connection.id), card: repository.getCardDetails(card.id), link: repository.listRemoteWorkItemLinksForStoryMap(card.storyMapId).find((candidate) => candidate.id === link.id), annotationLabels: annotationLabelsForCard(repository, connection, card), managedAnnotationLabels: managedAnnotationMappings(repository, connection, card.storyMapId).map((row) => row.name), storyMapName: repository.getStoryMapSnapshot(card.storyMapId)?.storyMap.name, releaseName: releaseNameForCard(repository, card.storyMapId, card.releaseId) };
  const { database, ...snapshot } = context;
  if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw new DomainError("conflict", "Sync conflict inputs changed during remote preparation.");
  const safety = repository.getSafetySettings(connection.projectId);
  if (!safety.github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  if (actor.actorType !== "agent") return;
  if (!agentAccessEnabled(safety)) throw new DomainError("disabled", "Agent access is disabled for this project.");

}

export function conflictWritePayload(context: ConflictResolutionContext, remote: RemoteWorkItem, localOrigin?: string): SyncPlan["items"][number] {
  const { conflict, connection, card, storyMapName, releaseName } = context;
  return { cardId: card.id, action: "update", remoteId: remote.remoteId,
    title: conflict.field === "title" ? card.title : remote.title,
    body: conflict.field === "description" ? buildGitHubIssueBody(card, storyMapName, { origin: localOrigin!, projectId: connection.projectId }) : remote.body,
    remoteState: conflict.field === "status" ? stateForStatus(connection, card.status) : remote.state,
    labels: conflict.field === "labels" ? managedLabelDiff(remote.labels, context.annotationLabels, context.managedAnnotationLabels).labels : conflict.field === "status" ? replaceSyncStatusLabels(connection, remote.labels, issueLabelsForCard(connection, card)) : remote.labels,
    milestone: conflict.field === "milestone" ? releaseName : remote.milestone
  };
}

export function persistConflictResolution(repository: StoryMapperRepository<"transaction">, context: ConflictResolutionContext, input: Pick<ResolveSyncConflictRequest, "storyMapId" | "resolution">, remote: RemoteWorkItem): ResolveSyncConflictResponse {
  const { conflict, connection, card, link } = context;
  if (input.resolution !== "local") throw new DomainError("validation", "Incoming conflict resolution requires a reviewed ChangeSet.");
  const updated = requireEntity(repository.getCardDetails(card.id), "Card");
  const reviewedFields = changedFieldsForRemote(repository, connection, updated, link, remote);
  const chosenField = reviewedFields[conflict.field];
  if (!sameJsonValue(chosenField.localValue, chosenField.remoteValue)) throw new DomainError("conflict", "GitHub did not persist the chosen conflict field; the conflict remains open.");
  for (const field of Object.keys(reviewedFields) as Array<keyof typeof reviewedFields>) {
    reviewedFields[field].local = field !== conflict.field;
    reviewedFields[field].remote = field === conflict.field;
  }
  const baseline = remoteBaseline(withLiveRelease(repository, link), remote, reviewedFields, syncBaseline(repository, connection, updated, remote));
  const open = repository.listOpenSyncConflicts(card.storyMapId).some((candidate) => candidate.id !== conflict.id && candidate.externalRefId === conflict.externalRefId);
  const fields = changedFieldsForRemote(repository, connection, updated, { ...baseline, parentOverrideLocal: link.parentOverrideLocal }, remote);
  const syncState = open ? "conflict" : Object.values(fields).some((field) => field.local) ? "unsynced" : Object.values(fields).some((field) => field.remote) ? "stale" : "synced";
  repository.bindRemoteWorkItemLink({ ...baseline, identity: remote.identity, remoteParentNumber: link.remoteParentNumber, syncState });
  const resolved = requireEntity(repository.resolveSyncConflict(conflict.id, input.resolution), "Sync conflict");
  return { conflict: resolved };
}
