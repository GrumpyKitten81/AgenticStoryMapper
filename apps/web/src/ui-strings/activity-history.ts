export const entities: Record<string, string> = { card: "Card", storyMap: "Story map", release: "Release", project: "Project", persona: "Persona", annotation: "Annotation", workflowStatus: "Workflow status", storyTemplate: "Template", changeSet: "ChangeSet" };
export const actions: Record<string, string> = { moved: "moved", proposed: "proposed", created: "created", updated: "updated", deleted: "deleted", archived: "archived", restored: "restored", applied: "applied", approved: "approved", rejected: "rejected", imported: "imported", parked: "parked", unparked: "unparked" };
export const tools: Record<string, string> = { BulkUpdateCards: "Bulk card update request", ListProjects: "Project read request", GetStoryMapSnapshot: "Story map read request", GetStoryMapCards: "Card read request", ListActivity: "Activity read request", SubmitChangeSet: "ChangeSet proposal request", ApproveChangeSet: "ChangeSet approval request", ApplyChangeSet: "ChangeSet application request" };
export const reasons: Record<string, string> = { disabled: "The action was blocked by safety settings.", protected: "The action was blocked by protection rules.", conflict: "The action could not proceed because the data changed.", not_found: "The requested object was not found.", validation: "The request was invalid.", restoring: "The action was blocked while restoration was in progress." };
export const fieldLabels: Record<string, string> = { cardType: "Card type", title: "Title", name: "Name", status: "Status", assignee: "Assignee", estimate: "Estimate", goal: "Goal", startDate: "Start date", releaseDate: "Release date", parked: "Parked", released: "Released", description: "Description", priority: "Priority", businessValue: "Business value", effort: "Effort", color: "Color", position: "Position", parentId: "Parent", releaseId: "Release" };


export const activityHistoryCopy = {
  viewLabel: "Activity view", show: "Show", changes: "Changes and problems", all: "All events", history: "ChangeSet history",
  recorded: "Recorded", unknownAction: "Activity recorded", toolExecution: "Tool execution recorded", nameNotRecorded: "Name not recorded",
  technical: "Technical details", moreChanges: (count: number) => `${count} more changes`,
  objectCount: (count: number) => `${count} recorded object reference${count === 1 ? "" : "s"}`,
  actor: (type: string, id: string) => `${type}${id === "local-user" ? " · Local user" : id === "local-mcp-host" ? " · Local MCP agent" : ""}`,
  subject: (key?: string, name?: string) => [key, name].filter(Boolean).join(" · ") || "Name not recorded",
  change: (field: string, before: string, after: string) => `${field}: ${before} → ${after}`,
  event: (id: string) => `Event: ${id}`, action: (value: string) => `Action: ${value}`, utc: (value: string) => `UTC: ${value}`,
  tool: (value: string) => `Tool: ${value}`, reason: (value: string) => `Reason: ${value}`,
  showDetails: "Show details", hideDetails: "Hide details",
  reviewLabel: (title: string, open: boolean) => `${open ? "Hide" : "Show"} details: ${title}`
} as const;

export function displayAuditValue(value: string | number | boolean | null | undefined): string {
  return value === undefined ? "Not recorded" : value === null || value === "" ? "Empty" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
}

export const specialActivityActions: Record<string, string> = { "changeSet.operation.applied": "ChangeSet operation applied", "project.restore_failed": "Project restoration failed" };
