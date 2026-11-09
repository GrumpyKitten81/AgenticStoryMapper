import type { ActorContext, CapabilityDescriptor, ConfirmRemotePushRequest, RemotePushPlanResponse } from "@storymapper/contracts";
import { DomainError } from "@storymapper/contracts";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireActor } from "@storymapper/server/application/actors";
import { executeRemotePush, readRemotePush } from "@storymapper/server/services/remote-push-execution";

export const getRemotePushPlanDescriptor: CapabilityDescriptor = { name: "getRemotePushPlan", kind: "read", route: "GET /api/sync/work-items/plans/:planId" };
export function getRemotePushPlan(deps: ApplicationDeps, actor: ActorContext, planId: string): RemotePushPlanResponse {
  requireActor(actor);
  return readRemotePush(deps.repository, actor, planId);
}

export const confirmRemotePushPlanDescriptor: CapabilityDescriptor = { name: "confirmRemotePushPlan", kind: "human-only", route: "POST /api/sync/work-items/confirm" };
export function confirmRemotePushPlan(deps: ApplicationDeps, actor: ActorContext, input: ConfirmRemotePushRequest): Promise<RemotePushPlanResponse> {
  requireHuman(actor);
  return executeRemotePush(deps.repository, deps.unitOfWork, actor, input.planId, false, deps.localOrigin, input.reviewOverride);
}

export const resumeRemotePushPlanDescriptor: CapabilityDescriptor = { name: "resumeRemotePushPlan", kind: "human-only", route: "POST /api/sync/work-items/resume" };
export function resumeRemotePushPlan(deps: ApplicationDeps, actor: ActorContext, input: ConfirmRemotePushRequest): Promise<RemotePushPlanResponse> {
  requireHuman(actor);
  return executeRemotePush(deps.repository, deps.unitOfWork, actor, input.planId, true, deps.localOrigin, input.reviewOverride);
}

function requireHuman(actor: ActorContext): void {
  requireActor(actor);
  if (actor.actorType !== "human") throw new DomainError("protected", "Remote push confirmation and resume are human-only.");
}
