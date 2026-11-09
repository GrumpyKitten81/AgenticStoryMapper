import { parseWorkItemLocator, isWorkItemProvider, workItemScopeMatches, type Card, type ConnectorConnection, type OperationSnapshot, type OperationSupply, type RemoteWorkItemLink, type SyncConflict } from "@storymapper/contracts";
import { labelsForSyncStatus, localStatusForRemote, managedAnnotationDefinitions, stateForSyncStatus, syncReleaseMetadata, syncStatusLabels } from "@storymapper/core/publishing/sync-fields";
import { stripGitHubIssueFooter } from "@storymapper/core/publishing/github-footer";
import { ownString } from "@storymapper/core/changesets/supply-values";
import { sameJsonValue as same } from "@storymapper/core/changesets/json-equality";
import { githubStatusSourceKey } from "@storymapper/contracts";
import { resolveGitHubStatus } from "@storymapper/core/story-map/github-status";

export function syncResolutionAgrees(snapshot: OperationSnapshot, supply: OperationSupply, conflict: SyncConflict, link: RemoteWorkItemLink, resolution: "local" | "remote", reviewed: { localValue?: unknown; remoteValue?: unknown }): boolean {
  const card = snapshot.cards.find((row) => row.id === conflict.cardId);
  const connection = snapshot.connections.find((row) => row.id === conflict.connectionId);
  const baseline = link.baseline;
  if (!card || !connection || !baseline) return false;
  const chosen = resolution === "local" ? reviewed.localValue : reviewed.remoteValue;
  const acknowledged = baseline.acknowledgedLocal;
  const observed = baseline.observedRemote;
  if (conflict.field === "title" || conflict.field === "description") {
    const actual = conflict.field === "title" ? card.title : stripGitHubIssueFooter(card.description);
    const key = conflict.field === "title" ? "titleHash" : "bodyHash";
    const hash = ownString(supply.syncTextHashes, actual);
    return actual === chosen && hash !== undefined && acknowledged[key] === hash && observed[key] === hash;
  }
  if (conflict.field === "labels") {
    const assigned = new Set(snapshot.cardAnnotations.filter((row) => row.cardId === card.id).map((row) => row.annotationId));
    const actual = managedAnnotationDefinitions(connection, snapshot.annotations.filter((row) => row.projectId === connection.projectId && (!row.storyMapId || row.storyMapId === card.storyMapId))).filter((row) => assigned.has(row.id)).map((row) => row.name).sort();
    return same(actual, chosen) && same(actual, acknowledged.annotationLabels) && same(actual, observed.annotationLabels);
  }
  if (conflict.field === "status" && link.statusEvidence && resolution === "remote") {
    const evidence = link.statusEvidence;
    const catalog = connection.statusCatalogs?.find((catalog) => githubStatusSourceKey(catalog.source) === githubStatusSourceKey(evidence.source));
    return Boolean(catalog && card.status === resolveGitHubStatus(connection.statusSource ?? { kind: "repository" }, catalog, evidence) && same(chosen, { state: evidence.issueState, labels: syncStatusLabels(connection, link.labels) }) && same(chosen, { state: acknowledged.remoteState, labels: acknowledged.statusLabels }) && same(chosen, { state: observed.remoteState, labels: observed.statusLabels }));
  }
  if (conflict.field === "status") return statusAgrees(card, connection, chosen, resolution, acknowledged, observed);
  const release = snapshot.releases.find((row) => row.id === card.releaseId);
  const identity = snapshot.externalRefs.find((row) => row.id === link.externalRefId);
  const repository = identity && parseWorkItemLocator(identity.system, identity.externalId)?.repo;
  const assignment = connection.releaseSource === "iteration" ? iterationIdentity(acknowledged.iteration) : snapshot.externalRefs.find((row) => row.system === connection.provider && row.entityType === "release" && row.entityId === card.releaseId && parseWorkItemLocator(row.system, row.externalId)?.repo === repository)?.externalId ?? (card.releaseId ? `local:${card.releaseId}` : null);
  const actual = card.releaseId ? { assignment, metadata: syncReleaseMetadata(connection, release) } : null;
  const observedValue = connection.releaseSource === "iteration" ? iterationIdentity(observed.iteration) : observed.milestone;
  return acknowledged.releaseId === card.releaseId && same(actual, chosen) && same(actual?.metadata ?? null, acknowledged.releaseMetadata) && same(actual?.metadata ?? null, observed.releaseMetadata) && assignment === observedValue && (connection.releaseSource !== "milestone" || assignment === acknowledged.milestone);
}

function statusAgrees(card: Card, connection: ConnectorConnection, chosen: unknown, resolution: "local" | "remote", acknowledged: NonNullable<RemoteWorkItemLink["baseline"]>["acknowledgedLocal"], observed: NonNullable<RemoteWorkItemLink["baseline"]>["observedRemote"]): boolean {
  if (!chosen || typeof chosen !== "object" || !("state" in chosen) || !("labels" in chosen) || typeof chosen.state !== "string" || !Array.isArray(chosen.labels) || chosen.labels.some((label) => typeof label !== "string")) return false;
  const chosenState = chosen.state;
  const chosenLabels = chosen.labels;
  const actual = { state: stateForSyncStatus(connection, card.status), labels: syncStatusLabels(connection, labelsForSyncStatus(connection, card.status)) };
  if (resolution === "remote") {
    const expectedStatus = localStatusForRemote(connection, chosenState, chosenLabels, card.status);
    if (card.status !== expectedStatus) return false;
  } else if (!same(actual, chosen)) return false;
  return same(actual, { state: acknowledged.remoteState, labels: acknowledged.statusLabels }) && same(chosen, { state: observed.remoteState, labels: observed.statusLabels });
}

function iterationIdentity(value: NonNullable<RemoteWorkItemLink["baseline"]>["observedRemote"]["iteration"]): string | null { return value ? JSON.stringify({ title: value.title, startDate: value.startDate, duration: value.duration }) : null; }
