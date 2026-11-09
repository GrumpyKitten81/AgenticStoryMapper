import { z } from "zod";
import { canonicalMilestoneIdSchema } from "@storymapper/contracts/schemas/work-item-identity";

export const syncReleaseMetadataSchema = z.object({
  name: z.string(),
  goal: z.string().nullable(),
  released: z.boolean().nullable(),
  startDate: z.string().nullable(),
  releaseDate: z.string().nullable()
}).strict();
export type SyncReleaseMetadata = z.infer<typeof syncReleaseMetadataSchema>;

export const syncFieldValuesSchema = z.object({
  titleHash: z.string(),
  bodyHash: z.string(),
  remoteState: z.string().optional(),
  statusLabels: z.array(z.string()),
  annotationLabels: z.array(z.string()),
  releaseMetadata: syncReleaseMetadataSchema.nullable(),
  milestone: canonicalMilestoneIdSchema.nullable(),
  iteration: z.object({ title: z.string().min(1), startDate: z.string().optional(), duration: z.number().optional() }).strict().nullable().optional()
}).strict();
export const workItemSyncBaselineSchema = z.object({
  pendingReleaseAssignment: z.boolean(),
  acknowledgedLocal: syncFieldValuesSchema.extend({ releaseId: z.string().min(1).nullable() }),
  observedRemote: syncFieldValuesSchema
}).strict();
export type WorkItemSyncBaseline = z.infer<typeof workItemSyncBaselineSchema>;
