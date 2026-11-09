import { createContext, useContext, type ReactNode } from "react";
import type { ConnectorConnection, Release, StoryMapSnapshot, SyncConflict } from "@storymapper/contracts";
import { managedAnnotationDefinitions } from "@storymapper/core/publishing/sync-fields";
import { useConnectorConnections, useWorkItemSyncHealth } from "@storymapper/web/app/api";
import { githubStatusStrings } from "@storymapper/web/ui-strings/github-status";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";

export type ReleaseSyncField = keyof Pick<Release, "name" | "goal" | "startDate" | "releaseDate" | "released">;
interface SyncLockContext { conflicts: SyncConflict[]; snapshot?: StoryMapSnapshot; connections: ConnectorConnection[] }
const SyncConflictsContext = createContext<SyncLockContext>({ conflicts: [], connections: [] });

export function SyncFieldLocksProvider({ snapshot, children }: { snapshot: StoryMapSnapshot; children: ReactNode }) {
  const linked = snapshot.remoteWorkItemLinks.length > 0;
  const health = useWorkItemSyncHealth(linked ? snapshot.storyMap.id : undefined);
  const connections = useConnectorConnections(linked ? snapshot.storyMap.projectId : undefined);
  return <SyncConflictsContext.Provider value={{ conflicts: health.data?.openConflicts ?? [], snapshot, connections: connections.data?.connections ?? [] }}>{health.error ? <p role="alert">{health.error.message}</p> : null}{connections.error ? <p role="alert">{connections.error.message}</p> : null}{children}</SyncConflictsContext.Provider>;
}

export function useSyncFieldLocks(cardId?: string): Set<SyncConflict["field"]> {
  const { conflicts, snapshot } = useContext(SyncConflictsContext);
  const locks = new Set(conflicts.filter((conflict) => conflict.cardId === cardId).map((conflict) => conflict.field));
  if (snapshot?.remoteWorkItemLinks.some((link) => link.cardId === cardId)) locks.add("status");
  return locks;
}

export function useSyncFieldLockHint(links?: StoryMapSnapshot["remoteWorkItemLinks"]) {
  const { conflicts, snapshot, connections } = useContext(SyncConflictsContext);
  return (cardIds: string | ReadonlySet<string> | undefined, field: SyncConflict["field"]): string | undefined => {
    const matches = (cardId: string | undefined) => Boolean(cardId && (typeof cardIds === "string" ? cardIds === cardId : cardIds?.has(cardId)));
    if (conflicts.some((conflict) => matches(conflict.cardId) && conflict.field === field)) return syncConflictStrings.lock(syncConflictStrings.fields[field]);
    if (field !== "status") return undefined;
    const sources = (links ?? snapshot?.remoteWorkItemLinks ?? []).filter((link) => matches(link.cardId)).map((link) => {
      const source = link.statusEvidence?.source ?? connections.find((connection) => connection.id === link.connectionId)?.statusSource;
      return source?.kind === "project" ? source.projectName : githubStatusStrings.repository;
    });
    return sources.length ? [...new Set(sources)].map(githubStatusStrings.ownership).join(" ") : undefined;
  };
}

export function useReleaseSyncFieldLocks(releaseId?: string | null): Set<ReleaseSyncField> {
  const { conflicts, snapshot, connections } = useContext(SyncConflictsContext);
  const fields = new Set<ReleaseSyncField>();
  if (!releaseId || !snapshot) return fields;
  for (const conflict of conflicts.filter((entry) => entry.field === "milestone")) {
    const card = snapshot.cards.find((row) => row.id === conflict.cardId);
    const baseline = snapshot.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId)?.baseline;
    const identities = [conflict.localValue, conflict.remoteValue].flatMap((value) => value && typeof value === "object" && "assignment" in value ? [value.assignment] : []);
    const disputedTarget = snapshot.externalRefs.some((ref) => ref.entityType === "release" && ref.entityId === releaseId && ref.system === "github" && identities.includes(ref.externalId));
    if (card?.releaseId !== releaseId && baseline?.acknowledgedLocal.releaseId !== releaseId && !disputedTarget) continue;
    const connection = connections.find((row) => row.id === conflict.connectionId);
    for (const field of connection?.releaseSource === "iteration" ? ["name", "startDate", "releaseDate"] as const : ["name", "goal", "releaseDate", "released"] as const) fields.add(field);
  }
  return fields;
}

export function useManagedAnnotationSyncLocks(cardIds: ReadonlySet<string>): Set<string> {
  const { conflicts, snapshot, connections } = useContext(SyncConflictsContext);
  const ids = new Set<string>();
  if (!snapshot) return ids;
  for (const conflict of conflicts.filter((row) => row.field === "labels" && row.cardId && cardIds.has(row.cardId))) {
    const connection = connections.find((row) => row.id === conflict.connectionId);
    const mapId = snapshot.cards.find((card) => card.id === conflict.cardId)?.storyMapId;
    if (connection) for (const annotation of managedAnnotationDefinitions(connection, snapshot.annotations.filter((row) => !row.storyMapId || row.storyMapId === mapId))) ids.add(annotation.id);
  }
  return ids;
}

export function useSyncFieldLocksForCards(cardIds: Set<string>): Set<SyncConflict["field"]> {
  const { conflicts, snapshot } = useContext(SyncConflictsContext);
  const locks = new Set(conflicts.filter((conflict) => conflict.cardId && cardIds.has(conflict.cardId)).map((conflict) => conflict.field));
  if (snapshot?.remoteWorkItemLinks.some((link) => link.cardId && cardIds.has(link.cardId))) locks.add("status");
  return locks;
}

export function useSyncConflicts(): SyncConflict[] {
  return useContext(SyncConflictsContext).conflicts;
}
