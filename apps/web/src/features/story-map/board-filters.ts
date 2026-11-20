import type { CardLevel, CardType, GitHubLink } from "@storymapper/contracts";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

export type GitHubFilter = "all" | "linked" | "unlinked" | GitHubLink["syncState"];

export interface BoardFilters {
  search: string;
  level: "all" | CardLevel;
  priority: "all" | "1" | "2" | "3" | "4" | "5";
  statuses: string[];
  cardTypes: (CardType | "none")[];
  statusMode: "include" | "exclude";
  hideCompleted: boolean;
  release: string;
  source: "all" | "linked" | "unlinked";
  github: GitHubFilter;
  estimate: "all" | "estimated" | "unestimated";
  persona: string;
  annotation: string;
  color: string;
}

export const defaultBoardFilters: BoardFilters = {
  search: "",
  level: "all",
  priority: "all",
  statuses: [],
  cardTypes: [],
  statusMode: "include",
  hideCompleted: true,
  release: "all",
  source: "all",
  github: "all",
  estimate: "all",
  persona: "all",
  color: "all",
  annotation: "all"
};

const changedBoardFilterKeys = (filters: BoardFilters, reference: BoardFilters) => (Object.keys(reference) as (keyof BoardFilters)[]).filter((key) => (key !== "persona" || isPersonasEnabled) && JSON.stringify(filters[key]) !== JSON.stringify(reference[key]));

export const hasActiveBoardFilters = (filters: BoardFilters) => changedBoardFilterKeys(filters, defaultBoardFilters).length > 0;

export const activeBoardFilterKeys = (filters: BoardFilters) => changedBoardFilterKeys(filters, { ...defaultBoardFilters, hideCompleted: false });
