import { reviewFingerprint, reviewInput } from "@storymapper/db";
import { createHash } from "node:crypto";
import { DomainError, canonicalWorkItemId, remoteWorkItemIdentity, type ActorContext, type RemoteIssuePayload, type RemoteMilestone, type RemotePushEffect, type RemotePushExecution, type RemotePushItemExecution, type RemotePushPlan, type RemotePushPlanResponse } from "@storymapper/contracts";
import { agentAccessEnabled, agentProtected, stripGitHubIssueFooter, syncReleaseMetadata } from "@storymapper/core";
import { DatabaseHandle, type StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, requireRemoteItem } from "@storymapper/github";
import { prepareConflictResolution, persistConflictResolution } from "@storymapper/server/services/sync-conflict-resolution";
import { remotePushEvidence, remoteMatchesIntent, type RemotePushResult } from "@storymapper/server/services/remote-push-evidence";
import { releaseSyncBaseline, syncBaseline, withLiveRelease, remoteMilestoneMetadata } from "@storymapper/server/services/sync-merge";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { assertReviewedInputs, assertRemotePushTarget, assertRemotePushMilestones, committedWrite, fingerprint, localPushFingerprint, pushContext, type RemotePushContext } from "@storymapper/server/services/remote-push-context";

const activePlans = new Set<string>();
type RemoteResult = RemotePushResult;
interface ExecutionContext extends RemotePushContext {
  plan: RemotePushPlan;
  runToken: string;
  expectedLocalFingerprint: string;
  provider: ReturnType<typeof createWorkItemProvider>;
  auth: Awaited<ReturnType<typeof resolveProviderAuth>>;
  currentMilestones: RemoteMilestone[];
}

export function readRemotePush(repository: StoryMapperRepository, actor: ActorContext, planId: string): RemotePushPlanResponse {
  const response = repository.getRemotePushPlan(planId);
  if (!response) throw new DomainError("not_found", "Remote push plan not found.");
  const safety = repository.getSafetySettings(response.plan.projectId);
  if (actor.actorType !== "human" && agentProtected(safety)) throw new DomainError("protected", "Project is protected from agent remote writes.");
  if (actor.actorType === "agent" && !agentAccessEnabled(safety)) throw new DomainError("disabled", "Agent access is disabled for this Project.");
  return response;
}

export async function executeRemotePush(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, planId: string, resume = false, localOrigin: () => string | undefined = () => undefined, reviewOverride?: { confirmed: true; reason: string }): Promise<RemotePushPlanResponse> {
  if (actor.actorType !== "human") throw new DomainError("protected", "Remote push confirmation and resume are human-only.");
  if (activePlans.has(planId)) throw new DomainError("conflict", "This Dry Run is already executing.");
  activePlans.add(planId);
  try {
    if (reviewOverride) recordReviewOverride(repository, unitOfWork, actor, planId, reviewOverride);
    return await executeOwnedPlan(repository, unitOfWork, actor, planId, resume, localOrigin);
  } finally {
    activePlans.delete(planId);
  }
}

async function executeOwnedPlan(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, planId: string, resume: boolean, localOrigin: () => string | undefined): Promise<RemotePushPlanResponse> {
  const reviewed = readRemotePush(repository, actor, planId);
  const { plan } = reviewed;
  const base = { ...pushContext(repository, unitOfWork, actor, plan.storyMapId, plan.connectionId), localOrigin };
  const expectedLocalFingerprint = reviewed.execution.expectedLocalFingerprint ?? plan.localFingerprint;
  assertExecutableInputs(base, plan, expectedLocalFingerprint);
  if (plan.blockers.length) throw new DomainError("validation", plan.blockers.join(" "));
  const auth = await resolveProviderAuth(base.connection);
  assertExecutableInputs(base, plan, expectedLocalFingerprint);
  const provider = createWorkItemProvider(base.connection.provider);
  const inputs = await provider.readPushInputs(auth.connection, auth.auth);
  assertExecutableInputs(base, plan, expectedLocalFingerprint);
  assertRemotePushMilestones(base, inputs.milestones);
  const capability = ({ milestones, ...values }: typeof inputs) => values;
  if (fingerprint(resume ? capability(inputs) : inputs) !== fingerprint(resume ? capability(plan.remoteEvidence) : plan.remoteEvidence)) throw new DomainError("conflict", "Repository types, labels, permissions or Milestones changed; review a new Dry Run.");
  const claimed = committedWrite<RemotePushExecution>(base, ({ repository }) => repository.claimRemotePushPlan(planId, actor, resume));
  const context: ExecutionContext = { ...base, plan, auth, provider, expectedLocalFingerprint, currentMilestones: inputs.milestones, runToken: claimed.runToken! };
  for (const item of plan.items) {
    const current = readRemotePush(repository, actor, planId).execution.items.find((row) => row.itemId === item.id)!;
    if (current.state === "succeeded") continue;
    try {
      assertExecution(context);
      await executeItem(context, item, current);
    } catch (error) {
      if (unitOfWork.handle.current !== context.database) throw error;
      const execution = repository.getRemotePushPlan(plan.id)!.execution;
      const evidence = execution.items.find((row) => row.itemId === item.id)!;
      if (evidence.state === "intent") outcome(context, item.id, { state: "uncertain", error: failureMessage(error) });
      else if (evidence.state === "remote_succeeded") outcome(context, item.id, { state: "local_failed", error: failureMessage(error) });
      else if (evidence.state !== "local_failed" && evidence.state !== "uncertain") outcome(context, item.id, { state: "failed", error: failureMessage(error) });
      committedWrite(context, ({ repository }) => repository.finishRemotePushPlan(plan.id, "interrupted", context.runToken));
      return readRemotePush(repository, actor, plan.id);
    }
  }
  committedWrite(context, ({ repository }) => {
    repository.finishRemotePushPlan(plan.id, "completed", context.runToken);
    repository.createSyncRun({ storyMapId: plan.storyMapId, connectionId: plan.connectionId, mode: "push", status: "applied", summary: `${plan.items.length} reviewed remote effects completed (${plan.id}).` });
  });
  return readRemotePush(repository, actor, plan.id);
}

function assertExecution(context: ExecutionContext): void {
  assertExecutableInputs(context, context.plan, context.expectedLocalFingerprint);
  const execution = context.repository.getRemotePushPlan(context.plan.id)?.execution;
  if (execution?.status !== "running" || execution.runToken !== context.runToken) throw new DomainError("conflict", "Remote execution ownership changed.");
}

function outcome(context: ExecutionContext, itemId: string, values: Partial<Omit<RemotePushItemExecution, "itemId" | "attempt">>): void {
  committedWrite(context, ({ repository }) => repository.recordRemotePushOutcome(context.plan.id, itemId, values, context.runToken));
}

function failureMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : "Remote effect interrupted. Review the retained evidence and explicitly resume to reconcile it.";
}

function exactPayload(context: ExecutionContext, item: RemotePushEffect): RemotePushEffect["payload"] {
  if (item.kind === "milestone") return item.payload;
  const payload = { ...item.payload };
  const execution = context.repository.getRemotePushPlan(context.plan.id)!.execution;
  for (const id of item.dependencies) if (execution.items.find((row) => row.itemId === id)?.state !== "succeeded") throw new DomainError("conflict", "An effect dependency has not succeeded.");
  if (item.milestoneItemId) {
    const result = execution.items.find((row) => row.itemId === item.milestoneItemId)?.remoteResult as RemoteMilestone | undefined;
    if (!result?.remoteNumber) throw new DomainError("conflict", "Milestone dependency has no durable remote identity.");
    assertRemotePushTarget(context, "milestone", result, result.remoteId);
    payload.milestoneNumber = result.remoteNumber;
  }
  if (item.issueItemId) {
    const result = execution.items.find((row) => row.itemId === item.issueItemId);
    if (!result?.remoteId) throw new DomainError("conflict", "Issue dependency has no durable remote identity.");
    payload.remoteId = result.remoteId;
  }
  return payload;
}

async function executeItem(context: ExecutionContext, item: RemotePushEffect, evidence: RemotePushItemExecution): Promise<void> {
  const payload = exactPayload(context, item);
  if (["remote_succeeded", "local_failed"].includes(evidence.state) && evidence.remoteResult) {
    assertExactResult(payload, evidence.remoteResult as RemoteResult);
    const savedCanonicalId = assertRemotePushTarget(context, item.kind, evidence.remoteResult as RemoteResult, evidence.remoteId);
    const remote = await detailedTarget(context, item.kind, evidence.remoteId!, item);
    assertExactResult(payload, remote);
    if (assertRemotePushTarget(context, item.kind, remote) !== savedCanonicalId) throw new DomainError("conflict", "Retained outcome and current remote identities disagree.");
    persistBinding(context, item, remote);
    return;
  }
  const inputs = await context.provider.readPushInputs(context.auth.connection, context.auth.auth);
  assertExecution(context);
  assertRemotePushMilestones(context, inputs.milestones);
  context.currentMilestones = inputs.milestones;
  const capability = ({ milestones, ...values }: typeof inputs) => values;
  if (fingerprint(capability(inputs)) !== fingerprint(capability(context.plan.remoteEvidence))) throw new DomainError("conflict", "Repository permissions, types or labels changed; review a new Dry Run.");
  const executionState = committedWrite<string>(context, ({ repository }) => repository.captureRemotePushReconciliation(context.plan.id, item.id));
  const remote = await reconcileItem(context, item, payload, evidence);
  if (remote) {
    outcome(context, item.id, { state: "remote_succeeded", remoteId: remote.remoteId, url: remote.url, remoteResult: remote });
    persistBinding(context, item, remote);
    return;
  }
  committedWrite(context, ({ repository }) => repository.recordRemotePushIntent(context.plan.id, item.id, context.runToken, payload, { complete: true, remoteId: payload.remoteId, executionState }));
  assertExecution(context);
  const before = reviewedBefore(context, item);
  const written = item.kind === "issue"
    ? await context.provider.writeRemoteIssue(context.auth.connection, context.auth.auth, payload as RemoteIssuePayload)
    : await context.provider.writeMilestone(context.auth.connection, context.auth.auth, item.payload);
  const result = "body" in written && before && "body" in before ? { ...written, parentNumber: written.parentNumber ?? before.parentNumber, iteration: written.iteration ?? before.iteration, assignee: written.assignee ?? before.assignee } : written;
  if (context.unitOfWork.handle.current !== context.database) {
    retainOriginalSuccess(context, item, result);
    throw new DomainError("conflict", "Remote write succeeded in the previous database; Restore does not undo GitHub.", { remoteSucceeded: true, remoteId: result.remoteId, url: result.url, planId: context.plan.id, itemId: item.id });
  }
  outcome(context, item.id, { state: "remote_succeeded", remoteId: result.remoteId, url: result.url, remoteResult: result });
  persistBinding(context, item, result);
}

function retainOriginalSuccess(context: ExecutionContext, item: RemotePushEffect, result: RemoteResult): void {
  if (!context.database.$client.open) return;
  const unitOfWork = new UnitOfWork(new DatabaseHandle(context.database));
  unitOfWork.run(context.actor, ({ repository }) => {
    repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "remote_succeeded", remoteId: result.remoteId, url: result.url, remoteResult: result }, context.runToken);
    repository.finishRemotePushPlan(context.plan.id, "interrupted", context.runToken);
  });
}

async function reconcileItem(context: ExecutionContext, item: RemotePushEffect, payload: RemotePushEffect["payload"], evidence: RemotePushItemExecution): Promise<RemoteResult | undefined> {
  const matches = await context.provider.findRemoteItemsByMarker(context.auth.connection, context.auth.auth, item.kind, item.marker);
  assertExecution(context);
  if (!matches.complete || matches.matches.length > 1) throw new DomainError("conflict", "Marker lookup is incomplete or ambiguous; no write was sent.");
  for (const match of matches.matches) assertRemotePushTarget(context, item.kind, match, payload.remoteId);
  let current = matches.matches[0];
  const markerCanonicalId = current && assertRemotePushTarget(context, item.kind, current);
  const remoteId = payload.remoteId ?? current?.remoteId;
  if (remoteId) current = await detailedTarget(context, item.kind, remoteId, item);
  if (current && markerCanonicalId && assertRemotePushTarget(context, item.kind, current) !== markerCanonicalId) throw new DomainError("conflict", "Marker and detailed remote identities disagree.");
  const before = reviewedBefore(context, item);
  if (before) {
    const reviewedCanonicalId = assertRemotePushTarget(context, item.kind, before, payload.remoteId);
    if (current && assertRemotePushTarget(context, item.kind, current, payload.remoteId) !== reviewedCanonicalId) throw new DomainError("conflict", "Reviewed and current remote identities disagree.");
  }
  const interrupted = ["intent", "uncertain", "remote_succeeded", "local_failed"].includes(evidence.state);
  if (current && interrupted && remoteMatchesIntent(payload, current)) return current;
  if (!payload.remoteId && current) throw new DomainError("conflict", "A remote entity now has this stable marker; review a new Dry Run.");
  if (payload.remoteId && (!current || !before || fingerprint(remotePushEvidence(current, context.currentMilestones)) !== fingerprint(remotePushEvidence(before, completedMilestones(context))))) throw new DomainError("conflict", "Remote target changed after review; prepare a new Dry Run.");
  if (interrupted) outcome(context, item.id, { state: "failed", error: "Complete lookup reconciled this effect as not applied." });
  return undefined;
}

async function detailedTarget(context: ExecutionContext, kind: RemotePushEffect["kind"], remoteId: string, item: RemotePushEffect): Promise<RemoteResult> {
  let remote: RemoteResult | undefined;
  if (kind === "issue") remote = requireRemoteItem(await context.provider.getRemoteItem(context.auth.connection, context.auth.auth, remoteId));
  else {
    const inputs = await context.provider.readPushInputs(context.auth.connection, context.auth.auth);
    assertExecution(context);
    assertRemotePushMilestones(context, inputs.milestones);
    remote = inputs.milestones.find((row) => row.remoteId === remoteId);
  }
  assertExecution(context);
  if (!remote) throw new DomainError("conflict", "The reviewed remote target is unavailable; no write was sent.");
  const binding = context.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).find((row) => row.connectionId === context.connection.id && (kind === "issue" ? row.cardId === item.entityId : row.releaseId === item.entityId));
  assertRemotePushTarget(context, kind, remote, remoteId, binding?.externalRefId);
  return remote;
}

function completedMilestones(context: ExecutionContext): RemoteMilestone[] {
  const execution = context.repository.getRemotePushPlan(context.plan.id)!.execution;
  const completed = context.plan.items.filter((item) => item.kind === "milestone").flatMap((item) => {
    const result = execution.items.find((row) => row.itemId === item.id);
    return result?.state === "succeeded" && result.remoteResult ? [result.remoteResult as RemoteMilestone] : [];
  });
  return [...context.plan.remoteEvidence.milestones.filter((row) => !completed.some((own) => own.remoteNumber === row.remoteNumber)), ...completed];
}

function reviewedBefore(context: ExecutionContext, item: RemotePushEffect): RemoteResult | undefined {
  const execution = context.repository.getRemotePushPlan(context.plan.id)!.execution;
  const before = (item.kind === "issue" && item.issueItemId ? execution.items.find((row) => row.itemId === item.issueItemId)?.remoteResult : item.remoteBefore) as RemoteResult | undefined;
  if (!before || !("body" in before)) return before;
  const own = context.plan.items.filter((effect) => effect.kind === "milestone").map((effect) => execution.items.find((row) => row.itemId === effect.id)).find((row) => row?.state === "succeeded" && (row.remoteResult as RemoteMilestone | undefined)?.remoteNumber === before.milestoneNumber)?.remoteResult as RemoteMilestone | undefined;
  return own ? { ...before, milestone: own.title, milestoneDueOn: own.dueOn ?? undefined, milestoneDescription: own.description, milestoneState: own.state } : before;
}

function assertExactResult(payload: RemotePushEffect["payload"], remote: RemoteResult): void {
  if (!remoteMatchesIntent(payload, remote)) throw new DomainError("conflict", "The remote effect returned different content than the exact reviewed intent. Its actual identity is retained; review a new Dry Run.", { remoteSucceeded: true, remoteId: remote.remoteId, url: remote.url });
}

function persistBinding(context: ExecutionContext, item: RemotePushEffect, remote: RemoteResult): void {
  assertExactResult(exactPayload(context, item), remote);
  assertExecution(context);
  const binding = context.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).find((row) => row.connectionId === context.connection.id && (item.kind === "issue" ? row.cardId === item.entityId : row.releaseId === item.entityId));
  assertRemotePushTarget(context, item.kind, remote, exactPayload(context, item).remoteId, binding?.externalRefId);
  const conflict = context.plan.selection.conflictId && item.kind === "issue" ? prepareConflictResolution(context.repository, context.unitOfWork, context.plan.selection.conflictId, { storyMapId: context.plan.storyMapId, resolution: "local" }) : undefined;
  committedWrite(context, ({ repository }) => {
    if (conflict && "body" in remote) persistConflictResolution(repository, conflict, { storyMapId: context.plan.storyMapId, resolution: "local" }, remote);
    else if (item.kind === "issue" && "body" in remote) {
      const card = repository.getCard(item.entityId)!;
      const baseline = syncBaseline(repository, context.connection, card, remote);
      const previousLink = repository.listRemoteWorkItemLinksForStoryMap(card.storyMapId).find((row) => row.cardId === card.id && row.connectionId === context.connection.id);
      const previous = previousLink && withLiveRelease(repository, previousLink).baseline;
      const before = item.remoteBefore as RemoteResult | null;
      const releaseExcluded = context.connection.releaseSource === "iteration" || !item.milestoneItemId && item.kind === "issue" && item.payload.milestoneNumber === (before && "body" in before ? before.milestoneNumber ?? null : null);
      if (releaseExcluded && previous) {
        for (const field of ["releaseId", "releaseMetadata", "iteration", "milestone"] as const) Object.assign(baseline.acknowledgedLocal, { [field]: previous.acknowledgedLocal[field] });
        for (const field of ["releaseMetadata", "iteration", "milestone"] as const) Object.assign(baseline.observedRemote, { [field]: previous.observedRemote[field] });
        baseline.pendingReleaseAssignment = previous.pendingReleaseAssignment;
      }
      const localReleaseChanged = releaseExcluded && (baseline.acknowledgedLocal.releaseId !== card.releaseId || JSON.stringify(baseline.acknowledgedLocal.releaseMetadata) !== JSON.stringify(syncReleaseMetadata(context.connection, card.releaseId ? repository.getRelease(card.releaseId) : undefined)));
      repository.bindRemoteWorkItemLink({ connectionId: context.connection.id, provider: context.connection.provider, cardId: item.entityId, remoteId: remote.remoteId, remoteNumber: remote.remoteNumber, url: remote.url, identity: remote.identity, titleHash: fingerprintText(item.payload.title), bodyHash: fingerprintText(stripGitHubIssueFooter(item.payload.body)), remoteState: remote.state, labels: remote.labels, milestone: remote.milestone, issueType: remote.issueType, managedLabels: item.managedLabels, baseline, remoteParentNumber: remote.parentNumber, syncState: localReleaseChanged ? "unsynced" : "synced" });
    }
    else if (item.kind === "milestone" && "description" in remote) repository.bindRemoteWorkItemLink({ connectionId: context.connection.id, provider: context.connection.provider, releaseId: item.entityId, remoteId: remote.remoteId, remoteNumber: remote.remoteNumber, url: remote.url, identity: remote.identity, remoteState: remote.state, milestone: remote.title, labels: [], baseline: releaseSyncBaseline(item.entityId, syncReleaseMetadata(context.connection, repository.getRelease(item.entityId))!, canonicalWorkItemId(context.connection.provider, remoteWorkItemIdentity(context.connection, remote, "milestone")),  remoteMilestoneMetadata(remote)), syncState: "synced" });
    else throw new DomainError("validation", "Remote outcome does not match the reviewed effect kind.");
    repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "succeeded", remoteId: remote.remoteId, url: remote.url, remoteResult: remote }, context.runToken);
    const updated = localPushFingerprint(repository, context.plan.storyMapId, context.plan.selection);
    repository.updateRemotePushFingerprint(context.plan.id, updated, context.runToken);
    context.expectedLocalFingerprint = updated;
  });
}

function fingerprintText(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function recordReviewOverride(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, planId: string, override: { confirmed: true; reason: string }): void {
  if (actor.actorType !== "human" || override.confirmed !== true || !override.reason.trim()) throw new DomainError("protected", "A human must explicitly confirm the DoR override and supply a reason.");
  const { plan } = readRemotePush(repository, actor, planId);
  if (!repository.getCardReviews(plan.projectId, plan.storyMapId).settings.allowHumanPushOverride) throw new DomainError("protected", "Human DoR override is disabled.");
  const ids = [...new Set(plan.items.flatMap((item) => item.kind === "issue" ? [item.entityId] : []))];
  const inputFingerprints = ids.map((id) => reviewFingerprint(reviewInput(repository, id, plan)));
  unitOfWork.run(actor, ({ repository: tx }) => tx.appendReviewRecord(plan.projectId, null, { kind: "override", value: { planId, inputFingerprints, reason: override.reason.trim(), actor } }));
}

function assertExecutableInputs(context: RemotePushContext, plan: RemotePushPlan, expectedLocalFingerprint: string): void {
  assertReviewedInputs(context, plan, expectedLocalFingerprint);
  context.repository.assertCardReviewsForPush(plan);
}
