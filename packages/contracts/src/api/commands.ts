import { z } from "zod";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";
import {
  bulkUpdateCardsCommandSchema,
  deleteCardRequestSchema,
  moveCardRequestSchema,
  parkCardRequestSchema,
  updateCardRequestSchema,
  updatePersonaRequestSchema,
  updateReleaseRequestSchema
} from "@storymapper/contracts/api/card-customization";
import { updateRoadmapRequestSchema, updateStoryMapRequestSchema } from "@storymapper/contracts/api/http";

export const baseVersionBodySchema = z.object({ baseVersion: baseVersionSchema });
export const baseVersionQuerySchema = z.object({ baseVersion: z.coerce.number().int().positive() });

export const updateCardCommandSchema = updateCardRequestSchema.extend(baseVersionBodySchema.shape);
export const moveCardCommandSchema = moveCardRequestSchema.extend(baseVersionBodySchema.shape);
export const deleteCardCommandSchema = deleteCardRequestSchema.extend(baseVersionBodySchema.shape);
export const parkCardCommandSchema = parkCardRequestSchema.extend(baseVersionBodySchema.shape);
export const updateReleaseCommandSchema = updateReleaseRequestSchema.extend(baseVersionBodySchema.shape);
export const updatePersonaCommandSchema = updatePersonaRequestSchema.extend(baseVersionBodySchema.shape);
export const updateRoadmapCommandSchema = updateRoadmapRequestSchema.extend(baseVersionBodySchema.shape);
export const updateStoryMapCommandSchema = updateStoryMapRequestSchema.extend(baseVersionBodySchema.shape);

export type BaseVersionBody = z.infer<typeof baseVersionBodySchema>;
export type UpdateCardCommand = z.infer<typeof updateCardCommandSchema>;
export type MoveCardCommand = z.infer<typeof moveCardCommandSchema>;
export type DeleteCardCommand = z.infer<typeof deleteCardCommandSchema>;
export type ParkCardCommand = z.infer<typeof parkCardCommandSchema>;
export type BulkUpdateCardsCommand = z.infer<typeof bulkUpdateCardsCommandSchema>;
export type UpdateReleaseCommand = z.infer<typeof updateReleaseCommandSchema>;
export type UpdatePersonaCommand = z.infer<typeof updatePersonaCommandSchema>;
export type UpdateRoadmapCommand = z.infer<typeof updateRoadmapCommandSchema>;
export type UpdateStoryMapCommand = z.infer<typeof updateStoryMapCommandSchema>;
