import { z } from "zod";
import * as reviews from "@storymapper/server/application/card/card-review.use-cases";
import { cardReviewCommandSchema, mcpToolInputSchemas, uuidSchema } from "@storymapper/contracts";
import * as dependencies from "@storymapper/server/application/card/card-dependencies.use-cases";
import { setCardDependencyRequestSchema, baseVersionQuerySchema } from "@storymapper/contracts";
import type { FastifyPluginAsync } from "fastify";
import { deleteCardsCommandSchema, baseVersionBodySchema, bulkUpdateCardsCommandSchema, cardHistoryQuerySchema, createCardAttachmentRequestSchema, createCardRequestSchema, createCardSourceLinkRequestSchema, deleteCardCommandSchema, deleteCardSourceLinkRequestSchema, moveCardCommandSchema, parkCardCommandSchema, setExternalRefRequestSchema, updateCardCommandSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import * as children from "@storymapper/server/application/card/card-children.use-cases";
import * as cards from "@storymapper/server/application/card/card.use-cases";
import { setCardExternalRef, setCardExternalRefDescriptor } from "@storymapper/server/application/external-ref/external-ref.use-cases";
import { parseInput } from "@storymapper/server/application/http/validate";
import { registerApplicationRoute, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const cardRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, reviews.getCardReviewsDescriptor, (request) => {
    const query = parseInput(mcpToolInputSchemas.GetCardReviews.omit({ projectId: true }).extend({ summaryOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional() }), request.query);
    return reviews.getCardReviews(application, actor, parseInput(uuidSchema, routeParam(request, "projectId")), query.storyMapId, query);
  });
  registerApplicationRoute(server, reviews.commandCardReviewDescriptor, (request) => reviews.commandCardReview(application, actor, parseInput(uuidSchema, routeParam(request, "projectId")), parseInput(cardReviewCommandSchema, request.body)));
  registerApplicationRoute(server, dependencies.setCardDependencyDescriptor, (request) => dependencies.setCardDependency(application, actor, routeParam(request, "cardId"), parseInput(setCardDependencyRequestSchema, request.body)));
  registerApplicationRoute(server, dependencies.deleteCardDependencyDescriptor, (request) => dependencies.deleteCardDependency(application, actor, routeParam(request, "cardId"), { prerequisiteCardId: routeParam(request, "prerequisiteCardId"), ...parseInput(baseVersionQuerySchema, request.query) }));
  registerApplicationRoute(server, cards.createCardDescriptor, (request, reply) => reply.code(201).send(cards.createCard(application, actor, parseInput(createCardRequestSchema, request.body)).card));
  registerApplicationRoute(server, setCardExternalRefDescriptor, (request, reply) => {
    const result = setCardExternalRef(application, actor, routeParam(request, "cardId"), parseInput(setExternalRefRequestSchema, request.body));
    return reply.code(result.status === "created" ? 201 : 200).send(result);
  });
  registerApplicationRoute(server, cards.deleteCardsDescriptor, (request) => cards.deleteCards(application, actor, parseInput(deleteCardsCommandSchema, request.body)));
  registerApplicationRoute(server, cards.bulkUpdateCardsDescriptor, (request) => cards.bulkUpdateCards(application, actor, parseInput(bulkUpdateCardsCommandSchema, request.body)));
  registerApplicationRoute(server, cards.updateCardDescriptor, (request) => cards.updateCard(application, actor, routeParam(request, "cardId"), parseInput(updateCardCommandSchema, request.body)).card);
  registerApplicationRoute(server, cards.moveCardDescriptor, (request) => cards.moveCard(application, actor, routeParam(request, "cardId"), parseInput(moveCardCommandSchema, request.body)).card);
  registerApplicationRoute(server, cards.archiveCardDescriptor, (request) => cards.archiveCard(application, actor, routeParam(request, "cardId"), parseInput(baseVersionBodySchema, request.body).baseVersion).card);
  registerApplicationRoute(server, cards.deleteCardDescriptor, (request) => cards.deleteCard(application, actor, routeParam(request, "cardId"), parseInput(deleteCardCommandSchema, request.body)));
  registerApplicationRoute(server, children.parkCardDescriptor, (request) => children.parkCard(application, actor, routeParam(request, "cardId"), parseInput(parkCardCommandSchema, request.body)));
  registerApplicationRoute(server, children.unparkCardDescriptor, (request) => children.unparkCard(application, actor, routeParam(request, "cardId"), parseInput(baseVersionBodySchema, request.body).baseVersion));
  registerApplicationRoute(server, children.getCardHistoryDescriptor, (request) => children.getCardHistory(application, actor, routeParam(request, "cardId"), parseInput(cardHistoryQuerySchema, request.query)));
  registerApplicationRoute(server, children.listCardAttachmentsDescriptor, (request) => children.listCardAttachments(application, actor, routeParam(request, "cardId")));
  registerApplicationRoute(server, children.createCardAttachmentDescriptor, (request, reply) => reply.code(201).send(children.createCardAttachment(application, actor, routeParam(request, "cardId"), parseInput(createCardAttachmentRequestSchema, request.body))));
  registerApplicationRoute(server, children.deleteCardAttachmentDescriptor, (request) => children.deleteCardAttachment(application, actor, routeParam(request, "cardId"), routeParam(request, "attachmentId")));
  registerApplicationRoute(server, children.createCardSourceLinkDescriptor, (request, reply) => reply.code(201).send(children.createCardSourceLink(application, actor, routeParam(request, "cardId"), parseInput(createCardSourceLinkRequestSchema, request.body))));
  registerApplicationRoute(server, children.deleteCardSourceLinkDescriptor, (request) => children.deleteCardSourceLink(application, actor, routeParam(request, "cardId"), parseInput(deleteCardSourceLinkRequestSchema, request.body)));
  registerApplicationRoute(server, children.setCardPersonaDescriptor, (request, reply) => reply.code(201).send(children.setCardPersona(application, actor, routeParam(request, "cardId"), routeParam(request, "personaId"))));
  registerApplicationRoute(server, children.deleteCardPersonaDescriptor, (request) => children.deleteCardPersona(application, actor, routeParam(request, "cardId"), routeParam(request, "personaId")));
  registerApplicationRoute(server, children.setCardAnnotationDescriptor, (request, reply) => reply.code(201).send(children.setCardAnnotation(application, actor, routeParam(request, "cardId"), routeParam(request, "annotationId"))));
  registerApplicationRoute(server, children.deleteCardAnnotationDescriptor, (request) => children.deleteCardAnnotation(application, actor, routeParam(request, "cardId"), routeParam(request, "annotationId")));
};
