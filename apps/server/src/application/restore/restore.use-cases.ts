import { restoreActivityResponseSchema, restorePointCapabilities, type ActorContext, type CapabilityDescriptor, type CreateRestorePointResponse, type ListRestorePointsResponse, type RestoreActivityResponse, type RestorePointCapabilitiesResponse, type RestorePointClass, type RestoreProjectResult } from "@storymapper/contracts";
import { createRestorePoint as publishPoint, listRestorePoints as readPoints, restoreProject as restoreDatabase } from "@storymapper/db";
import { requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity } from "@storymapper/server/application/validation";

function requireProject(deps: ApplicationDeps, actor: ActorContext, projectId: string): void {
  requireHumanActor(actor);
  requireEntity(deps.repository.listProjects().find((project) => project.id === projectId), "Project");
}

export const getRestorePointCapabilitiesDescriptor: CapabilityDescriptor = { name: "getRestorePointCapabilities", kind: "human-only", route: "GET /api/human/restore-point-capabilities" };
export function getRestorePointCapabilities(_deps: ApplicationDeps, actor: ActorContext): RestorePointCapabilitiesResponse {
  requireHumanActor(actor);
  return { capabilities: restorePointCapabilities };
}

export const readRestoreActivityDescriptor: CapabilityDescriptor = { name: "readRestoreActivity", kind: "human-only", route: "GET /api/human/projects/:projectId/restore-activity" };
export function readRestoreActivity(deps: ApplicationDeps, actor: ActorContext, projectId: string): RestoreActivityResponse {
  requireHumanActor(actor);
  return restoreActivityResponseSchema.parse({
    activityEvents: deps.repository.listActivity(projectId)
      .filter((event) => event.action === "project.restored")
      .map(({ id, action, undoneByRestore, after }) => ({ id, action, undoneByRestore, after }))
  });
}

export const listRestorePointsDescriptor: CapabilityDescriptor = { name: "listRestorePoints", kind: "human-only", route: "GET /api/human/projects/:projectId/restore-points" };
export function listRestorePoints(deps: ApplicationDeps, actor: ActorContext, projectId: string): ListRestorePointsResponse {
  requireProject(deps, actor, projectId);
  return { restorePoints: readPoints(deps.unitOfWork.handle) };
}

export const createRestorePointDescriptor: CapabilityDescriptor = { name: "createRestorePoint", kind: "human-only", route: "POST /api/human/projects/:projectId/restore-points" };
export function createRestorePoint(deps: ApplicationDeps, actor: ActorContext, projectId: string, pointClass: RestorePointClass): CreateRestorePointResponse {
  requireProject(deps, actor, projectId);
  return { restorePoint: publishPoint(deps.unitOfWork.handle, pointClass) };
}

export const restoreProjectDescriptor: CapabilityDescriptor = { name: "restoreProject", kind: "human-only", route: "POST /api/human/projects/:projectId/restore" };
export function restoreProject(deps: ApplicationDeps, actor: ActorContext, projectId: string, fileName: string): Promise<RestoreProjectResult> {
  requireProject(deps, actor, projectId);
  return restoreDatabase(deps.unitOfWork.handle, projectId, fileName, actor);
}
