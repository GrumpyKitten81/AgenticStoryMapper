import { useEffect, useId, useRef } from "react";
import { syncConflictSchema, type SyncConflict } from "@storymapper/contracts";
import { syncConflictStrings as strings } from "@storymapper/web/ui-strings/sync-conflicts";

export type ReviewedSyncValues = Pick<SyncConflict, "localValue" | "remoteValue">;

export function SyncConflictNotice({ current }: { current: unknown }) {
  const parsed = syncConflictSchema.safeParse(current);
  return parsed.success ? <><p>{strings.lock(strings.fields[parsed.data.field])}</p><SyncConflictDiff {...parsed.data} /></> : <p>{strings.title}</p>;
}

export function SyncConflictDiff({ field, localValue, remoteValue }: ReviewedSyncValues & { field: SyncConflict["field"] }) {
  const id = useId();
  return <section aria-labelledby={id}>
    <h4 id={id}>{strings.fields[field]}</h4>
    <dl><dt>{strings.local}</dt><dd><pre>{displayValue(localValue)}</pre></dd><dt>{strings.remote}</dt><dd><pre>{displayValue(remoteValue)}</pre></dd></dl>
  </section>;
}

export function SyncConflictDrift({ onReview }: { onReview: () => void }) {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => alert.current?.focus(), []);
  return <div ref={alert} role="alert" tabIndex={-1}><p>{strings.drift}</p><button type="button" onClick={onReview}>{strings.reviewCurrent}</button></div>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return strings.empty;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
