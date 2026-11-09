export interface GitHubSyncConflict {
  entityId: string;
  field: "title" | "description" | "status" | "milestone";
  localValue: unknown;
  remoteValue: unknown;
}

export function hasGitHubConflict(conflicts: GitHubSyncConflict[]): boolean {
  return conflicts.length > 0;
}
