import { createAiProposalRequestSchema, type ActorContext, type AiProposalResponse, type AiTemplatesResponse, type CapabilityDescriptor, type CreateAiProposalRequest, type AiFunctionTemplate, type CreateAiTemplateRequest, type UpdateAiTemplateRequest } from "@storymapper/contracts";
import { requireActor, requireHumanActor, requireAgentToolAccess } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { buildAiProposalChangeSet } from "@storymapper/server/services/ai-proposal-change-set";
import { visibleChangeSetWarnings } from "@storymapper/server/application/changeset/changeset-warning-visibility";
import { requirePatch } from "@storymapper/server/application/validation";

export const listAiTemplatesDescriptor: CapabilityDescriptor = { name: "listAiTemplates", kind: "read", route: "GET /api/ai/templates", tool: "ListAiTemplates" };
export function listAiTemplates(deps: ApplicationDeps, actor: ActorContext, projectId: string): AiTemplatesResponse {
  requireActor(actor);
  return { templates: deps.repository.listAiTemplates(projectId) };
}

export const createAiProposalDescriptor: CapabilityDescriptor = { name: "createAiProposal", kind: "write", route: "POST /api/ai/proposals", tool: "CreateAiProposal" };
export function createAiProposal(deps: ApplicationDeps, actor: ActorContext, input: CreateAiProposalRequest): AiProposalResponse {
  input = createAiProposalRequestSchema.parse(input);
  requireAgentToolAccess(deps.repository, actor, "CreateAiProposal", input);
  return deps.unitOfWork.run(actor, ({ repository }) => ({ changeSet: visibleChangeSetWarnings(deps.repository, actor, repository.createChangeSet(buildAiProposalChangeSet(repository, input))) }));
}

export const createAiTemplateDescriptor: CapabilityDescriptor = { name: "createAiTemplate", kind: "human-only", route: "POST /api/ai/templates" };
export function createAiTemplate(deps: ApplicationDeps, actor: ActorContext, input: CreateAiTemplateRequest): { template: AiFunctionTemplate } {
  requireHumanActor(actor);
  return { template: deps.unitOfWork.run(actor, ({ repository }) => repository.createAiTemplate(input)) };
}

export const updateAiTemplateDescriptor: CapabilityDescriptor = { name: "updateAiTemplate", kind: "human-only", route: "PATCH /api/projects/:projectId/ai/templates/:templateId" };
export function updateAiTemplate(deps: ApplicationDeps, actor: ActorContext, projectId: string, templateId: string, input: UpdateAiTemplateRequest): { template: AiFunctionTemplate } {
  requireHumanActor(actor);
  requirePatch(input);
  return { template: deps.unitOfWork.run(actor, ({ repository }) => repository.updateAiTemplate(projectId, templateId, input)) };
}

export const deleteAiTemplateDescriptor: CapabilityDescriptor = { name: "deleteAiTemplate", kind: "human-only", route: "DELETE /api/projects/:projectId/ai/templates/:templateId" };
export function deleteAiTemplate(deps: ApplicationDeps, actor: ActorContext, projectId: string, templateId: string): { deleted: boolean } {
  requireHumanActor(actor);
  return { deleted: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteAiTemplate(projectId, templateId)) };
}
