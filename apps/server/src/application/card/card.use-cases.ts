import { collectOperationConflicts, resolveOperations } from "@storymapper/core";
import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import {
  DomainError,
  type ActorContext,
  type BulkUpdateCardsCommand,
  type CapabilityDescriptor,
  type CardDetailsResponse,
  type CardResponse,
  type CardsResponse,
  type CreateCardRequest,
  type DeleteCardCommand,
  type DeleteCardsCommand,
  type DeleteCardsResponse,
  type MoveCardCommand,
  type DeletedRootResponse,
  type UpdateCardCommand
} from "@storymapper/contracts";
import { cardCreationOrigin, requireActor } from "@storymapper/server/application/actors";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requirePatch } from "@storymapper/server/application/validation";

export const listCardsDescriptor: CapabilityDescriptor = {
  name: "listCards",
  kind: "read",
  tool: "GetStoryMapCards"
};

export function listCards(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): CardsResponse {
  requireActor(actor);
  return { cards: deps.repository.listCards(storyMapId) };
}

export const getCardDetailsDescriptor: CapabilityDescriptor = {
  name: "getCardDetails",
  kind: "read",
  tool: "GetStoryMapCardDetails"
};

export function getCardDetails(deps: ApplicationDeps, actor: ActorContext, cardId: string): CardDetailsResponse {
  requireActor(actor);
  const card = deps.repository.getCardDetails(cardId);
  if (!card) throw new DomainError("not_found", "Card not found.");
  return {
    card,
    attachments: deps.repository.listCardAttachments(cardId),
    history: deps.repository.listCardHistory(cardId).slice(-5)
  };
}

export const createCardDescriptor: CapabilityDescriptor = {
  name: "createCard",
  kind: "write",
  tool: "CreateStoryMapCard",
  route: "POST /api/cards"
};

export function createCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateCardRequest): DomainCommandResponse<A, CardResponse>;
export function createCard(deps: ApplicationDeps, actor: ActorContext, body: CreateCardRequest): CardResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "storyMap", input.storyMapId).projectId, "createCard", [domainOperation("card", "create", undefined, input)], apply)!;
  const card = deps.unitOfWork.run(actor, ({ repository }) => repository.createCard(input, cardCreationOrigin(actor)));
  return { card };
}

export const updateCardDescriptor: CapabilityDescriptor = {
  name: "updateCard",
  kind: "write",
  tool: "UpdateStoryMapCard",
  route: "PATCH /api/cards/:cardId"
};

export function updateCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, command: UpdateCardCommand): DomainCommandResponse<A, CardResponse>;
export function updateCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, command: UpdateCardCommand): CardResponse | ChangeSetCommandResponse {
  const { apply, ...input } = command;
  const { baseVersion, ...patch } = input;
  requirePatch(patch);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "updateCard", [domainOperation("card", "update", cardId, patch, baseVersion)], apply)!;
  const card = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }], [domainOperation("card", "update", cardId, patch, baseVersion)]);
    return repository.updateCard(cardId, patch);
  });
  if (!card) throw new DomainError("not_found", "Card not found.");
  return { card };
}

export const bulkUpdateCardsDescriptor: CapabilityDescriptor = {
  name: "bulkUpdateCards",
  kind: "write",
  route: "PATCH /api/cards/bulk", tool: "BulkUpdateCards" };

export function bulkUpdateCards<A extends ActorContext>(deps: ApplicationDeps, actor: A, { cards, apply, ...request }: BulkUpdateCardsCommand): DomainCommandResponse<A, CardsResponse>;
export function bulkUpdateCards(deps: ApplicationDeps, actor: ActorContext, { cards, apply, ...request }: BulkUpdateCardsCommand): CardsResponse | ChangeSetCommandResponse {
  requirePatch(request.patch);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "storyMap", request.storyMapId).projectId, "bulkUpdateCards", [domainOperation("card", "bulk", request.storyMapId, { ...request, cards })], apply);
  return {
    cards: deps.unitOfWork.run(actor, ({ repository }) => {
      assertBaseVersions(repository, cards.map(({ id, baseVersion }) => ({ entity: "card", id, baseVersion })), [domainOperation("card", "bulk", request.storyMapId, { ...request, cards })]);
      return repository.bulkUpdateCards({ ...request, cardIds: cards.map(({ id }) => id) });
    })
  };
}

export const moveCardDescriptor: CapabilityDescriptor = {
  name: "moveCard",
  kind: "write",
  tool: "MoveStoryMapCard",
  route: "POST /api/cards/:cardId/move"
};

export function moveCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, { baseVersion, apply, ...move }: MoveCardCommand): DomainCommandResponse<A, CardResponse>;
export function moveCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, { baseVersion, apply, ...move }: MoveCardCommand): CardResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "moveCard", [domainOperation("card", "move", cardId, move, baseVersion)], apply)!;
  const card = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }], [domainOperation("card", "move", cardId, move, baseVersion)]);
    return repository.moveCard(cardId, move);
  });
  if (!card) throw new DomainError("not_found", "Card not found.");
  return { card };
}

export const archiveCardDescriptor: CapabilityDescriptor = {
  name: "archiveCard",
  kind: "write",
  tool: "DeleteOrArchiveStoryMapCard",
  route: "POST /api/cards/:cardId/archive"
};

export function archiveCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, baseVersion: number, apply?: boolean): DomainCommandResponse<A, CardResponse>;
export function archiveCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, baseVersion: number, apply?: boolean): CardResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "archiveCard", [domainOperation("card", "archive", cardId, {}, baseVersion)], apply)!;
  const card = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }], [domainOperation("card", "archive", cardId, {}, baseVersion)]);
    return repository.archiveCard(cardId);
  });
  if (!card) throw new DomainError("not_found", "Card not found.");
  return { card };
}

export const deleteCardDescriptor: CapabilityDescriptor = {
  name: "deleteCard",
  kind: "write",
  route: "POST /api/cards/:cardId/delete", tool: "DeleteCard" };

export function deleteCard<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, { baseVersion, apply, ...strategy }: DeleteCardCommand): DomainCommandResponse<A, DeletedRootResponse>;
export function deleteCard(deps: ApplicationDeps, actor: ActorContext, cardId: string, { baseVersion, apply, ...strategy }: DeleteCardCommand): DeletedRootResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, domainRoot(deps, "card", cardId).projectId, "deleteCard", [domainOperation("card", "delete", cardId, strategy, baseVersion)], apply)!;
  const deleted = deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion }], [domainOperation("card", "delete", cardId, strategy, baseVersion)]);
    return repository.deleteCard(cardId, strategy);
  });
  if (!deleted) throw new DomainError("not_found", "Card not found.");
  return { ok: true as const, version: baseVersion + 1 };
}

export const deleteCardsDescriptor: CapabilityDescriptor = {
  name: "deleteCards", kind: "write", route: "POST /api/cards/delete-set", tool: "DeleteCards"
};

export function deleteCards<A extends ActorContext>(deps: ApplicationDeps, actor: A, command: DeleteCardsCommand): DomainCommandResponse<A, DeleteCardsResponse>;
export function deleteCards(deps: ApplicationDeps, actor: ActorContext, { apply, strategy, ...selection }: DeleteCardsCommand): DeleteCardsResponse | ChangeSetCommandResponse {
  const projectId = domainRoot(deps, "storyMap", selection.storyMapId).projectId;
  const first = selection.cards[0]!;
  const operation = domainOperation("card", "delete", first.id, { strategy, selection }, first.baseVersion);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, projectId, "deleteCards", [operation], apply);
  deps.unitOfWork.run(actor, ({ repository }) => {
    const snapshot = repository.getOperationSnapshot(projectId);
    const supply = repository.prepareOperationSupply([operation], snapshot);
    const conflicts = collectOperationConflicts(snapshot, [operation], supply);
    if (conflicts.length) throw new DomainError("conflict", `${conflicts.length} object(s) changed since they were read.`, undefined, conflicts);
    const resolution = resolveOperations(snapshot, [operation], supply);
    repository.persistOperationResolution(resolution, projectId);
  });
  return { ok: true, cardIds: selection.cards.map((card) => card.id) };
}
