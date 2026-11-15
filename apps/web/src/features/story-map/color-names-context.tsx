import { createContext, useContext } from "react";
import type { ColorCategoryNames } from "@storymapper/contracts";
import { cardColors } from "@storymapper/web/features/story-map/card-visual-options";

export const ColorNamesContext = createContext<ColorCategoryNames | undefined | null>(null);
export function useCardColors(mapNames?: ColorCategoryNames) {
  const names = useContext(ColorNamesContext);
  return cardColors(names === null ? mapNames : names);
}
