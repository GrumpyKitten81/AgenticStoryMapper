import type { Card, WorkItemProvider } from "@storymapper/contracts";
import type { ReactNode } from "react";
import { Circle, Github } from "lucide-react";
import type { TreeColumnId } from "@storymapper/web/app/stores/tree-columns-store";
import { storyMapStrings as strings, whatChangedStrings } from "@storymapper/ui-strings";

export interface WorkItemRef {
  provider: WorkItemProvider;
  ticket: string;
  url: string;
}

export interface TreeCellContext {
  card: Card;
  estimationUnit: string;
  releaseName: string | undefined;
  workItem: WorkItemRef | undefined;
}

interface TreeColumn {
  id: Exclude<TreeColumnId, "changed">;
  header: (estimationUnit: string) => string;
  cell: (context: TreeCellContext) => ReactNode;
  title?: (context: TreeCellContext) => string | undefined;
}

export const TREE_COLUMNS: TreeColumn[] = [
  { id: "key", header: () => strings.key, cell: ({ card }) => card.key },
  { id: "status", header: () => strings.status, cell: ({ card }) => card.status },
  { id: "priority", header: () => strings.prio, cell: ({ card }) => card.priority ? strings.priorityValue(card.priority) : strings.emptyValue },
  { id: "estimate", header: (unit) => strings.estimateLabel(unit), cell: ({ card, estimationUnit }) => card.estimate !== undefined && card.estimate !== null ? strings.estimateWithUnit(card.estimate, estimationUnit) : strings.emptyValue },
  { id: "release", header: () => strings.release, cell: ({ releaseName }) => releaseName ?? strings.emptyValue, title: ({ releaseName }) => releaseName },
  { id: "assignee", header: () => strings.assignee, cell: ({ card }) => card.assignee ?? strings.emptyValue, title: ({ card }) => card.assignee },
  { id: "link", header: () => strings.link, cell: ({ workItem }) => workItem ? (
    <a className="tree-link-value" href={workItem.url} target="_blank" rel="noopener noreferrer" title={strings.githubTicket(workItem.ticket)}>
      <Github size={13} />
      <span>{workItem.ticket}</span>
    </a>
  ) : <span className="tree-link-value tree-link-empty" title={strings.notLinked}><Circle size={13} /></span> }
];

export const TREE_COLUMN_OPTIONS: { id: TreeColumnId; label: (estimationUnit: string) => string }[] = [
  { id: "changed", label: () => whatChangedStrings.changed },
  ...TREE_COLUMNS.map(({ id, header }) => ({ id, label: header }))
];
