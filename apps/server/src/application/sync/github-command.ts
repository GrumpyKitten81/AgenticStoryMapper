import { agentAccessEnabled, agentProtected } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { DomainError, type ActorContext, type ChangeOperation, type ChangeSetCommandResponse, type IncomingGitHubCommandResponse, type SyncItemResult, type ConnectorConnection, type SyncPlan } from "@storymapper/contracts";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { asDomainError } from "@storymapper/server/application/errors";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";

export interface GitHubPreparation {
  deps: ApplicationDeps;
  actor: ActorContext;
  connection: ConnectorConnection;
  storyMapId: string;
  database: ApplicationDeps["unitOfWork"]["handle"]["current"];
  mapVersion: number;
  reviewedMap: string;
  epoch: string | undefined;
  preparedStatusCatalogs: Map<string, string>;
}

export function beginGitHubPreparation(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, connectionId: string): GitHubPreparation {
  const connection = deps.repository.getConnectorConnection(connectionId);
  const map = deps.repository.getStoryMapOrThrow(storyMapId);
  if (!connection || !map) throw new DomainError("not_found", "GitHub connection or Story Map not found.");
  if (connection.projectId !== map.projectId) throw new DomainError("validation", "Connection belongs to another Project.");
  const safety = deps.repository.getSafetySettings(map.projectId);
  if (!safety.github || actor.actorType === "agent" && !agentAccessEnabled(safety)) throw new DomainError("disabled", "GitHub command access is disabled for this Project.");
  const context = { deps, actor, connection, storyMapId, database: deps.unitOfWork.handle.current, mapVersion: map.version, reviewedMap: reviewedMapInputs(deps, storyMapId), epoch: safety.epoch, preparedStatusCatalogs: new Map<string, string>() };
  revalidateGitHubPreparation(context);
  return context;
}

export function revalidateGitHubPreparation(context: GitHubPreparation): void {
  const { deps, connection, actor, storyMapId } = context;
  if (deps.unitOfWork.handle.current !== context.database) throw new DomainError("conflict", "Database changed during remote preparation.");
  const map = deps.repository.listStoryMaps(connection.projectId).find((entry) => entry.id === storyMapId);
  if (reviewedMapInputs(deps, storyMapId) !== context.reviewedMap || !map || map.version !== context.mapVersion || map.projectId !== connection.projectId || JSON.stringify(deps.repository.getConnectorConnection(connection.id)) !== JSON.stringify(connection)) throw new DomainError("conflict", "GitHub command ownership or connection changed during preparation.");
  const safety = deps.repository.getSafetySettings(connection.projectId);
  if (safety.epoch !== context.epoch) throw new DomainError("conflict", "Database epoch changed during remote preparation.");
  if (!safety.github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  if (actor.actorType === "agent" && !agentAccessEnabled(safety)) throw new DomainError("disabled", "Agent access is disabled for this project.");
}

export function githubCommand(context: GitHubPreparation, operations: ChangeOperation[], summary: string, apply?: boolean): ChangeSetCommandResponse {
  revalidateGitHubPreparation(context);
  const { actor, deps, connection } = context;
  return executeChangeSetCommand(deps, { ...actor, actorType: "github" }, { id: randomUUID(), projectId: connection.projectId, source: "github", title: summary, operations, createdAt: new Date().toISOString() }, { trustedGithubStatus: true, ...(apply === undefined ? {} : { apply }), initiatingActor: actor });
}

export function syncRunOperation(context: GitHubPreparation, mode: "import" | "push" | "sync", status: "planned" | "applied" = "applied"): Extract<ChangeOperation, { entity: "syncRun" }> {
  return { operationId: randomUUID(), entityId: randomUUID(), op: "create", entity: "syncRun", baseVersion: context.mapVersion, connectionBefore: context.connection, after: { projectId: context.connection.projectId, storyMapId: context.storyMapId, connectionId: context.connection.id, provider: context.connection.provider, mode, status, summary: `GitHub ${mode} ${status}.` } };
}

export function proposeRemotePush(context: GitHubPreparation, plan: SyncPlan): ChangeSetCommandResponse & { plan: SyncPlan } {
  if (agentProtected(context.deps.repository.getSafetySettings(context.connection.projectId))) throw new DomainError("protected", "Project is protected from agent remote writes.");
  const operation = syncRunOperation(context, "push", "planned");
  operation.after.dryRunPlan = plan;
  return { ...githubCommand(context, [operation], "GitHub push Dry Run; human confirmation required.", false), plan };
}

function reviewedMapInputs(deps: ApplicationDeps, storyMapId: string): string {
  const snapshot = deps.repository.getStoryMapSnapshot(storyMapId);
  if (!snapshot) return "null";
  const { storyMap, cards, releases, annotations, cardAnnotations, workflowStatuses, externalRefs, githubLinks, remoteWorkItemLinks } = snapshot;
  return JSON.stringify({ storyMap, cards, releases, annotations, cardAnnotations, workflowStatuses, externalRefs, githubLinks, remoteWorkItemLinks });
}

export function githubIncomingCommand(context: GitHubPreparation, operations: ChangeOperation[], summary: string, apply: boolean | undefined, results: (outcome: "proposed" | "applied") => SyncItemResult[]): IncomingGitHubCommandResponse {
  try {
    const result = githubCommand(context, operations, summary, apply);
    return { ...result, items: results(result.outcome) };
  } catch (error) {
    const domain = asDomainError(error);
    throw new DomainError(domain.code, domain.message, { ...domain.details, items: results("proposed").map((item) => ({ ...item, status: "failed", code: domain.code, message: domain.message, details: { phase: "finalize" } })) });
  }
}
