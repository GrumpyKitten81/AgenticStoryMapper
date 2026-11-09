import { DomainError, projectArchiveCapabilities, type ActorContext, type CapabilityDescriptor, type ImportProjectArchiveResponse, type ProjectArchiveCapabilitiesResponse, type ProjectArchiveExport, type StoryMapExportFormat, type TextExportFile } from "@storymapper/contracts";
import { buildStoryMapExport, buildAuditExport } from "@storymapper/core";
import { requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { visibleSnapshotSources } from "@storymapper/server/application/story-map/snapshot-source-visibility";
import { requireEntity } from "@storymapper/server/application/validation";
import { exportProjectArchive as buildArchive, importProjectArchive as openArchive } from "@storymapper/server/services/project-archive";

export const exportStoryMapDescriptor: CapabilityDescriptor = { name: "exportStoryMap", kind: "write", route: "GET /api/exports/story-map", tool: "ExportStoryMap" };
export function exportStoryMap(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, format: StoryMapExportFormat): TextExportFile {
  return deps.unitOfWork.run(actor, ({ repository }) => {
    const snapshot = visibleSnapshotSources(repository, actor, requireEntity(repository.getStoryMapSnapshot(storyMapId), "Story map"));
    const file = buildStoryMapExport(snapshot, format, new Date().toISOString());
    repository.logActivity(snapshot.storyMap.projectId, "exports.storyMapCreated", "storyMap", storyMapId, undefined, { storyMapId, format });
    repository.markExportCompleted([snapshot.storyMap.projectId]);
    return file;
  });
}

export const exportAuditDescriptor: CapabilityDescriptor = { name: "exportAudit", kind: "write", route: "GET /api/exports/audit", tool: "ExportAudit" };
export function exportAudit(deps: ApplicationDeps, actor: ActorContext, projectId: string, format: "json" | "markdown"): TextExportFile {
  return deps.unitOfWork.run(actor, ({ repository }) => {
    const project = requireEntity(repository.listProjects().find((candidate) => candidate.id === projectId), "Project");
    const settings = repository.getSafetySettings(projectId);
    repository.logActivity(projectId, "exports.auditCreated", "activity", projectId, undefined, { projectId, format, eventCount: repository.listAuditExportActivity(projectId, actor.actorType === "human").length });
    const file = buildAuditExport(project, settings, repository.listAuditExportActivity(projectId, actor.actorType === "human"), format, new Date().toISOString());
    repository.markExportCompleted([projectId]);
    return file;
  });
}

export const getProjectArchiveCapabilitiesDescriptor: CapabilityDescriptor = { name: "getProjectArchiveCapabilities", kind: "human-only", route: "GET /api/human/project-archive-capabilities" };
export function getProjectArchiveCapabilities(_deps: ApplicationDeps, actor: ActorContext): ProjectArchiveCapabilitiesResponse {
  requireHumanActor(actor);
  return { capabilities: projectArchiveCapabilities };
}

export const exportProjectArchiveDescriptor: CapabilityDescriptor = { name: "exportProjectArchive", kind: "human-only", route: "GET /api/projects/export" };
export async function exportProjectArchive(deps: ApplicationDeps, actor: ActorContext, projectId: string): Promise<ProjectArchiveExport> {
  requireHumanActor(actor);
  requireEntity(deps.repository.listProjects().find((project) => project.id === projectId), "Project");
  const database = deps.unitOfWork.handle.current;
  const archive = await buildArchive(deps.unitOfWork.handle, projectId);
  if (deps.unitOfWork.handle.current !== database) throw new DomainError("conflict", "Database changed during Project archive export.");
  deps.unitOfWork.run(actor, ({ repository }) => repository.markExportCompleted([projectId]));
  return archive;
}

export const importProjectArchiveDescriptor: CapabilityDescriptor = { name: "importProjectArchive", kind: "human-only", route: "POST /api/projects/import" };
export function importProjectArchive(deps: ApplicationDeps, actor: ActorContext, content: Buffer): Promise<ImportProjectArchiveResponse> {
  requireHumanActor(actor);
  return openArchive(content, deps.unitOfWork.handle, actor);
}
