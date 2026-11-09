import { randomUUID } from "node:crypto";
import { DomainError, type ActorContext, type PlanWorkItemSyncRequest, type RemotePushEffect, type RemotePushPlan, type SyncPlan, type RemotePushEvidence, type StoryMapSnapshot, type RemotePushPlanResponse } from "@storymapper/contracts";
import { buildGitHubIssueBody, stripGitHubIssueFooter, buildGitHubMilestoneDescription, gitHubIssueMarker, gitHubMilestoneMarker, managedLabelDiff, managedAnnotationDefinitions, syncReleaseMetadata } from "@storymapper/core";
import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, requireRemoteItem } from "@storymapper/github";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { assertPushContext, assertRemotePushTarget, assertRemotePushMilestones, assertReviewedInputs, committedWrite, fingerprint, localPushFingerprint, pushContext, type RemotePushContext } from "@storymapper/server/services/remote-push-context";
import { changedFieldsForRemote, conflictFields, mergedPayload, remoteMilestoneMetadata } from "@storymapper/server/services/sync-merge";
import { assertReviewedConflict, conflictWritePayload, prepareConflictResolution, type ConflictResolutionContext } from "@storymapper/server/services/sync-conflict-resolution";

export async function prepareRemotePush(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: PlanWorkItemSyncRequest & { localOrigin?: string | undefined }): Promise<RemotePushPlanResponse> {
  actor = Object.freeze({ ...actor });
  input = structuredClone(input);
  if (input.conflictId && !input.reviewed) throw new DomainError("validation", "Conflict resolution requires captured local and remote review values.");
  const context = pushContext(repository, unitOfWork, actor, input.storyMapId, input.connectionId);
  const { connection } = context;
  const selection = { ...(input.cardIds === undefined ? {} : { cardIds: input.cardIds }), ...(input.releaseId === undefined ? {} : { releaseId: input.releaseId }), ...(input.parentIssueNumber === undefined ? {} : { parentIssueNumber: input.parentIssueNumber }), ...(input.conflictId ? { conflictId: input.conflictId } : {}) };
  const localFingerprint = localPushFingerprint(repository, input.storyMapId, selection);
  const safety = repository.getSafetySettings(connection.projectId);
  const source = committedWrite<SyncPlan>(context, ({ repository }) => repository.createWorkItemPushPlan({ ...input, mode: "push" }));
  const provider = createWorkItemProvider(connection.provider);
  const auth = await resolveProviderAuth(connection);
  const check = () => {
    assertPushContext(context);
    if (fingerprint(repository.getSafetySettings(connection.projectId)) !== fingerprint(safety) || localPushFingerprint(repository, input.storyMapId, selection) !== localFingerprint) throw new DomainError("conflict", "Inputs changed while preparing the Dry Run.");
  };
  check();
  const remoteEvidence = await provider.readPushInputs(auth.connection, auth.auth);
  check();
  assertRemotePushMilestones(context, remoteEvidence.milestones);
  const snapshot = repository.getStoryMapSnapshot(input.storyMapId)!;
  const items: RemotePushEffect[] = [];
  const blockers: string[] = [];
  if (!remoteEvidence.writable) blockers.push("Repository permission does not allow Issue, type, label and Milestone writes. Grant write permission and prepare a new Dry Run.");
  if (input.parentIssueNumber !== undefined) blockers.push("Parent Issue assignment is unsupported by the reviewed GitHub write protocol. Remove the parent override and prepare a new Dry Run.");
  const milestoneEffects = new Map<string, RemotePushEffect>();
  const conflict = input.conflictId ? prepareConflictResolution(repository, unitOfWork, input.conflictId, { storyMapId: input.storyMapId, resolution: "local" }) : undefined;
  if (conflict && (selection.cardIds?.length !== 1 || selection.cardIds[0] !== conflict.card.id || conflict.connection.id !== connection.id)) throw new DomainError("validation", "Conflict review must select its exact Card and connection.");
  const planning: Planning = { context, input, selection, snapshot, source, provider, auth, remoteEvidence, items, blockers, milestoneEffects, conflict, check, syncMilestoneCards: new Set(), milestoneNumbers: new Map() };
  await prepareIssues(planning);
  const issues = items.splice(0);
  await prepareMilestones(planning);
  for (const issue of issues) {
    const releaseId = snapshot.cards.find((card) => card.id === issue.entityId)?.releaseId;
    const milestone = releaseId ? milestoneEffects.get(releaseId) : undefined;
    if (issue.kind === "issue" && milestone) { issue.dependencies.push(milestone.id); issue.milestoneItemId = milestone.id; }
    else if (issue.kind === "issue" && releaseId && planning.milestoneNumbers.has(releaseId)) issue.payload.milestoneNumber = planning.milestoneNumbers.get(releaseId)!;
  }
  items.push(...issues);
  check();
  const selected = snapshot.cards.filter((card) => (!selection.cardIds || selection.cardIds.includes(card.id)) && (selection.releaseId === undefined || card.releaseId === selection.releaseId));
  const plan: RemotePushPlan = { id: randomUUID(), actor, projectId: connection.projectId, storyMapId: input.storyMapId, connectionId: connection.id, epoch: safety.epoch!, createdAt: new Date().toISOString(), selection, localFingerprint, connectionFingerprint: fingerprint(connection), safetyFingerprint: fingerprint(safety), remoteFingerprint: fingerprint(remoteEvidence), remoteEvidence, items, exclusions: selected.filter((card) => !source.items.some((item) => item.cardId === card.id)).map((card) => ({ entityId: card.id, reason: card.level === "note" ? "Notes are not exported as Issues." : "Card is hidden, archived or parked." })), blockers: [...new Set(blockers)] };
  assertReviewedInputs(context, plan);
  return committedWrite(context, ({ repository }) => repository.saveRemotePushPlan(plan));
}

interface Planning {
  context: RemotePushContext;
  input: PlanWorkItemSyncRequest & { localOrigin?: string | undefined };
  selection: RemotePushPlan["selection"];
  snapshot: StoryMapSnapshot;
  source: SyncPlan;
  provider: ReturnType<typeof createWorkItemProvider>;
  auth: Awaited<ReturnType<typeof resolveProviderAuth>>;
  remoteEvidence: RemotePushEvidence;
  items: RemotePushEffect[];
  blockers: string[];
  milestoneEffects: Map<string, RemotePushEffect>;
  conflict: ConflictResolutionContext | undefined;
  check: () => void;
  syncMilestoneCards: Set<string>;
  milestoneNumbers: Map<string, number>;
}

async function prepareMilestones(planning: Planning): Promise<void> {
  const { context: { connection }, input, snapshot, source, provider, auth, remoteEvidence, items, milestoneEffects, conflict, check } = planning;
  if (connection.releaseSource !== "milestone") return;
  const releaseIds = new Set(source.items.filter((item) => input.mode !== "sync" || planning.syncMilestoneCards.has(item.cardId!)).flatMap((item) => snapshot.cards.find((card) => card.id === item.cardId)?.releaseId ?? []));
  if (input.releaseId) releaseIds.add(input.releaseId);
  for (const releaseId of releaseIds) {
    if (conflict && conflict.conflict.field !== "milestone") continue;
    const release = snapshot.releases.find((row) => row.id === releaseId);
    if (!release) throw new DomainError("not_found", "Selected Release not found in this Story Map.");
    const marker = gitHubMilestoneMarker(release, connection.projectId);
    const binding = snapshot.remoteWorkItemLinks.find((row) => row.releaseId === release.id && row.connectionId === connection.id);
    const matches = await provider.findRemoteItemsByMarker(auth.connection, auth.auth, "milestone", marker);
    check();
    if (!matches.complete || matches.matches.length > 1) throw new DomainError("conflict", "Milestone marker lookup is incomplete or ambiguous; resolve it before reviewing a push.");
    for (const match of matches.matches) assertRemotePushTarget(planning.context, "milestone", match, binding?.remoteId, binding?.externalRefId);
    const matched = matches.matches[0];
    const before = binding ? remoteEvidence.milestones.find((row) => row.remoteId === binding.remoteId) : matched && "description" in matched ? matched : undefined;
    if (before) assertRemotePushTarget(planning.context, "milestone", before, binding?.remoteId, binding?.externalRefId);
    if (binding && !before) throw new DomainError("conflict", "Bound Milestone is unavailable; its identity is retained.");
    if (!binding && snapshot.externalRefs.some((ref) => ref.system === connection.provider && ref.entityType === "release" && ref.entityId === release.id)) throw new DomainError("conflict", "A source-only GitHub reference does not grant outbound synchronization ownership.");
    if (input.mode === "sync" && binding && before) {
      const acknowledged = binding.baseline?.acknowledgedLocal.releaseMetadata;
      const observed = binding.baseline?.observedRemote.releaseMetadata;
      const local = syncReleaseMetadata(connection, release);
      const remote = remoteMilestoneMetadata(before);
      const locator = snapshot.externalRefs.find((row) => row.id === binding.externalRefId)!.externalId;
      const conflicts = planning.context.repository.listOpenSyncConflicts(input.storyMapId).some((row) => row.field === "milestone" && (snapshot.cards.some((card) => card.id === row.cardId && card.releaseId === release.id) || snapshot.remoteWorkItemLinks.some((link) => link.externalRefId === row.externalRefId && link.baseline?.acknowledgedLocal.releaseId === release.id) || [row.localValue, row.remoteValue].some((value) => value && typeof value === "object" && "assignment" in value && value.assignment === locator)));
      if (!binding.baseline || conflicts || JSON.stringify(observed) !== JSON.stringify(remote) && JSON.stringify(local) !== JSON.stringify(remote)) {
        planning.blockers.push(`Review and apply incoming Milestone changes for ${release.name} before preparing outgoing Sync, or prepare and review an explicit Push to choose the local Release metadata.`);
        continue;
      }
      if (JSON.stringify(acknowledged) === JSON.stringify(local)) { planning.milestoneNumbers.set(releaseId, before.remoteNumber); continue; }
    }
    const effect: RemotePushEffect = { id: randomUUID(), kind: "milestone", entityId: release.id, action: before ? "update" : "create", marker, dependencies: [], managedLabels: [], labelAdditions: [], labelRemovals: [], remoteBefore: before ?? null, payload: { title: release.name, description: buildGitHubMilestoneDescription(release.goal ?? "", marker), dueOn: release.releaseDate ? `${release.releaseDate}T00:00:00.000Z` : null, state: release.released ? "closed" : "open", ...(before ? { remoteId: before.remoteId } : {}) } };
    items.push(effect);
    milestoneEffects.set(release.id, effect);
  }
}

async function prepareIssues(planning: Planning): Promise<void> {
  const { context: { connection }, input, snapshot, source, provider, auth, remoteEvidence, items, blockers, milestoneEffects, conflict, check } = planning;
  for (const item of source.items) {
    const card = snapshot.cards.find((row) => row.id === item.cardId)!;
    const marker = gitHubIssueMarker(card, connection.projectId);
    const sync = snapshot.remoteWorkItemLinks.find((row) => row.cardId === card.id && row.connectionId === connection.id);
    const remote = await findPreparedIssue(planning, item, marker);
    check();
    if (remote) assertRemotePushTarget(planning.context, "issue", remote, item.remoteId, sync?.externalRefId);
    if (conflict) assertReviewedConflict(planning.context.repository, conflict, input.reviewed!, remote!);
    let sent = conflict ? conflictWritePayload(conflict, remote!, input.localOrigin) : item;
    const issueType = connection.issueTypeMapping.find((entry) => entry.cardType === card.cardType)?.issueType;
    if (input.mode === "sync") {
      if (!sync || !remote) continue;
      const fields = changedFieldsForRemote(planning.context.repository, connection, card, sync, remote);
      const mappedTypeChanged = issueType !== sync.issueType;
      if (remote.issueType !== sync.issueType && remote.issueType !== issueType) { blockers.push(`Review and apply incoming Issue type changes for ${card.key} before preparing outgoing Sync.`); continue; }
      if (Object.values(fields).some((field) => field.remote && !field.local && JSON.stringify(field.localValue) !== JSON.stringify(field.remoteValue))) {
        blockers.push(`Review and apply incoming changes for ${card.key} before preparing outgoing Sync.`);
        continue;
      }
      if (conflictFields(fields).length || planning.context.repository.listOpenSyncConflicts(input.storyMapId).some((row) => row.cardId === card.id && row.connectionId === connection.id) || !(mappedTypeChanged && issueType !== remote.issueType || Object.entries(fields).some(([field, delta]) => delta.local && (field !== "milestone" || connection.releaseSource === "milestone")))) continue;
      sent = mergedPayload(planning.context.repository, connection, card, sync, remote, fields, input.localOrigin);
      if (connection.releaseSource === "milestone" && fields.milestone.local) planning.syncMilestoneCards.add(card.id);
    }
    sent = { ...sent, ...(remote ? { remoteState: remote.state, labels: [...new Set([...sent.labels.filter((label) => !connection.statusMapping.some((entry) => entry.labels.includes(label))), ...remote.labels.filter((label) => connection.statusMapping.some((entry) => entry.labels.includes(label)))])] } : {}), body: buildGitHubIssueBody({ ...card, description: stripGitHubIssueFooter(sent.body) }, snapshot.storyMap.name, { origin: input.localOrigin!, projectId: connection.projectId }) };
    if (!issueType || !remoteEvidence.issueTypes.includes(issueType)) blockers.push(`Map ${card.cardType ?? "an explicit Card type"} to an available repository Issue type in connection settings (${card.key}).`);
    const unambiguousAnnotations = managedAnnotationDefinitions(connection, snapshot.annotations);
    const annotations = unambiguousAnnotations.filter((annotation) => snapshot.cardAnnotations.some((row) => row.cardId === card.id && row.annotationId === annotation.id)).map((annotation) => annotation.name);
    const managed = [...new Set([...item.labels, ...connection.statusMapping.flatMap((entry) => entry.labels), connection.defaultLabel, ...["activity", "step", "story", "note"].map((level) => `level:${level}`), `story-map:${snapshot.storyMap.cardKeyPrefix}`, ...unambiguousAnnotations.map((row) => row.name)])];
    const desired = input.mode === "sync" || conflict ? sent.labels : [...sent.labels, ...annotations];
    const diff = managedLabelDiff(remote?.labels ?? [], desired, managed);
    for (const label of diff.labels) if (!remoteEvidence.labels.includes(label)) blockers.push(`Create the configured label "${label}" in the GitHub repository, then prepare a new Dry Run.`);
    const milestone = card.releaseId ? milestoneEffects.get(card.releaseId) : undefined;
    const existingMilestone = connection.releaseSource !== "milestone" || input.mode === "sync" && !planning.syncMilestoneCards.has(card.id) || conflict && conflict.conflict.field !== "milestone" ? remote?.milestoneNumber : undefined;
    const effect: RemotePushEffect = { id: randomUUID(), kind: "issue", entityId: card.id, action: remote ? "update" : "create", marker, managedLabels: [...new Set(managed)], dependencies: milestone ? [milestone.id] : [], ...(milestone ? { milestoneItemId: milestone.id } : {}), remoteBefore: remote ?? null, labelAdditions: diff.additions, labelRemovals: diff.removals, payload: { title: sent.title, body: sent.body, labels: diff.labels, issueType: issueType ?? "unmapped", remoteState: sent.remoteState === "closed" ? "closed" : "open", milestoneNumber: existingMilestone ?? null, ...(remote ? { remoteId: remote.remoteId } : {}) } };
    if (!remote && effect.payload.remoteState === "closed") {
      const closed = { ...effect.payload };
      effect.payload.remoteState = "open";
      items.push(effect, { ...effect, id: randomUUID(), action: "update", dependencies: [effect.id], issueItemId: effect.id, payload: closed });
    } else items.push(effect);
  }
}

async function findPreparedIssue(planning: Planning, item: Planning["source"]["items"][number], marker: string) {
  const { provider, auth, check } = planning;
    let remote;
    if (item.remoteId) remote = requireRemoteItem(await provider.getRemoteItem(auth.connection, auth.auth, item.remoteId));
    else {
      const matches = await provider.findRemoteItemsByMarker(auth.connection, auth.auth, "issue", marker);
      check();
      if (!matches.complete || matches.matches.length > 1) throw new DomainError("conflict", "Issue marker lookup is incomplete or ambiguous; resolve it before reviewing a push.");
      for (const match of matches.matches) assertRemotePushTarget(planning.context, "issue", match);
      const matched = matches.matches[0];
      remote = matched && "body" in matched ? requireRemoteItem(await provider.getRemoteItem(auth.connection, auth.auth, matched.remoteId)) : undefined;
      if (remote && matched && assertRemotePushTarget(planning.context, "issue", remote, matched.remoteId) !== assertRemotePushTarget(planning.context, "issue", matched)) throw new DomainError("conflict", "Marker and detailed remote identities disagree.");
    }
  return remote;
}
