import { type ActorContext, type CapabilityDescriptor, type ExternalRefEntityType, type SetExternalRefRequest, type SetExternalRefResponse, type ChangeSetCommandResponse } from "@storymapper/contracts";
import { requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";

export const setExternalRefDescriptor: CapabilityDescriptor = { name: "setExternalRef", kind: "write", tool: "SetExternalRef" };
export const setCardExternalRefDescriptor: CapabilityDescriptor = { name: "setCardExternalRef", kind: "human-only", route: "POST /api/cards/:cardId/external-refs" };
export const setReleaseExternalRefDescriptor: CapabilityDescriptor = { name: "setReleaseExternalRef", kind: "human-only", route: "POST /api/releases/:releaseId/external-refs" };
export const setPersonaExternalRefDescriptor: CapabilityDescriptor = { name: "setPersonaExternalRef", kind: "human-only", route: "POST /api/personas/:personaId/external-refs" };

export function setExternalRef<A extends ActorContext>(deps: ApplicationDeps, actor: A, entityType: ExternalRefEntityType, entityId: string, input: SetExternalRefRequest): DomainCommandResponse<A, SetExternalRefResponse>;
export function setExternalRef(deps: ApplicationDeps, actor: ActorContext, entityType: ExternalRefEntityType, entityId: string, input: SetExternalRefRequest): SetExternalRefResponse | ChangeSetCommandResponse {
  const { apply, system, externalId } = input;
  if (actor.actorType !== "human") {
    const root = domainRoot(deps, entityType, entityId);
    const scopeId = entityType === "persona" ? deps.repository.getPersona(entityId)!.storyMapId ?? root.projectId : entityType === "card" ? deps.repository.getCard(entityId)!.storyMapId : deps.repository.getRelease(entityId)!.storyMapId;
    return nonHumanCommand(deps, actor, root.projectId, "setExternalRef", [domainOperation("externalRef", "set", entityId, { entityType, entityId, system, externalId, scopeId }, root.version)], apply);
  }
  return deps.unitOfWork.run(actor, ({ repository }) => repository.setExternalRef({ entityType, entityId, system, externalId }));
}

export function setCardExternalRef(deps: ApplicationDeps, actor: ActorContext, entityId: string, input: SetExternalRefRequest) {
  requireHumanActor(actor);
  return setExternalRef(deps, actor as ActorContext & { actorType: "human" }, "card", entityId, input);
}

export function setReleaseExternalRef(deps: ApplicationDeps, actor: ActorContext, entityId: string, input: SetExternalRefRequest) {
  requireHumanActor(actor);
  return setExternalRef(deps, actor as ActorContext & { actorType: "human" }, "release", entityId, input);
}

export function setPersonaExternalRef(deps: ApplicationDeps, actor: ActorContext, entityId: string, input: SetExternalRefRequest) {
  requireHumanActor(actor);
  return setExternalRef(deps, actor as ActorContext & { actorType: "human" }, "persona", entityId, input);
}
