import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { agentProtected } from "@storymapper/core";
import { remoteWorkItemSyncStateSchema } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import { DomainError, type ActorContext, type ChangeOperation, type ChangeSetCommandResponse, type ResolveSyncConflictRequest } from "@storymapper/contracts";
import { createWorkItemProvider, requireRemoteItem } from "@storymapper/github";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { beginGitHubPreparation, githubCommand, proposeRemotePush, revalidateGitHubPreparation } from "@storymapper/server/application/sync/github-command";
import { incomingOperations } from "@storymapper/server/application/sync/github-pull-command";
import { requireEntity } from "@storymapper/server/application/validation";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { assertReviewedConflict, conflictWritePayload, prepareConflictResolution, revalidateConflictResolution } from "@storymapper/server/services/sync-conflict-resolution";
import { changedFieldsForRemote } from "@storymapper/server/services/sync-merge";

export async function resolveGitHubConflictCommand(deps: ApplicationDeps, actor: ActorContext, conflictId: string, input: ResolveSyncConflictRequest): Promise<ChangeSetCommandResponse> {
  actor = Object.freeze({ ...actor });
  input = structuredClone(input);
  const resolution = prepareConflictResolution(deps.repository, deps.unitOfWork, conflictId, input);
  const context = beginGitHubPreparation(deps, actor, input.storyMapId, resolution.connection.id);
  if (input.resolution === "local" && agentProtected(deps.repository.getSafetySettings(resolution.connection.projectId))) throw new DomainError("protected", "Project is protected from agent remote writes.");
  const auth = await resolveProviderAuth(resolution.connection);
  revalidateGitHubPreparation(context);
  if (input.resolution === "local" && agentProtected(deps.repository.getSafetySettings(resolution.connection.projectId))) throw new DomainError("protected", "Project is protected from agent remote writes.");
  revalidateConflictResolution(deps.repository, deps.unitOfWork, resolution, actor);
  const remote = requireRemoteItem(await createWorkItemProvider(resolution.connection.provider).getRemoteItem(auth.connection, auth.auth, resolution.link.remoteId));
  revalidateGitHubPreparation(context);
  if (input.resolution === "local" && agentProtected(deps.repository.getSafetySettings(resolution.connection.projectId))) throw new DomainError("protected", "Project is protected from agent remote writes.");
  revalidateConflictResolution(deps.repository, deps.unitOfWork, resolution, actor);
  assertReviewedConflict(deps.repository, resolution, input.reviewed, remote);
  if (resolution.conflict.field === "parent" && input.resolution === "remote") {
    const number = remote.parentEvidence?.number ?? null;
    const links = deps.repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId);
    const parent = number === null ? undefined : links.find((link) => link.connectionId === resolution.connection.id && link.remoteNumber === number && link.cardId);
    if (number !== null && !parent?.cardId) throw new DomainError("conflict", "Remote parent has no Card binding in this connection.");
    const snapshot = requireEntity(deps.repository.getStoryMapSnapshot(input.storyMapId), "Story map");
    const position = snapshot.cards.filter((card) => card.parentId === (parent?.cardId ?? null) && card.id !== resolution.card.id).length;
    const operations: ChangeOperation[] = [
      { operationId: randomUUID(), entityId: resolution.card.id, op: "move", entity: "card", before: resolution.card, baseVersion: resolution.card.version, after: { parentId: parent?.cardId ?? null, position } },
      { operationId: randomUUID(), entityId: resolution.link.id, op: "set", entity: "remoteWorkItemLink", before: resolution.link, connectionBefore: resolution.connection, baseVersion: resolution.card.version, after: remoteWorkItemSyncStateSchema.omit({ id: true }).parse({ ...resolution.link, ...(resolution.link.baseline ? { baseline: { ...resolution.link.baseline, parentKnown: true } } : {}), remoteParentNumber: number, parentOverrideLocal: false, syncState: deps.repository.listOpenSyncConflicts(input.storyMapId).some((entry) => entry.id !== conflictId && entry.externalRefId === resolution.link.externalRefId) ? "conflict" : "unsynced" }) },
      { operationId: randomUUID(), entityId: conflictId, op: "resolve", entity: "syncConflict", before: resolution.conflict, after: { resolution: "remote", reviewed: input.reviewed } }
    ];
    return githubCommand(context, operations, "Resolve GitHub parent conflict with reviewed remote value.", false);
  }
  if (input.resolution === "local") {
    const remotePush = await prepareRemotePush(deps.repository, deps.unitOfWork, actor, { storyMapId: input.storyMapId, connectionId: resolution.connection.id, cardIds: [resolution.card.id], conflictId, reviewed: input.reviewed, mode: "push", localOrigin: deps.localOrigin?.() });
    return { ...proposeRemotePush(context, { storyMapId: input.storyMapId, connectionId: resolution.connection.id, provider: resolution.connection.provider, mode: "push", items: resolution.conflict.field === "parent" ? [] : [conflictWritePayload(resolution, remote, deps.localOrigin?.())] }), remotePush };
  }
  const fields = changedFieldsForRemote(deps.repository, resolution.connection, resolution.card, resolution.link, remote);
  const remaining = Object.entries(fields).filter(([field]) => field !== "status" && field !== resolution.conflict.field).map(([, delta]) => delta);
  const otherOpen = deps.repository.listOpenSyncConflicts(input.storyMapId).some((entry) => entry.id !== conflictId && entry.cardId === resolution.card.id && entry.connectionId === resolution.connection.id && entry.remoteId === resolution.link.remoteId);
  const syncState = otherOpen ? "conflict" : resolution.link.parentOverrideLocal || remaining.some((field) => field.local) ? "unsynced" : remaining.some((field) => field.remote) ? "stale" : "synced";
  for (const field of Object.keys(fields) as Array<keyof typeof fields>) { fields[field].remote = field === "status" || field === resolution.conflict.field; fields[field].local = field !== "status" && field !== resolution.conflict.field; }
  const operations: ChangeOperation[] = [...incomingOperations(context, [{ card: resolution.card, link: resolution.link, remote, fields }], true), { operationId: randomUUID(), entityId: conflictId, op: "resolve", entity: "syncConflict", before: resolution.conflict, after: { resolution: "remote", reviewed: input.reviewed } }];
  for (const operation of operations) if (operation.entity === "remoteWorkItemLink") operation.after.syncState = syncState;
  return githubCommand(context, operations, "Resolve GitHub conflict with reviewed remote value.", input.apply);
}
