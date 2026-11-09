import { parseWorkItemLocator, isWorkItemProvider, type OperationSnapshot, type ExternalRef, type GitHubLink, type RemoteWorkItemLink, type RemoteWorkItemSyncState } from "@storymapper/contracts";

export function projectGitHubRefs(refs: readonly ExternalRef[], states: readonly RemoteWorkItemSyncState[] = []): GitHubLink[] {
  return refs.filter((ref) => isWorkItemProvider(ref.system)).map((ref) => {
    const locator = parseWorkItemLocator(ref.system, ref.externalId);
    if (!locator || ref.entityType === "persona") throw new Error("Invalid canonical GitHub reference.");
    const sync = states.find((state) => state.externalRefId === ref.id);
    return { id: ref.id, ...(locator.provider === "github" ? {} : { provider: locator.provider }), ...(ref.entityType === "card" ? { cardId: ref.entityId } : { releaseId: ref.entityId }), repo: locator.repo,
      ...(locator.resource === "issues" ? { issueNumber: locator.number } : {}), url: locator.url,
      ...(sync?.milestone ? { milestone: sync.milestone } : {}), syncState: sync?.syncState ?? "unsynced" };
  });
}

export function projectRemoteWorkItemLink(state: RemoteWorkItemSyncState, refs: readonly ExternalRef[]): RemoteWorkItemLink {
  const ref = refs.find((entry) => entry.id === state.externalRefId && isWorkItemProvider(entry.system));
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  if (!ref || !locator || ref.entityType === "persona") throw new Error("Remote sync identity is missing.");
  return { ...state, issueType: state.issueType, managedLabels: state.managedLabels ?? [], provider: ref.system as RemoteWorkItemLink["provider"], ...(ref.entityType === "card" ? { cardId: ref.entityId } : { releaseId: ref.entityId }),
    remoteId: locator.remoteId, remoteNumber: locator.number, url: locator.url };
}

export function retireGitHubSync(state: Pick<OperationSnapshot, "remoteWorkItemLinks" | "syncConflicts">, externalRefId: string): void {
  if (state.syncConflicts) state.syncConflicts = state.syncConflicts.filter((conflict) => conflict.status !== "open" || conflict.externalRefId !== externalRefId);
  state.remoteWorkItemLinks = state.remoteWorkItemLinks.filter((link) => link.externalRefId !== externalRefId);
}
