import type { SyncItemResult } from "@storymapper/contracts";
import { incomingGitHubStrings as strings } from "@storymapper/web/ui-strings/incoming-github";

export function IncomingGitHubResults({ items }: { items: SyncItemResult[] }) {
  return <section aria-label={strings.prepared}>
    <h4>{strings.prepared}</h4>
    <ul>{items.map((item, index) => <li key={index}>
      <strong>{strings.states[item.status]}</strong>{" "}{item.remoteId ?? item.cardId}
      {"message" in item && item.message ? <p role={item.status === "failed" ? "alert" : undefined}>{item.message}</p> : null}
      {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{strings.open}</a> : null}
    </li>)}</ul>
  </section>;
}
