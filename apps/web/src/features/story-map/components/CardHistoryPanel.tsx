import { useEffect, useRef, useState } from "react";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { useCardHistory } from "@storymapper/web/app/api";
import { CardHistoryEntryView } from "@storymapper/web/features/story-map/components/CardHistoryEntryView";

export function CardHistoryPanel({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const history = useCardHistory(cardId, open);
  const versions = history.data?.pages.flatMap((page) => page.versions) ?? [];
  useEffect(() => {
    if (history.isFetching) return;
    const action = actionButton.current;
    if (action && !action.isConnected && document.activeElement === document.body) historyButton.current?.focus();
    actionButton.current = null;
  }, [history.isFetching, history.isError, history.hasNextPage]);
  const rememberFocus = (button: HTMLButtonElement) => { actionButton.current = document.activeElement === button ? button : null; };
  return (
    <section className="source-link-section card-history">
      <h2><button ref={historyButton} type="button" className="secondary" aria-expanded={open} aria-controls={`card-history-${cardId}`} onClick={() => setOpen(!open)}>{strings.history}</button></h2>
      <p role="status">{open && history.isFetching ? strings.loadingHistory : ""}</p>
      {open ? <div id={`card-history-${cardId}`} aria-busy={history.isFetching}>
        {history.isError ? <div role="alert"><p>{strings.historyError(history.error.message)}</p><button type="button" className="secondary" disabled={history.isFetching} onClick={(event) => { rememberFocus(event.currentTarget); if (history.isFetchNextPageError) void history.fetchNextPage(); else void history.refetch(); }}>{strings.retryHistory}</button></div> : null}
        {!history.isPending && !history.isError && versions.length === 0 ? <p>{strings.noHistoryYet}</p> : null}
        <ol className="card-history-list">{versions.map((entry) => <CardHistoryEntryView key={entry.id} entry={entry} />)}</ol>
        {history.hasNextPage && !history.isFetchNextPageError ? <button type="button" className="secondary" disabled={history.isFetching} onClick={(event) => { rememberFocus(event.currentTarget); void history.fetchNextPage(); }}>{strings.loadMoreHistory}</button> : null}
      </div> : null}
    </section>
  );
}
