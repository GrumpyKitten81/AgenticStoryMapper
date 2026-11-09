import { type ChangeSetCommandResponse, type ActorContext, type CapabilityDescriptor, type ResolveSyncConflictRequest, type RemotePushPlanResponse, type ResolveSyncConflictResponse } from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { prepareConflictResolution, revalidateConflictResolution } from "@storymapper/server/services/sync-conflict-resolution";

import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { resolveGitHubConflictCommand } from "@storymapper/server/application/sync/github-conflict-command";

export const resolveSyncConflictDescriptor: CapabilityDescriptor = { name: "resolveSyncConflict", tool: "ResolveSyncConflict", kind: "write", route: "POST /api/sync/conflicts/:conflictId/resolve" };
export async function resolveSyncConflict(deps: ApplicationDeps, actor: ActorContext, conflictId: string, input: ResolveSyncConflictRequest): Promise<ResolveSyncConflictResponse | RemotePushPlanResponse | ChangeSetCommandResponse> {
  requireActor(actor);
  actor = Object.freeze({ ...actor });
  input = structuredClone(input);
  if (actor.actorType !== "human") return resolveGitHubConflictCommand(deps, actor, conflictId, input);
  const { repository, unitOfWork } = deps;
  const context = prepareConflictResolution(repository, unitOfWork, conflictId, input);
  revalidateConflictResolution(repository, unitOfWork, context, actor);
  if (input.resolution === "local") return prepareRemotePush(repository, unitOfWork, actor, { storyMapId: input.storyMapId, connectionId: context.connection.id, cardIds: [context.card.id], conflictId, reviewed: input.reviewed, mode: "push", localOrigin: deps.localOrigin?.() });
  return resolveGitHubConflictCommand(deps, actor, conflictId, input);
}
