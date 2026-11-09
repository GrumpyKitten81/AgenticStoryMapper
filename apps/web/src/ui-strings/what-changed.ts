export const whatChangedStrings = {
  count: (name: string, count: number) => `${name} (${count})`,
  indicator: (count: number, error: boolean) => `What changed (${count})${error ? " !" : ""}`,
  indicatorCount: (count: number, error: boolean) => `${count}${error ? " !" : ""}`,
  affected: (type: string | undefined, id: string | undefined) => `${type ?? "Project"} ${id ?? ""}`,
  point: (label: string, fileName: string) => `${label}: ${fileName}`,
  glyph: "~",
  loading: "Loading changes…",
  readFailed: (status: number) => `Cannot read changes (${status}).`, kept: "The Project kept changing during Restore. Reload changes.", projectChanged: "The Project changed. Reload changes before marking seen.",
  changedBy: (actor: string) => `Changed by ${actor}`,
  title: "What changed", changed: "Changed", close: "Close changes", seen: "Mark seen", allSeen: "Mark displayed changes as read", empty: "You are up to date.", retry: "Retry", restore: "Open Restore point", unavailable: "Restore point unavailable", storageError: "Seen state could not be saved or read. Your previous acknowledgement is retained.",
  actors: { human: "Person", agent: "Agent", github: "GitHub", system: "System" },
  localUser: "Local user", localMcpAgent: "Local MCP agent", mapNameMissing: "Map name not available", technicalDetails: "Technical details", detailSeparator: " · ", returnToChanges: "Return to changes",
  currentMap: "Active Map", project: "Entire Project", projectChanges: "Other Project changes", scope: "Change scope", search: "Search Card key or title", more: "More", details: "Change details", cardNameMissing: "Card name not recorded", deleted: "Deleted Card", archived: "Archived Card", inaccessible: "Card unavailable", openFailed: "The Card details did not open. Your changes remain unread. Retry from What changed.", previewBlocked: "Close the preview before opening a changed Card.", opening: "Opening Card details…", changes: (count: number) => `${count} change${count === 1 ? "" : "s"}`
};
