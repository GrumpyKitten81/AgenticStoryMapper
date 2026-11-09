import type { CardLevel } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export interface CardLevelMeta {
  label: string;
  longLabel: string;
  pluralLabel: string;
}

export const cardLevelMeta: Record<CardLevel, CardLevelMeta> = strings.cardLevels;
