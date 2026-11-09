import { z } from "zod";
import { cardDependencySchema, cardSchema, releaseSchema, storyMapSchema, uuidSchema, workflowStatusSchema } from "@storymapper/contracts/schemas/domain";

export const planStateProjectionSchema = z.object({
  storyMap: storyMapSchema,
  cards: z.array(cardSchema),
  releases: z.array(releaseSchema),
  workflowStatuses: z.array(workflowStatusSchema),
  cardDependencies: z.array(cardDependencySchema),
  completedCardIds: z.array(uuidSchema).optional(),
  storyIds: z.array(uuidSchema)
}).strict();
export type PlanStateProjection = z.infer<typeof planStateProjectionSchema>;
export const planStateSummarySchema = z.object({
  id: uuidSchema, projectId: uuidSchema, storyMapId: uuidSchema,
  capturedAt: z.iso.datetime(), schemaVersion: z.literal(1), actor: z.string().min(1)
}).strict();
export type PlanStateSummary = z.infer<typeof planStateSummarySchema>;
export const planStateSchema = planStateSummarySchema.extend({ payload: planStateProjectionSchema }).strict();
export type PlanState = z.infer<typeof planStateSchema>;
const identitySchema = cardSchema.pick({ id: true, key: true, title: true, status: true, releaseId: true });
export const sliceDependencyCueSchema = z.object({
  cardId: uuidSchema, prerequisite: identitySchema, open: z.boolean(), blockedOrder: z.boolean()
}).strict();
export type SliceDependencyCue = z.infer<typeof sliceDependencyCueSchema>;
const progressSchema = z.object({ storyCount: z.number().int().nonnegative(), doneCount: z.number().int().nonnegative(), estimateTotal: z.number(), statusCounts: z.record(z.string(), z.number().int().nonnegative()) });
export const slicesReportSchema = z.object({
  storyMapId: uuidSchema,
  lanes: z.array(progressSchema.extend({ releaseId: uuidSchema.nullable(), name: z.string(), storyIds: z.array(uuidSchema), blockers: z.array(sliceDependencyCueSchema), activities: z.array(progressSchema.extend({ activityId: uuidSchema.nullable(), name: z.string() })) })),
  dependencies: z.array(sliceDependencyCueSchema)
}).strict();
export type SlicesReport = z.infer<typeof slicesReportSchema>;
export const planStateComparisonSchema = z.object({
  before: planStateSchema, after: planStateSchema,
  changes: z.array(z.object({ cardId: uuidSchema, kind: z.enum(["added", "removed", "moved"]), beforeReleaseId: uuidSchema.nullable(), afterReleaseId: uuidSchema.nullable() }).strict())
}).strict();
export type PlanStateComparison = z.infer<typeof planStateComparisonSchema>;
export const planStateResponseSchema = z.object({ state: planStateSchema }).strict();
export const listPlanStatesResponseSchema = z.object({ states: z.array(planStateSummarySchema) }).strict();
export type ListPlanStatesResponse = z.infer<typeof listPlanStatesResponseSchema>;
