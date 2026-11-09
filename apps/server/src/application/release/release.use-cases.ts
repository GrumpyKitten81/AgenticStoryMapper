import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type CreateReleaseRequest,
  type DeletedRootResponse,
  type ReleaseDetailsResponse,
  type ReleaseResponse,
  releaseNotesRequestSchema,
  type ReleaseNotesRequest,
  type ReleaseNotesResponse,
  type UpdateReleaseCommand
} from "@storymapper/contracts";
import { requireActor, requireAgentToolAccess } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { getReleaseSummaryReport, getReleaseTimelineReport } from "@storymapper/server/application/report/report.use-cases";
import { requirePatch } from "@storymapper/server/application/validation";

import { buildReleaseNotes } from "@storymapper/core";

export const getReleaseDetailsDescriptor: CapabilityDescriptor = {
  name: "getReleaseDetails",
  kind: "read",
  tool: "GetStoryMapReleaseDetails"
};

export function getReleaseDetails(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, releaseId?: string): ReleaseDetailsResponse {
  requireActor(actor);
  const releases = deps.repository.listReleases(storyMapId);
  const release = releaseId ? releases.find((candidate) => candidate.id === releaseId) : undefined;
  if (releaseId && !release) throw new DomainError("not_found", "Release not found.");
  return {
    releases: release ? [release] : releases,
    summary: releaseId ? getReleaseSummaryReport(deps, actor, storyMapId, releaseId) : undefined,
    timeline: getReleaseTimelineReport(deps, actor, storyMapId)
  };
}

export const createReleaseDescriptor: CapabilityDescriptor = {
  name: "createRelease",
  kind: "write",
  tool: "CreateStoryMapRelease",
  route: "POST /api/releases"
};

export function createRelease<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateReleaseRequest): DomainCommandResponse<A, ReleaseResponse>;
export function createRelease(deps: ApplicationDeps, actor: ActorContext, body: CreateReleaseRequest): ReleaseResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "storyMap", input.storyMapId).projectId, "createRelease", [domainOperation("release", "create", undefined, input)], apply)!;
  const release = deps.unitOfWork.run(actor, ({ repository }) => repository.createRelease(input));
  return { release };
}

export const updateReleaseDescriptor: CapabilityDescriptor = {
  name: "updateRelease",
  kind: "write",
  tool: "UpdateStoryMapRelease",
  route: "PATCH /api/releases/:releaseId"
};

export function updateRelease<A extends ActorContext>(deps: ApplicationDeps, actor: A, releaseId: string, command: UpdateReleaseCommand): DomainCommandResponse<A, ReleaseResponse>;
export function updateRelease(deps: ApplicationDeps, actor: ActorContext, releaseId: string, command: UpdateReleaseCommand): ReleaseResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  const { baseVersion, ...patch } = input;
  requirePatch(patch);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "release", releaseId).projectId, "updateRelease", [domainOperation("release", "update", releaseId, patch, baseVersion)], apply)!;
  const release = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "release", id: releaseId, baseVersion }], [domainOperation("release", "update", releaseId, patch, baseVersion)]);
    return repository.updateRelease(releaseId, patch);
  });
  if (!release) throw new DomainError("not_found", "Release not found.");
  return { release };
}

export const deleteReleaseDescriptor: CapabilityDescriptor = {
  name: "deleteRelease",
  kind: "write",
  route: "POST /api/releases/:releaseId/delete", tool: "DeleteRelease" };

export function deleteRelease<A extends ActorContext>(deps: ApplicationDeps, actor: A, releaseId: string, baseVersion: number, apply?: boolean): DomainCommandResponse<A, DeletedRootResponse>;
export function deleteRelease(deps: ApplicationDeps, actor: ActorContext, releaseId: string, baseVersion: number, apply?: boolean): DeletedRootResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "release", releaseId).projectId, "deleteRelease", [domainOperation("release", "delete", releaseId, {}, baseVersion)], apply)!;
  const deleted = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "release", id: releaseId, baseVersion }], [domainOperation("release", "delete", releaseId, {}, baseVersion)]);
    return repository.deleteRelease(releaseId);
  });
  if (!deleted) throw new DomainError("not_found", "Release not found.");
  return { ok: true as const, version: baseVersion + 1 };
}

export const getReleaseNotesDescriptor: CapabilityDescriptor = {
  name: "getReleaseNotes", kind: "read", tool: "GetReleaseNotes",
  route: "GET /api/story-maps/:storyMapId/releases/:releaseId/notes"
};

export function getReleaseNotes(deps: ApplicationDeps, actor: ActorContext, request: ReleaseNotesRequest): ReleaseNotesResponse {
  const input = releaseNotesRequestSchema.parse(request);
  requireAgentToolAccess(deps.repository, actor, "GetReleaseNotes", input);
  const snapshot = deps.repository.getStoryMapSnapshot(input.storyMapId);
  if (!snapshot) throw new DomainError("not_found", "Story map not found.");
  const release = snapshot.releases.find((row) => row.id === input.releaseId);
  if (!release) throw new DomainError("not_found", "Release not found in the supplied Story Map.");
  return { markdown: buildReleaseNotes({ release, cards: snapshot.cards, remoteWorkItemLinks: snapshot.remoteWorkItemLinks, workflowStatuses: snapshot.workflowStatuses }) };
}
