import { z } from "zod";
import { uuidSchema } from "@storymapper/contracts/schemas/domain";

export const baseVersionSchema = z.number().int().positive();

export const versionConflictEntrySchema = z.object({
  reason: z.enum(["version", "sync"]).optional(),
  syncConflictId: uuidSchema.optional(),
  operationId: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  entity: z.enum(["card", "release", "persona", "roadmap", "storyMap"]),
  id: uuidSchema,
  baseVersion: baseVersionSchema,
  currentVersion: z.number().int().positive(),
  current: z.unknown()
}).strict();
export type VersionConflictEntry = z.infer<typeof versionConflictEntrySchema>;
export const operationInputConflictEntrySchema = z.object({
  reason: z.enum(["fingerprint", "source"]),
  operationId: z.string(),
  index: z.number().int().nonnegative(),
  entity: z.enum(["storyMap", "sourceDocument", "connection", "project", "card"]),
  id: uuidSchema,
  current: z.unknown(),
  message: z.string(),
  baseVersion: z.never().optional(),
  currentVersion: z.never().optional()
}).strict();
export const conflictEntrySchema = z.union([versionConflictEntrySchema, operationInputConflictEntrySchema]);
export type ConflictEntry = z.infer<typeof conflictEntrySchema>;

export const conflictResponseSchema = z.object({ code: z.literal("conflict"), message: z.string(), conflicts: z.array(conflictEntrySchema).min(1) });
