import { z } from "zod";
import { cardSchema, externalRefSchema } from "@storymapper/contracts/schemas/domain";

export const sourcePlanIdentitySchema = z.object({ id: z.guid(), key: z.string().min(1), title: z.string().min(1) }).strict();
export const sourcePlanEntrySchema = z.object({
  cardId: z.guid(), identity: sourcePlanIdentitySchema, releaseName: z.string().nullable(),
  card: z.lazy(() => cardSchema.strict()).nullable(), active: z.boolean(),
  binding: z.lazy(() => externalRefSchema.strict()).nullable()
}).strict().superRefine((entry, context) => {
  if (entry.identity.id !== entry.cardId || entry.card && (entry.card.id !== entry.cardId || entry.identity.key !== entry.card.key || entry.identity.title !== entry.card.title)) context.addIssue({ code: "custom", message: "Captured Card identity is inconsistent." });
  if (entry.card && entry.active && ((entry.card.archived ?? entry.card.status === "archived") || entry.card.parked)) context.addIssue({ code: "custom", message: "Archived or parked Card cannot be active." });
  if (entry.card && entry.card.releaseId === null && entry.releaseName !== null) context.addIssue({ code: "custom", message: "Unscheduled Card cannot retain a Slice name." });
  if (!entry.card && (entry.active || entry.binding !== null)) context.addIssue({ code: "custom", message: "Deleted Card cannot retain active membership or binding." });
});
export type SourcePlanEntry = z.infer<typeof sourcePlanEntrySchema>;
export const sourcePlanBaselineSchema = z.object({
  id: z.guid(), projectId: z.guid(), storyMapId: z.guid(), system: z.string().trim().min(1),
  version: z.number().int().positive(), schemaVersion: z.literal(1),
  entries: z.array(sourcePlanEntrySchema), releases: z.array(z.object({ id: z.guid(), name: z.string().min(1) }).strict())
}).strict().superRefine((baseline, context) => {
  const releaseIds = new Set(baseline.releases.map((release) => release.id));
  for (const entry of baseline.entries) {
    if (entry.card && entry.binding && entry.binding.syncedVersion !== entry.card.version) context.addIssue({ code: "custom", message: "Captured binding version disagrees with Card." });
    if (entry.card?.releaseId && (!releaseIds.has(entry.card.releaseId) || entry.releaseName === null)) context.addIssue({ code: "custom", message: "Captured Slice evidence is missing." });
  }
});
export type SourcePlanBaseline = z.infer<typeof sourcePlanBaselineSchema>;
declare const validatedSourcePlanBaseline: unique symbol;
export type ValidatedSourcePlanBaseline = SourcePlanBaseline & { readonly [validatedSourcePlanBaseline]: true };
export const sourcePlanProjectionSchema = z.object({
  title: z.string().min(1), description: z.string(), status: z.string(), releaseId: z.guid().nullable(), active: z.boolean()
}).strict();
export const sourcePlanAcknowledgmentSchema = z.object({
  storyMapId: z.guid(), system: z.string().trim().min(1), baselineId: z.guid(), baselineVersion: z.number().int().positive(),
  entries: z.array(z.object({ cardId: z.guid(), before: sourcePlanEntrySchema.nullable(),
    current: z.lazy(() => cardSchema.strict()).nullable(), binding: z.lazy(() => externalRefSchema.strict()).nullable(),
    source: sourcePlanProjectionSchema.nullable() }).strict()).min(1)
}).strict();
export type SourcePlanAcknowledgment = z.infer<typeof sourcePlanAcknowledgmentSchema>;
export const planDriftReportSchema = z.object({
  storyMapId: z.guid(), system: z.string().min(1), baselineId: z.guid(), baselineVersion: z.number().int().positive(),
  changes: z.array(z.object({ cardId: z.guid(), kinds: z.array(z.enum(["added", "removed", "changed", "moved"])).min(1),
    reason: z.enum(["active", "archived", "deleted", "parked", "hidden"]), before: sourcePlanEntrySchema.nullable(), after: sourcePlanEntrySchema.nullable(),
    beforeReleaseName: z.string().nullable(), afterReleaseName: z.string().nullable() }).strict())
}).strict();
export type PlanDriftReport = z.infer<typeof planDriftReportSchema>;
export const planDriftSystemsResponseSchema = z.object({ systems: z.array(z.string().min(1)) }).strict();
