import { useEffect, useRef, useState } from "react";
import type { CreateCardRequest, StoryMapSnapshot } from "@storymapper/contracts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { GitHubConnectDialog } from "@storymapper/web/features/github-sync";
import { IncomingGitHubReview } from "@storymapper/web/features/github-sync";
import { useTicketCardComposer } from "@storymapper/web/features/story-map/components/useTicketCardComposer";
import { ticketComposerStrings as strings } from "@storymapper/web/ui-strings/ticket-composer";

interface TicketCardComposerProps {
  disabled: boolean;
  snapshot: StoryMapSnapshot;
  request: CreateCardRequest;
  onPopulate: (title: string, description: string) => void;
  onPendingChange: (pending: boolean) => void;
  onCreated: () => void;
  admitWrite: () => boolean;
  onSelectCard: (cardId: string) => void;
}

export function TicketCardComposer({ snapshot, request, onPopulate, onPendingChange, onCreated, onSelectCard, admitWrite, disabled }: TicketCardComposerProps) {
  const flow = useTicketCardComposer({ snapshot, request, onCreated, admitWrite, onPendingChange, disabled });
  const selectorInput = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);
  useEffect(() => { onPendingChange(flow.pending); return () => onPendingChange(false); }, [flow.pending, onPendingChange]);
  useEffect(() => { if (!flow.lookup) setReplace(false); }, [flow.lookup]);
  function populate() {
    if (!flow.lookup || !flow.isLookupCurrent() || flow.blocked || flow.pending) return;
    onPopulate(flow.lookup.ticket.title, flow.lookup.ticket.description); flow.confirmText(); setReplace(false);
  }
  return <section className="form-stack" aria-label={strings.title} aria-busy={flow.lookingUp || flow.pending}>
    <h3>{strings.title}</h3>
    <label>{strings.connection}<select value={flow.selectedId} disabled={flow.pending} onChange={(event) => flow.setConnectionId(event.target.value)}>
      <option value="">{strings.chooseConnection}</option>
      {flow.available.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}</option>)}
    </select></label>
    <button type="button" disabled={flow.pending} onClick={() => { flow.invalidate(); flow.setConnectOpen(true); }}>{strings.connect}</button>
    {!flow.enabled ? <p>{strings.off}</p> : null}
    {flow.connections.error || flow.safety.error ? <p role="alert">{flow.connections.error?.message ?? flow.safety.error?.message}</p> : null}
    <label>{strings.selector}<input ref={selectorInput} disabled={flow.pending} value={flow.selector} onChange={(event) => flow.setSelector(event.target.value)} /></label>
    <p>{strings.selectorHint}</p>
    <button type="button" disabled={!flow.enabled || !flow.connection || !flow.selector.trim() || flow.pending || flow.lookingUp || flow.blocked} onClick={() => void flow.findTicket()}>{flow.lookingUp ? strings.lookingUp : strings.lookup}</button>
    {flow.lookingUp ? <button type="button" className="secondary" onClick={() => { flow.cancelLookup(); selectorInput.current?.focus(); }}>{strings.cancelLookup}</button> : null}
    {flow.message ? <p role="status">{flow.message}</p> : null}
    {flow.stale ? <p role="alert">{strings.stale}</p> : null}
    {flow.lookup ? <div className="form-stack">
      <a href={flow.lookup.ticket.locator} target="_blank" rel="noreferrer">{strings.issueNumber(flow.lookup.ticket.number)}</a>
      <h4>{flow.lookup.ticket.title}</h4><p style={{ whiteSpace: "pre-wrap" }}>{flow.lookup.ticket.description}</p>
      {flow.lookup.existingCardId ? <><button type="button" disabled={flow.pending || flow.blocked} onClick={() => { if (flow.isLookupCurrent() && flow.lookup?.existingCardId) onSelectCard(flow.lookup.existingCardId); }}>{strings.openExisting}</button></> : <>
        <p>{strings.reviewText}</p>
        <button type="button" className="secondary" disabled={flow.pending || flow.blocked} onClick={() => { if (!flow.isLookupCurrent()) return; if (request.title || request.description) setReplace(true); else populate(); }}>{strings.populate}</button>
        <button type="button" className="secondary" disabled={flow.pending || flow.blocked} onClick={flow.confirmText}>{strings.keepDraft}</button>
        <button type="button" disabled={flow.pending || flow.blocked || !flow.textReviewed || !request.title.trim() || Boolean(flow.review)} onClick={flow.createLinked}>{flow.pending ? strings.creating : strings.create}</button>
      </>}
    </div> : null}
    {flow.review ? <IncomingGitHubReview command={flow.review.command} mutationKey={flow.mutationKey} isCurrent={flow.isReviewCurrent} onPendingChange={flow.setReviewPending} onApplied={flow.onApplied} /> : null}
    {replace && flow.lookup ? <Dialog title={strings.replaceTitle} description={strings.replaceDescription} onClose={() => setReplace(false)}>
      <div className="button-row"><button type="button" disabled={flow.pending || flow.blocked} onClick={populate}>{strings.replace}</button>
      <button type="button" className="secondary" onClick={() => setReplace(false)}>{strings.cancel}</button></div>
    </Dialog> : null}
    <GitHubConnectDialog open={flow.connectOpen} projectId={flow.projectId} connection={flow.connection} onClose={() => flow.setConnectOpen(false)} onConnected={(connection) => { flow.setConnectionId(connection.id); flow.setConnectOpen(false); }} />
  </section>;
}
