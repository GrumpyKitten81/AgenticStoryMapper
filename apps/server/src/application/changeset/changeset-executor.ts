import { isReviewCurrent } from "@storymapper/db";
import { createHash } from "node:crypto";
import { changeSetSchema, DomainError, OPERATIONS_SCHEMA_VERSION, type ActorContext, type ChangeSetResponse, type OperationSupply } from "@storymapper/contracts";
import { agentAccessEnabled, agentProtected, collectOperationConflicts, operationDependencies, OperationResolutionError, resolveOperations } from "@storymapper/core";
import { ChangeSetConflictError, CommittedUnitOfWorkError, publishRestorePoint } from "@storymapper/db";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { prepareSourceOperations } from "@storymapper/server/application/changeset/prepare-operation-supply";
import { visibleChangeSetWarnings } from "@storymapper/server/application/changeset/changeset-warning-visibility";
import { asDomainError } from "@storymapper/server/application/errors";
import { persistExecutorAudit } from "@storymapper/server/application/changeset/executor-audit";
import { commandResponse } from "@storymapper/server/application/changeset/command-response";

export function executeStoredOrNewChangeSet(deps: ApplicationDeps, actor: ActorContext, changeSetId: string, selectedOperationIds?: readonly string[], command?: { receipt: object; initiatingActor?: ActorContext; commandResponse?: boolean; preparedSourceImports?: OperationSupply["preparedSourceImports"] }): ChangeSetResponse {
  const initiator = command?.initiatingActor ?? actor;
  const executionActor: ActorContext = deps.repository.getChangeSet(changeSetId)?.source === "github" ? { ...actor, actorType: "github" } : actor;
  let admitted = false;
  let retainedRestorePoint: string | undefined;
  try {
    const response = deps.unitOfWork.runPrepared(executionActor, (database) => {
      const current = deps.repository.getChangeSet(changeSetId);
      if (!current) throw new DomainError("not_found", "ChangeSet not found.");
      if (current.undoneByRestore || current.status === "applied") throw new DomainError("conflict", "Applied or restore-undone ChangeSet is permanently historical.");
      if (current.status === "stale" || current.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION) throw new DomainError("conflict", "Stale ChangeSet requires current-schema resubmission and fresh approval.");
      const parsed = changeSetSchema.parse(current);
      assertCorrectionApproval(deps, parsed, Boolean(command));
      if (parsed.undoneByRestore || (!command && (parsed.status !== "approved" || !parsed.approval))) throw new DomainError("conflict", "Stored ChangeSet requires executable recorded approval.");
      if (!command && parsed.approval!.operationsHash !== createHash("sha256").update(JSON.stringify(parsed.operations)).digest("hex")) throw new DomainError("conflict", "ChangeSet operations require fresh approval.");
      const safety = deps.repository.getSafetySettings(parsed.projectId);
      assertInitiatingAuthority(executionActor, initiator, parsed, safety, Boolean(command));
      const selected = selectedOperationIds ?? parsed.approval?.selectedOperationIds ?? parsed.operations.map((operation) => operation.operationId);
      if (!command && JSON.stringify(selected) !== JSON.stringify(parsed.approval!.selectedOperationIds)) throw new DomainError("conflict", "ChangeSet selection requires fresh approval.");
      if (parsed.operations.some((operation) => selected.includes(operation.operationId) && operation.op === "acknowledge" && operation.entity === "sourcePlan") && (command || parsed.approval?.actor.actorType !== "human")) throw new DomainError("protected", "Source reconciliation requires recorded human approval.");
      admitted = true;
      const snapshot = deps.repository.getOperationSnapshot(parsed.projectId);
      const allocated = { ...deps.repository.prepareOperationSupply(parsed.operations, snapshot, command?.preparedSourceImports), creationOrigin: parsed.source === "human" ? "manual" as const : "inference" as const };
      const closed = new Set(selected);
      const dependencies = operationDependencies(snapshot, parsed.operations, allocated);
      for (const operation of parsed.operations) if (dependencies.get(operation.operationId)!.some((id) => !closed.has(id))) closed.delete(operation.operationId);
      const { supply, conflicts: sourceConflicts } = prepareSourceOperations(parsed.operations, snapshot, allocated, [...closed]);
      const conflicts = [...collectOperationConflicts(snapshot, parsed.operations, supply, selected), ...sourceConflicts].sort((a, b) => a.index! - b.index!);
      if (conflicts.length) throw new ChangeSetConflictError(parsed.id, conflicts);
      const resolved = resolveOperations(snapshot, parsed.operations, supply, selected, { retainOperationStates: false });
      if (resolved.selectedOperationIds.length) retainedRestorePoint = publishRestorePoint(database, "pre-apply").fileName;
      return { supply, ...(retainedRestorePoint ? { restorePoint: retainedRestorePoint } : {}) };
    }, ({ repository }, prepared) => {
      const current = repository.getChangeSet(changeSetId);
      if (!current) throw new DomainError("not_found", "ChangeSet not found.");
      assertInitiatingAuthority(executionActor, initiator, changeSetSchema.parse(current), repository.getSafetySettings(current.projectId), Boolean(command));
      const value = repository.applyChangeSet(changeSetId, { ...prepared, initiatingActor: initiator, ...(command ? { commandReceipt: command.receipt } : {}), ...(selectedOperationIds ? { selectedOperationIds } : {}) });
      if (!value) throw new DomainError("not_found", "ChangeSet not found.");
      const visible = visibleChangeSetWarnings(repository as unknown as ApplicationDeps["repository"], initiator, changeSetSchema.parse(value));
      const response = command?.commandResponse ? commandResponse(visible) : { changeSet: visible };
      persistExecutorAudit(repository, response);
      return response;
    });
    return response;
  } catch (error) {
    return executorFailure(deps, actor, changeSetId, admitted, retainedRestorePoint, error);
  }
}

function assertInitiatingAuthority(actor: ActorContext, initiator: ActorContext | undefined, changeSet: ChangeSetResponse["changeSet"], safety: ReturnType<ApplicationDeps["repository"]["getSafetySettings"]>, newCommand: boolean): void {
  const authority = initiator ?? actor;
  if (actor.actorType === "github" && (!initiator || changeSet.source !== "github" || newCommand && (changeSet.proposedBy?.actorType !== authority.actorType || changeSet.proposedBy.actorId !== authority.actorId || changeSet.proposedBy.mcpSessionId !== authority.mcpSessionId))) throw new DomainError("protected", "GitHub execution requires its recorded trusted initiating authority.");
  if (changeSet.source === "github" && !safety.github) throw new DomainError("disabled", "GitHub access is disabled for this Project.");
  if (authority.actorType === "agent" && (!agentAccessEnabled(safety) || agentProtected(safety))) throw new DomainError(agentAccessEnabled(safety) ? "protected" : "disabled", "Agent ChangeSet application is disabled for this Project.");
}

function executorFailure(deps: ApplicationDeps, actor: ActorContext, changeSetId: string, admitted: boolean, retainedRestorePoint: string | undefined, error: unknown): ChangeSetResponse {
    if (error instanceof CommittedUnitOfWorkError) return error.result as ChangeSetResponse;
    if (admitted && (error instanceof ChangeSetConflictError || error instanceof OperationResolutionError && error.code === "conflict" || error instanceof DomainError && error.code === "conflict")) {
      deps.unitOfWork.run(actor, ({ repository }) => {
        const current = repository.getChangeSet(changeSetId);
        if (current && !current.undoneByRestore && current.operationsSchemaVersion === OPERATIONS_SCHEMA_VERSION && ["proposed", "approved"].includes(current.status)) repository.updateChangeSetStatus(changeSetId, "conflict");
      });
    }
    if (retainedRestorePoint) {
      const failure = asDomainError(error);
      throw new DomainError(failure.code, failure.message, { ...failure.details, retainedRestorePoint, retainedPreparedEffects: [] }, failure.conflicts);
    }
    throw error;
}

function assertCorrectionApproval(deps: ApplicationDeps, changeSet: ChangeSetResponse["changeSet"], command: boolean): void {
  const fix = deps.repository.getReviewFixForChangeSet(changeSet.projectId, changeSet.id);
  if (!fix) return;
  const data = deps.repository.getCardReviews(changeSet.projectId);
  const report = data.reports.find((row) => row.id === fix.reportId);
  const request = data.requests.find((row) => row.id === report?.requestId);
  if (command || changeSet.approval?.actor.actorType !== "human") throw new DomainError("protected", "DoR corrections require separate recorded human approval.");
  if (!request || !isReviewCurrent(deps.repository, request)) throw new DomainError("conflict", "DoR correction context changed; request a fresh review and correction.");
}
