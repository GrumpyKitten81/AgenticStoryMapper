import { z } from "zod";
import { uuidSchema } from "@storymapper/contracts/schemas/identifiers";
import { parseWorkItemLocator, isWorkItemProvider } from "@storymapper/contracts/schemas/work-item-identity";

export const externalRefEntityTypeSchema = z.enum(["card", "release", "persona"]);
export type ExternalRefEntityType = z.infer<typeof externalRefEntityTypeSchema>;
export const externalRefSchema = z.object({
  id: uuidSchema,
  entityType: externalRefEntityTypeSchema,
  entityId: uuidSchema,
  system: z.string().regex(/^[a-z0-9-]+$/),
  externalId: z.string().trim().min(1),
  scopeId: uuidSchema,
  syncedVersion: z.number().refine(Number.isInteger).positive(),
  createdAt: z.iso.datetime().or(z.iso.datetime({ precision: -1 }))
}).refine((ref) => !isWorkItemProvider(ref.system) || ref.entityType !== "persona" && Boolean(parseWorkItemLocator(ref.system, ref.externalId)) && (ref.system !== "github" || parseWorkItemLocator(ref.system, ref.externalId)!.url === ref.externalId), "GitHub references require a canonical Issue or Milestone locator and a Card or Release owner.");
export type ExternalRef = z.infer<typeof externalRefSchema>;

export const externalRefDeletedEvidenceSchema = z.object({
  reason: z.literal("entity-deleted"), projectId: uuidSchema, storyMapId: uuidSchema,
  entityType: z.enum(["card", "release"]), entityId: uuidSchema, before: externalRefSchema
}).strict().refine((evidence) => isWorkItemProvider(evidence.before.system) && evidence.before.entityType === evidence.entityType && evidence.before.entityId === evidence.entityId && evidence.before.scopeId === evidence.storyMapId, "Deletion evidence must retain the canonical deleted GitHub owner.");
export type ExternalRefDeletedEvidence = z.infer<typeof externalRefDeletedEvidenceSchema>;
