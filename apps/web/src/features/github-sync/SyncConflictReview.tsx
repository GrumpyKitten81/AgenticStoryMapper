import { useRef, useState } from "react";
import { syncConflictSchema, type SyncConflict, type Card, type RemoteWorkItemLink } from "@storymapper/contracts";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { SyncConflictDiff, SyncConflictDrift, type ReviewedSyncValues } from "@storymapper/web/features/github-sync/SyncConflictDiff";
import { panelStrings } from "@storymapper/ui-strings";
import { syncConflictStrings as strings } from "@storymapper/web/ui-strings/sync-conflicts";

export function SyncConflictReview({ conflict, card, link, readOnly, disabled, available, onResolve }: {
  conflict: SyncConflict;
  card: Card | undefined;
  link: RemoteWorkItemLink | undefined;
  readOnly: boolean;
  disabled: boolean;
  available: boolean;
  onResolve: (conflict: SyncConflict, reviewed: ReviewedSyncValues, resolution: "local" | "remote", origin: HTMLElement) => Promise<unknown>;
}) {
  const [reviewed, setReviewed] = useState<ReviewedSyncValues>({ localValue: conflict.localValue, remoteValue: conflict.remoteValue });
  const [drift, setDrift] = useState<ReviewedSyncValues>();
  const [error, setError] = useState("");
  const choice = useRef<HTMLButtonElement>(null);
  function choose(resolution: "local" | "remote", origin: HTMLElement) {
    if (disabled || drift || !available || resolution === "local" && readOnly) return;
    setError("");
    void onResolve(conflict, reviewed, resolution, origin).catch((error: unknown) => {
      const entry = isConflictError(error) ? error.conflicts.find((entry) => entry.reason === "fingerprint" && entry.operationId === conflict.id) : undefined;
      const current = syncConflictSchema.safeParse(entry?.current);
      if (current.success) setDrift({ localValue: current.data.localValue, remoteValue: current.data.remoteValue });
      else if (error instanceof Error) setError(error.message);
      else throw error;
    });
  }
  return <section className="github-link-row" aria-label={card ? strings.reviewCard(card.key, card.title) : strings.title}>
    <div><strong>{card ? `${card.key} ${card.title}` : conflict.cardId}</strong>{link ? <a aria-label={strings.openIssueForCard(card?.key ?? conflict.cardId ?? conflict.id, link.remoteNumber)} href={link.url} target="_blank" rel="noreferrer">{panelStrings.openLink}</a> : null}{JSON.stringify(reviewed) !== JSON.stringify({ localValue: conflict.localValue, remoteValue: conflict.remoteValue }) ? <><p>{strings.original}</p><SyncConflictDiff {...conflict} /><p>{strings.current}</p></> : null}<SyncConflictDiff field={conflict.field} {...reviewed} />
      {drift ? <><SyncConflictDiff field={conflict.field} {...drift} /><SyncConflictDrift onReview={() => { setReviewed(drift); setDrift(undefined); queueMicrotask(() => choice.current?.focus()); }} /></> : null}
      {!available ? <p>{strings.unavailable}</p> : readOnly ? <p>{strings.readOnly}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
    <button ref={readOnly ? undefined : choice} type="button" className="secondary" disabled={disabled || !available || readOnly || Boolean(drift)} onClick={(event) => choose("local", event.currentTarget)}>{panelStrings.keepLocal}</button>
    <button ref={readOnly ? choice : undefined} type="button" className="secondary" disabled={disabled || !available || Boolean(drift)} onClick={(event) => choose("remote", event.currentTarget)}>{panelStrings.keepRemote}</button>
  </section>;
}
