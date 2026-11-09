import { cardReviewCommandSchema, cardReviewQuerySchema } from "@storymapper/contracts/schemas/card-review";
import { z } from "zod";
import { lookupGitHubTicketRequestSchema, importGitHubTicketRequestSchema } from "@storymapper/contracts/api/github-ticket";
import * as request from "@storymapper/contracts/api/http";
import * as existing from "@storymapper/contracts/mcp/tools";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";
import { externalRefEntityTypeSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

import { setCardDependencyRequestSchema } from "@storymapper/contracts/api/card-dependencies";

const projectInputSchema = z.object({ projectId: uuidSchema });
const projectListInputSchema = projectInputSchema.partial();
const projectStoryMapInputSchema = projectInputSchema.extend({ storyMapId: uuidSchema.optional() });
const cardAnnotationInputSchema = existing.cardDetailsToolInputSchema.extend({ annotationId: uuidSchema });
const cardPersonaInputSchema = existing.cardDetailsToolInputSchema.extend({ personaId: uuidSchema });

export const mcpToolInputSchemas = {
  GetCardReviews: cardReviewQuerySchema.extend({ projectId: uuidSchema }).strict(),
  CardReview: z.object({ projectId: uuidSchema, command: cardReviewCommandSchema }).strict(),
  GetPlanDriftReport: existing.storyMapToolInputSchema.extend({ system: z.string().min(1) }),
  ListPlanDriftSystems: existing.storyMapToolInputSchema,
  GetSlicesReport: existing.storyMapToolInputSchema,
  ListPlanStates: existing.storyMapToolInputSchema,
  GetPlanState: existing.storyMapToolInputSchema.extend({ stateId: uuidSchema }),
  ComparePlanStates: existing.storyMapToolInputSchema.extend({ beforeId: uuidSchema, afterId: uuidSchema }),
  ListProjects: z.object({}),
  ListStoryMaps: existing.listStoryMapsToolInputSchema,
  GetStoryMapData: existing.storyMapToolInputSchema,
  GetStoryMapCards: existing.storyMapToolInputSchema,
  GetStoryMapCardDetails: existing.cardDetailsToolInputSchema,
  GetStoryMapReleaseDetails: existing.releaseDetailsToolInputSchema,
  GetReleaseNotes: request.releaseNotesRequestSchema,
  GetStoryMapPersonaDetails: existing.personaDetailsToolInputSchema,
  CreateStoryMapCard: existing.createStoryMapCardToolInputSchema,
  UpdateStoryMapCard: existing.updateStoryMapCardToolInputSchema,
  MoveStoryMapCard: existing.moveStoryMapCardToolInputSchema,
  DeleteOrArchiveStoryMapCard: existing.deleteOrArchiveStoryMapCardToolInputSchema,
  CreateStoryMapRelease: existing.createStoryMapReleaseToolInputSchema,
  UpdateStoryMapRelease: existing.updateStoryMapReleaseToolInputSchema,
  CreateStoryMapPersona: existing.createStoryMapPersonaToolInputSchema,
  UpdateStoryMapPersona: existing.updateStoryMapPersonaToolInputSchema,
  ListGitHubLinks: existing.storyMapToolInputSchema,
  ImportGitHubIssues: existing.importGitHubIssuesToolInputSchema,
  LookupGitHubTicket: lookupGitHubTicketRequestSchema,
  ImportGitHubTicket: importGitHubTicketRequestSchema,
  PushCardsToGitHub: existing.pushCardsToGitHubToolInputSchema,
  SyncGitHubLinks: existing.syncGitHubLinksToolInputSchema,
  PullStoryMapGitHubLinks: existing.pullStoryMapGitHubLinksToolInputSchema,
  ProposeMapFromSourceDocument: existing.proposeMapFromSourceDocumentInputSchema,
  ProposeBacklogGrooming: existing.storyMapToolInputSchema,
  ProposeReleaseSlice: request.proposeReleaseSliceRequestSchema,
  SubmitChangeSet: existing.submitChangeSetInputSchema,
  ApplyChangeSet: existing.applyChangeSetInputSchema,
  ApproveChangeSet: existing.approveChangeSetInputSchema,
  CreateAiProposal: request.createAiProposalRequestSchema,
  ListAiTemplates: request.listAiTemplatesRequestSchema,
  CreateCardAttachment: request.createCardAttachmentRequestSchema.extend({ cardId: uuidSchema }),
  CreateCardSourceLink: z.discriminatedUnion("kind", [
    request.createCardSourceLinkRequestSchema.options[0].extend({ cardId: uuidSchema }),
    request.createCardSourceLinkRequestSchema.options[1].extend({ cardId: uuidSchema }),
    request.createCardSourceLinkRequestSchema.options[2].extend({ cardId: uuidSchema })
  ]),
  DeleteCardAnnotation: cardAnnotationInputSchema.extend({ apply: z.boolean().optional() }),
  DeleteCardAttachment: existing.cardDetailsToolInputSchema.extend({ attachmentId: uuidSchema }).extend({ apply: z.boolean().optional() }),
  DeleteCardPersona: cardPersonaInputSchema.extend({ apply: z.boolean().optional() }),
  DeleteCardSourceLink: request.deleteCardSourceLinkRequestSchema.extend({ cardId: uuidSchema }),
  GetCardHistory: request.cardHistoryQuerySchema.extend({ cardId: uuidSchema }),
  ListCardAttachments: existing.cardDetailsToolInputSchema,
  ParkCard: request.parkCardRequestSchema.extend({ cardId: uuidSchema, baseVersion: baseVersionSchema }),
  SetCardAnnotation: cardAnnotationInputSchema.extend({ apply: z.boolean().optional() }),
  SetCardDependency: setCardDependencyRequestSchema.extend({ cardId: uuidSchema }),
  DeleteCardDependency: setCardDependencyRequestSchema.extend({ cardId: uuidSchema }),
  SetCardPersona: cardPersonaInputSchema.extend({ apply: z.boolean().optional() }),
  SetExternalRef: request.setExternalRefRequestSchema.extend({ entityType: externalRefEntityTypeSchema, entityId: uuidSchema }),
  UnparkCard: existing.cardDetailsToolInputSchema.extend({ baseVersion: baseVersionSchema }).extend({ apply: z.boolean().optional() }),
  ListConnectorConnections: projectInputSchema,
  CreateAnnotation: request.createAnnotationRequestSchema,
  CreateStoryTemplate: request.createStoryTemplateRequestSchema,
  CreateWorkflowStatus: request.createWorkflowStatusRequestSchema,
  DeleteAnnotation: request.deleteAnnotationRequestSchema.extend({ annotationId: uuidSchema }),
  DeleteStoryTemplate: z.object({ templateId: uuidSchema }).extend({ apply: z.boolean().optional() }),
  DeleteWorkflowStatus: request.deleteWorkflowStatusRequestSchema.extend({ statusId: uuidSchema }),
  GetCustomization: projectStoryMapInputSchema,
  GetSafetySettings: projectInputSchema,
  ListActivity: request.activityQuerySchema,
  UpdateAnnotation: z.object({ annotationId: uuidSchema, patch: request.updateAnnotationRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  UpdateStoryTemplate: z.object({ templateId: uuidSchema, patch: request.updateStoryTemplateRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  UpdateWorkflowStatus: z.object({ statusId: uuidSchema, patch: request.updateWorkflowStatusRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  ExportAudit: request.auditExportQuerySchema,
  ExportStoryMap: request.storyMapExportQuerySchema,
  CreateGitHubIssueDryRun: request.createGitHubIssueDryRunRequestSchema,
  CreateGitHubLink: request.createGitHubLinkRequestSchema,
  DeleteGitHubLink: z.object({ linkId: uuidSchema }).extend({ apply: z.boolean().optional() }),
  GetGitHubSyncHealth: existing.storyMapToolInputSchema,
  UpdateGitHubLink: z.object({ linkId: uuidSchema, patch: request.updateGitHubLinkRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  GetProductContext: projectStoryMapInputSchema,
  UpsertProductContext: request.upsertProductContextRequestSchema,
  GetBacklogHealthReport: existing.storyMapToolInputSchema,
  GetReleaseSummaryReport: existing.releaseDetailsToolInputSchema.extend({ releaseId: uuidSchema.nullable().optional(), includeReleased: z.boolean().optional() }),
  GetReleaseTimelineReport: existing.storyMapToolInputSchema,
  GetSourceCoverageReport: projectInputSchema,
  CreateRoadmapCard: request.createRoadmapCardRequestSchema,
  CreateRoadmapColumn: request.createRoadmapColumnRequestSchema,
  CreateRoadmap: request.createRoadmapRequestSchema,
  CreateRoadmapReference: request.createRoadmapReferenceRequestSchema,
  CreateRoadmapSwimlane: request.createRoadmapSwimlaneRequestSchema,
  GetRoadmapDetails: z.object({ roadmapId: uuidSchema }),
  ListRoadmaps: projectStoryMapInputSchema,
  UpdateRoadmap: z.object({ roadmapId: uuidSchema, baseVersion: baseVersionSchema, patch: request.updateRoadmapRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  ResolveSyncConflict: request.resolveSyncConflictRequestSchema.extend({ conflictId: uuidSchema }),
  GetWorkItemSyncHealth: existing.storyMapToolInputSchema,
  PlanWorkItems: request.planWorkItemSyncRequestSchema,
  GetStoryMapSnapshot: existing.storyMapToolInputSchema,
  CreateStoryMap: request.createStoryMapRequestSchema,
  UpdateStoryMap: z.object({ storyMapId: uuidSchema, baseVersion: baseVersionSchema, patch: request.updateStoryMapRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() }),
  DeleteStoryMap: request.deleteStoryMapParamsSchema.extend({ apply: z.boolean().optional() }),
  UpdateDeliveryStatus: request.updateDeliveryStatusRequestSchema,
  BulkUpdateCards: request.bulkUpdateCardsCommandSchema,
  DeleteCards: request.deleteCardsCommandSchema,
  DeleteCard: request.deleteCardRequestSchema.extend({ cardId: uuidSchema, baseVersion: baseVersionSchema }),
  DeletePersona: request.deletePersonaCommandSchema.extend({ personaId: uuidSchema }),
  DeleteRelease: z.object({ releaseId: uuidSchema, baseVersion: baseVersionSchema }).extend({ apply: z.boolean().optional() }),
  GetSourceDocument: z.object({ documentId: uuidSchema }),
  ImportSourceDocument: request.importSourceDocumentFieldsSchema
    .omit({ filePath: true })
    .extend({ content: request.preparedSourceDocumentImportSchema.shape.content.regex(/\S/, { message: "Content must not be empty." }) })
    .strict(),
  ListSourceDocuments: projectListInputSchema,
  ListChangeSets: projectListInputSchema
} satisfies Record<existing.McpToolName, z.ZodType>;

export type McpToolInput<Name extends existing.McpToolName> = z.infer<typeof mcpToolInputSchemas[Name]>;

export function parseMcpToolAuditInput(name: existing.McpToolName, input: unknown): unknown {
  return parseDeclaredFields(mcpToolInputSchemas[name], input);
}

function parseDeclaredFields(schema: z.ZodType, input: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) return parseDeclaredFields(schema.unwrap() as z.ZodType, input);
  if (schema instanceof z.ZodObject && input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    return Object.fromEntries(Object.entries(schema.shape).flatMap(([key, field]) => {
      if (!(key in record)) return [];
      const value = parseDeclaredFields(field as z.ZodType, record[key]);
      return value === undefined ? [] : [[key, value]];
    }));
  }
  if (schema instanceof z.ZodArray && Array.isArray(input)) return input.map((value) => parseDeclaredFields(schema.element as z.ZodType, value)).filter((value) => value !== undefined);
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}
