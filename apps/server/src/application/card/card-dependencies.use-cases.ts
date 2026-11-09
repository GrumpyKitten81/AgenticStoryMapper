import type { ActorContext, CapabilityDescriptor, CardDependencyResponse, ChangeSetCommandResponse, SetCardDependencyRequest } from "@storymapper/contracts";
import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import { assertBaseVersions } from "@storymapper/server/application/base-versions";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export const setCardDependencyDescriptor: CapabilityDescriptor = { name: "setCardDependency", kind: "write", route: "POST /api/cards/:cardId/dependencies", tool: "SetCardDependency" };
export function setCardDependency<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, body: SetCardDependencyRequest): DomainCommandResponse<A, CardDependencyResponse>;
export function setCardDependency(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: SetCardDependencyRequest): CardDependencyResponse | ChangeSetCommandResponse {
  return mutateDependency(deps, actor, cardId, body, true);
}

export const deleteCardDependencyDescriptor: CapabilityDescriptor = { name: "deleteCardDependency", kind: "write", route: "DELETE /api/cards/:cardId/dependencies/:prerequisiteCardId", tool: "DeleteCardDependency" };
export function deleteCardDependency<A extends ActorContext>(deps: ApplicationDeps, actor: A, cardId: string, body: SetCardDependencyRequest): DomainCommandResponse<A, CardDependencyResponse>;
export function deleteCardDependency(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: SetCardDependencyRequest): CardDependencyResponse | ChangeSetCommandResponse {
  return mutateDependency(deps, actor, cardId, body, false);
}

function mutateDependency(deps: ApplicationDeps, actor: ActorContext, cardId: string, body: SetCardDependencyRequest, set: boolean): CardDependencyResponse | ChangeSetCommandResponse {
  if (actor.actorType !== "human") {
    const root = domainRoot(deps, "card", cardId);
    const after = { cardId: { kind: "id", id: cardId }, prerequisiteCardId: { kind: "id", id: body.prerequisiteCardId } };
    return nonHumanCommand(deps, actor, root.projectId, set ? "setCardDependency" : "deleteCardDependency", [domainOperation("cardDependency", set ? "set" : "unset", cardId, after, body.baseVersion)], body.apply);
  }
  return deps.unitOfWork.run(actor, ({ repository }) => {
    assertBaseVersions(repository, [{ entity: "card", id: cardId, baseVersion: body.baseVersion }]);
    return repository.mutateCardDependency(cardId, body.prerequisiteCardId, set);
  });
}
