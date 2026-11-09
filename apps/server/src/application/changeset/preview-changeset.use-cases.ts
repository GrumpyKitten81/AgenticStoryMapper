import { createHash } from "node:crypto";
import { changeSetSchema, changeSetPresentationStatus, DomainError, OPERATIONS_SCHEMA_VERSION, type ActivityEvent, type ActorContext, type CapabilityDescriptor, type ChangeSetPreviewOperation, type ChangeSetPreviewResponse, type ConflictEntry } from "@storymapper/contracts";
import { agentAccessEnabled, agentApprovalAllowed, agentProtected, collectOperationConflicts, operationDependencies, OperationResolutionError, resolveOperations } from "@storymapper/core";
import { operationAuditChanges } from "@storymapper/db";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { canReadChangeSet, resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import { visibleChangeSetWarnings } from "@storymapper/server/application/changeset/changeset-warning-visibility";
import { prepareSourceOperations } from "@storymapper/server/application/changeset/prepare-operation-supply";
import { previewBoards } from "@storymapper/server/application/changeset/preview-board-projection";

export const previewChangeSetDescriptor: CapabilityDescriptor = { name: "previewChangeSet", kind: "read", route: "GET /api/changesets/:changeSetId/preview" };

export function previewChangeSet(deps: ApplicationDeps, actor: ActorContext, changeSetId: string, requested?: readonly string[]): ChangeSetPreviewResponse {
  requireActor(actor);
  const stored = deps.repository.getChangeSet(changeSetId);
  if (!stored) throw new DomainError("not_found", "ChangeSet not found.");
  const safety = deps.repository.getSafetySettings(stored.projectId);
  if (actor.actorType === "agent" && (!agentAccessEnabled(safety) || !canReadChangeSet(deps.repository, stored))) throw new DomainError("disabled", "ChangeSet is not available for Agent access.");
  const changeSet = visibleChangeSetWarnings(deps.repository, actor, stored);
  const presentationStatus = changeSetPresentationStatus(changeSet);
  const closed = Boolean(stored.undoneByRestore || stored.status === "applied");
  const stale = stored.status === "stale" || stored.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION;
  const base = { changeSet, presentationStatus: stale && !closed ? "stale" as const : presentationStatus, closed, canApprove: false, canApply: false, selectedOperationIds: [], conflicts: [], boards: [] };
  if (closed || stale) {
    const history = deps.repository.listActivity(stored.projectId);
    return { ...base, explanation: stored.undoneByRestore ? "Discarded: this ChangeSet was undone by restore and remains available in Activity." : closed ? "Applied: this ChangeSet remains available in Activity." : "Stale ChangeSet requires current-schema resubmission and fresh approval.", operations: stored.operations.map((operation, index) => {
      const row = historicalReviewRow(history, stored.id, operation, index, stale ? "stale" : "unchanged");
      return !stale && stored.execution && !stored.execution.selectedOperationIds.includes(row.operationId) ? { ...row, status: "excluded" as const } : row;
    }) };
  }
  const current = changeSetSchema.parse(stored);
  const snapshot = deps.repository.getOperationSnapshot(stored.projectId);
  const allocated = { ...deps.repository.prepareOperationSupply(current.operations, snapshot), creationOrigin: current.source === "human" ? "manual" as const : "inference" as const };
  let dependencies: ReturnType<typeof operationDependencies>;
  try { dependencies = operationDependencies(snapshot, current.operations, allocated); }
  catch (error) {
    if (!(error instanceof OperationResolutionError)) throw error;
    return { ...base, presentationStatus: "conflict", conflicts: [{ entity: "project", id: current.projectId, index: error.index, operationId: error.operationId, reason: "fingerprint", current: null, message: error.message }], operations: current.operations.map((operation, index) => ({ ...historicalRow(operation, index, "conflict"), cause: error.message })), boards: previewBoards(deps, actor, snapshot, []) };
  }
  const { selected, selectedOperationIds } = previewSelection(deps, actor, current, requested, dependencies);
  const prepared = prepareSourceOperations(current.operations, snapshot, allocated, selectedOperationIds);
  const conflicts = [...collectOperationConflicts(snapshot, current.operations, prepared.supply, selectedOperationIds), ...prepared.conflicts];
  let resolved: ReturnType<typeof resolveOperations> | undefined;
  if (!conflicts.length) {
    try { resolved = resolveOperations(snapshot, current.operations, prepared.supply, selectedOperationIds, { retainOperationStates: false }); }
    catch (error) {
      if (!(error instanceof OperationResolutionError)) throw error;
      conflicts.push({ entity: "project", id: current.projectId, operationId: error.operationId, index: error.index, reason: "fingerprint", current: null, message: error.message });
    }
  }
  const operations = current.operations.map((operation, index): ChangeSetPreviewOperation => {
    const result = resolved?.operations.find((row) => row.operationId === operation.operationId);
    const issues = conflicts.filter((conflict) => conflict.operationId === operation.operationId);
    const row = historicalRow(operation, index, !selected.has(operation.operationId) ? "excluded" : conflicts.length ? "conflict" : "unchanged");
    return { ...row, ...(result ? (({ state: _state, ...description }) => ({ ...description, changes: operationAuditChanges(description.changes) }))(result) : {}), dependencies: dependencies.get(operation.operationId)!, ...(issues.length ? { cause: issues.map(conflictCause).join("; ") } : conflicts.length && selected.has(operation.operationId) ? { cause: "Projection blocked: no operations applied because selected work conflicts." } : {}) };
  });
  const requiresHuman = current.operations.some((operation) => selected.has(operation.operationId) && operation.op === "acknowledge" && operation.entity === "sourcePlan");
  const allowedApproval = actor.actorType === "human" || !requiresHuman && actor.actorType === "agent" && agentApprovalAllowed(safety);
  const exactApproval = current.status === "approved" && current.approval?.operationsHash === createHash("sha256").update(JSON.stringify(current.operations)).digest("hex") && (!requiresHuman || current.approval?.actor.actorType === "human") && JSON.stringify(current.approval?.selectedOperationIds) === JSON.stringify(selectedOperationIds);
  return { ...base, presentationStatus: conflicts.length ? "conflict" : base.presentationStatus, selectedOperationIds, conflicts, operations, boards: previewBoards(deps, actor, resolved?.state ?? snapshot, resolved?.operations ?? [], snapshot), canApprove: !conflicts.length && allowedApproval, canApply: !conflicts.length && exactApproval && (current.source !== "github" || safety.github) && (actor.actorType === "human" || actor.actorType === "agent" && !agentProtected(safety)) };
}

function historicalRow(operation: unknown, index: number, status: ChangeSetPreviewOperation["status"]): ChangeSetPreviewOperation {
  const fields = operation && typeof operation === "object" ? operation as Record<string, unknown> : {};
  return { operationId: typeof fields.operationId === "string" ? fields.operationId : `historical-${index}`, index, kind: `${fields.op ?? "unknown"}:${fields.entity ?? "unknown"}`, label: fields.op === "upsert" ? "may change" : String(fields.op ?? "Historical operation"), status, dependencies: [], owners: [], changes: [], operation };
}
function conflictCause(conflict: ConflictEntry): string {
  return "message" in conflict && conflict.message ? conflict.message : "baseVersion" in conflict ? `Version conflict: expected ${conflict.baseVersion}, current ${conflict.currentVersion}.` : "Operation conflicts with the current state.";
}

function historicalReviewRow(history: readonly ActivityEvent[], changeSetId: string, operation: unknown, index: number, status: ChangeSetPreviewOperation["status"]): ChangeSetPreviewOperation {
  const row = historicalRow(operation, index, status);
  const event = history.find((event) => event.action === "changeSet.operation.applied" && event.after && typeof event.after === "object" && "changeSetId" in event.after && event.after.changeSetId === changeSetId && "operationId" in event.after && event.after.operationId === row.operationId);
  const after = event?.after;
  if (after && typeof after === "object" && "changes" in after && Array.isArray(after.changes)) return { ...row, ...(status !== "stale" && "status" in after && (after.status === "changed" || after.status === "unchanged") ? { status: after.status } : {}), changes: after.changes as ChangeSetPreviewOperation["changes"] };
  return row;
}

function previewSelection(deps: ApplicationDeps, actor: ActorContext, current: ReturnType<typeof changeSetSchema.parse>, requested: readonly string[] | undefined, dependencies: ReturnType<typeof operationDependencies>) {
  const selected = new Set(requested ?? (current.status === "approved" ? current.approval?.selectedOperationIds : undefined) ?? current.operations.map((operation) => operation.operationId));
  if (requested && selected.size !== requested.length) throw new DomainError("validation", "Duplicate selected operation ID.");
  if ([...selected].some((id) => !current.operations.some((operation) => operation.operationId === id))) throw new DomainError("validation", "Selection contains an unknown operation ID.");
  for (const operation of current.operations) if (dependencies.get(operation.operationId)!.some((id) => !selected.has(id))) selected.delete(operation.operationId);
  const selectedOperationIds = current.operations.filter((operation) => selected.has(operation.operationId)).map((operation) => operation.operationId);
  const owners = resolveToolProjectIds(deps.repository, "SubmitChangeSet", { projectId: current.projectId, operations: current.operations.filter((operation) => selected.has(operation.operationId)) });
  for (const projectId of new Set([current.projectId, ...owners])) {
    if (projectId !== current.projectId) throw new DomainError("validation", "ChangeSet references a foreign Project.");
    if (actor.actorType === "agent" && !agentAccessEnabled(deps.repository.getSafetySettings(projectId))) throw new DomainError("disabled", "Agent access is disabled for this Project.");
  }
  return { selected, selectedOperationIds };
}
