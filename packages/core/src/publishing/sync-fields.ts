import type { ConnectorConnection, Release, SyncReleaseMetadata } from "@storymapper/contracts";

export function normalizeRemoteWorkItemTitle(title: string, localTitle?: string): string {
  return title === localTitle ? title : title.replace(/^[A-Z][A-Z0-9]*-\d+:\s*/u, "");
}

export function replaceSyncStatusLabels(connection: ConnectorConnection, remote: string[], local: string[]): string[] {
  const managed = new Set(connection.statusMapping.flatMap((entry) => entry.labels));
  const isStatus = (label: string): boolean => managed.has(label);
  return [...new Set([...remote.filter((label) => !isStatus(label)), ...local.filter(isStatus)])];
}

export function syncStatusLabels(connection: ConnectorConnection, labels: string[]): string[] {
  const managed = new Set(connection.statusMapping.flatMap((entry) => entry.labels));
  return [...new Set(labels.filter((label) => managed.has(label)))].sort();
}

export function managedAnnotationDefinitions<T extends { name: string }>(connection: ConnectorConnection, annotations: T[]): T[] {
  if (!connection.labelsAsAnnotations) return [];
  const statusLabels = new Set(connection.statusMapping.flatMap((entry) => entry.labels));
  return annotations.filter((row) => annotations.filter((other) => other.name === row.name).length === 1
    && !statusLabels.has(row.name) && row.name !== connection.defaultLabel && !row.name.startsWith("story-map:") && !row.name.startsWith("level:"));
}

export function labelsForSyncStatus(connection: ConnectorConnection, status: string): string[] {
  return connection.statusMapping.find((entry) => entry.localStatus === status)?.labels ?? [];
}

export function stateForSyncStatus(connection: ConnectorConnection, status: string): string {
  return connection.statusMapping.find((entry) => entry.localStatus === status)?.remoteState ?? (status === "done" ? "closed" : "open");
}

export function localStatusForRemote(connection: ConnectorConnection, remoteState: string, labels: string[], currentStatus: string): string {
  const exactLabelMatch = connection.statusMapping.find((entry) => entry.labels.some((label) => labels.includes(label)));
  if (exactLabelMatch) return exactLabelMatch.localStatus;
  const stateMatches = connection.statusMapping.filter((entry) => entry.remoteState.toLowerCase() === remoteState.toLowerCase());
  if (stateMatches.length === 1) return stateMatches[0]!.localStatus;
  return remoteState.toLowerCase() === "closed" ? "done" : currentStatus;
}

export function syncReleaseMetadata(connection: Pick<ConnectorConnection, "releaseSource">, release: Pick<Release, "name" | "goal" | "released" | "startDate" | "releaseDate"> | undefined): SyncReleaseMetadata | null {
  return connection.releaseSource === "none" || !release ? null : { name: release.name, goal: connection.releaseSource === "milestone" ? release.goal : null, released: connection.releaseSource === "milestone" ? release.released : null, startDate: connection.releaseSource === "iteration" ? release.startDate ?? null : null, releaseDate: release.releaseDate ?? null };
}
