import { remotePushPlanResponseSchema } from "@storymapper/contracts/schemas/remote-push";
import { z } from "zod";
import { syncItemResultSchema } from "@storymapper/contracts/schemas/sync-results";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";
import { createCardRequestSchema, updateCardRequestSchema, moveCardRequestSchema, createReleaseRequestSchema, updateReleaseRequestSchema, createPersonaRequestSchema, updatePersonaRequestSchema } from "@storymapper/contracts/api/card-customization";
import {
  changeOperationSchema,
  changeSetSchema,
  syncPlanSchema,
  uuidSchema
} from "@storymapper/contracts/schemas/domain";

export const mcpToolNameSchema = z.enum([
  "GetCardReviews", "CardReview",
  "GetPlanDriftReport", "ListPlanDriftSystems", "GetSlicesReport", "ListPlanStates", "GetPlanState", "ComparePlanStates",
  "ListProjects",
  "ListStoryMaps",
  "GetStoryMapData",
  "GetStoryMapCards",
  "GetStoryMapCardDetails",
  "GetStoryMapReleaseDetails",
  "GetReleaseNotes",
  "GetStoryMapPersonaDetails",
  "CreateStoryMapCard",
  "UpdateStoryMapCard",
  "MoveStoryMapCard",
  "DeleteOrArchiveStoryMapCard",
  "CreateStoryMapRelease",
  "UpdateStoryMapRelease",
  "CreateStoryMapPersona",
  "UpdateStoryMapPersona",
  "ListGitHubLinks",
  "ImportGitHubIssues",
  "LookupGitHubTicket",
  "ImportGitHubTicket",
  "PushCardsToGitHub",
  "SyncGitHubLinks",
  "PullStoryMapGitHubLinks",
  "ProposeMapFromSourceDocument",
  "ProposeBacklogGrooming",
  "ProposeReleaseSlice",
  "SubmitChangeSet",
  "ApplyChangeSet",
  "ApproveChangeSet",
  "CreateAiProposal",
  "ListAiTemplates",
  "CreateCardAttachment",
  "CreateCardSourceLink",
  "DeleteCardAnnotation",
  "DeleteCardAttachment",
  "DeleteCardPersona",
  "DeleteCardSourceLink",
  "GetCardHistory",
  "ListCardAttachments",
  "ParkCard",
  "SetCardAnnotation",
  "SetCardPersona",
  "SetCardDependency",
  "DeleteCardDependency",
  "SetExternalRef",
  "UnparkCard",
  "ListConnectorConnections",
  "CreateAnnotation",
  "CreateStoryTemplate",
  "CreateWorkflowStatus",
  "DeleteAnnotation",
  "DeleteStoryTemplate",
  "DeleteWorkflowStatus",
  "GetCustomization",
  "GetSafetySettings",
  "ListActivity",
  "UpdateAnnotation",
  "UpdateStoryTemplate",
  "UpdateWorkflowStatus",
  "ExportAudit",
  "ExportStoryMap",
  "CreateGitHubIssueDryRun",
  "CreateGitHubLink",
  "DeleteGitHubLink",
  "GetGitHubSyncHealth",
  "UpdateGitHubLink",
  "GetProductContext",
  "UpsertProductContext",
  "GetBacklogHealthReport",
  "GetReleaseSummaryReport",
  "GetReleaseTimelineReport",
  "GetSourceCoverageReport",
  "CreateRoadmapCard",
  "CreateRoadmapColumn",
  "CreateRoadmap",
  "CreateRoadmapReference",
  "CreateRoadmapSwimlane",
  "GetRoadmapDetails",
  "ListRoadmaps",
  "UpdateRoadmap",
  "ResolveSyncConflict",
  "GetWorkItemSyncHealth",
  "PlanWorkItems",
  "GetStoryMapSnapshot",
  "CreateStoryMap",
  "UpdateStoryMap",
  "DeleteStoryMap",
  "BulkUpdateCards",
  "UpdateDeliveryStatus",
  "DeleteCard", "DeleteCards",
  "DeletePersona",
  "DeleteRelease",
  "GetSourceDocument",
  "ImportSourceDocument",
  "ListSourceDocuments",
  "ListChangeSets"
]);

export type McpToolName = z.infer<typeof mcpToolNameSchema>;

export const changeSetCommandToolNames: ReadonlySet<McpToolName> = new Set(["SetCardDependency", "DeleteCardDependency", "UpdateDeliveryStatus", "SubmitChangeSet", "CreateStoryMapCard", "UpdateStoryMapCard", "MoveStoryMapCard", "DeleteOrArchiveStoryMapCard", "CreateStoryMapRelease", "UpdateStoryMapRelease", "CreateStoryMapPersona", "UpdateStoryMapPersona", "ImportGitHubIssues", "ImportGitHubTicket", "SyncGitHubLinks", "PullStoryMapGitHubLinks", "CreateCardAttachment", "CreateCardSourceLink", "DeleteCardAnnotation", "DeleteCardAttachment", "DeleteCardPersona", "DeleteCardSourceLink", "ParkCard", "SetCardAnnotation", "SetCardPersona", "SetExternalRef", "UnparkCard", "CreateAnnotation", "CreateStoryTemplate", "CreateWorkflowStatus", "DeleteAnnotation", "DeleteStoryTemplate", "DeleteWorkflowStatus", "UpdateAnnotation", "UpdateStoryTemplate", "UpdateWorkflowStatus", "CreateGitHubLink", "DeleteGitHubLink", "UpdateGitHubLink", "UpsertProductContext", "CreateRoadmapCard", "CreateRoadmapColumn", "CreateRoadmap", "CreateRoadmapReference", "CreateRoadmapSwimlane", "UpdateRoadmap", "ResolveSyncConflict", "CreateStoryMap", "UpdateStoryMap", "DeleteStoryMap", "BulkUpdateCards", "DeleteCard", "DeleteCards", "DeletePersona", "DeleteRelease", "ImportSourceDocument", "PushCardsToGitHub"]);

export const listStoryMapsToolInputSchema = z.object({
  projectId: uuidSchema.optional()
});

export const storyMapToolInputSchema = z.object({
  storyMapId: uuidSchema
});

export const cardDetailsToolInputSchema = z.object({
  cardId: uuidSchema
});

export const releaseDetailsToolInputSchema = z.object({
  storyMapId: uuidSchema,
  releaseId: uuidSchema.optional()
});

export const personaDetailsToolInputSchema = z.object({
  projectId: uuidSchema,
  storyMapId: uuidSchema.optional(),
  personaId: uuidSchema.optional()
});

export const createStoryMapCardToolInputSchema = createCardRequestSchema;

export const updateStoryMapCardToolInputSchema = z.object({ cardId: uuidSchema, baseVersion: baseVersionSchema, patch: updateCardRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() });

export const moveStoryMapCardToolInputSchema = moveCardRequestSchema.extend({ cardId: uuidSchema, baseVersion: baseVersionSchema });

export const deleteOrArchiveStoryMapCardToolInputSchema = z.object({
  cardId: uuidSchema,
  baseVersion: baseVersionSchema
}).extend({ apply: z.boolean().optional() });

export const importGitHubIssuesToolInputSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  query: z.string().optional()
}).extend({ apply: z.boolean().optional() });

export const pushCardsToGitHubToolInputSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  cardIds: z.array(uuidSchema).optional(),
  releaseId: uuidSchema.nullable().optional(),
  parentIssueNumber: z.number().refine(Number.isInteger).positive().optional()
}).extend({ apply: z.boolean().optional() });

export const syncGitHubLinksToolInputSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema
}).extend({ apply: z.boolean().optional() });

export const pullStoryMapGitHubLinksToolInputSchema = z.object({
  storyMapId: uuidSchema,
  connectionIds: z.array(uuidSchema).optional()
}).extend({ apply: z.boolean().optional() });

export const createStoryMapReleaseToolInputSchema = createReleaseRequestSchema;

export const updateStoryMapReleaseToolInputSchema = z.object({ storyMapId: uuidSchema, releaseId: uuidSchema, baseVersion: baseVersionSchema, patch: updateReleaseRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() });

export const createStoryMapPersonaToolInputSchema = createPersonaRequestSchema;

export const updateStoryMapPersonaToolInputSchema = z.object({ projectId: uuidSchema, personaId: uuidSchema, baseVersion: baseVersionSchema, patch: updatePersonaRequestSchema.omit({ apply: true }) }).extend({ apply: z.boolean().optional() });

export const proposeMapFromSourceDocumentInputSchema = z.object({
  projectId: uuidSchema,
  sourceDocumentId: uuidSchema,
  storyMapId: uuidSchema.optional(),
  mode: z.enum(["draft", "gap-fill"]).default("draft")
});

export const submitChangeSetInputSchema = z.object({
  projectId: changeSetSchema.shape.projectId,
  title: changeSetSchema.shape.title,
  operations: changeSetSchema.shape.operations,
  context: changeOperationSchema.options[0].shape.context,
  sources: changeOperationSchema.options[0].shape.sources,
  rationale: changeOperationSchema.options[0].shape.rationale,
  apply: z.boolean().optional()
}).strict();
export type SubmitChangeSetInput = z.infer<typeof submitChangeSetInputSchema>;

export const applyChangeSetInputSchema = z.object({
  changeSetId: uuidSchema,
  approvalToken: z.string().min(1),
  selectedOperationIds: z.array(z.string().trim().min(1)).optional()
}).strict();

export const approveChangeSetInputSchema = z.object({ changeSetId: uuidSchema, selectedOperationIds: z.array(z.string().trim().min(1)).optional() }).strict();

export const changeSetCommandResponseSchema = z.object({
  remotePush: remotePushPlanResponseSchema.optional(),
  changeSet: changeSetSchema,
  outcome: z.enum(["proposed", "applied"]),
  changeSetId: uuidSchema,
  previewRef: z.object({ changeSetId: uuidSchema }).strict(),
  plan: syncPlanSchema.optional(),
  items: z.array(syncItemResultSchema).optional()
}).strict();
export const incomingGitHubCommandResponseSchema = changeSetCommandResponseSchema.extend({ items: z.array(syncItemResultSchema) });
export type IncomingGitHubCommandResponse = z.infer<typeof incomingGitHubCommandResponseSchema>;
export type ChangeSetCommandResponse = z.infer<typeof changeSetCommandResponseSchema>;

export const mcpToolResultSchema = z.object({
  plan: syncPlanSchema.optional(),
  outcome: z.enum(["proposed", "applied"]).optional(),
  changeSetId: uuidSchema.optional(),
  previewRef: z.object({ changeSetId: uuidSchema }).strict().optional(),
  changeSet: changeSetSchema.optional(),
  data: z.unknown().optional(),
  auditEventId: uuidSchema.optional()
});

export type McpToolResult = z.infer<typeof mcpToolResultSchema>;
export type CreateStoryMapCardToolInput = z.infer<typeof createStoryMapCardToolInputSchema>;
export type UpdateStoryMapCardToolInput = z.infer<typeof updateStoryMapCardToolInputSchema>;
export type MoveStoryMapCardToolInput = z.infer<typeof moveStoryMapCardToolInputSchema>;
export type CreateStoryMapReleaseToolInput = z.infer<typeof createStoryMapReleaseToolInputSchema>;
export type UpdateStoryMapReleaseToolInput = z.infer<typeof updateStoryMapReleaseToolInputSchema>;
export type CreateStoryMapPersonaToolInput = z.infer<typeof createStoryMapPersonaToolInputSchema>;
export type UpdateStoryMapPersonaToolInput = z.infer<typeof updateStoryMapPersonaToolInputSchema>;
export type ImportGitHubIssuesToolInput = z.infer<typeof importGitHubIssuesToolInputSchema>;
export type PushCardsToGitHubToolInput = z.infer<typeof pushCardsToGitHubToolInputSchema>;
export type SyncGitHubLinksToolInput = z.infer<typeof syncGitHubLinksToolInputSchema>;
export type PullStoryMapGitHubLinksToolInput = z.infer<typeof pullStoryMapGitHubLinksToolInputSchema>;
