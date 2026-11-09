import { getCardReviews, commandCardReview } from "@storymapper/server/application/card/card-review.use-cases";
import * as dependencies from "@storymapper/server/application/card/card-dependencies.use-cases";
import { updateDeliveryStatus } from "@storymapper/server/application/card/delivery-status.use-cases";
import { mcpToolInputSchemas as inputs } from "@storymapper/contracts";
import { bulkUpdateCards, deleteCard, deleteCards } from "@storymapper/server/application/card/card.use-cases";
import * as children from "@storymapper/server/application/card/card-children.use-cases";
import { setExternalRef } from "@storymapper/server/application/external-ref/external-ref.use-cases";
import * as links from "@storymapper/server/application/github-link/github-link.use-cases";
import { getWorkItemSyncHealth, planWorkItems } from "@storymapper/server/application/sync/sync.use-cases";
import { resolveSyncConflict } from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { registerTool, type RegistrationContext } from "@storymapper/server/mcp/tools/register-tools";

export function registerAdditionalCardTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "GetCardReviews", (input) => { const parsed = inputs.GetCardReviews.parse(input); return { data: getCardReviews(application, actor, parsed.projectId, parsed.storyMapId, { ...(parsed.cardId ? { cardId: parsed.cardId } : {}), ...(parsed.planId ? { planId: parsed.planId } : {}), ...(parsed.summaryOnly === undefined ? {} : { summaryOnly: parsed.summaryOnly }) }) }; });
  registerTool(context, "CardReview", (input) => { const parsed = inputs.CardReview.parse(input); return { data: commandCardReview(application, actor, parsed.projectId, parsed.command) }; }, undefined, true);
  registerTool(context, "UpdateDeliveryStatus", (input) => ({ data: updateDeliveryStatus(application, actor, inputs.UpdateDeliveryStatus.parse(input)) }), undefined, true);
  registerTool(context, "BulkUpdateCards", (input) => ({ data: bulkUpdateCards(application, actor, inputs.BulkUpdateCards.parse(input)) }), undefined, true);
  registerTool(context, "DeleteCards", (input) => ({ data: deleteCards(application, actor, inputs.DeleteCards.parse(input)) }), undefined, true);
  registerTool(context, "DeleteCard", (input) => { const parsed = inputs.DeleteCard.parse(input); return { data: deleteCard(application, actor, parsed.cardId, { strategy: parsed.strategy, baseVersion: parsed.baseVersion, apply: parsed.apply }) }; }, undefined, true);
  registerTool(context, "ParkCard", (input) => { const parsed = inputs.ParkCard.parse(input); return { data: children.parkCard(application, actor, parsed.cardId, { childStrategy: parsed.childStrategy, baseVersion: parsed.baseVersion, apply: parsed.apply }) }; }, undefined, true);
  registerTool(context, "UnparkCard", (input) => { const parsed = inputs.UnparkCard.parse(input); return { data: children.unparkCard(application, actor, parsed.cardId, parsed.baseVersion, parsed.apply) }; }, undefined, true);
  registerTool(context, "GetCardHistory", async (input) => { const { cardId, ...query } = inputs.GetCardHistory.parse(input); return { data: children.getCardHistory(application, actor, cardId, query) }; });
  registerTool(context, "ListCardAttachments", async (input) => ({ data: children.listCardAttachments(application, actor, inputs.ListCardAttachments.parse(input).cardId) }));
  registerTool(context, "CreateCardAttachment", async (input) => { const parsed = inputs.CreateCardAttachment.parse(input); return { data: children.createCardAttachment(application, actor, parsed.cardId, parsed) }; });
  registerTool(context, "DeleteCardAttachment", async (input) => { const parsed = inputs.DeleteCardAttachment.parse(input); return { data: children.deleteCardAttachment(application, actor, parsed.cardId, parsed.attachmentId, parsed.apply) }; });
  registerTool(context, "CreateCardSourceLink", (input) => { const { cardId, ...evidence } = inputs.CreateCardSourceLink.parse(input); return { data: children.createCardSourceLink(application, actor, cardId, evidence) }; }, undefined, true);
  registerTool(context, "DeleteCardSourceLink", (input) => { const { cardId, ...evidence } = inputs.DeleteCardSourceLink.parse(input); return { data: children.deleteCardSourceLink(application, actor, cardId, evidence) }; }, undefined, true);
  registerTool(context, "SetCardDependency", (input) => { const { cardId, ...body } = inputs.SetCardDependency.parse(input); return { data: dependencies.setCardDependency(application, actor, cardId, body) }; }, undefined, true);
  registerTool(context, "DeleteCardDependency", (input) => { const { cardId, ...body } = inputs.DeleteCardDependency.parse(input); return { data: dependencies.deleteCardDependency(application, actor, cardId, body) }; }, undefined, true);
  registerTool(context, "SetCardPersona", (input) => { const parsed = inputs.SetCardPersona.parse(input); return { data: children.setCardPersona(application, actor, parsed.cardId, parsed.personaId, parsed.apply) }; }, undefined, true);
  registerTool(context, "DeleteCardPersona", (input) => { const parsed = inputs.DeleteCardPersona.parse(input); return { data: children.deleteCardPersona(application, actor, parsed.cardId, parsed.personaId, parsed.apply) }; }, undefined, true);
  registerTool(context, "SetCardAnnotation", (input) => { const parsed = inputs.SetCardAnnotation.parse(input); return { data: children.setCardAnnotation(application, actor, parsed.cardId, parsed.annotationId, parsed.apply) }; }, undefined, true);
  registerTool(context, "DeleteCardAnnotation", (input) => { const parsed = inputs.DeleteCardAnnotation.parse(input); return { data: children.deleteCardAnnotation(application, actor, parsed.cardId, parsed.annotationId, parsed.apply) }; }, undefined, true);
  registerTool(context, "SetExternalRef", (input) => {
    const parsed = inputs.SetExternalRef.parse(input);
    return { data: setExternalRef(application, actor, parsed.entityType, parsed.entityId, parsed) };
  }, undefined, true);
  registerLinkTools(context);
}

function registerLinkTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "CreateGitHubLink", async (input) => ({ data: await links.createGitHubLink(application, actor, inputs.CreateGitHubLink.parse(input)) }), undefined, true);
  registerTool(context, "UpdateGitHubLink", (input) => { const { linkId, patch, apply } = inputs.UpdateGitHubLink.parse(input); return { data: links.updateGitHubLink(application, actor, linkId, { ...patch, apply }) }; }, undefined, true);
  registerTool(context, "DeleteGitHubLink", (input) => { const parsed = inputs.DeleteGitHubLink.parse(input); return { data: links.deleteGitHubLink(application, actor, parsed.linkId, parsed.apply) }; }, undefined, true);
  registerTool(context, "GetGitHubSyncHealth", async (input) => ({ data: links.getGitHubSyncHealth(application, actor, inputs.GetGitHubSyncHealth.parse(input).storyMapId) }));
  registerTool(context, "CreateGitHubIssueDryRun", (input) => ({ data: links.createGitHubIssueDryRun(application, actor, inputs.CreateGitHubIssueDryRun.parse(input)) }), undefined, true);
  registerTool(context, "PlanWorkItems", async (input) => ({ data: await planWorkItems(application, actor, inputs.PlanWorkItems.parse(input)) }));
  registerTool(context, "GetWorkItemSyncHealth", async (input) => ({ data: getWorkItemSyncHealth(application, actor, inputs.GetWorkItemSyncHealth.parse(input).storyMapId) }));
  registerTool(context, "ResolveSyncConflict", async (input) => { const parsed = inputs.ResolveSyncConflict.parse(input); return { data: await resolveSyncConflict(application, actor, parsed.conflictId, parsed) }; });
}
