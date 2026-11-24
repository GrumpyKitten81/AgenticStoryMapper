import { DomainError, parseWorkItemLocator, workItemScopeMatches, remotePushRelationshipResultSchema, type RemotePushEffect, type RemotePushIssueReference, type RemotePushItemExecution, type RemotePushPlan, type RemotePushRelationshipIntent } from "@storymapper/contracts";
import { requireRemoteItem, type RemoteWorkItem, type WorkItemProvider, type ProviderAuth } from "@storymapper/github";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { assertRemotePushTarget, committedWrite, localPushFingerprint, type RemotePushContext } from "@storymapper/server/services/remote-push-context";
import { parentConflictLocalValue, prepareConflictResolution } from "@storymapper/server/services/sync-conflict-resolution";
import { changedFieldsForRemote } from "@storymapper/server/services/sync-merge";

type Relationship = Extract<RemotePushEffect, { kind: "relationship" }>;
export interface RelationshipContext extends RemotePushContext {
  plan: RemotePushPlan;
  runToken: string;
  expectedLocalFingerprint: string;
  provider: WorkItemProvider;
  auth: { connection: RemotePushContext["connection"]; auth: ProviderAuth };
}

function resolveReference(context: RelationshipContext, reference: RemotePushIssueReference): { number: number; url: string } {
  if (reference.kind === "existing") {
    const locator = parseWorkItemLocator(context.connection.provider, reference.url);
    if (!locator || locator.resource !== "issues" || locator.number !== reference.remoteNumber || !workItemScopeMatches(locator, context.connection)) throw new DomainError("conflict", "Reviewed Issue reference does not match this connection.");
    return { number: reference.remoteNumber, url: reference.url };
  }
  const item = context.plan.items.find((entry) => entry.id === reference.itemId);
  const result = context.repository.getRemotePushPlan(context.plan.id)!.execution.items.find((entry) => entry.itemId === reference.itemId);
  if (item?.kind !== "issue" || item.action !== "create" || result?.state !== "succeeded" || !result.remoteResult) throw new DomainError("conflict", "Issue creation dependency has not succeeded.");
  const remote = result.remoteResult as RemoteWorkItem;
  assertRemotePushTarget(context, "issue", remote, result.remoteId);
  if (!remote.remoteNumber || !remote.url) throw new DomainError("conflict", "Issue creation dependency lacks a durable identity.");
  return { number: remote.remoteNumber, url: remote.url };
}

async function observe(context: RelationshipContext, item: Relationship, child: { number: number; url: string }, assertExecution: () => void): Promise<RemoteWorkItem> {
  const remote = requireRemoteItem(await context.provider.getRemoteItem(context.auth.connection, context.auth.auth, String(child.number)));
  assertExecution();
  const binding = context.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).find((link) => link.connectionId === context.connection.id && link.cardId === item.entityId);
  if (!binding) throw new DomainError("conflict", "Relationship child has no durable binding.");
  assertRemotePushTarget(context, "issue", remote, String(child.number), binding.externalRefId);
  if (remote.remoteNumber !== child.number || remote.url !== child.url || remote.parentEvidence === undefined) throw new DomainError("conflict", "Child identity or parent evidence is incomplete or changed.");
  if (remote.parentEvidence && (remote.parentEvidence.repository.toLowerCase() !== `${context.connection.owner}/${context.connection.repository}`.toLowerCase() || remote.parentEvidence.url !== `https://github.com/${remote.parentEvidence.repository}/issues/${remote.parentEvidence.number}`)) throw new DomainError("conflict", "Remote parent belongs to a different or unverifiable repository.");
  return remote;
}

export async function executeRelationship(context: RelationshipContext, item: Relationship, evidence: RemotePushItemExecution, assertExecution: () => void): Promise<void> {
  if (!context.provider.resolveIssueDatabaseId || item.action !== "acknowledge" && !context.provider.writeSubIssue) throw new DomainError("validation", "Provider does not support relationship writes.");
  const execution = context.repository.getRemotePushPlan(context.plan.id)!.execution;
  if (item.dependencies.some((id) => execution.items.find((row) => row.itemId === id)?.state !== "succeeded")) throw new DomainError("conflict", "A relationship dependency has not succeeded.");
  const binding = context.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).find((link) => link.connectionId === context.connection.id && link.cardId === item.entityId);
  if (!binding?.baseline) throw new DomainError("conflict", "Relationship child has no sync baseline; pull it before reviewing a relationship change.");
  const child = resolveReference(context, item.child);
  const expectedReference = item.expectedParent && resolveReference(context, item.expectedParent);
  const resultingReference = item.resultingParent && resolveReference(context, item.resultingParent);
  const expected = expectedReference?.number ?? null;
  const resulting = resultingReference?.number ?? null;
  if (item.action === "acknowledge") return acknowledgeConvergence(context, item, evidence, child, expected, resulting, assertExecution);
  const parentNumber = item.action === "add" ? resulting : expected;
  if (!parentNumber || (item.action === "add" ? expected !== null : resulting !== null)) throw new DomainError("validation", "Relationship effect has invalid parent transition.");
  const remote = await observe(context, item, child, assertExecution);
  const current = remote.parentEvidence?.number ?? null;
  const interrupted = ["intent", "uncertain", "remote_succeeded", "local_failed"].includes(evidence.state);
  if (interrupted) {
    const saved = evidence.intentPayload;
    if (!saved || !("operation" in saved) || saved.operation !== item.action || saved.childNumber !== child.number || saved.parentNumber !== parentNumber || saved.expectedParent !== expected || saved.resultingParent !== resulting) throw new DomainError("conflict", "Retained relationship intent does not match the reviewed effect.");
  }
  if (interrupted && current === resulting) return acknowledge(context, item, remote, relationshipResult(evidence.remoteResult && typeof evidence.remoteResult === "object" && "response" in evidence.remoteResult ? evidence.remoteResult.response : null, remote));
  if (current !== expected) throw new DomainError("conflict", "Remote parent changed after review; no relationship write was sent.");
  if (["remote_succeeded", "local_failed"].includes(evidence.state)) throw new DomainError("conflict", "Previously successful relationship is no longer present.");
  if (interrupted) committedWrite(context, ({ repository }) => repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "failed", error: "Live parent confirms the previous attempt was not applied." }, context.runToken));
  const databaseId = await context.provider.resolveIssueDatabaseId(context.auth.connection, context.auth.auth, child.number, child.url);
  const parent = item.action === "add" ? resultingReference : expectedReference;
  if (!parent) throw new DomainError("validation", "Relationship parent identity is missing.");
  await context.provider.resolveIssueDatabaseId(context.auth.connection, context.auth.auth, parent.number, parent.url);
  assertExecution();
  const intent: RemotePushRelationshipIntent = { operation: item.action, childNumber: child.number, childDatabaseId: databaseId, parentNumber, expectedParent: expected, resultingParent: resulting };
  const state = committedWrite(context, ({ repository }) => repository.captureRemotePushReconciliation(context.plan.id, item.id));
  committedWrite(context, ({ repository }) => repository.recordRemotePushIntent(context.plan.id, item.id, context.runToken, intent, { complete: true, remoteId: String(child.number), executionState: state }));
  const checked = await observe(context, item, child, assertExecution);
  if ((checked.parentEvidence?.number ?? null) !== expected) throw new DomainError("conflict", "Remote parent changed before the relationship write.");
  const response = await context.provider.writeSubIssue!(context.auth.connection, context.auth.auth, item.action, parentNumber, databaseId);
  if (context.unitOfWork.handle.current !== context.database) {
    if (context.database.$client.open) new UnitOfWork(new DatabaseHandle(context.database)).run(context.actor, ({ repository }) => {
      repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "remote_succeeded", remoteId: String(child.number), url: child.url, remoteResult: { response: response ?? null } }, context.runToken);
      repository.finishRemotePushPlan(context.plan.id, "interrupted", context.runToken);
    });
    throw new DomainError("conflict", "Database changed after the relationship write; resume against the original database.");
  }
  committedWrite(context, ({ repository }) => repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "remote_succeeded", remoteId: String(child.number), url: child.url, remoteResult: { response: response ?? null } }, context.runToken));
  const observed = await observe(context, item, child, assertExecution);
  const result = relationshipResult(response, observed);
  if ((observed.parentEvidence?.number ?? null) !== resulting) throw new DomainError("conflict", "GitHub returned a different relationship than the reviewed result.");
  acknowledge(context, item, observed, result);
}

async function acknowledgeConvergence(context: RelationshipContext, item: Relationship, evidence: RemotePushItemExecution, child: { number: number; url: string }, expected: number | null, resulting: number | null, assertExecution: () => void): Promise<void> {
  if (expected !== resulting || item.action !== "acknowledge") throw new DomainError("validation", "Convergence acknowledgement must retain the reviewed parent.");
  const remote = await observe(context, item, child, assertExecution);
  if ((remote.parentEvidence?.number ?? null) !== resulting) throw new DomainError("conflict", "Remote parent changed after review; acknowledgement was not applied.");
  const interrupted = ["intent", "uncertain", "remote_succeeded", "local_failed"].includes(evidence.state);
  if (interrupted) {
    const saved = evidence.intentPayload;
    if (!saved || !("operation" in saved) || saved.operation !== "acknowledge" || saved.childNumber !== child.number || saved.expectedParent !== expected || saved.resultingParent !== resulting) throw new DomainError("conflict", "Retained acknowledgement intent does not match the reviewed effect.");
  } else {
    const databaseId = await context.provider.resolveIssueDatabaseId!(context.auth.connection, context.auth.auth, child.number, child.url);
    if (item.resultingParent) {
      const parent = resolveReference(context, item.resultingParent);
      await context.provider.resolveIssueDatabaseId!(context.auth.connection, context.auth.auth, parent.number, parent.url);
    }
    assertExecution();
    const intent: RemotePushRelationshipIntent = { operation: "acknowledge", childNumber: child.number, childDatabaseId: databaseId, parentNumber: resulting, expectedParent: expected, resultingParent: resulting };
    const state = committedWrite(context, ({ repository }) => repository.captureRemotePushReconciliation(context.plan.id, item.id));
    committedWrite(context, ({ repository }) => repository.recordRemotePushIntent(context.plan.id, item.id, context.runToken, intent, { complete: true, remoteId: String(child.number), executionState: state }));
  }
  const confirmed = await observe(context, item, child, assertExecution);
  if ((confirmed.parentEvidence?.number ?? null) !== resulting) throw new DomainError("conflict", "Remote parent changed before acknowledgement.");
  acknowledge(context, item, confirmed, relationshipResult(null, confirmed));
}

function relationshipResult(response: unknown, remote: RemoteWorkItem): unknown {
  return remotePushRelationshipResultSchema.parse({ response: response ?? null, observedParent: remote.parentEvidence });
}

function acknowledge(context: RelationshipContext, item: Relationship, remote: RemoteWorkItem, result: unknown): void {
  const later = context.plan.items.slice(context.plan.items.findIndex((entry) => entry.id === item.id) + 1).some((entry) => entry.kind === "relationship" && entry.entityId === item.entityId);
  const conflict = !later && context.plan.selection.conflictId ? prepareConflictResolution(context.repository, context.unitOfWork, context.plan.selection.conflictId, { storyMapId: context.storyMapId, resolution: "local" }) : undefined;
  if (conflict && (conflict.conflict.field !== "parent" || conflict.card.id !== item.entityId || parentConflictLocalValue(context.repository, conflict) !== (remote.parentEvidence?.number ?? null))) throw new DomainError("conflict", "Parent conflict no longer matches the verified relationship.");
  committedWrite(context, ({ repository }) => {
    if (!later) {
      const link = repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).find((entry) => entry.connectionId === context.connection.id && entry.cardId === item.entityId);
      if (!link) throw new DomainError("conflict", "Relationship child has no durable binding.");
      if (conflict) repository.resolveSyncConflict(conflict.conflict.id, "local");
      const open = repository.listOpenSyncConflicts(context.storyMapId).some((entry) => entry.externalRefId === link.externalRefId);
      const card = repository.getCard(item.entityId);
      if (!card) throw new DomainError("conflict", "Relationship child Card is unavailable.");
      const fields = changedFieldsForRemote(repository, context.connection, card, link, remote);
      const syncState = open ? "conflict" : !link.baseline || Object.values(fields).some((field) => field.local) ? "unsynced" : Object.values(fields).some((field) => field.remote) ? "stale" : "synced";
      if (!link.baseline) throw new DomainError("conflict", "Relationship child has no sync baseline.");
      repository.upsertRemoteWorkItemLink({ ...link, baseline: { ...link.baseline, parentKnown: true }, remoteParentNumber: remote.parentEvidence?.number ?? null, parentOverrideLocal: false, syncState });
    }
    const old = repository.getRemotePushPlan(context.plan.id)!.execution.items.find((entry) => entry.itemId === item.id)!;
    if (["intent", "uncertain"].includes(old.state)) repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "remote_succeeded", remoteId: remote.remoteId, url: remote.url, remoteResult: result }, context.runToken);
    repository.recordRemotePushOutcome(context.plan.id, item.id, { state: "succeeded", remoteId: remote.remoteId, url: remote.url, remoteResult: result }, context.runToken);
    const updated = localPushFingerprint(repository, context.storyMapId, context.plan.selection);
    repository.updateRemotePushFingerprint(context.plan.id, updated, context.runToken);
    context.expectedLocalFingerprint = updated;
  });
}
