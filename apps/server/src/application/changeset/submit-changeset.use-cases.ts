import { randomUUID } from "node:crypto";
import { changeSetSchema, DomainError, submitChangeSetInputSchema, type ActorContext, type CapabilityDescriptor, type ChangeSetCommandResponse, type SubmitChangeSetInput } from "@storymapper/contracts";
import { agentAccessEnabled, collectOperationConflicts, resolveOperations } from "@storymapper/core";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";
import { prepareSourceOperations } from "@storymapper/server/application/changeset/prepare-operation-supply";
import { submissionOperations } from "@storymapper/server/application/changeset/submission-operations";
import { resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";

export const submitChangeSetDescriptor: CapabilityDescriptor = { name: "submitChangeSet", kind: "write", tool: "SubmitChangeSet" };

export function submitChangeSet(deps: ApplicationDeps, actor: ActorContext, input: SubmitChangeSetInput): ChangeSetCommandResponse {
  requireActor(actor);
  const parsed = submitChangeSetInputSchema.parse(input);
  const operations = submissionOperations(parsed);
  if (operations.some((operation) => ["githubExternalRef", "remoteWorkItemLink", "syncRun", "syncConflict", "githubBoardImport"].includes(operation.entity))) throw new DomainError("protected", "GitHub adapter operations require a validated GitHub command.");
  for (const operation of operations) if (operation.entity === "sourceLink" && operation.op === "unlink" && operation.after.kind === "github") {
    const identity = deps.repository.getGitHubLink(operation.after.id);
    if (identity) throw new DomainError("protected", "Canonical GitHub source detachment requires the validated adapter command.");
  }
  resolveToolProjectIds(deps.repository, "SubmitChangeSet", parsed);
  if (!agentAccessEnabled(deps.repository.getSafetySettings(parsed.projectId)) && actor.actorType === "agent") throw new DomainError("disabled", "Agent access is disabled for this Project.");
  for (const [index, operation] of operations.entries()) {
    if (operation.entity === "sourceDocument" && !operation.after.inlineContent?.trim()) throw new DomainError("validation", "Agent source imports require nonblank inline content.", { index, operationId: operation.operationId });
  }
  const snapshot = deps.repository.getOperationSnapshot(parsed.projectId);
  const prepared = prepareSourceOperations(operations, snapshot, deps.repository.prepareOperationSupply(operations, snapshot), operations.map((operation) => operation.operationId));
  const conflicts = [...collectOperationConflicts(snapshot, operations, prepared.supply), ...prepared.conflicts].sort((a, b) => a.index! - b.index!);
  if (conflicts.length) throw new DomainError("conflict", "Publication conflicts with current state.", { index: conflicts[0]!.index, operationId: conflicts[0]!.operationId }, conflicts);
  resolveOperations(snapshot, operations, prepared.supply, undefined, { retainOperationStates: false });
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId: parsed.projectId, title: parsed.title, source: "mcp", operations, createdAt: new Date().toISOString() });
  return executeChangeSetCommand(deps, actor, changeSet, { ...(parsed.apply !== undefined ? { apply: parsed.apply } : {}), preparedSourceImports: prepared.supply.preparedSourceImports });
}
