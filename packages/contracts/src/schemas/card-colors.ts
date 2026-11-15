import { z } from "zod";

export const CARD_COLOR_VALUES = ["#ffffff", "#e5484d", "#f5a623", "#f2d600", "#4caf7d", "#4a90e2", "#8e5bd6", "#17a2b8", "#e0559b", "#a3762f"] as const;
export const cardColorValueSchema = z.enum(CARD_COLOR_VALUES);
export const colorCategoryNamesSchema = z.partialRecord(cardColorValueSchema, z.string().trim().min(1).max(60));
export type CardColorValue = z.infer<typeof cardColorValueSchema>;
export type ColorCategoryNames = z.infer<typeof colorCategoryNamesSchema>;
