import { agentAccessEnabled } from "@storymapper/core";
import { storyMapperMcpTools } from "@storymapper/mcp";
import { type ActivityChangesQuery, type ActivityChangesResponse } from "@storymapper/contracts";
import { domainOperation, proposeDomainCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  activityQuerySchema,
  type ActivityQuery,
  type ActivityResponse,
  type ActorContext,
  type Annotation,
  type CapabilityDescriptor,
  type CreateAnnotationRequest,
  type CreateStoryTemplateRequest,
  type CreateWorkflowStatusRequest,
  type DeleteWorkflowStatusRequest,
  type DeleteAnnotationRequest,
  type CustomizationResponse,
  type OkResponse,
  type SafetySettingsResponse,
  type StoryTemplate,
  type UpdateAnnotationRequest,
  type UpdateSafetySettingsRequest,
  type UpdateStoryTemplateRequest,
  type UpdateWorkflowStatusRequest,
  type WorkflowStatus
} from "@storymapper/contracts";
import { requireActor, requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity, requirePatch } from "@storymapper/server/application/validation";
import { assertOperationConflicts } from "@storymapper/server/application/base-versions";

export const getCustomizationDescriptor: CapabilityDescriptor = { name: "getCustomization", kind: "read", route: "GET /api/customization", tool: "GetCustomization" };
export function getCustomization(deps: ApplicationDeps, actor: ActorContext, projectId: string, storyMapId?: string): CustomizationResponse {
  requireActor(actor);
  return deps.repository.getCustomization(projectId, storyMapId);
}

export const createWorkflowStatusDescriptor: CapabilityDescriptor = { name: "createWorkflowStatus", kind: "write", route: "POST /api/workflow-statuses", tool: "CreateWorkflowStatus" };
export function createWorkflowStatus<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateWorkflowStatusRequest): DomainCommandResponse<A, WorkflowStatus>;
export function createWorkflowStatus(deps: ApplicationDeps, actor: ActorContext, body: CreateWorkflowStatusRequest): WorkflowStatus | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, input.projectId, "createWorkflowStatus", [domainOperation("workflowStatus", "create", undefined, input)], apply)!;
  requireActor(actor);
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createWorkflowStatus(input));
}

export const updateWorkflowStatusDescriptor: CapabilityDescriptor = { name: "updateWorkflowStatus", kind: "write", route: "PATCH /api/workflow-statuses/:statusId", tool: "UpdateWorkflowStatus" };
export function updateWorkflowStatus<A extends ActorContext>(deps: ApplicationDeps, actor: A, statusId: string, body: UpdateWorkflowStatusRequest): DomainCommandResponse<A, WorkflowStatus>;
export function updateWorkflowStatus(deps: ApplicationDeps, actor: ActorContext, statusId: string, body: UpdateWorkflowStatusRequest): WorkflowStatus | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  requirePatch(input);
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getWorkflowStatus(statusId), "WorkflowStatus").projectId, "updateWorkflowStatus", [domainOperation("workflowStatus", "update", statusId, input)], apply)!;
  requireActor(actor);
  return requireEntity(deps.unitOfWork.run(actor, ({ repository }) => {
    assertOperationConflicts(repository, requireEntity(repository.getWorkflowStatus(statusId), "Workflow status").projectId, [domainOperation("workflowStatus", "update", statusId, input)]);
    return repository.updateWorkflowStatus(statusId, input);
  }), "Workflow status");
}

export const deleteWorkflowStatusDescriptor: CapabilityDescriptor = { name: "deleteWorkflowStatus", kind: "write", route: "DELETE /api/workflow-statuses/:statusId", tool: "DeleteWorkflowStatus" };
export function deleteWorkflowStatus<A extends ActorContext>(deps: ApplicationDeps, actor: A, statusId: string, command?: DeleteWorkflowStatusRequest): DomainCommandResponse<A, OkResponse>;
export function deleteWorkflowStatus(deps: ApplicationDeps, actor: ActorContext, statusId: string, command: DeleteWorkflowStatusRequest = {}): OkResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getWorkflowStatus(statusId), "WorkflowStatus").projectId, "deleteWorkflowStatus", [domainOperation("workflowStatus", "delete", statusId, input)], apply)!;
  requireActor(actor);
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => {
    assertOperationConflicts(repository, requireEntity(repository.getWorkflowStatus(statusId), "Workflow status").projectId, [domainOperation("workflowStatus", "delete", statusId, input)]);
    return repository.deleteWorkflowStatus(statusId, input);
  }) };
}

export const createAnnotationDescriptor: CapabilityDescriptor = { name: "createAnnotation", kind: "write", route: "POST /api/annotations", tool: "CreateAnnotation" };
export function createAnnotation<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateAnnotationRequest): DomainCommandResponse<A, Annotation>;
export function createAnnotation(deps: ApplicationDeps, actor: ActorContext, body: CreateAnnotationRequest): Annotation | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, input.projectId, "createAnnotation", [domainOperation("annotation", "create", undefined, input)], apply)!;
  requireActor(actor);
  return deps.unitOfWork.run(actor, ({ repository }) => {
    assertOperationConflicts(repository, input.projectId, [domainOperation("annotation", "create", undefined, input)]);
    return repository.createAnnotation(input);
  });
}

export const updateAnnotationDescriptor: CapabilityDescriptor = { name: "updateAnnotation", kind: "write", route: "PATCH /api/annotations/:annotationId", tool: "UpdateAnnotation" };
export function updateAnnotation<A extends ActorContext>(deps: ApplicationDeps, actor: A, annotationId: string, body: UpdateAnnotationRequest): DomainCommandResponse<A, Annotation>;
export function updateAnnotation(deps: ApplicationDeps, actor: ActorContext, annotationId: string, body: UpdateAnnotationRequest): Annotation | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  requirePatch(input);
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getAnnotation(annotationId), "Annotation").projectId, "updateAnnotation", [domainOperation("annotation", "update", annotationId, input)], apply)!;
  requireActor(actor);
  return requireEntity(deps.unitOfWork.run(actor, ({ repository }) => {
    assertOperationConflicts(repository, requireEntity(repository.getAnnotation(annotationId), "Annotation").projectId, [domainOperation("annotation", "update", annotationId, input)]);
    return repository.updateAnnotation(annotationId, input);
  }), "Annotation");
}

export const deleteAnnotationDescriptor: CapabilityDescriptor = { name: "deleteAnnotation", kind: "write", route: "DELETE /api/annotations/:annotationId", tool: "DeleteAnnotation" };
export function deleteAnnotation<A extends ActorContext>(deps: ApplicationDeps, actor: A, annotationId: string, command?: DeleteAnnotationRequest): DomainCommandResponse<A, OkResponse>;
export function deleteAnnotation(deps: ApplicationDeps, actor: ActorContext, annotationId: string, command: DeleteAnnotationRequest = {}): OkResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getAnnotation(annotationId), "Annotation").projectId, "deleteAnnotation", [domainOperation("annotation", "delete", annotationId, input)], apply)!;
  requireActor(actor);
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => {
    assertOperationConflicts(repository, requireEntity(repository.getAnnotation(annotationId), "Annotation").projectId, [domainOperation("annotation", "delete", annotationId, input)]);
    return repository.deleteAnnotation(annotationId, input);
  }) };
}

export const createStoryTemplateDescriptor: CapabilityDescriptor = { name: "createStoryTemplate", kind: "write", route: "POST /api/story-templates", tool: "CreateStoryTemplate" };
export function createStoryTemplate<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateStoryTemplateRequest): DomainCommandResponse<A, StoryTemplate>;
export function createStoryTemplate(deps: ApplicationDeps, actor: ActorContext, body: CreateStoryTemplateRequest): StoryTemplate | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, input.projectId, "createStoryTemplate", [domainOperation("storyTemplate", "create", undefined, input)], apply)!;
  requireActor(actor);
  return deps.unitOfWork.run(actor, ({ repository }) => repository.createStoryTemplate(input));
}

export const updateStoryTemplateDescriptor: CapabilityDescriptor = { name: "updateStoryTemplate", kind: "write", route: "PATCH /api/story-templates/:templateId", tool: "UpdateStoryTemplate" };
export function updateStoryTemplate<A extends ActorContext>(deps: ApplicationDeps, actor: A, templateId: string, body: UpdateStoryTemplateRequest): DomainCommandResponse<A, StoryTemplate>;
export function updateStoryTemplate(deps: ApplicationDeps, actor: ActorContext, templateId: string, body: UpdateStoryTemplateRequest): StoryTemplate | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  requirePatch(input);
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getStoryTemplate(templateId), "StoryTemplate").projectId, "updateStoryTemplate", [domainOperation("storyTemplate", "update", templateId, input)], apply)!;
  requireActor(actor);
  return requireEntity(deps.unitOfWork.run(actor, ({ repository }) => repository.updateStoryTemplate(templateId, input)), "Story template");
}

export const deleteStoryTemplateDescriptor: CapabilityDescriptor = { name: "deleteStoryTemplate", kind: "write", route: "DELETE /api/story-templates/:templateId", tool: "DeleteStoryTemplate" };
export function deleteStoryTemplate<A extends ActorContext>(deps: ApplicationDeps, actor: A, templateId: string, apply?: boolean): DomainCommandResponse<A, OkResponse>;
export function deleteStoryTemplate(deps: ApplicationDeps, actor: ActorContext, templateId: string, apply?: boolean): OkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, requireEntity(deps.repository.getStoryTemplate(templateId), "StoryTemplate").projectId, "deleteStoryTemplate", [domainOperation("storyTemplate", "delete", templateId, {})], apply)!;
  requireActor(actor);
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteStoryTemplate(templateId)) };
}

export const listActivityDescriptor: CapabilityDescriptor = { name: "listActivity", kind: "read", route: "GET /api/activity", tool: "ListActivity" };
export function listActivity(deps: ApplicationDeps, actor: ActorContext, projectId?: string, query?: ActivityQuery): ActivityResponse {
  requireActor(actor);
  const filters = query ?? activityQuerySchema.parse({ projectId });
  const projectIds = actor.actorType === "agent" ? deps.repository.listProjects().filter((project) => agentAccessEnabled(deps.repository.getSafetySettings(project.id))).map((project) => project.id) : undefined;
  return deps.repository.listActivityPage(filters, { includeRuntime: actor.actorType === "human", ...(projectIds ? { projectIds } : {}) }, storyMapperMcpTools.filter((tool) => tool.permission === "read").map((tool) => tool.name));
}

export const getSafetySettingsDescriptor: CapabilityDescriptor = { name: "getSafetySettings", kind: "read", route: "GET /api/settings/safety", tool: "GetSafetySettings" };
export function getSafetySettings(deps: ApplicationDeps, actor: ActorContext, projectId: string): SafetySettingsResponse {
  requireActor(actor);
  requireEntity(deps.repository.listProjects().find((project) => project.id === projectId), "Project");
  return { settings: deps.repository.getSafetySettings(projectId) };
}

export const updateSafetySettingsDescriptor: CapabilityDescriptor = { name: "updateSafetySettings", kind: "human-only", route: "PATCH /api/settings/safety" };
export function updateSafetySettings(deps: ApplicationDeps, actor: ActorContext, projectId: string, body: UpdateSafetySettingsRequest): SafetySettingsResponse {
  requireHumanActor(actor);
  requirePatch(body);
  return { settings: deps.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(projectId, body)) };
}

export const listActivityChangesDescriptor: CapabilityDescriptor = { name: "listActivityChanges", kind: "read", route: "GET /api/activity/changes" };
export function listActivityChanges(deps: ApplicationDeps, actor: ActorContext, input: ActivityChangesQuery): ActivityChangesResponse {
  requireHumanActor(actor);
  requireEntity(deps.repository.listProjects().find((project) => project.id === input.projectId), "Project");
  return deps.repository.listActivityChanges(input);
}
