import type { WorkflowGroup } from "@storymapper/contracts";

export interface GitHubStatusMapping {
  localStatus: string;
  workflowGroup: WorkflowGroup;
  githubState: "open" | "closed";
  labels: string[];
}

export function defaultStatusMappings(): GitHubStatusMapping[] {
  return [
    { localStatus: "todo", workflowGroup: "todo", githubState: "open", labels: ["status:todo"] },
    { localStatus: "active", workflowGroup: "active", githubState: "open", labels: ["status:active"] },
    { localStatus: "done", workflowGroup: "done", githubState: "closed", labels: ["status:done"] }
  ];
}
