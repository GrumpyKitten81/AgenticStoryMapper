import { z } from "zod";
import { uuidSchema } from "@storymapper/contracts/schemas/identifiers";
import { workItemIdentitySchema } from "@storymapper/contracts/schemas/work-item-identity";

export const deletedLocalSyncLinkSchema = z.object({
  id: uuidSchema,
  externalRefId: uuidSchema,
  storyMapId: uuidSchema,
  entityType: z.enum(["card", "release"]),
  entityId: uuidSchema,
  url: workItemIdentitySchema.shape.url,
  syncState: z.literal("local_deleted")
}).strict();
export type DeletedLocalSyncLink = z.infer<typeof deletedLocalSyncLinkSchema>;
