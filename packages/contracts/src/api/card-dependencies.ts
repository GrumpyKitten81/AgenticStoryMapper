import { z } from "zod";
import { cardDependencySchema, cardSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";

export const setCardDependencyRequestSchema = z.object({ prerequisiteCardId: uuidSchema, baseVersion: baseVersionSchema, apply: z.boolean().optional() }).strict();
export const deleteCardDependencyRequestSchema = setCardDependencyRequestSchema;
export const cardDependencyResponseSchema = z.object({ card: cardSchema, dependencies: z.array(cardDependencySchema) }).strict();
export type SetCardDependencyRequest = z.infer<typeof setCardDependencyRequestSchema>;
export type DeleteCardDependencyRequest = z.infer<typeof deleteCardDependencyRequestSchema>;
export type CardDependencyResponse = z.infer<typeof cardDependencyResponseSchema>;
