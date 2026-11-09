export const githubStatusStrings = {
  sourceHeading: "GitHub status source", source: "Status source", repository: "Repository (Open / Closed)",
  loadProjects: "Load GitHub Projects", sourceHint: "GitHub owns linked Card statuses. Source changes are adopted by the next applied sync.",
  selectionMode: "Status selection mode", include: "Include selected statuses", exclude: "Exclude selected statuses",
  hideCompleted: "Hide completed / closed", multiSelectHint: "Select several statuses with Ctrl or Command. An empty selection includes every status.",
  clearStatuses: "Clear status selection", ownership: (source: string) => `Status is owned by GitHub · ${source}. Detach the sync link to edit it locally.`,
  missingMembership: "This Issue is not in the selected GitHub Project.",
  bind: "Link an existing GitHub Issue", selector: "GitHub Issue URL or number", connection: "GitHub connection", previewBinding: "Preview GitHub link",
  adoptionPending: "Status adoption is pending. Apply an incoming GitHub sync to adopt the selected source status.",
  ancestorContext: "Ancestor Card context",
  detach: "Detach GitHub sync", detached: "GitHub sync detached. The last status is retained."
};
