import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { panelStrings } from "@storymapper/ui-strings";

const syncStateHints: Record<string, string> = {
  synced: panelStrings.inSyncWithGitHubNoActionNeeded,
  unsynced: syncConflictStrings.unsynced,
  stale: syncConflictStrings.stale,
  conflict: panelStrings.conflictHint,
  remote_deleted: panelStrings.theLinkedGitHubIssueWasDeleted,
  local_deleted: panelStrings.theLocalCardWasDeleted
};

export function githubSyncStateHint(state: string | undefined): string {
  if (!state) return panelStrings.notLinkedToAGitHubIssueYet;
  return syncStateHints[state] ?? panelStrings.syncState(state);
}
