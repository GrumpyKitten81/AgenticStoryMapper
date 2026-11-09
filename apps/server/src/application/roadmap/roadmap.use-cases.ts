import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import { buildRoadmapDetails } from "@storymapper/core";
import {
  type ActorContext,
  type CapabilityDescriptor,
  type CreateRoadmapCardRequest,
  type CreateRoadmapColumnRequest,
  type CreateRoadmapReferenceRequest,
  type CreateRoadmapRequest,
  type CreateRoadmapSwimlaneRequest,
  type ListRoadmapsResponse,
  type Roadmap,
  type RoadmapCard,
  type RoadmapColumn,
  type RoadmapDetails,
  type RoadmapReference,
  type RoadmapSwimlane,
  type UpdateRoadmapCommand
} from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity, requirePatch } from "@storymapper/server/application/validation";

export const listRoadmapsDescriptor: CapabilityDescriptor = { name: "listRoadmaps", kind: "read", route: "GET /api/roadmaps", tool: "ListRoadmaps" };
export function listRoadmaps(deps: ApplicationDeps, actor: ActorContext, projectId: string, storyMapId?: string): ListRoadmapsResponse {
  requireActor(actor);
  return { roadmaps: deps.repository.listRoadmaps(projectId, storyMapId) };
}

export const createRoadmapDescriptor: CapabilityDescriptor = { name: "createRoadmap", kind: "write", route: "POST /api/roadmaps", tool: "CreateRoadmap" };
export function createRoadmap<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateRoadmapRequest): DomainCommandResponse<A, Roadmap>;
export function createRoadmap(deps: ApplicationDeps, actor: ActorContext, body: CreateRoadmapRequest): Roadmap | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, input.projectId, "createRoadmap", [domainOperation("roadmap", "create", undefined, input)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createRoadmap(input));
}

export const getRoadmapDetailsDescriptor: CapabilityDescriptor = { name: "getRoadmapDetails", kind: "read", route: "GET /api/roadmaps/:roadmapId", tool: "GetRoadmapDetails" };
export function getRoadmapDetails(deps: ApplicationDeps, actor: ActorContext, roadmapId: string): RoadmapDetails {
  requireActor(actor);
  return requireEntity(buildRoadmapDetails(deps.repository.getRoadmapDetailsData(roadmapId)), "Roadmap");
}

export const updateRoadmapDescriptor: CapabilityDescriptor = { name: "updateRoadmap", kind: "write", route: "PATCH /api/roadmaps/:roadmapId", tool: "UpdateRoadmap" };
export function updateRoadmap<A extends ActorContext>(deps: ApplicationDeps, actor: A, roadmapId: string, command: UpdateRoadmapCommand): DomainCommandResponse<A, Roadmap>;
export function updateRoadmap(deps: ApplicationDeps, actor: ActorContext, roadmapId: string, command: UpdateRoadmapCommand): Roadmap | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  const { baseVersion, ...patch } = input;
  requirePatch(patch);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "roadmap", roadmapId).projectId, "updateRoadmap", [domainOperation("roadmap", "update", roadmapId, patch, baseVersion)], apply)!;
  return requireEntity(deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "roadmap", id: roadmapId, baseVersion }]);
    return repository.updateRoadmap(roadmapId, patch);
  }), "Roadmap");
}

export const createRoadmapColumnDescriptor: CapabilityDescriptor = { name: "createRoadmapColumn", kind: "write", route: "POST /api/roadmap-columns", tool: "CreateRoadmapColumn" };
export function createRoadmapColumn<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateRoadmapColumnRequest): DomainCommandResponse<A, RoadmapColumn>;
export function createRoadmapColumn(deps: ApplicationDeps, actor: ActorContext, body: CreateRoadmapColumnRequest): RoadmapColumn | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "roadmap", input.roadmapId).projectId, "createRoadmapColumn", [domainOperation("roadmapColumn", "create", undefined, input, domainRoot(deps, "roadmap", input.roadmapId).version)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createRoadmapColumn(input));
}

export const createRoadmapSwimlaneDescriptor: CapabilityDescriptor = { name: "createRoadmapSwimlane", kind: "write", route: "POST /api/roadmap-swimlanes", tool: "CreateRoadmapSwimlane" };
export function createRoadmapSwimlane<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateRoadmapSwimlaneRequest): DomainCommandResponse<A, RoadmapSwimlane>;
export function createRoadmapSwimlane(deps: ApplicationDeps, actor: ActorContext, body: CreateRoadmapSwimlaneRequest): RoadmapSwimlane | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "roadmap", input.roadmapId).projectId, "createRoadmapSwimlane", [domainOperation("roadmapSwimlane", "create", undefined, input, domainRoot(deps, "roadmap", input.roadmapId).version)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createRoadmapSwimlane(input));
}

export const createRoadmapCardDescriptor: CapabilityDescriptor = { name: "createRoadmapCard", kind: "write", route: "POST /api/roadmap-cards", tool: "CreateRoadmapCard" };
export function createRoadmapCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateRoadmapCardRequest): DomainCommandResponse<A, RoadmapCard>;
export function createRoadmapCard(deps: ApplicationDeps, actor: ActorContext, body: CreateRoadmapCardRequest): RoadmapCard | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "roadmap", input.roadmapId).projectId, "createRoadmapCard", [domainOperation("roadmapCard", "create", undefined, input, domainRoot(deps, "roadmap", input.roadmapId).version)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createRoadmapCard(input));
}

export const createRoadmapReferenceDescriptor: CapabilityDescriptor = { name: "createRoadmapReference", kind: "write", route: "POST /api/roadmap-references", tool: "CreateRoadmapReference" };
export function createRoadmapReference<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateRoadmapReferenceRequest): DomainCommandResponse<A, RoadmapReference>;
export function createRoadmapReference(deps: ApplicationDeps, actor: ActorContext, body: CreateRoadmapReferenceRequest): RoadmapReference | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "roadmap", requireEntity(deps.repository.getRoadmapCard(input.roadmapCardId), "Roadmap card").roadmapId).projectId, "createRoadmapReference", [domainOperation("roadmapReference", "create", undefined, input, domainRoot(deps, "roadmap", requireEntity(deps.repository.getRoadmapCard(input.roadmapCardId), "Roadmap card").roadmapId).version)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createRoadmapReference(input));
}
