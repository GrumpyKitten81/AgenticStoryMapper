import { z } from "zod";
import { connectionVerificationFailureSchema, repositoryCapabilitiesSchema } from "@storymapper/contracts/schemas/github-connection";
import { builtinProposalTemplateSchema } from "@storymapper/contracts/schemas/proposal-templates";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";
import { syncItemResultSchema } from "@storymapper/contracts/schemas/sync-results";
import { restorePointSchema, restorePointCapabilitySchema } from "@storymapper/contracts/schemas/restore-points";
import {
  incomingGitHubCommandResponseSchema,
  mcpToolNameSchema,
  mcpToolResultSchema
} from "@storymapper/contracts/mcp/tools";
import {
  gettingStartedChecklistSchema,
  backlogHealthReportSchema,
  cardSourceLinkSchema,
  cardKeyPrefixSchema,
  changeSetSchema,
  storedChangeSetSchema,
  connectorConnectionSchema,
  credentialStatusSchema,
  credentialSourceSchema,
  githubIssueDryRunSchema,
  githubLinkSchema,
  githubSyncHealthReportSchema,
  safetySettingsSchema,
  agentModeSchema,
  aiFunctionTemplateSchema,
  productContextSchema,
  projectSchema,
  releaseSummaryReportSchema,
  releaseTimelineReportSchema,
  remoteWorkItemLinkSchema,
  roadmapCardSchema,
  roadmapColumnSchema,
  roadmapDetailsSchema,
  roadmapReferenceSchema,
  roadmapSchema,
  roadmapSwimlaneSchema,
  storyMapExportFormatSchema,
  projectArchiveManifestSchema,
  sourceChunkSchema,
  sourceCoverageReportSchema,
  sourceDocumentSchema,
  sha256HexSchema,
  sourceDocumentDetailsSchema,
  sourceDocumentSummarySchema,
  storyMapSnapshotSchema,
  externalRefSchema,
  storyMapSchema,
  syncConflictSchema,
  workItemSyncHealthReportSchema,
  syncConflictReviewSchema,
  syncPlanSchema,
  syncRunSchema,
  workItemProviderSchema,
  uuidSchema
} from "@storymapper/contracts/schemas/domain";

export * from "@storymapper/contracts/api/card-customization";
export * from "@storymapper/contracts/schemas/audit";

export const listProjectsResponseSchema = z.object({
  projects: z.array(projectSchema)
});

export const restorePointProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();
export const createRestorePointRequestSchema = z.object({ class: z.literal("manual") }).strict();
export const createRestorePointResponseSchema = z.object({ restorePoint: restorePointSchema }).strict();
export const listRestorePointsResponseSchema = z.object({ restorePoints: z.array(restorePointSchema) }).strict();
export const restorePointCapabilitiesResponseSchema = z.object({ capabilities: z.array(restorePointCapabilitySchema) }).strict();
export type CreateRestorePointRequest = z.infer<typeof createRestorePointRequestSchema>;
export type CreateRestorePointResponse = z.infer<typeof createRestorePointResponseSchema>;
export type ListRestorePointsResponse = z.infer<typeof listRestorePointsResponseSchema>;

export const createProjectRequestSchema = z.object({
  name: z.string().min(1),
  localPath: z.string().optional(),
  description: z.string().optional()
});

export const listStoryMapsResponseSchema = z.object({
  storyMaps: z.array(storyMapSchema)
});

export const createStoryMapRequestSchema = z.object({
  epicContext: storyMapSchema.shape.epicContext,
  projectId: uuidSchema,
  name: z.string().min(1),
  description: z.string().optional()
}).extend({ apply: z.boolean().optional() });

export const updateStoryMapRequestSchema = z.object({
  epicContext: storyMapSchema.shape.epicContext,
  cardKeyPrefix: cardKeyPrefixSchema.optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  defaultConnectionId: uuidSchema.nullable().optional()
}).extend({ apply: z.boolean().optional() });

export const getStoryMapResponseSchema = storyMapSnapshotSchema;

export const productContextResponseSchema = z.object({
  context: productContextSchema
});

export const upsertProductContextRequestSchema = productContextSchema
  .pick({
    projectId: true,
    storyMapId: true,
    productType: true,
    purpose: true,
    keyFeatures: true,
    targetUsers: true,
    platform: true,
    pricing: true,
    notes: true,
    glossary: true,
    nonGoals: true,
    complianceConstraints: true
  })
  .extend({
    productType: productContextSchema.shape.productType.removeDefault(),
    purpose: productContextSchema.shape.purpose.removeDefault(),
    keyFeatures: productContextSchema.shape.keyFeatures.removeDefault(),
    targetUsers: productContextSchema.shape.targetUsers.removeDefault(),
    platform: productContextSchema.shape.platform.removeDefault(),
    pricing: productContextSchema.shape.pricing.removeDefault(),
    notes: productContextSchema.shape.notes.removeDefault(),
    glossary: productContextSchema.shape.glossary.removeDefault(),
    nonGoals: productContextSchema.shape.nonGoals.removeDefault(),
    complianceConstraints: productContextSchema.shape.complianceConstraints.removeDefault()
  })
  .partial({
    storyMapId: true,
    productType: true,
    purpose: true,
    keyFeatures: true,
    targetUsers: true,
    platform: true,
    pricing: true,
    notes: true,
    glossary: true,
    nonGoals: true,
    complianceConstraints: true
  }).extend({ apply: z.boolean().optional() });

export const listAiTemplatesRequestSchema = z.object({ projectId: uuidSchema });
export const createAiTemplateRequestSchema = aiFunctionTemplateSchema;
export const updateAiTemplateRequestSchema = aiFunctionTemplateSchema.omit({ projectId: true, id: true }).extend({
  arguments: aiFunctionTemplateSchema.shape.arguments.removeDefault(),
  examples: aiFunctionTemplateSchema.shape.examples.removeDefault(),
  outputSchemaName: aiFunctionTemplateSchema.shape.outputSchemaName.nullable()
}).partial();
export const aiFunctionTemplatesResponseSchema = z.object({ templates: z.array(aiFunctionTemplateSchema) });
export type CreateAiTemplateRequest = z.infer<typeof createAiTemplateRequestSchema>;
export type UpdateAiTemplateRequest = z.infer<typeof updateAiTemplateRequestSchema>;
export type ListAiTemplatesRequest = z.infer<typeof listAiTemplatesRequestSchema>;

export const listSourceDocumentsResponseSchema = z.object({
  documents: z.array(sourceDocumentSummarySchema)
});

export const importSourceDocumentFieldsSchema = z.object({
  projectId: uuidSchema,
  title: z.string().min(1),
  type: z.enum(["markdown", "txt"]),
  content: z.string().optional(),
  filePath: z.string().optional()
}).extend({ apply: z.boolean().optional() });

export const importSourceDocumentRequestSchema = importSourceDocumentFieldsSchema.refine((value) => Boolean(value.content?.trim() || value.filePath?.trim()), {
  message: "Either content or filePath is required."
});

export const preparedSourceDocumentImportSchema = z.object({ ...importSourceDocumentFieldsSchema.shape, content: z.string(), fileHash: sha256HexSchema, parsedChunks: z.array(sourceChunkSchema.pick({ heading: true, locator: true, text: true })) });
export type PreparedSourceDocumentImport = z.infer<typeof preparedSourceDocumentImportSchema>;

export const importSourceDocumentResponseSchema = z.object({
  document: sourceDocumentSchema,
  chunks: z.array(sourceChunkSchema),
  status: z.enum(["imported", "unchanged"])
});

export const getSourceDocumentResponseSchema = sourceDocumentDetailsSchema;

export const createCardSourceLinkRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chunk"), chunkId: sha256HexSchema, confidence: z.number().min(0).max(1).optional(), apply: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("github"), externalRefId: uuidSchema, apply: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("note"), note: z.string().trim().regex(/\S/, "Note must not be blank."), apply: z.boolean().optional() }).strict()
]);
export const deleteCardSourceLinkRequestSchema = z.object({ kind: z.enum(["chunk", "github", "note"]), id: uuidSchema, apply: z.boolean().optional() }).strict();
export type DeleteCardSourceLinkRequest = z.infer<typeof deleteCardSourceLinkRequestSchema>;

export const createCardSourceLinkResponseSchema = z.object({
  link: cardSourceLinkSchema
});

export const deleteCardSourceLinkResponseSchema = z.object({
  ok: z.boolean()
});

export const setExternalRefRequestSchema = z.object({
  system: z.string().regex(/^[a-z0-9-]+$/),
  externalId: z.string().trim().min(1)
}).strict().extend({ apply: z.boolean().optional() });

export const setExternalRefResponseSchema = z.object({
  ref: externalRefSchema,
  status: z.enum(["created", "unchanged"])
}).strict();

export const sourceCoverageReportResponseSchema = sourceCoverageReportSchema;

export const backlogHealthReportResponseSchema = backlogHealthReportSchema;

export const releaseSummaryReportResponseSchema = releaseSummaryReportSchema;
export const releaseTimelineReportResponseSchema = releaseTimelineReportSchema;

export const listRoadmapsResponseSchema = z.object({
  roadmaps: z.array(roadmapSchema)
});

export const createRoadmapRequestSchema = roadmapSchema
  .pick({
    projectId: true,
    storyMapId: true,
    name: true,
    type: true
  })
  .extend({
    type: roadmapSchema.shape.type.removeDefault()
  })
  .partial({
    storyMapId: true,
    type: true
  }).extend({ apply: z.boolean().optional() });

export const updateRoadmapRequestSchema = roadmapSchema
  .pick({
    name: true,
    type: true
  })
  .extend({
    type: roadmapSchema.shape.type.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });

export const roadmapDetailsResponseSchema = roadmapDetailsSchema;

export const createRoadmapColumnRequestSchema = roadmapColumnSchema
  .pick({
    roadmapId: true,
    name: true,
    position: true
  })
  .partial({
    position: true
  }).extend({ apply: z.boolean().optional() });

export const createRoadmapSwimlaneRequestSchema = roadmapSwimlaneSchema
  .pick({
    roadmapId: true,
    name: true,
    position: true
  })
  .partial({
    position: true
  }).extend({ apply: z.boolean().optional() });

export const createRoadmapCardRequestSchema = roadmapCardSchema
  .pick({
    roadmapId: true,
    columnId: true,
    swimlaneId: true,
    title: true,
    details: true,
    labels: true,
    reach: true,
    impact: true,
    confidence: true,
    effort: true,
    position: true
  })
  .extend({
    details: roadmapCardSchema.shape.details.removeDefault(),
    labels: roadmapCardSchema.shape.labels.removeDefault()
  })
  .partial({
    swimlaneId: true,
    details: true,
    labels: true,
    reach: true,
    impact: true,
    confidence: true,
    effort: true,
    position: true
  }).extend({ apply: z.boolean().optional() });

export const createRoadmapReferenceRequestSchema = roadmapReferenceSchema
  .pick({
    roadmapCardId: true,
    targetType: true,
    targetId: true
  }).extend({ apply: z.boolean().optional() });

export const safetySettingsResponseSchema = z.object({
  settings: safetySettingsSchema.required({ agentMode: true, github: true })
});

export const updateSafetySettingsRequestSchema = z
  .object({
    agentMode: agentModeSchema.optional(),
    github: z.boolean().optional()
  })
  .strict();

export const storyMapExportQuerySchema = z.object({
  storyMapId: uuidSchema,
  format: storyMapExportFormatSchema.default("json")
});

export const auditExportQuerySchema = z.object({
  projectId: uuidSchema,
  format: z.enum(["json", "markdown"]).default("json")
});

export const importProjectArchiveResponseSchema = z.object({
  localPath: z.string(),
  projectId: uuidSchema,
  opened: z.literal(true),
  manifest: projectArchiveManifestSchema
});
export type ImportProjectArchiveResponse = z.infer<typeof importProjectArchiveResponseSchema>;

const githubLinkPayloadSchema = githubLinkSchema
  .pick({
    cardId: true,
    releaseId: true,
    repo: true,
    issueNumber: true,
    url: true
  })
  .partial({
    cardId: true,
    releaseId: true,
    issueNumber: true
  });

export const createGitHubLinkRequestSchema = githubLinkPayloadSchema
  .extend({ connectionId: uuidSchema.optional(), apply: z.boolean().optional() }).strict().refine((value) => Boolean(value.cardId) !== Boolean(value.releaseId), {
    message: "Exactly one cardId or releaseId is required."
  });

export const updateGitHubLinkRequestSchema = githubLinkPayloadSchema.partial().extend({ apply: z.boolean().optional() }).strict();

export const listGitHubLinksResponseSchema = z.object({
  links: z.array(githubLinkSchema)
});

export const gitHubLinkResponseSchema = z.object({
  link: githubLinkSchema
});

export const deleteGitHubLinkResponseSchema = z.object({
  ok: z.boolean()
});

export const gitHubSyncHealthResponseSchema = githubSyncHealthReportSchema;

export const createGitHubIssueDryRunRequestSchema = z.object({
  storyMapId: uuidSchema,
  cardIds: z.array(uuidSchema).optional(),
  releaseId: uuidSchema.nullable().optional(),
  repo: z.string().min(1),
  exportLabel: z.string().min(1).default("local-story-map"),
  milestone: z.string().optional()
});

export const createGitHubIssueDryRunResponseSchema = z.object({
  dryRuns: z.array(githubIssueDryRunSchema)
});

export const createConnectorConnectionRequestSchema = connectorConnectionSchema
  .pick({
    projectId: true,
    provider: true,
    name: true,
    authMode: true,
    owner: true,
    repository: true,
    defaultLabel: true,
    readOnly: true,
    statusSource: true,
    statusMapping: true,
    typeMapping: true,
    issueTypeMapping: true,
    releaseSource: true,
    iterationFieldName: true,
    labelsAsAnnotations: true
  })
  .extend({
    defaultLabel: connectorConnectionSchema.shape.defaultLabel.removeDefault(),
    readOnly: connectorConnectionSchema.shape.readOnly.removeDefault(),
    statusMapping: connectorConnectionSchema.shape.statusMapping.removeDefault(),
    typeMapping: connectorConnectionSchema.shape.typeMapping.removeDefault(),
    issueTypeMapping: connectorConnectionSchema.shape.issueTypeMapping.removeDefault(),
    releaseSource: connectorConnectionSchema.shape.releaseSource.removeDefault(),
    iterationFieldName: connectorConnectionSchema.shape.iterationFieldName.removeDefault(),
    labelsAsAnnotations: connectorConnectionSchema.shape.labelsAsAnnotations.removeDefault()
  })
  .partial({
    repository: true,
    defaultLabel: true,
    readOnly: true,
    statusMapping: true,
    typeMapping: true,
    issueTypeMapping: true,
    releaseSource: true,
    iterationFieldName: true,
    labelsAsAnnotations: true
  }).strict();

export const updateConnectorConnectionRequestSchema = createConnectorConnectionRequestSchema
  .omit({ projectId: true, provider: true })
  .partial();

export const listConnectorConnectionsResponseSchema = z.object({
  connections: z.array(connectorConnectionSchema)
});

export const connectorConnectionResponseSchema = z.object({
  connection: connectorConnectionSchema
});

export const credentialStatusesResponseSchema = z.object({ credentials: z.array(credentialStatusSchema) });

const githubCredentialTokenSchema = z.string().min(1).refine((value) => !/\s/.test(value), "A nonempty GitHub token without whitespace is required.");
export const storeGitHubCredentialRequestSchema = z.object({ token: githubCredentialTokenSchema }).strict();
export const userCredentialFileSchema = z.object({ github: storeGitHubCredentialRequestSchema }).strict();
export const storeGitHubCredentialResponseSchema = z.object({ ok: z.literal(true), source: z.literal("user-file"), location: z.string() });
export type StoreGitHubCredentialRequest = z.infer<typeof storeGitHubCredentialRequestSchema>;
export type StoreGitHubCredentialResponse = z.infer<typeof storeGitHubCredentialResponseSchema>;

export const validateConnectorConnectionRequestSchema = createConnectorConnectionRequestSchema;

export const gitHubConnectionCandidateSchema = z.object({
  configuration: createConnectorConnectionRequestSchema.extend({ repository: connectorConnectionSchema.shape.repository.unwrap() }).strict(),
  connectionId: uuidSchema.optional(),
  credential: z.discriminatedUnion("method", [
    z.object({ method: z.literal("token"), token: githubCredentialTokenSchema }).strict(),
    z.object({ method: z.literal("github-cli") }).strict()
  ])
}).strict().refine((value) => value.configuration.authMode === value.credential.method, "Credential method must match the connection authentication mode.");
export const verifyGitHubConnectionRequestSchema = z.object({ candidate: gitHubConnectionCandidateSchema, consent: z.literal(true) }).strict();
export const connectGitHubConnectionRequestSchema = z.object({ candidate: gitHubConnectionCandidateSchema, verificationId: uuidSchema, confirm: z.literal(true) }).strict();
export const verifyGitHubConnectionResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), verificationId: uuidSchema, verifiedSource: z.enum(["candidate-token", "github-cli"]), operationalSource: credentialSourceSchema, capabilities: repositoryCapabilitiesSchema, githubEnabled: z.boolean(), message: z.string() }).strict(),
  z.object({ ok: z.literal(false), failure: connectionVerificationFailureSchema }).strict()
]);
export const connectGitHubConnectionResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), connection: connectorConnectionSchema, connections: z.array(connectorConnectionSchema), settings: safetySettingsSchema, credentials: z.array(credentialStatusSchema), credentialStored: z.boolean(), publicationWarning: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), failure: connectionVerificationFailureSchema, credentialStored: z.boolean(), databaseCommitted: z.literal(false) }).strict()
]);
export type GitHubConnectionCandidate = z.infer<typeof gitHubConnectionCandidateSchema>;
export type VerifyGitHubConnectionRequest = z.infer<typeof verifyGitHubConnectionRequestSchema>;
export type VerifyGitHubConnectionResponse = z.infer<typeof verifyGitHubConnectionResponseSchema>;
export type ConnectGitHubConnectionRequest = z.infer<typeof connectGitHubConnectionRequestSchema>;
export type ConnectGitHubConnectionResponse = z.infer<typeof connectGitHubConnectionResponseSchema>;

export const validateConnectorConnectionResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  provider: workItemProviderSchema,
  credentials: z.array(credentialStatusSchema).default([]),
  details: z.record(z.string(), z.unknown()).optional()
});

export const workItemSelectionSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  cardIds: z.array(uuidSchema).optional(),
  releaseId: uuidSchema.nullable().optional(),
  parentIssueNumber: z.number().refine(Number.isInteger).positive().optional()
});

export const planWorkItemSyncRequestSchema = workItemSelectionSchema.extend({
  mode: z.enum(["push", "import", "sync"]).default("push"),
  query: z.string().optional(),
  conflictId: uuidSchema.optional(),
  reviewed: syncConflictReviewSchema.optional()
});

export const applyWorkItemSyncRequestSchema = workItemSelectionSchema.extend({
  confirm: z.literal(true)
});

export const importWorkItemsRequestSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  query: z.string().optional()
}).extend({ apply: z.boolean().optional() });

export const syncWorkItemsRequestSchema = workItemSelectionSchema.extend({
  confirm: z.literal(true)
}).extend({ apply: z.boolean().optional() });

export const pullStoryMapWorkItemsRequestSchema = z.object({
  storyMapId: uuidSchema,
  connectionIds: z.array(uuidSchema).optional(),
  confirm: z.literal(true)
}).extend({ apply: z.boolean().optional() });

export const syncPlanResponseSchema = z.object({
  plan: syncPlanSchema
});

export const applyWorkItemSyncResponseSchema = z.object({
  run: syncRunSchema,
  links: z.array(remoteWorkItemLinkSchema),
  items: z.array(syncItemResultSchema)
});

export const importWorkItemsResponseSchema = incomingGitHubCommandResponseSchema;

export const pullStoryMapWorkItemsResponseSchema = incomingGitHubCommandResponseSchema;

export const workItemSyncHealthResponseSchema = workItemSyncHealthReportSchema;

export const resolveSyncConflictRequestSchema = z.object({
  storyMapId: uuidSchema,
  resolution: z.enum(["local", "remote"]),
  reviewed: syncConflictReviewSchema
}).extend({ apply: z.boolean().optional() });

export const resolveSyncConflictResponseSchema = z.object({
  conflict: syncConflictSchema
});

export const cardSourceLinksResponseSchema = z.object({
  links: z.array(cardSourceLinkSchema)
});

export const listChangeSetsResponseSchema = z.object({
  changeSets: z.array(storedChangeSetSchema)
});

export const releaseTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), releaseId: uuidSchema }).strict(),
  z.object({ kind: z.literal("new") }).strict()
]);

export const proposeReleaseSliceRequestSchema = z.object({
  storyMapId: uuidSchema,
  releaseTarget: releaseTargetSchema,
  rationale: z.string().trim().min(1).optional()
}).strict();

export const releaseNotesRequestSchema = z.object({ storyMapId: uuidSchema, releaseId: uuidSchema }).strict();
export const releaseNotesResponseSchema = z.object({ markdown: z.string() }).strict();
export type ReleaseTarget = z.infer<typeof releaseTargetSchema>;
export type ProposeReleaseSliceRequest = z.infer<typeof proposeReleaseSliceRequestSchema>;
export type ReleaseNotesRequest = z.infer<typeof releaseNotesRequestSchema>;
export type ReleaseNotesResponse = z.infer<typeof releaseNotesResponseSchema>;

const aiProposalFields = {
  projectId: uuidSchema,
  storyMapId: uuidSchema,
  personaId: uuidSchema.optional(),
  sourceDocumentId: uuidSchema.optional()
};
export const createAiProposalRequestSchema = z.discriminatedUnion("templateId", [
  z.object({ ...aiProposalFields, templateId: z.literal("release-slice"), releaseTarget: releaseTargetSchema, rationale: z.string().trim().min(1).optional() }).strict(),
  z.object({ ...aiProposalFields, templateId: builtinProposalTemplateSchema.exclude(["release-slice"]), cardIds: z.array(uuidSchema).optional(), releaseId: uuidSchema.optional() }).strict()
]);

export const createAiProposalResponseSchema = z.object({
  changeSet: changeSetSchema
});

export const mcpToolsResponseSchema = z.object({
  tools: z.array(z.object({
    name: mcpToolNameSchema,
    description: z.string(),
    permission: z.enum(["read", "proposal", "approval", "write", "github", "admin"]),
    enabled: z.boolean()
  }))
});

export const mcpCallRequestSchema = z.object({
  name: z.string().min(1),
  input: z.unknown().optional()
}).strict();

export const mcpCallResponseSchema = mcpToolResultSchema;

const mcpHostCommandSchema = z.object({ command: z.string(), args: z.array(z.string()) });
const mcpHostConfigurationSchema = z.object({ mcpServers: z.object({ storymapper: mcpHostCommandSchema }) });
export const mcpHostConfigsResponseSchema = z.object({
  workspaceRoot: z.string(), databasePath: z.string(), runtimeDirectory: z.string(), bridgePath: z.string(),
  development: mcpHostCommandSchema, production: mcpHostCommandSchema,
  claudeDesktop: mcpHostConfigurationSchema, cursor: mcpHostConfigurationSchema,
  vsCode: z.object({ servers: z.object({ storymapper: mcpHostCommandSchema.extend({ type: z.literal("stdio") }) }) })
});
export type McpHostConfigsResponse = z.infer<typeof mcpHostConfigsResponseSchema>;

export const changeSetStatusResponseSchema = z.object({
  changeSet: changeSetSchema
});

export const applyChangeSetResponseSchema = changeSetStatusResponseSchema;

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateStoryMapRequest = z.infer<typeof createStoryMapRequestSchema>;
export type UpdateStoryMapRequest = z.infer<typeof updateStoryMapRequestSchema>;
export type UpsertProductContextRequest = z.infer<typeof upsertProductContextRequestSchema>;
export type CreateRoadmapRequest = z.infer<typeof createRoadmapRequestSchema>;
export type UpdateRoadmapRequest = z.infer<typeof updateRoadmapRequestSchema>;
export type CreateRoadmapColumnRequest = z.infer<typeof createRoadmapColumnRequestSchema>;
export type CreateRoadmapSwimlaneRequest = z.infer<typeof createRoadmapSwimlaneRequestSchema>;
export type CreateRoadmapCardRequest = z.infer<typeof createRoadmapCardRequestSchema>;
export type CreateRoadmapReferenceRequest = z.infer<typeof createRoadmapReferenceRequestSchema>;
export type UpdateSafetySettingsRequest = z.infer<typeof updateSafetySettingsRequestSchema>;
export type ImportSourceDocumentRequest = z.infer<typeof importSourceDocumentRequestSchema>;
export type CreateCardSourceLinkRequest = z.infer<typeof createCardSourceLinkRequestSchema>;
export type SetExternalRefRequest = z.infer<typeof setExternalRefRequestSchema>;
export type SetExternalRefResponse = z.infer<typeof setExternalRefResponseSchema>;
export type CreateGitHubLinkRequest = z.infer<typeof createGitHubLinkRequestSchema>;
export type UpdateGitHubLinkRequest = z.infer<typeof updateGitHubLinkRequestSchema>;
export type CreateGitHubIssueDryRunRequest = z.infer<typeof createGitHubIssueDryRunRequestSchema>;
export type CreateConnectorConnectionRequest = z.infer<typeof createConnectorConnectionRequestSchema>;
export type UpdateConnectorConnectionRequest = z.infer<typeof updateConnectorConnectionRequestSchema>;
export type ValidateConnectorConnectionRequest = z.infer<typeof validateConnectorConnectionRequestSchema>;
export type PlanWorkItemSyncRequest = z.infer<typeof planWorkItemSyncRequestSchema>;
export type ApplyWorkItemSyncRequest = z.infer<typeof applyWorkItemSyncRequestSchema>;
export type ImportWorkItemsRequest = z.infer<typeof importWorkItemsRequestSchema>;
export type SyncWorkItemsRequest = z.infer<typeof syncWorkItemsRequestSchema>;
export type PullStoryMapWorkItemsRequest = z.infer<typeof pullStoryMapWorkItemsRequestSchema>;
export type ResolveSyncConflictRequest = z.infer<typeof resolveSyncConflictRequestSchema>;
export type CreateAiProposalRequest = z.infer<typeof createAiProposalRequestSchema>;
export type McpCallRequest = z.infer<typeof mcpCallRequestSchema>;
export type ApplyWorkItemSyncResponse = z.infer<typeof applyWorkItemSyncResponseSchema>;
export type ImportWorkItemsResponse = z.infer<typeof importWorkItemsResponseSchema>;
export type PullStoryMapWorkItemsResponse = z.infer<typeof pullStoryMapWorkItemsResponseSchema>;
export type ResolveSyncConflictResponse = { conflict: z.infer<typeof syncConflictSchema> };
export type ConnectorConnectionsResponse = z.infer<typeof listConnectorConnectionsResponseSchema>;
export type ConnectorConnectionResponse = z.infer<typeof connectorConnectionResponseSchema>;
export type ValidateConnectorConnectionResponse = z.infer<typeof validateConnectorConnectionResponseSchema>;
export type GitHubLinkResponse = z.infer<typeof gitHubLinkResponseSchema>;
export type GitHubIssueDryRunResponse = z.infer<typeof createGitHubIssueDryRunResponseSchema>;
export type GitHubLinksWithHealthResponse = z.infer<typeof listGitHubLinksResponseSchema> & { syncHealth: z.infer<typeof githubSyncHealthReportSchema> | undefined };

export const gettingStartedProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();
export const deleteStoryMapParamsSchema = z.object({ storyMapId: uuidSchema, baseVersion: baseVersionSchema }).strict();
export const gettingStartedChecklistResponseSchema = z.object({ checklist: gettingStartedChecklistSchema });
export const dismissGettingStartedRequestSchema = z.object({}).strict();
export const recordVisualExportRequestSchema = z.object({ format: z.enum(["html", "png", "pdf"]) }).strict();
