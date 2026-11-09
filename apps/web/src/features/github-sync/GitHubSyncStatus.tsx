import type { Card, ConnectorConnection, RemoteWorkItemLink, SyncConflict, WorkItemSyncHealthReport } from "@storymapper/contracts";
import { AlertTriangle } from "lucide-react";
import { panelStrings } from "@storymapper/ui-strings";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { SyncConflictReview } from "@storymapper/web/features/github-sync/SyncConflictReview";
import type { ReviewedSyncValues } from "@storymapper/web/features/github-sync/SyncConflictDiff";
import { githubSyncStateHint } from "@storymapper/web/features/github-sync/sync-status";

export type SyncHealthFilter = "all" | RemoteWorkItemLink["syncState"];

export function GitHubSyncStatus({ health, filter, connections, cards, visibleCardIds, connectorEnabled, pending, scope, onQuickReview, onResolve }: {
  health: WorkItemSyncHealthReport | undefined;
  filter: SyncHealthFilter;
  connections: ConnectorConnection[];
  cards: Card[];
  visibleCardIds: Set<string>;
  connectorEnabled: boolean;
  pending: boolean;
  scope: string;
  onQuickReview: (link: RemoteWorkItemLink, mode?: "push" | "sync") => void;
  onResolve: (conflict: SyncConflict, reviewed: ReviewedSyncValues, resolution: "local" | "remote", origin: HTMLElement) => Promise<unknown>;
}) {
  const links = (health?.links ?? []).filter((link) => filter === "all" || link.syncState === filter);
  const deleted = (health?.deletedLocalLinks ?? []).filter(() => filter === "all" || filter === "local_deleted");
  return <><section className="github-link-list">
    <h3>{panelStrings.remoteLinksTitle}</h3>
    {links.map((link) => {
      const connection = connections.find((connection) => connection.id === link.connectionId);
      const available = connectorEnabled && connection && !pending;
      return <div className="github-link-row" key={link.id}>
        <div><strong>{link.syncState !== "synced" ? <AlertTriangle size={14} /> : null}{link.provider} {panelStrings.issueNumberPrefix}{link.remoteNumber ?? link.remoteId}</strong>
          <span title={githubSyncStateHint(link.syncState)}>{link.syncState} {panelStrings.detailSeparator}{link.remoteState ?? panelStrings.unknown}{link.milestone ? panelStrings.detailSuffix(link.milestone) : ""}</span>
          <span>{link.labels.join(", ")}</span>{link.lastSyncedAt ? <span>{syncConflictStrings.lastSynced(link.lastSyncedAt)}</span> : null}</div>
        <div className="button-row compact">
          {link.cardId && (link.syncState === "stale" || link.syncState === "unsynced") ? <button type="button" className="secondary" title={panelStrings.pushCardHint} onClick={() => onQuickReview(link)} disabled={!available || connection.readOnly}>{panelStrings.push}</button> : null}
          {link.cardId && link.syncState !== "synced" && link.syncState !== "remote_deleted" && link.syncState !== "local_deleted" ? <button type="button" className="secondary" title={panelStrings.syncCardHint} onClick={() => onQuickReview(link, "sync")} disabled={!available}>{panelStrings.sync}</button> : null}
        </div><a href={link.url} target="_blank" rel="noreferrer">{panelStrings.openLink}</a>
      </div>;
    })}
    {deleted.map((link) => <div className="github-link-row" key={link.id}><div><strong>{syncConflictStrings.deletedLocal(link.entityType, link.entityId)}</strong><span>{syncConflictStrings.map(link.storyMapId)}</span><span>{panelStrings.localDeleted}</span></div><a href={link.url} target="_blank" rel="noreferrer">{panelStrings.openLink}</a></div>)}
    {links.length === 0 && deleted.length === 0 ? <p>{panelStrings.noLinksForThisFilter}</p> : null}
  </section>
    {health?.openConflicts.length ? <section className="github-link-list"><h3>{panelStrings.conflicts}</h3>{health.openConflicts.map((conflict) => {
      const connection = connections.find((row) => row.id === conflict.connectionId);
      return <SyncConflictReview key={JSON.stringify([conflict.id, scope, connection])} conflict={conflict} card={cards.find((card) => card.id === conflict.cardId)} link={health.links.find((link) => link.externalRefId === conflict.externalRefId)} readOnly={connection?.readOnly ?? true} available={Boolean(connectorEnabled && connection && conflict.cardId && visibleCardIds.has(conflict.cardId))} disabled={pending} onResolve={onResolve} />;
    })}</section> : null}</>;
}
