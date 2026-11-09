import { z } from "zod";
import { cardSchema, cardTypeSchema, uuidSchema, actorContextSchema, productContextSchema, cardSourceLinkSchema, sourceChunkSchema } from "@storymapper/contracts/schemas/domain";

export const CARD_REVIEW_CRITERIA_VERSION = "1";
export const CARD_REVIEW_SKILL_VERSION = "1";
const all = cardTypeSchema.options;
export const CARD_REVIEW_CRITERIA = [
  { id: "DOR-01", severity: "blocker", types: all, instruction: "Explicit type is present and matches the work." },
  { id: "DOR-02", severity: "blocker", types: ["story", "feature", "epic", "task", "theme"], instruction: "Concrete value (story/feature/epic), task outcome or theme focus." },
  { id: "DOR-03", severity: "warning", types: all, instruction: "Scope is bounded; blocker only when the scope prevents starting work." },
  { id: "DOR-04", severity: "blocker", types: ["story", "bug", "feature", "epic", "task"], instruction: "Observable acceptance (story/bug), success (feature/epic) or completion (task) criteria." },
  { id: "DOR-05", severity: "warning", types: ["story", "bug"], instruction: "Concrete behavior-driven scenarios." },
  { id: "DOR-06", severity: "blocker", types: all, instruction: "No known unresolved prerequisite or dependency prevents work." },
  { id: "DOR-07", severity: "blocker", types: all, instruction: "Goal, criteria and authorized context do not contradict one another." },
  { id: "DOR-08", severity: "blocker", types: ["bug"], instruction: "Observation, expectation, reproduction or reliable evidence." },
  { id: "DOR-09", severity: "blocker", types: ["spike"], instruction: "Question, deliverable and stop condition; completed results are unnecessary." },
  { id: "DOR-10", severity: "warning", types: all, instruction: "Concise readable authorship, meaningful structure/references and no template debris or redundancy." }
] as const;
export const cardReviewRuleIdSchema = z.enum(CARD_REVIEW_CRITERIA.map((rule) => rule.id));
export const cardReviewSettingsSchema = z.object({
  reviewBeforeAgentPush: z.boolean().default(true), reviewAfterAgentCreate: z.boolean().default(false),
  reviewAfterAgentContentChange: z.boolean().default(false), allowHumanPushOverride: z.boolean().default(false)
}).strict();
export type CardReviewSettings = z.infer<typeof cardReviewSettingsSchema>;
export const cardReviewInputSchema = z.object({
  card: cardSchema, parents: z.array(cardSchema), prerequisites: z.array(cardSchema),
  prerequisiteCompletion: z.array(z.object({ cardId: uuidSchema, completed: z.boolean(), status: z.string(), workflowGroup: z.string().nullable(), github: z.array(z.object({ connectionId: uuidSchema, externalRefId: uuidSchema, remoteState: z.string().nullable(), issueState: z.enum(["open", "closed"]).nullable() }).strict()) }).strict()).default([]),
  githubSources: z.array(z.object({ sourceLinkId: uuidSchema, externalRefId: uuidSchema, projectId: uuidSchema, url: z.string(), titleHash: z.string().nullable(), bodyHash: z.string().nullable(), contentAvailability: z.enum(["exact", "hash_only", "unavailable"]), remoteBefore: z.object({ title: z.string(), body: z.string() }).strict().nullable() }).strict()).default([]),
  productContext: productContextSchema, sourceLinks: z.array(cardSourceLinkSchema), sourceChunks: z.array(sourceChunkSchema),
  outgoing: z.array(z.object({ title: z.string(), body: z.string(), issueType: z.string() }).strict()).optional(),
  exportFingerprint: z.string().optional()
}).strict();
export type CardReviewInput = z.infer<typeof cardReviewInputSchema>;
export const cardReviewRuleResultSchema = z.object({
  ruleId: cardReviewRuleIdSchema, outcome: z.enum(["pass", "finding", "not_applicable", "unknown"]),
  severity: z.enum(["blocker", "warning"]), evidence: z.array(z.string().trim().min(1)),
  advice: z.string(), preventsStart: z.boolean().optional(),
  suggestion: z.object({ title: z.string().min(1).optional(), description: z.string().optional(), cardType: cardTypeSchema.optional() }).strict().optional()
}).strict();
export const cardReviewReportSubmissionSchema = z.object({
  requestId: uuidSchema, inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/u), criteriaVersion: z.literal(CARD_REVIEW_CRITERIA_VERSION),
  skillVersion: z.literal(CARD_REVIEW_SKILL_VERSION), status: z.enum(["success", "error"]),
  results: z.array(cardReviewRuleResultSchema), error: z.string().trim().min(1).optional()
}).strict();
export const cardReviewRequestSchema = z.object({
  id: uuidSchema, projectId: uuidSchema, cardId: uuidSchema, purpose: z.enum(["manual", "save", "push"]),
  planId: uuidSchema.optional(), changeSetId: uuidSchema.optional(), initiatedBy: actorContextSchema.optional(), input: cardReviewInputSchema, inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/u), epoch: z.string(),
  criteriaVersion: z.literal(CARD_REVIEW_CRITERIA_VERSION), skillVersion: z.literal(CARD_REVIEW_SKILL_VERSION),
  actor: actorContextSchema, createdAt: z.iso.datetime()
}).strict();
export type CardReviewRequest = z.infer<typeof cardReviewRequestSchema>;
export const cardReviewRequestHeaderRecordSchema = z.object({ kind: z.literal("request"), value: cardReviewRequestSchema.omit({ input: true }) }).strict();
export const cardReviewReportSchema = cardReviewReportSubmissionSchema.extend({
  id: uuidSchema, projectId: uuidSchema, cardId: uuidSchema, actor: actorContextSchema, createdAt: z.iso.datetime(),
  results: z.array(cardReviewRuleResultSchema.extend({ id: uuidSchema }))
}).strict();
export type CardReviewReport = z.infer<typeof cardReviewReportSchema>;
export const cardReviewDecisionSchema = z.object({
  id: uuidSchema, projectId: uuidSchema, cardId: uuidSchema, reportId: uuidSchema, findingId: uuidSchema,
  ruleId: cardReviewRuleIdSchema, inputFingerprint: z.string(), scope: z.enum(["occurrence", "rule"]), reason: z.string().trim().min(1),
  actor: actorContextSchema, createdAt: z.iso.datetime(), revokedDecisionId: uuidSchema.optional()
}).strict();
export type CardReviewDecision = z.infer<typeof cardReviewDecisionSchema>;
export const cardReviewFixSchema = z.object({
  id: uuidSchema, projectId: uuidSchema, cardId: uuidSchema, reportId: uuidSchema, findingIds: z.array(uuidSchema).min(1),
  inputFingerprint: z.string(), baseVersion: z.number().int().positive(), changeSetId: uuidSchema.optional(),
  actor: actorContextSchema, createdAt: z.iso.datetime()
}).strict();
export type CardReviewFix = z.infer<typeof cardReviewFixSchema>;
export const cardReviewSummarySchema = z.object({
  cardId: uuidSchema, state: z.enum(["missing", "pending", "running", "error", "stale", "reviewed", "awaiting_verification"]),
  unresolvedCount: z.number().int().nonnegative(), highestSeverity: z.enum(["blocker", "warning"]).nullable(),
  reportId: uuidSchema.optional(), requestId: uuidSchema.optional(), ignoredFindingIds: z.array(uuidSchema)
}).strict();
export type CardReviewSummary = z.infer<typeof cardReviewSummarySchema>;
export const cardReviewQuerySchema = z.object({ storyMapId: uuidSchema.optional(), cardId: uuidSchema.optional(), planId: uuidSchema.optional(), summaryOnly: z.boolean().optional() }).strict();
export type CardReviewQuery = z.infer<typeof cardReviewQuerySchema>;
export const cardPushReadinessSchema = z.object({ planId: uuidSchema, required: z.boolean(), ready: z.boolean(), overridden: z.boolean(), cards: z.array(z.object({ cardId: uuidSchema, key: z.string(), ready: z.boolean(), summary: cardReviewSummarySchema }).strict()) }).strict();
export const cardReviewsResponseSchema = z.object({
  settings: cardReviewSettingsSchema, summaries: z.array(cardReviewSummarySchema), requests: z.array(cardReviewRequestSchema),
  reports: z.array(cardReviewReportSchema), decisions: z.array(cardReviewDecisionSchema), fixes: z.array(cardReviewFixSchema),
  runningRequestIds: z.array(uuidSchema), inaccessibleRequestIds: z.array(uuidSchema).optional(), pushReadiness: cardPushReadinessSchema.optional()
}).strict();
export type CardReviewsResponse = z.infer<typeof cardReviewsResponseSchema>;
export const cardReviewCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), cardIds: z.array(uuidSchema).min(1).max(500), planId: uuidSchema.optional() }).strict(),
  z.object({ action: z.literal("start"), requestId: uuidSchema }).strict(),
  z.object({ action: z.literal("submit"), report: cardReviewReportSubmissionSchema }).strict(),
  z.object({ action: z.literal("settings"), settings: cardReviewSettingsSchema }).strict(),
  z.object({ action: z.literal("ignore"), reportId: uuidSchema, findingId: uuidSchema, scope: z.enum(["occurrence", "rule"]), reason: z.string().trim().min(1) }).strict(),
  z.object({ action: z.literal("revoke"), decisionId: uuidSchema, reason: z.string().trim().min(1) }).strict(),
  z.object({ action: z.literal("fix"), reportId: uuidSchema, findingIds: z.array(uuidSchema).min(1) }).strict(),
  z.object({ action: z.literal("proposeFix"), fixId: uuidSchema, patch: z.object({ title: z.string().min(1).optional(), description: z.string().optional(), cardType: cardTypeSchema.optional() }).strict().refine((patch) => Object.keys(patch).length > 0) }).strict()
]);
export type CardReviewCommand = z.infer<typeof cardReviewCommandSchema>;
export const cardReviewRecordPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("request"), value: cardReviewRequestSchema }).strict(),
  z.object({ kind: z.literal("report"), value: cardReviewReportSchema }).strict(),
  z.object({ kind: z.literal("decision"), value: cardReviewDecisionSchema }).strict(),
  z.object({ kind: z.literal("fix"), value: cardReviewFixSchema }).strict(),
  z.object({ kind: z.literal("settings"), value: cardReviewSettingsSchema }).strict(),
  z.object({ kind: z.literal("start"), value: z.object({ requestId: uuidSchema, actor: actorContextSchema }).strict() }).strict(),
  z.object({ kind: z.literal("fixProposal"), value: z.object({ fixId: uuidSchema, changeSetId: uuidSchema }).strict() }).strict(),
  z.object({ kind: z.literal("override"), value: z.object({ planId: uuidSchema, inputFingerprints: z.array(z.string()), reason: z.string().trim().min(1), actor: actorContextSchema }).strict() }).strict()
]);
export type CardReviewRecordPayload = z.infer<typeof cardReviewRecordPayloadSchema>;
