import { z } from "zod";
import { activityEventSchema, actorTypeSchema, sha256HexSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

export const toolCallMetadataSchema = z.object({
  toolName: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
  outcome: z.enum(["ok", "rejected", "error"]),
  affectedEntityIds: z.array(z.union([uuidSchema, sha256HexSchema])),
  rejectionReason: z.enum(["validation", "not_found", "conflict", "disabled", "protected", "restoring"]).optional(),
  errorId: uuidSchema.optional()
}).strict();
export type ToolCallMetadata = z.infer<typeof toolCallMetadataSchema>;

const activityChangeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const activitySummarySchema = activityEventSchema.omit({ before: true, after: true }).extend({
  scope: z.enum(["project", "runtime"]),
  toolCall: toolCallMetadataSchema.optional(),
  subject: z.object({ type: z.string(), id: z.string(), key: z.string().optional(), name: z.string().optional() }).strict().optional(),
  changes: z.array(z.object({ field: z.string(), before: activityChangeValueSchema.optional(), after: activityChangeValueSchema.optional() }).strict()).optional()
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityCursorSchema = z.object({ createdAt: activityEventSchema.shape.createdAt, id: uuidSchema }).strict();
function validActivityCursor(value: string): boolean {
  try { return activityCursorSchema.safeParse(JSON.parse(value)).success; }
  catch (error) { if (error instanceof SyntaxError) return false; throw error; }
}
export const activityQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  actorType: actorTypeSchema.optional(),
  toolName: z.string().regex(/^(?:[A-Za-z][A-Za-z0-9_.-]*|prompts\/(?:list|get))$/).max(100).optional(),
  view: z.enum(["changes", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().refine(validActivityCursor, { message: "Invalid activity cursor." }).optional()
}).strict();
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export const activityResponseSchema = z.object({
  activityEvents: z.array(activitySummarySchema),
  nextCursor: activityCursorSchema.nullable()
}).strict();

export const activityChangesQuerySchema = z.object({
  projectId: uuidSchema,
  originClientId: uuidSchema,
  afterSeq: z.coerce.number().int().nonnegative().default(0),
  epoch: uuidSchema.optional(),
  highWater: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100)
}).strict();
export type ActivityChangesQuery = z.infer<typeof activityChangesQuerySchema>;
export const activityAffectedCardSchema = z.object({
  id: uuidSchema, title: z.string().optional(), key: z.string().optional(), storyMapId: uuidSchema.optional(), action: z.string().optional(),
  changes: activitySummarySchema.shape.changes,
  actions: z.array(z.string()).optional(),
  navigation: z.object({ key: z.string(), storyMapId: uuidSchema, mapName: z.string(), availability: z.enum(["available", "archived", "inaccessible"]) }).strict().optional(),
  availability: z.enum(["deleted", "inaccessible"]).optional()
}).strict();
export type ActivityAffectedCard = z.infer<typeof activityAffectedCardSchema>;
export const activityProjectTargetSchema = z.object({ subject: activitySummarySchema.shape.subject.unwrap(), action: z.string(), changes: activitySummarySchema.shape.changes }).strict();
export type ActivityProjectTarget = z.infer<typeof activityProjectTargetSchema>;
export const activityChangeSchema = activityEventSchema.omit({ before: true, after: true }).extend({
  seq: z.number().int().positive(),
  subject: activitySummarySchema.shape.subject,
  changes: activitySummarySchema.shape.changes,
  toolCall: activitySummarySchema.shape.toolCall,
  cards: z.array(activityAffectedCardSchema).optional(),
  projectTargets: z.array(activityProjectTargetSchema).optional(),
  restorePoint: z.object({ fileName: z.string().min(1), available: z.boolean() }).strict().optional()
}).strict();
export type ActivityChange = z.infer<typeof activityChangeSchema>;
export const activityChangesResponseSchema = z.object({
  epoch: uuidSchema,
  floor: z.number().int().nonnegative(),
  highWater: z.number().int().nonnegative(),
  events: z.array(activityChangeSchema),
  nextAfterSeq: z.number().int().nonnegative().nullable()
}).strict();
export type ActivityChangesResponse = z.infer<typeof activityChangesResponseSchema>;

export const activitySeenStateSchema = z.object({ epoch: uuidSchema, throughSeq: z.number().int().nonnegative(), acknowledgedSeqs: z.array(z.number().int().positive()), targetAcknowledgements: z.record(z.string(), z.array(z.number().int().positive())).default({}) }).strict();
export type ActivitySeenState = z.infer<typeof activitySeenStateSchema>;
