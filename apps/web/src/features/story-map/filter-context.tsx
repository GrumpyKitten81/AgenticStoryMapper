import { createContext, useContext } from "react";

export const FilterMatchesContext = createContext<ReadonlySet<string> | undefined>(undefined);
export function useIsFilterContext(cardId: string): boolean {
  const matches = useContext(FilterMatchesContext);
  return matches !== undefined && !matches.has(cardId);
}
