import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { ColorCategoryNames, CardColorValue } from "@storymapper/contracts";

export interface CardColor {
  label: string;
  value: CardColorValue;
}

export const CARD_COLORS: CardColor[] = [
  { label: strings.colorNames.white, value: "#ffffff" },
  { label: strings.colorNames.red, value: "#e5484d" },
  { label: strings.colorNames.orange, value: "#f5a623" },
  { label: strings.colorNames.yellow, value: "#f2d600" },
  { label: strings.colorNames.green, value: "#4caf7d" },
  { label: strings.colorNames.blue, value: "#4a90e2" },
  { label: strings.colorNames.purple, value: "#8e5bd6" },
  { label: strings.colorNames.teal, value: "#17a2b8" },
  { label: strings.colorNames.pink, value: "#e0559b" },
  { label: strings.colorNames.brown, value: "#a3762f" }
];

export const DEFAULT_CARD_COLOR = "#ffffff";

export const CARD_PRIORITY_OPTIONS = ["1", "2", "3", "4", "5"] as const;

export function cardColors(names?: ColorCategoryNames): CardColor[] {
  return CARD_COLORS.map((color) => ({ ...color, label: names?.[color.value] ?? color.label }));
}
