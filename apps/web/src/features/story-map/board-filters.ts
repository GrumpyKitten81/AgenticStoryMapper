import type { CardLevel, GitHubLink } from "@storymapper/contracts";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

export type GitHubFilter = "all" | "linked" | "unlinked" | GitHubLink["syncState"];

export interface BoardFilters {
  search: string;
  level: "all" | CardLevel;
  priority: "all" | "1" | "2" | "3" | "4" | "5";
  statuses: string[];
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
  statusMode: "include",
  hideCompleted: false,
  release: "all",
  source: "all",
  github: "all",
  estimate: "all",
  persona: "all",
  color: "all",
  annotation: "all"
};

export const hasActiveBoardFilters = (filters: BoardFilters) => (Object.keys(defaultBoardFilters) as (keyof BoardFilters)[]).some((key) => (key !== "persona" || isPersonasEnabled) && JSON.stringify(filters[key]) !== JSON.stringify(defaultBoardFilters[key]));
