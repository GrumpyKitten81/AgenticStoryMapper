import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type CreateStoryMapRequest,
  type DeleteStoryMapParams,
  type DeleteStoryMapResponse,
  type ListStoryMapsResponse,
  type StoryMap,
  type StoryMapDataResponse,
  type StoryMapResponse,
  type StoryMapSnapshot,
  type UpdateStoryMapCommand
} from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { visibleSnapshotSources } from "@storymapper/server/application/story-map/snapshot-source-visibility";
import { getBacklogHealthReport, getSourceCoverageReport } from "@storymapper/server/application/report/report.use-cases";
import { requirePatch } from "@storymapper/server/application/validation";

export const listStoryMapsDescriptor: CapabilityDescriptor = {
  name: "listStoryMaps",
  kind: "read",
  tool: "ListStoryMaps",
  route: "GET /api/story-maps"
};

export function listStoryMaps(deps: ApplicationDeps, actor: ActorContext, projectId?: string): ListStoryMapsResponse {
  requireActor(actor);
  return { storyMaps: deps.repository.listStoryMaps(projectId) };
}

export const getStoryMapSnapshotDescriptor: CapabilityDescriptor = {
  name: "getStoryMapSnapshot",
  kind: "read",
  route: "GET /api/story-maps/:storyMapId", tool: "GetStoryMapSnapshot" };

export function getStoryMapSnapshot(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): StoryMapSnapshot {
  requireActor(actor);
  const snapshot = deps.repository.getStoryMapSnapshot(storyMapId);
  if (!snapshot) throw new DomainError("not_found", "Story map not found.");
  return visibleSnapshotSources(deps.repository, actor, snapshot);
}

export const getStoryMapDataDescriptor: CapabilityDescriptor = {
  name: "getStoryMapData",
  kind: "read",
  tool: "GetStoryMapData"
};

export function getStoryMapData(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): StoryMapDataResponse {
  requireActor(actor);
  const snapshot = getStoryMapSnapshot(deps, actor, storyMapId);
  return {
    ...snapshot,
    backlogHealth: getBacklogHealthReport(deps, actor, storyMapId),
    sourceCoverage: getSourceCoverageReport(deps, actor, snapshot.storyMap.projectId)
  };
}

export const createStoryMapDescriptor: CapabilityDescriptor = {
  name: "createStoryMap",
  kind: "write",
  route: "POST /api/story-maps", tool: "CreateStoryMap" };

export function createStoryMap<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateStoryMapRequest): DomainCommandResponse<A, StoryMap>;
export function createStoryMap(deps: ApplicationDeps, actor: ActorContext, body: CreateStoryMapRequest): StoryMap | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, input.projectId, "createStoryMap", [domainOperation("storyMap", "create", undefined, input)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createStoryMap(input));
}

export const updateStoryMapDescriptor: CapabilityDescriptor = {
  name: "updateStoryMap",
  kind: "write",
  route: "PATCH /api/story-maps/:storyMapId", tool: "UpdateStoryMap" };

export function updateStoryMap<A extends ActorContext>(deps: ApplicationDeps, actor: A, storyMapId: string, command: UpdateStoryMapCommand): DomainCommandResponse<A, StoryMapResponse>;
export function updateStoryMap(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, command: UpdateStoryMapCommand): StoryMapResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  const { baseVersion, ...patch } = input;
  requirePatch(patch);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "storyMap", storyMapId).projectId, "updateStoryMap", [domainOperation("storyMap", "update", storyMapId, patch, baseVersion)], apply)!;
  const storyMap = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "storyMap", id: storyMapId, baseVersion }]);
    return repository.updateStoryMap(storyMapId, patch);
  });
  if (!storyMap) throw new DomainError("not_found", "Story map not found.");
  return { storyMap };
}

export const deleteStoryMapDescriptor: CapabilityDescriptor = {
  name: "deleteStoryMap",
  kind: "write",
  route: "DELETE /api/story-maps/:storyMapId", tool: "DeleteStoryMap" };

export function deleteStoryMap<A extends ActorContext>(deps: ApplicationDeps, actor: A, params: DeleteStoryMapParams, apply?: boolean): DomainCommandResponse<A, DeleteStoryMapResponse>;
export function deleteStoryMap(deps: ApplicationDeps, actor: ActorContext, params: DeleteStoryMapParams, apply?: boolean): DeleteStoryMapResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "storyMap", params.storyMapId).projectId, "deleteStoryMap", [domainOperation("storyMap", "delete", params.storyMapId, {}, params.baseVersion)], apply);
  const deleted = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "storyMap", id: params.storyMapId, baseVersion: params.baseVersion }]);
    return repository.deleteStoryMap(params.storyMapId);
  });
  if (!deleted) throw new DomainError("not_found", "Story map not found.");
  return { deleted: true as const, version: params.baseVersion + 1 };
}
