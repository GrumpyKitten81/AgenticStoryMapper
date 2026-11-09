import { uuidSchema, type ActorContext, type CapabilityDescriptor, type PlanState, type PlanStateComparison, type PlanStateSummary, type SlicesReport } from "@storymapper/contracts";
import { buildSlicesReport, comparePlanStates as compareStates } from "@storymapper/core";
import { requireAgentToolAccess, requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity } from "@storymapper/server/application/validation";

export const capturePlanStateDescriptor: CapabilityDescriptor = { name: "capturePlanState", kind: "human-only", route: "POST /api/story-maps/:storyMapId/plan-states" };
export function capturePlanState(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): { state: PlanState } {
  requireHumanActor(actor);
  uuidSchema.parse(storyMapId);
  return { state: deps.unitOfWork.run(actor, ({ repository }) => repository.capturePlanState(storyMapId)) };
}
export const listPlanStatesDescriptor: CapabilityDescriptor = { name: "listPlanStates", kind: "read", route: "GET /api/story-maps/:storyMapId/plan-states", tool: "ListPlanStates" };
export function listPlanStates(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): { states: PlanStateSummary[] } {
  uuidSchema.parse(storyMapId);
  requireAgentToolAccess(deps.repository, actor, "ListPlanStates", { storyMapId });
  return { states: deps.repository.listPlanStates(storyMapId) };
}
export const getPlanStateDescriptor: CapabilityDescriptor = { name: "getPlanState", kind: "read", route: "GET /api/story-maps/:storyMapId/plan-states/:stateId", tool: "GetPlanState" };
export function getPlanState(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, stateId: string): { state: PlanState } {
  uuidSchema.parse(storyMapId); uuidSchema.parse(stateId);
  requireAgentToolAccess(deps.repository, actor, "GetPlanState", { storyMapId, stateId });
  return { state: deps.repository.getPlanState(storyMapId, stateId) };
}
export const comparePlanStatesDescriptor: CapabilityDescriptor = { name: "comparePlanStates", kind: "read", route: "GET /api/story-maps/:storyMapId/plan-states/compare", tool: "ComparePlanStates" };
export function comparePlanStates(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, beforeId: string, afterId: string): PlanStateComparison {
  requireAgentToolAccess(deps.repository, actor, "ComparePlanStates", { storyMapId });
  return compareStates(getPlanState(deps, actor, storyMapId, beforeId).state, getPlanState(deps, actor, storyMapId, afterId).state);
}
export const getSlicesReportDescriptor: CapabilityDescriptor = { name: "getSlicesReport", kind: "read", route: "GET /api/story-maps/:storyMapId/slices", tool: "GetSlicesReport" };
export function getSlicesReport(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): SlicesReport {
  uuidSchema.parse(storyMapId);
  requireAgentToolAccess(deps.repository, actor, "GetSlicesReport", { storyMapId });
  return buildSlicesReport(requireEntity(deps.repository.getStoryMapSnapshot(storyMapId), "Story Map"));
}
