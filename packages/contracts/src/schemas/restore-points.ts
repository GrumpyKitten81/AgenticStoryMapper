import { workItemProviderSchema } from "@storymapper/contracts/schemas/work-item-provider";
import { z } from "zod";
import { githubLinkSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

export const restorePointClassSchema = z.enum(["manual", "pre-migration", "pre-restore", "pre-apply"]);

export const restorePointSchema = z.object({
  fileName: z.string().regex(/^[a-z0-9_.-]+$/i),
  class: restorePointClassSchema,
  createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime()),
  sizeBytes: z.number().refine(Number.isInteger).nonnegative(),
  schemaVersion: z.string().regex(/^release-sha256-[a-f0-9]{64}$/),
  scope: z.literal("local-database")
}).strict();

export const restorePointCapabilitySchema = z.object({
  name: z.enum(["restore-points.list", "restore-points.create", "restore-points.restore"]),
  audience: z.literal("human"),
  mcp: z.literal(false)
}).strict();

export const restorePointCapabilities = z.array(restorePointCapabilitySchema).parse([
  { name: "restore-points.list", audience: "human", mcp: false },
  { name: "restore-points.create", audience: "human", mcp: false },
  { name: "restore-points.restore", audience: "human", mcp: false }
]);

export const humanOnlyRestoreToolNames: readonly string[] = ["RestoreProject", "restore-points.restore", "RestoreRestorePoint"];

export const restoreProjectRequestSchema =z.object({
  fileName: restorePointSchema.shape.fileName,
  confirm: z.literal(true)
}).strict();

export const restoreProjectResultSchema = z.object({
  restorePoint: restorePointSchema,
  preRestorePoint: restorePointSchema,
  epoch: uuidSchema,
  githubLinks: z.array(z.object({ url: githubLinkSchema.shape.url, provider: workItemProviderSchema, kind: z.literal("canonical") }).strict()),
  attachmentsRetained: z.literal(true),
  undoneActivityEvents: z.number().refine(Number.isInteger).nonnegative(),
  undoneChangeSets: z.number().refine(Number.isInteger).nonnegative()
}).strict();

export type RestoreProjectRequest = z.infer<typeof restoreProjectRequestSchema>;
export type RestoreProjectResult = z.infer<typeof restoreProjectResultSchema>;

export const restoreActivityResponseSchema = z.object({
  activityEvents: z.array(z.object({
    id: uuidSchema,
    action: z.literal("project.restored"),
    undoneByRestore: z.boolean().optional(),
    after: restoreProjectResultSchema
  }).strict())
}).strict();
export type RestoreActivityResponse = z.infer<typeof restoreActivityResponseSchema>;

export type RestorePointClass = z.infer<typeof restorePointClassSchema>;
export type RestorePoint = z.infer<typeof restorePointSchema>;
export type RestorePointCapability = z.infer<typeof restorePointCapabilitySchema>;
