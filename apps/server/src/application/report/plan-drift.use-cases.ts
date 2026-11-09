import { DomainError, uuidSchema, type ActorContext, type CapabilityDescriptor, type PlanDriftReport } from "@storymapper/contracts";
import { buildPlanDriftReportFromValidatedBaseline } from "@storymapper/core";
import { requireAgentToolAccess } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity } from "@storymapper/server/application/validation";

export const listPlanDriftSystemsDescriptor: CapabilityDescriptor = { name: "listPlanDriftSystems", kind: "read", route: "GET /api/story-maps/:storyMapId/plan-drift/systems", tool: "ListPlanDriftSystems" };
export function listPlanDriftSystems(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): { systems: string[] } {
  uuidSchema.parse(storyMapId);
  requireAgentToolAccess(deps.repository, actor, "ListPlanDriftSystems", { storyMapId });
  requireEntity(deps.repository.listStoryMaps().find((map) => map.id === storyMapId), "Story Map");
  return { systems: sourceSystems(deps, storyMapId) };
}

export const getPlanDriftReportDescriptor: CapabilityDescriptor = { name: "getPlanDriftReport", kind: "read", route: "GET /api/story-maps/:storyMapId/plan-drift", tool: "GetPlanDriftReport" };
export function getPlanDriftReport(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, system: string): PlanDriftReport {
  uuidSchema.parse(storyMapId);
  requireAgentToolAccess(deps.repository, actor, "GetPlanDriftReport", { storyMapId });
  const baseline = deps.repository.getSourcePlanBaseline(storyMapId, system);
  if (!baseline) {
    const systems = sourceSystems(deps, storyMapId);
    if (!systems.includes(system)) throw new DomainError("not_found", `Unknown source system. Available systems: ${systems.join(", ") || "none"}.`, { systems });
    throw new DomainError("conflict", "Source system has no durable synchronization baseline.", { systems });
  }
  return buildPlanDriftReportFromValidatedBaseline(baseline, deps.repository.getPlanStateProjection(storyMapId), deps.repository.listExternalRefsForStoryMap(storyMapId));
}

function sourceSystems(deps: ApplicationDeps, storyMapId: string): string[] {
  return [...new Set([...deps.repository.listExternalRefsForStoryMap(storyMapId).map((ref) => ref.system), ...deps.repository.listSourcePlanSystems(storyMapId)])].sort();
}
