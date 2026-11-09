import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type Card,
  type CardAnnotationLinkResponse,
  type CardAttachmentResponse,
  type CardAttachmentsResponse,
  type CardHistoryQuery,
  type CardHistoryResponse,
  type CardPersonaLinkResponse,
  type CreateCardAttachmentRequest,
  type CreateCardSourceLinkRequest,
  type CreateCardSourceLinkResponse,
  type DeleteCardSourceLinkRequest,
  type OkResponse,
  type ParkCardCommand
} from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity } from "@storymapper/server/application/validation";

export const parkCardDescriptor: CapabilityDescriptor = { name: "parkCard", kind: "write", route: "POST /api/cards/:cardId/park", tool: "ParkCard" };
export function parkCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, { baseVersion, apply, ...park }: ParkCardCommand): DomainCommandResponse<A, Card>;
export function parkCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, { baseVersion, apply, ...park }: ParkCardCommand): Card | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "parkCard", [domainOperation("card", "park", cardId, park, baseVersion)], apply)!;
  return deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }]);
    const existing = repository.getCardDetails(cardId);
    if (!existing) throw new DomainError("not_found", "Card not found.");
    if (existing.level !== "activity") throw new DomainError("validation", "Only Activities can be parked.");
    return requireEntity(repository.parkCard(cardId, park), "Card");
  });
}

export const unparkCardDescriptor: CapabilityDescriptor = { name: "unparkCard", kind: "write", route: "POST /api/cards/:cardId/unpark", tool: "UnparkCard" };
export function unparkCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, baseVersion: number, apply?: boolean): DomainCommandResponse<A, Card>;
export function unparkCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, baseVersion: number, apply?: boolean): Card | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "unparkCard", [domainOperation("card", "unpark", cardId, {}, baseVersion)], apply)!;
  const card = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }]);
    return repository.unparkCard(cardId);
  });
  if (!card) throw new DomainError("not_found", "Card not found.");
  return card;
}

export const getCardHistoryDescriptor: CapabilityDescriptor = { name: "getCardHistory", kind: "read", route: "GET /api/cards/:cardId/history", tool: "GetCardHistory" };
export function getCardHistory(deps: ApplicationDeps, actor: ActorContext, cardId: string, query: CardHistoryQuery): CardHistoryResponse {
  requireActor(actor);
  if (!deps.repository.getCardDetails(cardId)) throw new DomainError("not_found", "Card not found.");
  return deps.repository.listCardHistoryPage(cardId, query);
}

export const listCardAttachmentsDescriptor: CapabilityDescriptor = { name: "listCardAttachments", kind: "read", route: "GET /api/cards/:cardId/attachments", tool: "ListCardAttachments" };
export function listCardAttachments(deps: ApplicationDeps, actor: ActorContext, cardId: string): CardAttachmentsResponse {
  requireActor(actor);
  if (!deps.repository.getCardDetails(cardId)) throw new DomainError("not_found", "Card not found.");
  return { attachments: deps.repository.listCardAttachments(cardId) };
}

export const createCardAttachmentDescriptor: CapabilityDescriptor = { name: "createCardAttachment", kind: "write", route: "POST /api/cards/:cardId/attachments", tool: "CreateCardAttachment" };
export function createCardAttachment<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, body: CreateCardAttachmentRequest): DomainCommandResponse<A, CardAttachmentResponse>;
export function createCardAttachment(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: CreateCardAttachmentRequest): CardAttachmentResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "createCardAttachment", [domainOperation("attachment", "create", undefined, { cardId, ...input }, domainRoot(deps, "card", cardId).version)], apply)!;
  const attachment = deps.unitOfWork.run(actor, ({ repository }) => repository.createCardAttachment(cardId, input));
  if (!attachment) throw new DomainError("not_found", "Card not found.");
  return { attachment };
}

export const deleteCardAttachmentDescriptor: CapabilityDescriptor = { name: "deleteCardAttachment", kind: "write", route: "DELETE /api/cards/:cardId/attachments/:attachmentId", tool: "DeleteCardAttachment" };
export function deleteCardAttachment<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, attachmentId: string, apply?: boolean): DomainCommandResponse<A, OkResponse>;
export function deleteCardAttachment(deps: ApplicationDeps, actor: ActorContext, cardId: string, attachmentId: string, apply?: boolean): OkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") {
    const root = domainRoot(deps, "card", cardId);
    if (!deps.repository.listCardAttachments(cardId).some((attachment) => attachment.id === attachmentId)) throw new DomainError("validation", "Attachment does not belong to the supplied Card.");
    return nonHumanCommand(deps, actor, root.projectId, "deleteCardAttachment", [domainOperation("attachment", "delete", attachmentId, {}, root.version)], apply);
  }
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteCardAttachment(cardId, attachmentId)) };
}

export const createCardSourceLinkDescriptor: CapabilityDescriptor = { name: "createCardSourceLink", kind: "write", route: "POST /api/cards/:cardId/source-links", tool: "CreateCardSourceLink" };
export function createCardSourceLink<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, body: CreateCardSourceLinkRequest): DomainCommandResponse<A, CreateCardSourceLinkResponse>;
export function createCardSourceLink(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: CreateCardSourceLinkRequest): CreateCardSourceLinkResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "createCardSourceLink", [domainOperation("sourceLink", "link", cardId, { cardId, ...input }, domainRoot(deps, "card", cardId).version)], apply)!;
  const link = deps.unitOfWork.run(actor, ({ repository }) => repository.createCardSourceLink(cardId, input));
  if (!link) throw new DomainError("not_found", "Card not found.");
  return { link };
}

export const deleteCardSourceLinkDescriptor: CapabilityDescriptor = { name: "deleteCardSourceLink", kind: "write", route: "DELETE /api/cards/:cardId/source-links", tool: "DeleteCardSourceLink" };
export function deleteCardSourceLink<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, body: DeleteCardSourceLinkRequest): DomainCommandResponse<A, OkResponse>;
export function deleteCardSourceLink(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: DeleteCardSourceLinkRequest): OkResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "deleteCardSourceLink", [domainOperation("sourceLink", "unlink", cardId, { cardId, ...input }, domainRoot(deps, "card", cardId).version)], apply)!;
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteCardSourceLink(cardId, input)) };
}

export const setCardPersonaDescriptor: CapabilityDescriptor = { name: "setCardPersona", kind: "write", route: "POST /api/cards/:cardId/personas/:personaId", tool: "SetCardPersona" };
export function setCardPersona<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, personaId: string, apply?: boolean): DomainCommandResponse<A, CardPersonaLinkResponse>;
export function setCardPersona(deps: ApplicationDeps, actor: ActorContext, cardId: string, personaId: string, apply?: boolean): CardPersonaLinkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "setCardPersona", [domainOperation("cardPersona", "set", cardId, { cardId, personaId }, domainRoot(deps, "card", cardId).version)], apply)!;
  return { link: deps.unitOfWork.run(actor, ({ repository }) => repository.setCardPersona(cardId, personaId)) };
}

export const deleteCardPersonaDescriptor: CapabilityDescriptor = { name: "deleteCardPersona", kind: "write", route: "DELETE /api/cards/:cardId/personas/:personaId", tool: "DeleteCardPersona" };
export function deleteCardPersona<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, personaId: string, apply?: boolean): DomainCommandResponse<A, OkResponse>;
export function deleteCardPersona(deps: ApplicationDeps, actor: ActorContext, cardId: string, personaId: string, apply?: boolean): OkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "deleteCardPersona", [domainOperation("cardPersona", "unset", cardId, { cardId, personaId }, domainRoot(deps, "card", cardId).version)], apply)!;
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteCardPersona(cardId, personaId)) };
}

export const setCardAnnotationDescriptor: CapabilityDescriptor = { name: "setCardAnnotation", kind: "write", route: "POST /api/cards/:cardId/annotations/:annotationId", tool: "SetCardAnnotation" };
export function setCardAnnotation<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, annotationId: string, apply?: boolean): DomainCommandResponse<A, CardAnnotationLinkResponse>;
export function setCardAnnotation(deps: ApplicationDeps, actor: ActorContext, cardId: string, annotationId: string, apply?: boolean): CardAnnotationLinkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "setCardAnnotation", [domainOperation("cardAnnotation", "set", cardId, { cardId, annotationId }, domainRoot(deps, "card", cardId).version)], apply)!;
  return { link: deps.unitOfWork.run(actor, ({ repository }) => {
    const card = requireEntity(repository.getCard(cardId), "Card");
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion: card.version }], [domainOperation("cardAnnotation", "set", cardId, { cardId, annotationId }, card.version)]);
    return repository.setCardAnnotation(cardId, annotationId);
  }) };
}

export const deleteCardAnnotationDescriptor: CapabilityDescriptor = { name: "deleteCardAnnotation", kind: "write", route: "DELETE /api/cards/:cardId/annotations/:annotationId", tool: "DeleteCardAnnotation" };
export function deleteCardAnnotation<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, annotationId: string, apply?: boolean): DomainCommandResponse<A, OkResponse>;
export function deleteCardAnnotation(deps: ApplicationDeps, actor: ActorContext, cardId: string, annotationId: string, apply?: boolean): OkResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "deleteCardAnnotation", [domainOperation("cardAnnotation", "unset", cardId, { cardId, annotationId }, domainRoot(deps, "card", cardId).version)], apply)!;
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => {
    const card = requireEntity(repository.getCard(cardId), "Card");
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion: card.version }], [domainOperation("cardAnnotation", "unset", cardId, { cardId, annotationId }, card.version)]);
    return repository.deleteCardAnnotation(cardId, annotationId);
  }) };
}
