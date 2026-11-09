import { agentAccessEnabled, agentProtected } from "@storymapper/core";
import { isWorkItemProvider } from "@storymapper/contracts";
import { unique } from "@storymapper/server/services/sync-values";
export { hashText, issueLabelsForCard, releaseNameForCard, labelsForStatus, stateForStatus, localStatusForRemote } from "@storymapper/server/services/sync-values";
import { randomUUID } from "node:crypto";
import type {
  ActorContext,
  ChangeSetCommandResponse,
  ApplyWorkItemSyncRequest,
  ApplyWorkItemSyncResponse,
  Card,
  ConnectorConnection,
  SyncPlan,
  ImportWorkItemsRequest,
  IncomingGitHubCommandResponse,
  PlanWorkItemSyncRequest,
  PullStoryMapWorkItemsRequest,
  SyncWorkItemsRequest,
  RemotePushPlan
} from "@storymapper/contracts";
import { DomainError, syncItemResultSchema } from "@storymapper/contracts";
import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider } from "@storymapper/github";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";

import { asDomainError } from "@storymapper/server/application/errors";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";
import { beginGitHubPreparation, githubIncomingCommand, proposeRemotePush, revalidateGitHubPreparation } from "@storymapper/server/application/sync/github-command";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { importGitHubCommand } from "@storymapper/server/application/sync/github-import-command";
import { incomingFailure, incomingOperations, incomingResults, prepareIncomingItems, pullGitHubCommand, type IncomingItem } from "@storymapper/server/application/sync/github-pull-command";

export class WorkItemSyncError extends DomainError {
  constructor(message: string, readonly statusCode: number) {
    super(statusCode === 404 ? "not_found" : statusCode === 403 ? "disabled" : statusCode === 409 ? "conflict" : "validation", message);
    this.name = "WorkItemSyncError";
  }
}

function requireEnabledConnection(repository: StoryMapperRepository, connectionId: string): ConnectorConnection {
  const connection = repository.getConnectorConnection(connectionId);
  if (!connection) throw new WorkItemSyncError("Connector connection not found.", 404);
  const settings = repository.getSafetySettings(connection.projectId);
  if (connection.provider === "github" && !settings.github) {
    throw new WorkItemSyncError("GitHub is disabled by the safety switch.", 403);
  }
  return connection;
}

function requireVisibleStoryMap(repository: StoryMapperRepository, storyMapId: string): void {
  if (!repository.listStoryMaps().some((map) => map.id === storyMapId)) throw new WorkItemSyncError("Story map not found.", 404);
}

function requireWritableConnection(connection: ConnectorConnection): void {
  if (connection.readOnly) {
    throw new WorkItemSyncError("Connection is read-only; GitHub writes are disabled.", 403);
  }
}

function assertCurrentDatabase(unitOfWork: UnitOfWork, database: UnitOfWork["handle"]["current"]): void {
  if (unitOfWork.handle.current !== database) throw new WorkItemSyncError("Database changed during remote preparation.", 409);
}

function assertCurrentConnection(repository: StoryMapperRepository, connection: ConnectorConnection): void {
  const current = requireEnabledConnection(repository, connection.id);
  if (JSON.stringify(current) !== JSON.stringify(connection)) throw new WorkItemSyncError("Connector connection changed during remote preparation.", 409);
}

function requireAgentPlanningAccess(repository: StoryMapperRepository, actor: ActorContext, projectId: string): void {
  if (actor.actorType !== "agent") return;
  const safety = repository.getSafetySettings(projectId);
  if (!agentAccessEnabled(safety)) throw new DomainError("disabled", "Agent access is disabled for this project.");
}

export async function planWorkItems(
  repository: StoryMapperRepository,
  unitOfWork: UnitOfWork,
  actor: ActorContext,
  input: PlanWorkItemSyncRequest & { localOrigin?: string | undefined }
): Promise<SyncPlan | RemotePushPlan> {
  const database = unitOfWork.handle.current;
  requireVisibleStoryMap(repository, input.storyMapId);
  const connection = requireEnabledConnection(repository, input.connectionId);
  const preparation = actor.actorType === "human" ? undefined : beginGitHubPreparation({ repository, unitOfWork }, actor, input.storyMapId, input.connectionId);
  requireAgentPlanningAccess(repository, actor, connection.projectId);
  if (input.mode === "import") {
    const provider = createWorkItemProvider(connection.provider);
    const resolvedAuth = await resolveProviderAuth(connection);
    if (preparation) revalidateGitHubPreparation(preparation);
    assertCurrentDatabase(unitOfWork, database);
    assertCurrentConnection(repository, connection);
    requireVisibleStoryMap(repository, input.storyMapId);
    requireAgentPlanningAccess(repository, actor, connection.projectId);
    const remoteItems = await provider.listRemoteItems(resolvedAuth.connection, resolvedAuth.auth, input.query);
    if (preparation) revalidateGitHubPreparation(preparation);
    assertCurrentDatabase(unitOfWork, database);
    assertCurrentConnection(repository, connection);
    requireVisibleStoryMap(repository, input.storyMapId);
    requireAgentPlanningAccess(repository, actor, connection.projectId);
    return unitOfWork.run(actor, (tx) => tx.repository.createWorkItemImportPlan({ storyMapId: input.storyMapId, connectionId: connection.id, items: remoteItems }));
  }
  requireWritableConnection(connection);
  if (actor.actorType === "human") {
    return (await prepareRemotePush(repository, unitOfWork, actor, input)).plan;
  }
  if (agentProtected(repository.getSafetySettings(connection.projectId))) throw new DomainError("protected", "Project is protected from agent remote writes.");
  return unitOfWork.run(actor, (tx) => tx.repository.createWorkItemPushPlan(input));
}

export function pushWorkItems(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext & { actorType: "human" }, input: Omit<ApplyWorkItemSyncRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<ApplyWorkItemSyncResponse>;
export function pushWorkItems(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: Omit<ApplyWorkItemSyncRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<ApplyWorkItemSyncResponse | ChangeSetCommandResponse>;
export async function pushWorkItems(
  repository: StoryMapperRepository,
  unitOfWork: UnitOfWork,
  actor: ActorContext,
  input: Omit<ApplyWorkItemSyncRequest, "confirm"> & { localOrigin?: string | undefined }
): Promise<ApplyWorkItemSyncResponse | ChangeSetCommandResponse> {
  if (actor.actorType !== "human") {
    const context = beginGitHubPreparation({ repository, unitOfWork }, actor, input.storyMapId, input.connectionId);
    requireWritableConnection(context.connection);
    const plan = unitOfWork.run(actor, ({ repository }) => repository.createWorkItemPushPlan({ ...input, mode: "push" }));
    const remotePush = await prepareRemotePush(repository, unitOfWork, actor, { ...input, mode: "push" });
    return { ...proposeRemotePush(context, plan), remotePush };
  }
  throw new DomainError("validation", "Human push requires confirmation of a persisted Dry Run plan id.");
}

export async function importWorkItems(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: ImportWorkItemsRequest): Promise<IncomingGitHubCommandResponse> {
  return importGitHubCommand(beginGitHubPreparation({ repository, unitOfWork }, actor, input.storyMapId, input.connectionId), input);
}

export async function syncWorkItems(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: Omit<SyncWorkItemsRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<IncomingGitHubCommandResponse> {
  return pullGitHubCommand(beginGitHubPreparation({ repository, unitOfWork }, actor, input.storyMapId, input.connectionId), input);
}

export async function pullStoryMapWorkItems(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: Omit<PullStoryMapWorkItemsRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<IncomingGitHubCommandResponse> {
  return pullMapGitHubCommand(repository, unitOfWork, actor, input);
}

async function pullMapGitHubCommand(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: Omit<PullStoryMapWorkItemsRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<IncomingGitHubCommandResponse> {
  const map = repository.getStoryMapOrThrow(input.storyMapId);
  requireAgentPlanningAccess(repository, actor, map.projectId);
  if (!repository.getSafetySettings(map.projectId).github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  const sources = repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId).filter((link) => link.cardId && (!input.connectionIds || input.connectionIds.includes(link.connectionId)));
  try { return await prepareMapGitHubCommand(repository, unitOfWork, actor, input); }
  catch (error) { throw incomingFailure(error, sources); }
}

async function prepareMapGitHubCommand(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, input: Omit<PullStoryMapWorkItemsRequest, "confirm"> & { localOrigin?: string | undefined }): Promise<IncomingGitHubCommandResponse> {
  const map = repository.getStoryMapOrThrow(input.storyMapId);
  requireAgentPlanningAccess(repository, actor, map.projectId);
  if (!repository.getSafetySettings(map.projectId).github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  const sources = repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId).filter((link) => link.cardId && (!input.connectionIds || input.connectionIds.includes(link.connectionId)));
  const ids = unique(sources.map((link) => link.connectionId));
  if (!ids.length) return { ...executeChangeSetCommand({ repository, unitOfWork }, { ...actor, actorType: "github" }, { id: randomUUID(), projectId: map.projectId, title: "Pull Story Map GitHub links.", source: "github", operations: [], createdAt: new Date().toISOString() }, { ...(input.apply === undefined ? {} : { apply: input.apply }), initiatingActor: actor }), items: [] };
  const contexts = ids.map((id) => {
    try { return beginGitHubPreparation({ repository, unitOfWork }, actor, input.storyMapId, id); }
    catch (error) { throw incomingFailure(error, sources, sources.findIndex((row) => row.connectionId === id)); }
  });
  const operations = [];
  const prepared: IncomingItem[] = [];
  const pendingReleases = { metadata: new Map<string, string>(), releases: new Map(repository.listExternalRefsForStoryMap(input.storyMapId).filter((ref) => isWorkItemProvider(ref.system) && ref.entityType === "release").map((ref) => [ref.externalId, ref.entityId])) };
  for (const [index, context] of contexts.entries()) {
    try {
      const items = await prepareIncomingItems(context, { storyMapId: input.storyMapId, connectionId: context.connection.id });
      for (const captured of contexts) revalidateGitHubPreparation(captured);
      operations.push(...incomingOperations(context, items, false, pendingReleases));
      prepared.push(...items);
    } catch (error) {
      const domain = asDomainError(error);
      const currentSources = sources.filter((link) => link.connectionId === context.connection.id);
      const reported = syncItemResultSchema.array().parse(incomingFailure(domain, currentSources).details!.items);
      const remaining = sources.filter((link) => contexts.slice(index + 1).some((pending) => pending.connection.id === link.connectionId));
      throw new DomainError(domain.code, domain.message, { ...domain.details, items: [...prepared.map(({ card, link }) => ({ status: "not_attempted", cardId: card.id, remoteId: link.remoteId, url: link.url, message: "Prepared item was not applied because preparation failed." })), ...reported, ...remaining.map((link) => ({ status: "not_attempted", cardId: link.cardId!, remoteId: link.remoteId, url: link.url, message: "An earlier preparation failed." }))] });
    }
  }
  return githubIncomingCommand(contexts[0]!, operations, "Pull Story Map GitHub links.", input.apply, (outcome) => incomingResults(prepared, outcome));
}
