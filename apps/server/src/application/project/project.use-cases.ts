import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type CreateProjectRequest,
  type GettingStartedResponse,
  type ListProjectsResponse,
  type ProductContextResponse,
  type Project,
  type RecordedVisualExportResponse,
  type UpsertProductContextRequest
} from "@storymapper/contracts";
import { requireActor, requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";

export const listProjectsDescriptor: CapabilityDescriptor = { name: "listProjects", kind: "read", tool: "ListProjects", route: "GET /api/projects" };
export function listProjects(deps: ApplicationDeps, actor: ActorContext): ListProjectsResponse {
  requireActor(actor);
  return { projects: deps.repository.listProjects() };
}

export const createProjectDescriptor: CapabilityDescriptor = { name: "createProject", kind: "human-only", route: "POST /api/projects" };
export function createProject(deps: ApplicationDeps, actor: ActorContext, body: CreateProjectRequest): Project {
  requireHumanActor(actor);
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createProjectWithGettingStarted(body));
}

function assertProject(deps: ApplicationDeps, projectId: string): void {
  if (!deps.repository.listProjects().some((project) => project.id === projectId)) throw new DomainError("not_found", "Project not found.");
}

export const getGettingStartedDescriptor: CapabilityDescriptor = { name: "getGettingStarted", kind: "human-only", route: "GET /api/projects/:projectId/getting-started" };
export function getGettingStarted(deps: ApplicationDeps, actor: ActorContext, projectId: string): GettingStartedResponse {
  requireHumanActor(actor);
  assertProject(deps, projectId);
  return { checklist: deps.unitOfWork.run(actor, ({ repository }) => {
    repository.initializeGettingStarted(projectId);
    return repository.getGettingStartedChecklist(projectId);
  }) };
}

export const dismissGettingStartedDescriptor: CapabilityDescriptor = { name: "dismissGettingStarted", kind: "human-only", route: "POST /api/projects/:projectId/getting-started/dismiss" };
export function dismissGettingStarted(deps: ApplicationDeps, actor: ActorContext, projectId: string): GettingStartedResponse {
  requireHumanActor(actor);
  assertProject(deps, projectId);
  return { checklist: deps.unitOfWork.run(actor, ({ repository }) => repository.dismissGettingStartedChecklist(projectId)) };
}

export const recordVisualExportDescriptor: CapabilityDescriptor = { name: "recordVisualExport", kind: "human-only", route: "POST /api/projects/:projectId/getting-started/export-success" };
export function recordVisualExport(deps: ApplicationDeps, actor: ActorContext, projectId: string): RecordedVisualExportResponse {
  requireHumanActor(actor);
  assertProject(deps, projectId);
  return { checklist: deps.unitOfWork.run(actor, ({ repository }) => repository.markExportCompleted([projectId]))[0] };
}

export const getProductContextDescriptor: CapabilityDescriptor = { name: "getProductContext", kind: "read", route: "GET /api/product-context", tool: "GetProductContext" };
export function getProductContext(deps: ApplicationDeps, actor: ActorContext, projectId: string, storyMapId?: string): ProductContextResponse {
  requireActor(actor);
  return { context: deps.repository.getProductContext(projectId, storyMapId) };
}

export const upsertProductContextDescriptor: CapabilityDescriptor = { name: "upsertProductContext", kind: "write", route: "PATCH /api/product-context", tool: "UpsertProductContext" };
export function upsertProductContext<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: UpsertProductContextRequest): DomainCommandResponse<A, ProductContextResponse>;
export function upsertProductContext(deps: ApplicationDeps, actor: ActorContext, body: UpsertProductContextRequest): ProductContextResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, input.projectId, "upsertProductContext", [domainOperation("productContext", "set", input.storyMapId ?? input.projectId, input, input.storyMapId ? domainRoot(deps, "storyMap", input.storyMapId).version : undefined)], apply);
  return { context: deps.unitOfWork.run(actor, ({ repository }) => repository.upsertProductContext(input)) };
}
