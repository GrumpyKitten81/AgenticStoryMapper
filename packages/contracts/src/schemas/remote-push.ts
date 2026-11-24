import { workItemIdentitySchema } from "@storymapper/contracts/schemas/work-item-identity";
import { z } from "zod";
import { actorContextSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

export const remoteIssuePayloadSchema = z.object({
  title: z.string().min(1), body: z.string(), labels: z.array(z.string()), issueType: z.string().min(1),
  remoteState: z.enum(["open", "closed"]), milestoneNumber: z.number().int().positive().nullable(),
  remoteId: z.string().min(1).optional()
}).strict();
export type RemoteIssuePayload = z.infer<typeof remoteIssuePayloadSchema>;
export const remoteMilestonePayloadSchema = z.object({
  title: z.string().min(1), description: z.string(), dueOn: z.string().nullable(),
  state: z.enum(["open", "closed"]), remoteId: z.string().min(1).optional()
}).strict();
export type RemoteMilestonePayload = z.infer<typeof remoteMilestonePayloadSchema>;
export const remoteMilestoneSchema = remoteMilestonePayloadSchema.omit({ remoteId: true }).extend({
  remoteId: z.string().min(1), remoteNumber: z.number().int().positive(), url: z.string().url(), identity: workItemIdentitySchema.optional()
}).strict();
export type RemoteMilestone = z.infer<typeof remoteMilestoneSchema>;
export const remotePushEvidenceSchema = z.object({
  issueTypes: z.array(z.string()), labels: z.array(z.string()), writable: z.boolean(), milestones: z.array(remoteMilestoneSchema)
}).strict();
export type RemotePushEvidence = z.infer<typeof remotePushEvidenceSchema>;
export const remotePushIssueReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), remoteNumber: z.number().int().positive(), url: z.string().url() }).strict(),
  z.object({ kind: z.literal("create"), itemId: uuidSchema, cardKey: z.string().min(1), cardTitle: z.string().min(1) }).strict()
]);
export type RemotePushIssueReference = z.infer<typeof remotePushIssueReferenceSchema>;
export const remotePushRelationshipIntentSchema = z.object({
  operation: z.enum(["add", "remove", "acknowledge"]), childNumber: z.number().int().positive(), childDatabaseId: z.number().int().positive(),
  parentNumber: z.number().int().positive().nullable(), expectedParent: z.number().int().positive().nullable(), resultingParent: z.number().int().positive().nullable()
}).strict().refine((value) => value.operation === "add" ? value.expectedParent === null && value.resultingParent !== null && value.parentNumber === value.resultingParent : value.operation === "remove" ? value.expectedParent !== null && value.resultingParent === null && value.parentNumber === value.expectedParent : value.expectedParent === value.resultingParent && value.parentNumber === value.resultingParent, "Relationship intent must describe its exact transition.");
export type RemotePushRelationshipIntent = z.infer<typeof remotePushRelationshipIntentSchema>;
export const remotePushRelationshipResultSchema = z.object({
  response: z.unknown(), observedParent: z.object({ number: z.number().int().positive(), url: z.string().url(), repository: z.string().min(1) }).strict().nullable()
}).strict();
const effectFields = {
  id: uuidSchema, entityId: uuidSchema, action: z.enum(["create", "update"]), marker: z.string().min(1), dependencies: z.array(uuidSchema),
  labelAdditions: z.array(z.string()), labelRemovals: z.array(z.string()), managedLabels: z.array(z.string()).default([]), remoteBefore: z.unknown().optional()
};
export const remotePushEffectSchema = z.discriminatedUnion("kind", [
  z.object({ ...effectFields, kind: z.literal("issue"), payload: remoteIssuePayloadSchema, milestoneItemId: uuidSchema.optional(), issueItemId: uuidSchema.optional() }).strict(),
  z.object({ ...effectFields, kind: z.literal("milestone"), payload: remoteMilestonePayloadSchema }).strict(),
  z.object({ ...effectFields, kind: z.literal("relationship"), action: z.enum(["add", "remove", "acknowledge"]), cardKey: z.string().min(1), cardTitle: z.string().min(1), child: remotePushIssueReferenceSchema, expectedParent: remotePushIssueReferenceSchema.nullable(), resultingParent: remotePushIssueReferenceSchema.nullable() }).strict()
]).refine((effect) => effect.kind !== "relationship" || (effect.action === "add" ? effect.expectedParent === null && effect.resultingParent !== null : effect.action === "remove" ? effect.expectedParent !== null && effect.resultingParent === null : JSON.stringify(effect.expectedParent) === JSON.stringify(effect.resultingParent)), "Relationship effect must describe its exact transition.");
export type RemotePushEffect = z.infer<typeof remotePushEffectSchema>;
export const remotePushSelectionSchema = z.object({
  cardIds: z.array(uuidSchema).optional(), releaseId: uuidSchema.nullable().optional(), parentIssueNumber: z.number().int().positive().optional(), conflictId: uuidSchema.optional()
}).strict();
export const remotePushPlanSchema = z.object({
  id: uuidSchema, actor: actorContextSchema, projectId: uuidSchema, storyMapId: uuidSchema, connectionId: uuidSchema,
  epoch: z.string().min(1), createdAt: z.iso.datetime(), selection: remotePushSelectionSchema,
  localFingerprint: z.string().min(1), connectionFingerprint: z.string().min(1), safetyFingerprint: z.string().min(1), remoteFingerprint: z.string().min(1),
  remoteEvidence: remotePushEvidenceSchema, items: z.array(remotePushEffectSchema),
  exclusions: z.array(z.object({ entityId: uuidSchema, reason: z.string().min(1) }).strict()), blockers: z.array(z.string())
}).strict();
export type RemotePushPlan = z.infer<typeof remotePushPlanSchema>;
export const remotePushItemExecutionSchema = z.object({
  itemId: uuidSchema, state: z.enum(["not_attempted", "intent", "remote_succeeded", "local_failed", "succeeded", "failed", "uncertain"]),
  attempt: z.number().int().nonnegative(), remoteId: z.string().optional(), url: z.string().optional(), error: z.string().optional(),
  remoteResult: z.unknown().optional(), intentPayload: z.union([remoteIssuePayloadSchema, remoteMilestonePayloadSchema, remotePushRelationshipIntentSchema]).optional(), intentAt: z.iso.datetime().optional(), completedAt: z.iso.datetime().optional()
}).strict();
export type RemotePushItemExecution = z.infer<typeof remotePushItemExecutionSchema>;
export const remotePushExecutionSchema = z.object({
  planId: uuidSchema, status: z.enum(["reviewed", "running", "interrupted", "completed", "stale"]),
  confirmedBy: actorContextSchema.optional(), confirmedAt: z.iso.datetime().optional(), runToken: uuidSchema.optional(),
  expectedLocalFingerprint: z.string().optional(), items: z.array(remotePushItemExecutionSchema)
}).strict();
export type RemotePushExecution = z.infer<typeof remotePushExecutionSchema>;
export const remotePushPlanResponseSchema = z.object({ plan: remotePushPlanSchema, execution: remotePushExecutionSchema }).strict();
export type RemotePushPlanResponse = z.infer<typeof remotePushPlanResponseSchema>;
export const confirmRemotePushRequestSchema = z.object({ planId: uuidSchema, reviewOverride: z.object({ confirmed: z.literal(true), reason: z.string().trim().min(1) }).strict().optional() }).strict();
export const resumeRemotePushRequestSchema = confirmRemotePushRequestSchema;
export type ConfirmRemotePushRequest = z.infer<typeof confirmRemotePushRequestSchema>;
