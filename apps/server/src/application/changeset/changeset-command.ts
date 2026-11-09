import { agentAccessEnabled, agentProtected } from "@storymapper/core";
import { changeSetSchema, DomainError, type ActorContext, type ChangeSetInput, type ChangeSetCommandResponse, type OperationSupply } from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { visibleChangeSetWarnings } from "@storymapper/server/application/changeset/changeset-warning-visibility";
import { executeStoredOrNewChangeSet } from "@storymapper/server/application/changeset/changeset-executor";
import { commandResponse } from "@storymapper/server/application/changeset/command-response";
import { resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";

export function executeChangeSetCommand(deps: ApplicationDeps, actor: ActorContext, input: ChangeSetInput, options: { apply?: boolean; initiatingActor?: ActorContext; trustedGithubStatus?: boolean; preparedSourceImports?: OperationSupply["preparedSourceImports"] } = {}): ChangeSetCommandResponse {
  requireActor(actor);
  const initiator = options.initiatingActor ?? actor;
  requireActor(initiator);
  const command = deps.unitOfWork.run(initiator, ({ repository }) => {
    const reviewed = changeSetSchema.parse(input);
    const owners = resolveToolProjectIds(repository as unknown as ApplicationDeps["repository"], "ApplyChangeSet", {}, reviewed);
    if (owners.some((id) => id !== input.projectId)) throw new DomainError("validation", "Command ChangeSet references a foreign Project.");
    const safety = repository.getSafetySettings(input.projectId);
    if (initiator.actorType === "agent" && !agentAccessEnabled(safety) || input.source === "github" && !safety.github) throw new DomainError("disabled", "ChangeSet initiating access is disabled for this Project.");
    const customizationReview = (actor.actorType !== "human" || initiator.actorType !== "human") && reviewed.operations.some(({ entity }) => ["persona", "annotation", "workflowStatus", "storyTemplate"].includes(entity));
    if (customizationReview && options.apply === true) throw new DomainError("validation", "Customization changes require a proposal followed by separate approval and Apply.");
    const deferred = customizationReview || options.apply === false || initiator.actorType === "agent" && agentProtected(safety) || reviewed.operations.some((operation) => operation.op === "acknowledge" && operation.entity === "sourcePlan");
    if (deferred) for (const operation of reviewed.operations) if (operation.entity === "sourceDocument" && operation.after.inlineContent === undefined && (!operation.after.filePath || operation.after.filePath.startsWith("inline://")) && !repository.listSourceDocumentSummaryData(input.projectId).some(({ document }) => document.type === operation.after.type && document.fileHash === operation.after.fileHash)) throw new DomainError("validation", "Deferred source imports require reviewed content or durable local source paths.");
    return { ...repository.createCommandChangeSet(input, options.trustedGithubStatus === true && actor.actorType === "github" && options.initiatingActor !== undefined), deferred };
  });
  if (command.deferred) return commandResponse(visibleChangeSetWarnings(deps.repository, initiator, command.changeSet));
  return executeStoredOrNewChangeSet(deps, actor, command.changeSet.id, undefined, { receipt: command.receipt, initiatingActor: initiator, commandResponse: true, ...(options.preparedSourceImports ? { preparedSourceImports: options.preparedSourceImports } : {}) }) as ChangeSetCommandResponse;
}
