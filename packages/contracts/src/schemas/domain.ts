import { epicContextSchema } from "@storymapper/contracts/schemas/epic-context";
import { workItemIdentitySchema, workItemUrlSchema } from "@storymapper/contracts/schemas/work-item-identity";
import { workItemProviderSchema } from "@storymapper/contracts/schemas/work-item-provider";
import { deletedLocalSyncLinkSchema } from "@storymapper/contracts/schemas/sync-health";
export * from "@storymapper/contracts/schemas/sync-health";
import { workItemSyncBaselineSchema } from "@storymapper/contracts/schemas/work-item-sync-baseline";
export * from "@storymapper/contracts/schemas/work-item-sync-baseline";
import { uuidSchema, sha256HexSchema } from "@storymapper/contracts/schemas/identifiers";
import { externalRefSchema } from "@storymapper/contracts/schemas/external-refs";
import { parseGitHubLocator } from "@storymapper/contracts/schemas/github-identity";
import { z } from "zod";
import { makeChangeSetSchemas } from "@storymapper/contracts/schemas/change-set-schemas";
import { makeChangeOperationSchema } from "@storymapper/contracts/schemas/change-operations";
import { githubStatusSourceSchema, githubStatusCatalogSchema, githubStatusEvidenceSchema } from "@storymapper/contracts/schemas/github-status";
export * from "@storymapper/contracts/schemas/github-status";
export { uuidSchema, sha256HexSchema } from "@storymapper/contracts/schemas/identifiers";
export * from "@storymapper/contracts/schemas/external-refs";
export const cardTypeSchema = z.enum(["story", "task", "bug", "spike", "feature", "epic", "theme"]);
export type CardType = z.infer<typeof cardTypeSchema>;
export const cardLevelSchema = z.enum(["activity", "step", "story", "note"]);
export type CardLevel = z.infer<typeof cardLevelSchema>;
export const workflowGroupSchema = z.enum(["todo", "active", "done"]);
export type WorkflowGroup = z.infer<typeof workflowGroupSchema>;
export const actorTypeSchema = z.enum(["human", "agent", "github", "system"]);
export type ActorType = z.infer<typeof actorTypeSchema>;
export const actorContextSchema = z.object({
  actorType: actorTypeSchema,
  actorId: z.string().trim().min(1),
  originClientId: uuidSchema.optional(),
  mcpSessionId: z.string().trim().min(1).optional()
});
export type ActorContext = Readonly<z.infer<typeof actorContextSchema>>;
export const projectSchema = z.object({
  historicalStub: z.boolean().optional(),
  id: uuidSchema,
  name: z.string().min(1),
  localPath: z.string().min(1),
  description: z.string().optional(),
  defaultLanguage: z.string().default("en"),
  defaultEstimationUnit: z.string().default("points"),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type Project = z.infer<typeof projectSchema>;
export const cardKeyPrefixSchema = z.string().trim().min(1);
export const storyMapSchema = z.object({
  epicContext: epicContextSchema.nullable().optional(),
  version: z.number().refine(Number.isInteger).positive(),
  id: uuidSchema,
  projectId: uuidSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  estimationUnit: z.string().default("points"),
  cardKeyPrefix: cardKeyPrefixSchema.default("LSM"),
  defaultConnectionId: uuidSchema.nullable().optional(),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  updatedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type StoryMap = z.infer<typeof storyMapSchema>;
export const storyMapTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  releases: z.array(z.object({
    ref: z.string().min(1), name: z.string().min(1), goal: z.string().default("")
  }).strict()),
  cards: z.array(z.object({
    ref: z.string().min(1), parentRef: z.string().min(1).optional(), releaseRef: z.string().min(1).optional(),
    level: cardLevelSchema, title: z.string().min(1), description: z.string().default("")
  }).strict())
}).strict();
export type StoryMapTemplate = z.infer<typeof storyMapTemplateSchema>;
export const gettingStartedChecklistSchema = z.object({
  projectId: uuidSchema,
  initialized: z.boolean(),
  dismissed: z.boolean(),
  sampleStoryMapId: uuidSchema.nullable(),
  completed: z.object({
    createStoryMap: z.boolean(), addCards: z.boolean(), connectGitHub: z.boolean(), export: z.boolean()
  }).strict()
}).strict();
export type GettingStartedChecklist = z.infer<typeof gettingStartedChecklistSchema>;
export const cardCreationOriginSchema = z.enum(["manual", "inference", "unknown"]);
export const cardProvenanceSchema = z.enum(["linked", "manual", "inference", "unknown"]);
export const cardSchema = z.object({
  creationOrigin: cardCreationOriginSchema,
  provenance: cardProvenanceSchema,
  version: z.number().refine(Number.isInteger).positive(),
  id: uuidSchema,
  storyMapId: uuidSchema,
  parentId: uuidSchema.nullable(),
  releaseId: uuidSchema.nullable(),
  key: z.string().min(1),
  level: cardLevelSchema,
  cardType: cardTypeSchema.nullable().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  position: z.number().refine(Number.isInteger).nonnegative(),
  status: z.string().default("todo"),
  archived: z.boolean().optional(),
  parked: z.boolean().default(false),
  priority: z.string().optional(),
  businessValue: z.number().refine(Number.isInteger).optional(),
  effort: z.number().refine(Number.isInteger).optional(),
  estimate: z.number().optional(),
  color: z.string().optional(),
  assignee: z.string().optional(),
  createdAt: z.iso.datetime().or(z.iso.datetime({ precision: -1 })),
  updatedAt: z.iso.datetime().or(z.iso.datetime({ precision: -1 }))
});
export type Card = z.infer<typeof cardSchema>;
export const releaseSchema = z.object({
  version: z.number().refine(Number.isInteger).positive(),
  id: uuidSchema,
  storyMapId: uuidSchema,
  name: z.string().min(1),
  goal: z.string().default(""),
  position: z.number().refine(Number.isInteger).nonnegative(),
  startDate: z.string().date().nullable(),
  releaseDate: z.string().date().nullable(),
  released: z.boolean().default(false)
});
export type Release = z.infer<typeof releaseSchema>;

export const personaSchema = z.object({
  version: z.number().refine(Number.isInteger).positive(),
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  name: z.string().min(1),
  role: z.string().min(1),
  personaType: z.string().default(""),
  avatar: z.string().default(""),
  represents: z.string().default(""),
  age: z.string().default(""),
  country: z.string().default(""),
  fachexpertise: z.string().default(""),
  workLife: z.string().default(""),
  productExperience: z.string().default(""),
  expectations: z.string().default(""),
  description: z.string().default(""),
  centralNeed: z.string().default(""),
  successIndicators: z.string().default(""),
  scopeNote: z.string().default(""),
  goals: z.array(z.string()).default([]),
  pains: z.array(z.string()).default([])
});
export type Persona = z.infer<typeof personaSchema>;

export const workflowStatusSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  name: z.string().min(1),
  group: workflowGroupSchema,
  position: z.number().refine(Number.isInteger).nonnegative(),
  color: z.string().optional()
});
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const cardDependencySchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  prerequisiteCardId: uuidSchema,
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
}).strict();
export type CardDependency = z.infer<typeof cardDependencySchema>;

export const cardPersonaLinkSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  personaId: uuidSchema,
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type CardPersonaLink = z.infer<typeof cardPersonaLinkSchema>;

export const annotationSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  name: z.string().min(1),
  icon: z.string().default("tag"),
  color: z.string().default("#eef2ff"),
  position: z.number().refine(Number.isInteger).nonnegative()
});
export type Annotation = z.infer<typeof annotationSchema>;

export const cardAnnotationLinkSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  annotationId: uuidSchema,
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type CardAnnotationLink = z.infer<typeof cardAnnotationLinkSchema>;

export const storyTemplateSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  name: z.string().min(1),
  descriptionTemplate: z.string().default(""),
  defaultStatus: z.string().default("todo"),
  defaultEstimate: z.number().nullable(),
  position: z.number().refine(Number.isInteger).nonnegative()
});
export type StoryTemplate = z.infer<typeof storyTemplateSchema>;

export const roadmapTypeSchema = z.enum(["simple", "release", "epic"]);
export type RoadmapType = z.infer<typeof roadmapTypeSchema>;

export const roadmapSchema = z.object({
  version: z.number().refine(Number.isInteger).positive(),
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  name: z.string().min(1),
  type: roadmapTypeSchema.default("simple"),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  updatedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type Roadmap = z.infer<typeof roadmapSchema>;

export const roadmapColumnSchema = z.object({
  id: uuidSchema,
  roadmapId: uuidSchema,
  name: z.string().min(1),
  position: z.number().refine(Number.isInteger).nonnegative()
});
export type RoadmapColumn = z.infer<typeof roadmapColumnSchema>;

export const roadmapSwimlaneSchema = z.object({
  id: uuidSchema,
  roadmapId: uuidSchema,
  name: z.string().min(1),
  position: z.number().refine(Number.isInteger).nonnegative()
});
export type RoadmapSwimlane = z.infer<typeof roadmapSwimlaneSchema>;

export const roadmapCardSchema = z.object({
  id: uuidSchema,
  roadmapId: uuidSchema,
  columnId: uuidSchema,
  swimlaneId: uuidSchema.nullable(),
  title: z.string().min(1),
  details: z.string().default(""),
  labels: z.array(z.string()).default([]),
  reach: z.number().nullable(),
  impact: z.number().nullable(),
  confidence: z.number().nullable(),
  effort: z.number().nullable(),
  position: z.number().refine(Number.isInteger).nonnegative()
});
export type RoadmapCard = z.infer<typeof roadmapCardSchema>;

export const roadmapReferenceSchema = z.object({
  id: uuidSchema,
  roadmapCardId: uuidSchema,
  targetType: z.enum(["release", "card"]),
  targetId: uuidSchema
});
export type RoadmapReference = z.infer<typeof roadmapReferenceSchema>;

export const roadmapCardReportSchema = z.object({
  roadmapCardId: uuidSchema,
  totalCards: z.number().refine(Number.isInteger).nonnegative(),
  totalStories: z.number().refine(Number.isInteger).nonnegative(),
  doneStories: z.number().refine(Number.isInteger).nonnegative(),
  estimateTotal: z.number().nonnegative(),
  progressRatio: z.number().min(0).max(1),
  statusCounts: z.record(z.string(), z.number().refine(Number.isInteger).nonnegative())
});
export type RoadmapCardReport = z.infer<typeof roadmapCardReportSchema>;

export const roadmapDetailsSchema = z.object({
  roadmap: roadmapSchema,
  columns: z.array(roadmapColumnSchema),
  swimlanes: z.array(roadmapSwimlaneSchema),
  cards: z.array(roadmapCardSchema),
  references: z.array(roadmapReferenceSchema),
  reports: z.array(roadmapCardReportSchema)
});
export type RoadmapDetails = z.infer<typeof roadmapDetailsSchema>;

export const sourceDocumentSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  title: z.string().min(1),
  type: z.enum(["markdown", "txt"]),
  filePath: z.string().min(1),
  fileHash: sha256HexSchema,
  importedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const sourceChunkSchema = z.object({
  id: sha256HexSchema,
  documentId: uuidSchema,
  text: z.string(),
  locator: z.string(),
  heading: z.string().optional(),
  page: z.number().refine(Number.isInteger).positive().optional()
});
export type SourceChunk = z.infer<typeof sourceChunkSchema>;

export const chunkCardSourceLinkSchema = z.object({
  kind: z.literal("chunk"),
  id: uuidSchema,
  cardId: uuidSchema,
  chunkId: sha256HexSchema,
  confidence: z.number().nullable(),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type ChunkCardSourceLink = z.infer<typeof chunkCardSourceLinkSchema>;
export const githubCardSourceLinkSchema = z.object({
  kind: z.literal("github"), provider: workItemProviderSchema.optional(), id: uuidSchema, cardId: uuidSchema,
  externalRefId: uuidSchema, repoFullName: z.string().min(1),
  issueNumber: z.number().int().positive(), url: workItemUrlSchema
}).refine((link) => { if (link.provider && link.provider !== "github") return workItemIdentitySchema.shape.url.safeParse(link.url).success; const locator = parseGitHubLocator(link.url); return locator?.resource === "issues" && locator.repo === link.repoFullName && locator.number === link.issueNumber; }, "GitHub source evidence must match its canonical Issue locator.");
export const noteCardSourceLinkSchema = z.object({
  kind: z.literal("note"), id: uuidSchema, cardId: uuidSchema,
  note: z.string().trim().min(1), createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export const cardSourceLinkSchema = z.discriminatedUnion("kind", [chunkCardSourceLinkSchema, githubCardSourceLinkSchema, noteCardSourceLinkSchema]);
export type CardSourceLink = z.infer<typeof cardSourceLinkSchema>;

export const cardAttachmentSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  label: z.string().min(1),
  filePath: z.string().min(1),
  mimeType: z.string().optional(),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type CardAttachment = z.infer<typeof cardAttachmentSchema>;

export const cardVersionSummarySchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  version: z.number().refine(Number.isInteger).positive(),
  actor: z.string().min(1),
  actorType: actorTypeSchema,
  mcpSessionId: z.string().min(1).optional(),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  snapshot: cardSchema,
  changedFields: z.array(z.string()).default([])
});
export type CardVersionSummary = z.infer<typeof cardVersionSummarySchema>;

export const cardHistorySnapshotSchema = cardSchema.extend({
  priority: cardSchema.shape.priority.nullable(),
  businessValue: cardSchema.shape.businessValue.nullable(),
  effort: cardSchema.shape.effort.nullable(),
  estimate: cardSchema.shape.estimate.nullable(),
  color: cardSchema.shape.color.nullable(),
  assignee: cardSchema.shape.assignee.nullable()
});
export type CardHistorySnapshot = z.infer<typeof cardHistorySnapshotSchema>;

export const cardHistoryEntrySchema = cardVersionSummarySchema.extend({
  snapshot: cardHistorySnapshotSchema,
  previousSnapshot: cardHistorySnapshotSchema.nullable()
});
export type CardHistoryEntry = z.infer<typeof cardHistoryEntrySchema>;

export const sourceDocumentSummarySchema = sourceDocumentSchema.extend({
  chunkCount: z.number().refine(Number.isInteger).nonnegative(),
  linkedChunkCount: z.number().refine(Number.isInteger).nonnegative(),
  coverageRatio: z.number().min(0).max(1)
});
export type SourceDocumentSummary = z.infer<typeof sourceDocumentSummarySchema>;

export const sourceDocumentDetailsSchema = z.object({
  document: sourceDocumentSchema,
  chunks: z.array(sourceChunkSchema),
  links: z.array(chunkCardSourceLinkSchema),
  linkedCardsByChunkId: z.record(z.string(), z.array(cardSchema.pick({ id: true, key: true, title: true })))
});
export type SourceDocumentDetails = z.infer<typeof sourceDocumentDetailsSchema>;

export const sourceCoverageReportSchema = z.object({
  projectId: uuidSchema,
  documents: z.array(sourceDocumentSummarySchema),
  totalChunks: z.number().refine(Number.isInteger).nonnegative(),
  linkedChunks: z.number().refine(Number.isInteger).nonnegative(),
  coverageRatio: z.number().min(0).max(1)
});
export type SourceCoverageReport = z.infer<typeof sourceCoverageReportSchema>;

export const backlogHealthIssueSchema = z.object({
  cardId: uuidSchema,
  cardKey: z.string().min(1),
  cardTitle: z.string().min(1),
  type: z.enum(["missing-description", "missing-estimate", "missing-source", "missing-github-link"]),
  severity: z.enum(["info", "warning", "error"])
});
export type BacklogHealthIssue = z.infer<typeof backlogHealthIssueSchema>;

export const backlogHealthReportSchema = z.object({
  storyMapId: uuidSchema,
  totalStories: z.number().refine(Number.isInteger).nonnegative(),
  healthyStories: z.number().refine(Number.isInteger).nonnegative(),
  readinessRatio: z.number().min(0).max(1),
  issueCounts: z.partialRecord(backlogHealthIssueSchema.shape.type, z.number().refine(Number.isInteger).nonnegative()),
  issues: z.array(backlogHealthIssueSchema)
});
export type BacklogHealthReport = z.infer<typeof backlogHealthReportSchema>;

export const releaseSummaryReportSchema = z.object({
  storyMapId: uuidSchema,
  scope: z.enum(["all", "unscheduled", "release"]),
  releaseId: uuidSchema.nullable(),
  releaseName: z.string().optional(),
  totalCards: z.number().refine(Number.isInteger).nonnegative(),
  totalStories: z.number().refine(Number.isInteger).nonnegative(),
  estimateTotal: z.number().nonnegative(),
  unestimatedCards: z.number().refine(Number.isInteger).nonnegative(),
  unestimatedStories: z.array(z.object({ cardId: uuidSchema, cardKey: z.string().min(1), cardTitle: z.string().min(1) })),
  // DESIGN Zod records omit __proto__, which is a valid persisted workflow status.
  statusCounts: z.custom<Record<string, number>>((value) => typeof value === "object" && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) && Object.values(value).every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0)),
  riskCounts: z.object({
    missingDescription: z.number().refine(Number.isInteger).nonnegative(),
    missingSource: z.number().refine(Number.isInteger).nonnegative(),
    missingGitHubLink: z.number().refine(Number.isInteger).nonnegative()
  })
});
export type ReleaseSummaryReport = z.infer<typeof releaseSummaryReportSchema>;

export const releaseTimelineItemSchema = z.object({
  release: releaseSchema,
  totalStories: z.number().refine(Number.isInteger).nonnegative(),
  doneStories: z.number().refine(Number.isInteger).nonnegative(),
  estimateTotal: z.number().nonnegative(),
  progressRatio: z.number().min(0).max(1),
  startOffsetDays: z.number().refine(Number.isInteger),
  durationDays: z.number().refine(Number.isInteger).positive()
});
export type ReleaseTimelineItem = z.infer<typeof releaseTimelineItemSchema>;

export const releaseTimelineReportSchema = z.object({
  storyMapId: uuidSchema,
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
  items: z.array(releaseTimelineItemSchema)
});
export type ReleaseTimelineReport = z.infer<typeof releaseTimelineReportSchema>;

export const productContextSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema.nullable(),
  productType: z.string().default(""),
  purpose: z.string().default(""),
  keyFeatures: z.array(z.string()).default([]),
  targetUsers: z.string().default(""),
  platform: z.string().default(""),
  pricing: z.string().default(""),
  notes: z.string().default(""),
  glossary: z.string().default(""),
  nonGoals: z.string().default(""),
  complianceConstraints: z.string().default(""),
  updatedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type ProductContext = z.infer<typeof productContextSchema>;

export const aiPromptArgumentSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u).refine((name) => name !== "storyMapId", "storyMapId is reserved for Product Context scope."),
  description: z.string().optional(),
  required: z.boolean().default(false)
});
export type AiPromptArgument = z.infer<typeof aiPromptArgumentSchema>;

export const aiFunctionTemplateSchema = z.object({
  projectId: uuidSchema,
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u),
  name: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  arguments: z.array(aiPromptArgumentSchema).default([]).refine((arguments_) => new Set(arguments_.map((argument) => argument.name)).size === arguments_.length, "Prompt argument names must be unique."),
  outputSchemaName: z.string().optional(),
  examples: z.array(z.string()).default([])
});
export type AiFunctionTemplate = z.infer<typeof aiFunctionTemplateSchema>;

export const githubLinkSchema = z.object({
  id: uuidSchema,
  provider: workItemProviderSchema.optional(),
  cardId: uuidSchema.optional(),
  releaseId: uuidSchema.optional(),
  repo: z.string().min(1),
  issueNumber: z.number().refine(Number.isInteger).positive().optional(),
  url: z.string().refine((value) => URL.canParse(value), { message: "Invalid url" }),
  milestone: z.string().optional(),
  syncState: z.enum(["synced", "unsynced", "conflict", "stale", "remote_deleted", "local_deleted"])
});
export type GitHubLink = z.infer<typeof githubLinkSchema>;

export const githubSyncHealthReportSchema = z.object({
  storyMapId: uuidSchema,
  totalLinks: z.number().refine(Number.isInteger).nonnegative(),
  stateCounts: z.partialRecord(githubLinkSchema.shape.syncState, z.number().refine(Number.isInteger).nonnegative()),
  links: z.array(githubLinkSchema)
});
export type GitHubSyncHealthReport = z.infer<typeof githubSyncHealthReportSchema>;

export const githubIssueDryRunSchema = z.object({
  cardId: uuidSchema,
  title: z.string().min(1),
  body: z.string(),
  labels: z.array(z.string()),
  repo: z.string().min(1),
  milestone: z.string().optional()
});
export type GitHubIssueDryRun = z.infer<typeof githubIssueDryRunSchema>;

export { workItemProviderSchema, type WorkItemProvider } from "@storymapper/contracts/schemas/work-item-provider";

export const workItemAuthModeSchema = z.enum(["github-cli", "token"]);
export type WorkItemAuthMode = z.infer<typeof workItemAuthModeSchema>;
export const credentialSourceSchema = z.enum(["env", "github-cli", "user-file"]);
export type CredentialSource = z.infer<typeof credentialSourceSchema>;
export const credentialStatusSchema = z.object({
  provider: workItemProviderSchema,
  source: credentialSourceSchema,
  configured: z.boolean(),
  selected: z.boolean().optional(),
  unusable: z.boolean().optional(),
  variableName: z.string().optional(),
  location: z.string().optional(),
  message: z.string()
});
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;

export const issueTypeMappingSchema = z.object({ cardType: cardTypeSchema, issueType: z.string().trim().min(1) }).strict();

export const typeMappingEntrySchema = z.object({
  match: z.string().min(1),
  level: cardLevelSchema
});
export type TypeMappingEntry = z.infer<typeof typeMappingEntrySchema>;

export const releaseSourceSchema = z.enum(["milestone", "iteration", "none"]);
export type ReleaseSource = z.infer<typeof releaseSourceSchema>;

export const connectorConnectionSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  provider: workItemProviderSchema,
  name: z.string().min(1),
  authMode: workItemAuthModeSchema,
  owner: z.string().regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, "GitHub owner must be a plain account name."),
  repository: z.string().regex(/^[a-zA-Z0-9_.-]+$/, "GitHub repository must be a plain repository name.").refine((value) => value !== "." && value !== "..", "GitHub repository must be a plain repository name.").optional(),
  defaultLabel: z.string().default("local-story-map"),
  readOnly: z.boolean().default(true),
  statusSource: githubStatusSourceSchema.optional(),
  statusCatalogs: z.array(githubStatusCatalogSchema).optional(),
  statusMapping: z.array(z.object({
    localStatus: z.string().min(1),
    remoteState: z.string().min(1),
    labels: z.array(z.string()).default([])
  })).default([]),
  issueTypeMapping: z.array(issueTypeMappingSchema).refine((mapping) => new Set(mapping.map((entry) => entry.cardType)).size === mapping.length, "Each Card type must have at most one outbound Issue type mapping.").default([]),
  typeMapping: z.array(typeMappingEntrySchema).default([
    { match: "epic", level: "activity" },
    { match: "feature", level: "step" }
  ]),
  releaseSource: releaseSourceSchema.default("milestone"),
  iterationFieldName: z.string().default("Iteration"),
  labelsAsAnnotations: z.boolean().default(false),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  updatedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type ConnectorConnection = z.infer<typeof connectorConnectionSchema>;

export const remoteWorkItemSyncStateSchema = z.object({
  id: uuidSchema,
  connectionId: uuidSchema,
  externalRefId: uuidSchema,
  titleHash: z.string().optional(),
  bodyHash: z.string().optional(),
  remoteState: z.string().optional(),
  statusEvidence: githubStatusEvidenceSchema.optional(),
  issueType: z.string().optional(),
  managedLabels: z.array(z.string()).optional(),
  baseline: workItemSyncBaselineSchema.optional(),
  labels: z.array(z.string()).default([]),
  milestone: z.string().nullable().optional(),
  remoteParentNumber: z.number().refine(Number.isInteger).positive().nullable().optional(),
  parentOverrideLocal: z.boolean().default(false),
  syncState: githubLinkSchema.shape.syncState,
  lastSyncedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()).optional()
});
export type RemoteWorkItemSyncState = z.infer<typeof remoteWorkItemSyncStateSchema>;
export const remoteWorkItemLinkSchema = remoteWorkItemSyncStateSchema.extend({
  provider: workItemProviderSchema, cardId: uuidSchema.optional(), releaseId: uuidSchema.nullable().optional(),
  remoteId: z.string().min(1), remoteNumber: z.number().int().positive(), url: workItemUrlSchema
}).refine((link) => link.provider !== "github" || parseGitHubLocator(link.url)?.url === link.url, "GitHub sync identity requires a canonical GitHub locator.");
export type RemoteWorkItemLink = z.infer<typeof remoteWorkItemLinkSchema>;

export const syncPlanItemSchema = z.object({
  cardId: uuidSchema.optional(),
  action: z.enum(["create", "update", "skip", "conflict"]),
  title: z.string().min(1),
  body: z.string(),
  labels: z.array(z.string()).default([]),
  milestone: z.string().optional(),
  githubIssueType: z.string().min(1).optional(),
  parentIssueNumber: z.number().refine(Number.isInteger).positive().optional(),
  remoteState: z.string().optional(),
  remoteId: z.string().optional(),
  reason: z.string().optional(),
  level: cardLevelSchema.optional(),
  assignee: z.string().optional(),
  releaseName: z.string().optional(),
  localStatus: z.string().optional()
});
export type SyncPlanItem = z.infer<typeof syncPlanItemSchema>;

export const syncPlanSchema = z.object({
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  provider: workItemProviderSchema,
  mode: z.enum(["push", "import", "sync"]),
  items: z.array(syncPlanItemSchema)
});
export type SyncPlan = z.infer<typeof syncPlanSchema>;

export const syncRunSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  storyMapId: uuidSchema,
  connectionId: uuidSchema,
  provider: workItemProviderSchema,
  mode: z.enum(["push", "import", "sync"]),
  status: z.enum(["planned", "applied", "failed"]),
  summary: z.string().default(""),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type SyncRun = z.infer<typeof syncRunSchema>;
export const syncConflictSchema = z.object({
  id: uuidSchema,
  externalRefId: uuidSchema,
  syncRunId: uuidSchema,
  connectionId: uuidSchema,
  cardId: uuidSchema.optional(),
  remoteId: z.string().optional(),
  field: z.enum(["title", "description", "status", "labels", "milestone"]),
  localValue: z.unknown().optional(),
  remoteValue: z.unknown().optional(),
  status: z.enum(["open", "resolved-local", "resolved-remote"]).default("open"),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  resolvedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()).optional()
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export const syncConflictReviewSchema = syncConflictSchema.pick({ localValue: true, remoteValue: true }).strict();
export const workItemSyncHealthReportSchema = z.object({
  storyMapId: uuidSchema,
  totalLinks: z.number().refine(Number.isInteger).nonnegative(),
  stateCounts: z.partialRecord(githubLinkSchema.shape.syncState, z.number().refine(Number.isInteger).nonnegative()),
  links: z.array(remoteWorkItemLinkSchema),
  openConflicts: z.array(syncConflictSchema),
  staleLinks: z.array(remoteWorkItemLinkSchema).default([]),
  deletedLocalLinks: z.array(deletedLocalSyncLinkSchema).default([]),
  deletedLinks: z.array(z.union([remoteWorkItemLinkSchema, deletedLocalSyncLinkSchema])).default([]),
  lastRun: syncRunSchema.optional()
});
export type WorkItemSyncHealthReport = z.infer<typeof workItemSyncHealthReportSchema>;
export const changeOperationSchema = makeChangeOperationSchema({ card: cardSchema, map: storyMapSchema, release: releaseSchema, persona: personaSchema, roadmap: roadmapSchema, roadmapColumn: roadmapColumnSchema, roadmapSwimlane: roadmapSwimlaneSchema, roadmapCard: roadmapCardSchema, roadmapReference: roadmapReferenceSchema, annotation: annotationSchema, workflowStatus: workflowStatusSchema, storyTemplate: storyTemplateSchema, productContext: productContextSchema, attachment: cardAttachmentSchema, githubLink: githubLinkSchema });
export type ChangeOperation = z.infer<typeof changeOperationSchema>;

export { OPERATIONS_SCHEMA_VERSION, changeSetStatusSchema } from "@storymapper/contracts/schemas/change-set-schemas";
export const { changeSetSchema, storedChangeSetSchema } = makeChangeSetSchemas(changeOperationSchema);
export type ChangeSet = z.infer<typeof changeSetSchema>;
export type ChangeSetInput = z.input<typeof changeSetSchema>;
export type StoredChangeSet = z.infer<typeof storedChangeSetSchema>;

export const activityEventSchema = z.object({
  seq: z.number().int().positive().optional(),
  undoneByRestore: z.boolean().optional(),
  originClientId: uuidSchema.optional(),
  id: uuidSchema,
  projectId: uuidSchema.nullable(),
  actor: z.string().min(1),
  actorType: actorTypeSchema,
  mcpSessionId: z.string().min(1).optional(),
  action: z.string().min(1),
  affectedEntityType: z.string().optional(),
  affectedEntityId: z.string().optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  externalCallId: z.string().optional(),
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const agentModeSchema = z.enum(["off", "propose", "apply", "autonomous"]);
export type AgentMode = z.infer<typeof agentModeSchema>;

export const safetySettingsSchema = z.object({
  epoch: uuidSchema.optional(),
  projectId: uuidSchema,
  agentMode: agentModeSchema.default("apply"),
  github: z.boolean().default(false),
  updatedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
});
export type SafetySettings = z.infer<typeof safetySettingsSchema>;

export const storyMapExportFormatSchema = z.enum(["json", "markdown", "csv"]);
export type StoryMapExportFormat = z.infer<typeof storyMapExportFormatSchema>;

export const auditExportFormatSchema = z.enum(["json", "markdown"]);
export type AuditExportFormat = z.infer<typeof auditExportFormatSchema>;

export const projectArchiveManifestSchema = z.object({
  formatVersion: z.number().refine(Number.isInteger),
  schemaVersion: z.string().min(1),
  exportedAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  appVersion: z.string(),
  databaseFileName: z.literal("storymapper.sqlite"),
  databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dataClassification: z.enum(["business-data"]),
  redactedTables: z.array(z.string()),
  redactedRowCount: z.number().refine(Number.isInteger).nonnegative(),
  counts: z.object({
    projects: z.literal(1),
    storyMaps: z.number().refine(Number.isInteger).nonnegative(),
    cards: z.number().refine(Number.isInteger).nonnegative()
  }),
  includedFolders: z.array(z.enum(["documents", "attachments", "exports"]))
}).strict();
export type ProjectArchiveManifest = z.infer<typeof projectArchiveManifestSchema>;

export const storyMapSnapshotSchema = z.object({
  githubStatusCatalogs: z.array(z.object({ connectionId: uuidSchema, connectionName: z.string().min(1), catalog: githubStatusCatalogSchema }).strict()).optional(),
  storyMap: storyMapSchema,
  cards: z.array(cardSchema),
  releases: z.array(releaseSchema),
  externalRefs: z.array(externalRefSchema).default([]),
  personas: z.array(personaSchema).default([]),
  workflowStatuses: z.array(workflowStatusSchema).default([]),
  cardPersonas: z.array(cardPersonaLinkSchema).default([]),
  annotations: z.array(annotationSchema).default([]),
  cardAnnotations: z.array(cardAnnotationLinkSchema).default([]),
  cardDependencies: z.array(cardDependencySchema),
  storyTemplates: z.array(storyTemplateSchema).default([]),
  roadmaps: z.array(roadmapSchema).default([]),
  productContext: productContextSchema.optional(),
  sourceChunks: z.array(sourceChunkSchema).default([]),
  sourceLinks: z.array(cardSourceLinkSchema).default([]),
  cardAttachments: z.array(cardAttachmentSchema).default([]),
  githubLinks: z.array(githubLinkSchema).default([]),
  remoteWorkItemLinks: z.array(remoteWorkItemLinkSchema).default([])
});
export type StoryMapSnapshot = z.infer<typeof storyMapSnapshotSchema>;
