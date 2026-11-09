import { incomingGitHubStatus } from "@storymapper/server/services/github-status";
import { DomainError, parseWorkItemLocator, canonicalWorkItemId, remoteWorkItemIdentity, type Annotation, type Card, type ConnectorConnection, type RemoteWorkItemLink, type SyncPlan, type WorkItemSyncBaseline, type SyncReleaseMetadata, type RemoteMilestone } from "@storymapper/contracts";
import { buildGitHubIssueBody, stripGitHubIssueFooter, stripGitHubMilestoneMarker, normalizeRemoteWorkItemTitle, replaceSyncStatusLabels, sameSyncStatusLabels, syncStatusLabels, managedAnnotationDefinitions, managedLabelDiff, syncReleaseMetadata } from "@storymapper/core";
import { importReleaseSource, type StoryMapperRepository } from "@storymapper/db";
import { remoteMilestoneIdentity, type RemoteWorkItem } from "@storymapper/github";
import { hashText, issueLabelsForCard, labelsForStatus, releaseNameForCard, stateForStatus } from "@storymapper/server/services/sync-values";

type Repository = StoryMapperRepository<"root" | "transaction">;
interface ChangedField<Value> { local: boolean; remote: boolean; localValue: Value; remoteValue: Value }
export interface SyncFields {
  title: ChangedField<string>;
  description: ChangedField<string>;
  status: ChangedField<{ state: string | undefined; labels: string[] }>;
  labels: ChangedField<string[]>;
  milestone: ChangedField<{ assignment: string | null; metadata: SyncReleaseMetadata | null } | null>;
}

export function managedAnnotationMappings(repository: Repository, connection: ConnectorConnection, storyMapId: string): Annotation[] {
  return managedAnnotationDefinitions(connection, repository.listAnnotations(connection.projectId, storyMapId));
}

export function annotationLabelsForCard(repository: Repository, connection: ConnectorConnection, card: Card): string[] {
  const assigned = new Set(repository.listCardAnnotationsForStoryMap(card.storyMapId).filter((row) => row.cardId === card.id).map((row) => row.annotationId));
  return managedAnnotationMappings(repository, connection, card.storyMapId).filter((row) => assigned.has(row.id)).map((row) => row.name).sort();
}

export function remoteMilestoneLocator(connection: ConnectorConnection, remote: RemoteWorkItem): string | null {
  if (connection.releaseSource !== "milestone" || !remote.milestone && remote.milestoneNumber === undefined) return null;
  const identity = remoteMilestoneIdentity(connection, remote);
  if (!identity) return null;
  return canonicalWorkItemId(connection.provider, identity);
}

function localMilestoneLocator(repository: Repository, connection: ConnectorConnection, card: Card, remote: RemoteWorkItem): string | null {
  if (!card.releaseId || connection.releaseSource !== "milestone") return null;
  const issueRepository = remoteWorkItemIdentity(connection, remote).repo;
  return repository.listExternalRefsForStoryMap(card.storyMapId).find((row) => row.entityType === "release" && row.entityId === card.releaseId && row.system === connection.provider && parseWorkItemLocator(row.system, row.externalId)?.repo === issueRepository)?.externalId ?? null;
}

function remoteValues(connection: ConnectorConnection, remote: RemoteWorkItem, annotations: string[], title?: string): WorkItemSyncBaseline["observedRemote"] {
  return { titleHash: hashText(normalizeRemoteWorkItemTitle(remote.title, title)), bodyHash: hashText(stripGitHubIssueFooter(remote.body)), remoteState: remote.state,
    releaseMetadata: remoteReleaseMetadata(connection, remote), statusLabels: syncStatusLabels(connection, remote.labels), annotationLabels: [...new Set(remote.labels.filter((label) => annotations.includes(label)))].sort(), milestone: remoteMilestoneLocator(connection, remote), ...(connection.releaseSource === "iteration" ? { iteration: remote.iteration ?? null } : {}) };
}

export function importSyncBaseline(connection: ConnectorConnection, remote: RemoteWorkItem, status: string, annotationLabels: string[] = []): WorkItemSyncBaseline {
  const observedRemote = remoteValues(connection, remote, annotationLabels);
  return { pendingReleaseAssignment: observedRemote.milestone !== null || observedRemote.iteration != null, acknowledgedLocal: { ...observedRemote, remoteState: remote.state, statusLabels: syncStatusLabels(connection, remote.labels), annotationLabels: [...annotationLabels].sort(), releaseId: null, releaseMetadata: null, milestone: null, ...(connection.releaseSource === "iteration" ? { iteration: null } : {}) }, observedRemote };
}

export function syncBaseline(repository: Repository, connection: ConnectorConnection, card: Card, remote: RemoteWorkItem): WorkItemSyncBaseline {
  const annotations = managedAnnotationMappings(repository, connection, card.storyMapId).map((row) => row.name);
  return { pendingReleaseAssignment: false, acknowledgedLocal: { releaseMetadata: syncReleaseMetadata(connection, card.releaseId ? repository.getRelease(card.releaseId) : undefined), titleHash: hashText(card.title), bodyHash: hashText(stripGitHubIssueFooter(card.description)), remoteState: remote.state, statusLabels: syncStatusLabels(connection, remote.labels), annotationLabels: annotationLabelsForCard(repository, connection, card), releaseId: card.releaseId, milestone: localMilestoneLocator(repository, connection, card, remote), ...(connection.releaseSource === "iteration" ? { iteration: card.releaseId ? remote.iteration ?? null : null } : {}) }, observedRemote: remoteValues(connection, remote, annotations, card.title) };
}

export function syncPayload(repository: Repository, connection: ConnectorConnection, card: Card, link: RemoteWorkItemLink): SyncPlan["items"][number] {
  return { cardId: card.id, action: "update", title: card.title, body: stripGitHubIssueFooter(card.description), labels: [...issueLabelsForCard(connection, card), ...annotationLabelsForCard(repository, connection, card)], milestone: releaseNameForCard(repository, card.storyMapId, card.releaseId), remoteState: stateForStatus(connection, card.status), remoteId: link.remoteId };
}

export function changedFieldsForRemote(repository: Repository, connection: ConnectorConnection, card: Card, link: RemoteWorkItemLink, remote: RemoteWorkItem): SyncFields {
  const local = syncPayload(repository, connection, card, link);
  const acknowledged = withLiveRelease(repository, link).baseline?.acknowledgedLocal;
  const observed = link.baseline?.observedRemote;
  const remoteBody = stripGitHubIssueFooter(remote.body);
  const title = normalizeRemoteWorkItemTitle(remote.title, card.title);
  const annotations = managedAnnotationMappings(repository, connection, card.storyMapId).map((row) => row.name);
  const localLabels = annotationLabelsForCard(repository, connection, card);
  const remoteLabels = [...new Set(remote.labels.filter((label) => annotations.includes(label)))].sort();
  const baselineLabels = (acknowledged?.annotationLabels ?? link.labels).filter((label) => annotations.includes(label));
  const observedLabels = (observed?.annotationLabels ?? link.labels).filter((label) => annotations.includes(label));
  const localMilestone = localMilestoneLocator(repository, connection, card, remote);
  const remoteMilestone = connection.releaseSource === "iteration" ? iterationValue(remote.iteration) : remoteMilestoneLocator(connection, remote);
  const acknowledgedMilestone = connection.releaseSource === "iteration" ? iterationValue(acknowledged?.iteration) : acknowledged?.milestone;
  const observedMilestone = connection.releaseSource === "iteration" ? iterationValue(observed?.iteration) : observed?.milestone;
  const currentMilestone = connection.releaseSource === "iteration" && acknowledged?.releaseId === card.releaseId ? acknowledgedMilestone : localMilestone;
  const localMetadata = syncReleaseMetadata(connection, card.releaseId ? repository.getRelease(card.releaseId) : undefined);
  const localReleaseBaseline = connection.releaseSource === "milestone" && card.releaseId ? repository.listRemoteWorkItemLinksForStoryMap(card.storyMapId).find((row) => row.releaseId === card.releaseId)?.baseline : undefined;
  const acknowledgedMetadata = localReleaseBaseline?.acknowledgedLocal.releaseMetadata ?? acknowledged?.releaseMetadata;
  const remoteMetadata = remoteReleaseMetadata(connection, remote);
  const target = milestoneTargetMetadata(repository, connection, card.storyMapId, remote);
  const targetConflict = target?.localChanged && target.remoteChanged && JSON.stringify(target.metadata) !== JSON.stringify(remoteMetadata);
  return {
    title: { local: (acknowledged?.titleHash ?? link.titleHash) !== hashText(local.title), remote: (observed?.titleHash ?? link.titleHash) !== hashText(title), localValue: local.title, remoteValue: title },
    description: { local: (acknowledged?.bodyHash ?? link.bodyHash) !== hashText(local.body), remote: (observed?.bodyHash ?? link.bodyHash) !== hashText(remoteBody), localValue: local.body, remoteValue: remoteBody },
    status: { local: false, remote: JSON.stringify(link.statusEvidence) !== JSON.stringify(incomingGitHubStatus(connection, remote).statusEvidence) || card.status !== incomingGitHubStatus(connection, remote).status, localValue: { state: link.remoteState, labels: syncStatusLabels(connection, link.labels) }, remoteValue: { state: remote.state, labels: syncStatusLabels(connection, remote.labels) } },
    labels: { local: !sameLabels(baselineLabels, localLabels), remote: !sameLabels(observedLabels, remoteLabels), localValue: localLabels, remoteValue: remoteLabels },
    milestone: { local: targetConflict || connection.releaseSource !== "none" && (acknowledged ? acknowledged.releaseId !== card.releaseId || card.releaseId === null && (acknowledgedMilestone != null || acknowledgedMetadata != null) || JSON.stringify(acknowledgedMetadata) !== JSON.stringify(localMetadata) : card.releaseId !== null), remote: connection.releaseSource !== "none" && (target?.remoteChanged || link.baseline?.pendingReleaseAssignment === true || (observed ? observedMilestone !== remoteMilestone || JSON.stringify(observed.releaseMetadata) !== JSON.stringify(remoteMetadata) : remoteMilestone !== null)), localValue: targetConflict ? { assignment: card.releaseId ? currentMilestone ?? `local:${card.releaseId}` : null, metadata: target.metadata } : card.releaseId ? { assignment: currentMilestone ?? `local:${card.releaseId}`, metadata: localMetadata } : null, remoteValue: remoteMilestone ? { assignment: remoteMilestone, metadata: remoteMetadata } : null }
  };
}

export function withLiveRelease<Link extends { baseline?: WorkItemSyncBaseline | undefined }>(repository: Repository, link: Link): Link {
  const baseline = link.baseline;
  return baseline?.acknowledgedLocal.releaseId && !repository.getRelease(baseline.acknowledgedLocal.releaseId) ? { ...link, baseline: { ...baseline, acknowledgedLocal: { ...baseline.acknowledgedLocal, releaseId: null } } } : link;
}

export function conflictFields(fields: SyncFields): Array<keyof SyncFields> {
  return (Object.keys(fields) as Array<keyof SyncFields>).filter((key) => fields[key].local && fields[key].remote && JSON.stringify(fields[key].localValue) !== JSON.stringify(fields[key].remoteValue));
}

export function mergedPayload(repository: Repository, connection: ConnectorConnection, card: Card, link: RemoteWorkItemLink, remote: RemoteWorkItem, fields: SyncFields, localOrigin?: string): SyncPlan["items"][number] {
  const local = syncPayload(repository, connection, card, link);
  const mergedCard = { ...card, title: fields.title.local ? card.title : fields.title.remoteValue, description: fields.description.local ? card.description : remote.body };
  const body = buildGitHubIssueBody(mergedCard, repository.getStoryMapSnapshot(card.storyMapId)!.storyMap.name, { origin: localOrigin!, projectId: connection.projectId });
  const statusMerged = fields.status.local ? replaceSyncStatusLabels(connection, remote.labels, local.labels) : remote.labels;
  const labels = fields.labels.local ? managedLabelDiff(statusMerged, fields.labels.localValue, managedAnnotationMappings(repository, connection, card.storyMapId).map((row) => row.name)).labels : statusMerged;
  return { ...local, title: mergedCard.title, body, remoteState: fields.status.local ? local.remoteState : remote.state, labels, milestone: fields.milestone.local ? local.milestone : remote.milestone };
}

export function remoteBaseline(link: RemoteWorkItemLink, remote: RemoteWorkItem, fields: SyncFields, baseline?: WorkItemSyncBaseline): Omit<RemoteWorkItemLink, "parentOverrideLocal"> {
  const { parentOverrideLocal: _override, ...values } = link;
  const acknowledged = baseline ? { ...baseline.acknowledgedLocal, ...(link.baseline?.acknowledgedLocal ?? {
    titleHash: link.titleHash ?? baseline.acknowledgedLocal.titleHash,
    bodyHash: link.bodyHash ?? baseline.acknowledgedLocal.bodyHash,
    remoteState: link.remoteState ?? baseline.acknowledgedLocal.remoteState,
    statusLabels: baseline.observedRemote.statusLabels.filter((label) => link.labels.includes(label)),
    annotationLabels: baseline.observedRemote.annotationLabels.filter((label) => link.labels.includes(label)),
    releaseId: fields.milestone.local ? null : baseline.acknowledgedLocal.releaseId,
    milestone: fields.milestone.local ? baseline.observedRemote.milestone : baseline.acknowledgedLocal.milestone
  }) } : undefined;
  if (acknowledged && baseline) {
    if (!fields.title.local || fields.title.remote && fields.title.localValue === fields.title.remoteValue) acknowledged.titleHash = baseline.acknowledgedLocal.titleHash;
    if (!fields.description.local || fields.description.remote && fields.description.localValue === fields.description.remoteValue) acknowledged.bodyHash = baseline.acknowledgedLocal.bodyHash;
    if (!fields.status.local || fields.status.remote && JSON.stringify(fields.status.localValue) === JSON.stringify(fields.status.remoteValue)) { acknowledged.remoteState = baseline.acknowledgedLocal.remoteState; acknowledged.statusLabels = baseline.acknowledgedLocal.statusLabels; }
    if (!fields.labels.local || fields.labels.remote && sameLabels(fields.labels.localValue, fields.labels.remoteValue)) acknowledged.annotationLabels = baseline.acknowledgedLocal.annotationLabels;
    if (!fields.milestone.local || fields.milestone.remote && JSON.stringify(fields.milestone.localValue) === JSON.stringify(fields.milestone.remoteValue)) { acknowledged.releaseId = baseline.acknowledgedLocal.releaseId; acknowledged.milestone = baseline.acknowledgedLocal.milestone; acknowledged.iteration = baseline.acknowledgedLocal.iteration; acknowledged.releaseMetadata = baseline.acknowledgedLocal.releaseMetadata; }
  }
  const observed = baseline ? { ...baseline.observedRemote } : undefined;
  const previous = link.baseline?.observedRemote ?? acknowledged;
  if (observed && previous) {
    const keys = { title: ["titleHash"], description: ["bodyHash"], status: ["remoteState", "statusLabels"], labels: ["annotationLabels"], milestone: ["milestone", "iteration", "releaseMetadata"] } as const;
    for (const field of Object.keys(keys) as Array<keyof SyncFields>) if (fields[field].local && !fields[field].remote) for (const key of keys[field]) Object.assign(observed, { [key]: previous[key] });
  }
  return { ...values, ...(baseline && acknowledged && observed ? { baseline: { pendingReleaseAssignment: fields.milestone.local ? link.baseline?.pendingReleaseAssignment ?? false : false, acknowledgedLocal: acknowledged, observedRemote: observed } } : {}), titleHash: !fields.title.local ? hashText(fields.title.remoteValue) : link.titleHash, bodyHash: !fields.description.local ? hashText(fields.description.remoteValue) : link.bodyHash, remoteState: !fields.status.local ? remote.state : link.remoteState, labels: !fields.status.local ? remote.labels : link.labels, milestone: !fields.milestone.local ? remote.milestone ?? null : link.milestone, remoteParentNumber: remote.parentNumber ?? null };
}

export function sameLabels(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((label, index) => label === b[index]);
}

export function iterationValue(iteration: RemoteWorkItem["iteration"] | null | undefined): string | null {
  return iteration ? JSON.stringify({ title: iteration.title, startDate: iteration.startDate, duration: iteration.duration }) : null;
}

export function remoteReleaseMetadata(connection: ConnectorConnection, remote: RemoteWorkItem): SyncReleaseMetadata | null {
  const source = importReleaseSource(connection, remote);
  return syncReleaseMetadata(connection, source ? { ...source, startDate: source.startDate ?? null, releaseDate: source.releaseDate ?? null } : undefined);
}

export function milestoneTargetMetadata(repository: Repository, connection: ConnectorConnection, storyMapId: string, remote: RemoteWorkItem): { metadata: SyncReleaseMetadata | null; localChanged: boolean; remoteChanged: boolean } | undefined {
  const locator = remoteMilestoneLocator(connection, remote);
  const ref = locator && repository.listExternalRefsForStoryMap(storyMapId).find((row) => row.system === connection.provider && row.entityType === "release" && row.externalId === locator);
  if (!ref) return undefined;
  const release = repository.getRelease(ref.entityId);
  if (!release) throw new DomainError("conflict", "Bound Milestone Release is unavailable.");
  const metadata = syncReleaseMetadata(connection, release);
  const links = repository.listRemoteWorkItemLinksForStoryMap(storyMapId);
  const releaseBaseline = links.find((row) => row.externalRefId === ref.id)?.baseline;
  const baselines = releaseBaseline ? [releaseBaseline] : links.filter((row) => row.baseline?.acknowledgedLocal.releaseId === release.id && row.baseline.acknowledgedLocal.milestone === locator).map((row) => row.baseline!);
  return { metadata, localChanged: baselines.some((row) => JSON.stringify(row.acknowledgedLocal.releaseMetadata) !== JSON.stringify(metadata)), remoteChanged: baselines.some((row) => row.observedRemote.milestone === locator && JSON.stringify(row.observedRemote.releaseMetadata) !== JSON.stringify(remoteReleaseMetadata(connection, remote))) };
}

export function releaseSyncBaseline(releaseId: string, metadata: SyncReleaseMetadata, locator: string, observedMetadata: SyncReleaseMetadata = metadata): WorkItemSyncBaseline {
  const fields = { titleHash: hashText(metadata.name), bodyHash: hashText(""), statusLabels: [], annotationLabels: [], milestone: locator, releaseMetadata: metadata };
  return { pendingReleaseAssignment: false, acknowledgedLocal: { ...fields, releaseId }, observedRemote: { ...fields, titleHash: hashText(observedMetadata.name), releaseMetadata: observedMetadata } };
}

export function remoteMilestoneMetadata(remote: RemoteMilestone): SyncReleaseMetadata {
  return { name: remote.title, goal: stripGitHubMilestoneMarker(remote.description), released: remote.state === "closed", startDate: null, releaseDate: remote.dueOn?.slice(0, 10) ?? null };
}
