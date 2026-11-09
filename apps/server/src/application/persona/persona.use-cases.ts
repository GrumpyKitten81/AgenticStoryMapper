import { domainOperation, domainRoot, proposeDomainCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type CreatePersonaRequest,
  type DeletePersonaCommand,
  type DeletedRootResponse,
  type PersonaResponse,
  type PersonasResponse,
  type UpdatePersonaCommand
} from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requirePatch } from "@storymapper/server/application/validation";

export const listPersonasDescriptor: CapabilityDescriptor = {
  name: "listPersonas",
  kind: "read",
  tool: "GetStoryMapPersonaDetails",
  route: "GET /api/personas"
};

export function listPersonas(deps: ApplicationDeps, actor: ActorContext, projectId: string, storyMapId?: string, personaId?: string): PersonasResponse {
  requireActor(actor);
  deps.repository.getCustomization(projectId, storyMapId);
  const personas = storyMapId
    ? deps.repository.listPersonas(projectId, storyMapId)
    : deps.repository.listPersonasForProject(projectId);
  const persona = personaId ? personas.find((candidate) => candidate.id === personaId) : undefined;
  if (personaId && !persona) throw new DomainError("not_found", "Persona not found.");
  const result = persona ? [persona] : personas;
  return { personas: result, externalRefs: deps.repository.listExternalRefsForPersonas(result.map(({ id }) => id)) };
}

export const createPersonaDescriptor: CapabilityDescriptor = {
  name: "createPersona",
  kind: "write",
  tool: "CreateStoryMapPersona",
  route: "POST /api/personas"
};

export function createPersona<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreatePersonaRequest): DomainCommandResponse<A, PersonaResponse>;
export function createPersona(deps: ApplicationDeps, actor: ActorContext, body: CreatePersonaRequest): PersonaResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, input.projectId, "createPersona", [domainOperation("persona", "create", undefined, input)], apply)!;
  const persona = deps.unitOfWork.run(actor, ({ repository }) => repository.createPersona(input));
  return { persona };
}

export const updatePersonaDescriptor: CapabilityDescriptor = {
  name: "updatePersona",
  kind: "write",
  tool: "UpdateStoryMapPersona",
  route: "PATCH /api/personas/:personaId"
};

export function updatePersona<A extends ActorContext>(deps: ApplicationDeps, actor: A, personaId: string, command: UpdatePersonaCommand): DomainCommandResponse<A, PersonaResponse>;
export function updatePersona(deps: ApplicationDeps, actor: ActorContext, personaId: string, command: UpdatePersonaCommand): PersonaResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  const { baseVersion, ...patch } = input;
  requirePatch(patch);
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, domainRoot(deps, "persona", personaId).projectId, "updatePersona", [domainOperation("persona", "update", personaId, patch, baseVersion)], apply)!;
  const persona = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "persona", id: personaId, baseVersion }]);
    return repository.updatePersona(personaId, patch);
  });
  if (!persona) throw new DomainError("not_found", "Persona not found.");
  return { persona };
}

export const deletePersonaDescriptor: CapabilityDescriptor = {
  name: "deletePersona",
  kind: "write",
  route: "DELETE /api/personas/:personaId", tool: "DeletePersona" };

export function deletePersona<A extends ActorContext>(deps: ApplicationDeps, actor: A, personaId: string, command: DeletePersonaCommand): DomainCommandResponse<A, DeletedRootResponse>;
export function deletePersona(deps: ApplicationDeps, actor: ActorContext, personaId: string, command: DeletePersonaCommand): DeletedRootResponse | ChangeSetCommandResponse {
  const { baseVersion, apply, ...input } = command;
  if (actor.actorType !== "human") return proposeDomainCommand(deps, actor, domainRoot(deps, "persona", personaId).projectId, "deletePersona", [domainOperation("persona", "delete", personaId, input, baseVersion)], apply)!;
  const deleted = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "persona", id: personaId, baseVersion }]);
    return repository.deletePersona(personaId, input);
  });
  if (!deleted) throw new DomainError("not_found", "Persona not found.");
  return { ok: true as const, version: baseVersion + 1 };
}
