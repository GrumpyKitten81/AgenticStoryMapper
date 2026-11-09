import { useLayoutEffect, useRef } from "react";
import { changeSetStrings as strings } from "@storymapper/ui-strings";
import type { ChangeSetReviewState } from "@storymapper/web/features/changesets/useChangeSetReview";

export function ChangeSetReview({ state }: { state: ChangeSetReviewState }) {
  const { preview, selected, fresh, decide } = state;
  const heading = useRef<HTMLHeadingElement>(null);
  const actionFocus = useRef(false);
  const reviewFocus = useRef(false);
  const retry = useRef<HTMLButtonElement>(null);
  const data = preview.data;
  useLayoutEffect(() => {
    if (data?.closed && actionFocus.current) { heading.current?.focus(); actionFocus.current = false; }
  }, [data?.closed]);
  useLayoutEffect(() => {
    if (preview.error && reviewFocus.current) retry.current?.focus();
  }, [preview.error]);
  return <section className="changeset-review form-stack" aria-label={strings.review} aria-busy={preview.isFetching} onFocusCapture={() => { reviewFocus.current = true; }} onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) reviewFocus.current = false; }}>
    <button key="refresh" ref={retry} type="button" className="secondary" onClick={state.refresh} aria-disabled={preview.isFetching || state.writePending}>{strings.refresh}</button>
    {preview.error ? <p role="alert">{preview.error.message}</p> : !data ? <p role="status">{strings.loading}</p> : <>
      <h3 ref={heading} tabIndex={-1}>{data.changeSet.title}</h3>
      <p role="status"><span className="preview-marker">{strings.statuses[data.presentationStatus]}</span></p>
      <p>{strings.proposer}{strings.separator}{data.changeSet.proposedBy?.actorType} {data.changeSet.proposedBy?.actorId}</p>
      {data.changeSet.approval ? <p>{strings.approver}{strings.separator}{data.changeSet.approval.actor.actorType} {data.changeSet.approval.actor.actorId}</p> : null}
      <p>{strings.policy}</p>
      {data.explanation ? <p role="status">{data.explanation}</p> : null}
      {!fresh ? <p role="alert">{strings.refreshRequired}</p> : null}
      {state.personasBlocked ? <p role="status">{strings.personasDisabled}</p> : null}
      {data.conflicts.map((conflict, index) => <pre role="alert" key={index}>{JSON.stringify(conflict, null, 2)}</pre>)}
      <div className="changeset-operation-list">{data.operations.map((operation) => <article key={operation.operationId} className="changeset-operation">
        <label className="checkbox-row"><input type="checkbox" aria-label={strings.select(operation.index + 1, operation.label)} checked={selected.includes(operation.operationId)} aria-disabled={!state.selectionAvailable} onChange={(event) => state.select(operation.operationId, event.target.checked)} /> {strings.operationLabel(operation.index + 1, operation.label)}</label>
        <p><span aria-hidden="true">{strings.operationGlyphs[operation.status]}</span> {operation.kind}{strings.separator}{operation.status}{operation.cause ? strings.cause(operation.cause) : ""}</p>
        {operation.dependencies.length ? <p>{strings.dependencies}{strings.separator}{operation.dependencies.join(", ")}</p> : null}
        <details><summary>{strings.submitted}</summary><pre>{JSON.stringify(operation.operation, null, 2)}</pre></details>
        {!operation.changes.length ? <div className="changeset-before-after"><div><h4>{strings.before}</h4><p>{strings.effects[operation.status]}</p></div><div><h4>{strings.after}</h4><p>{strings.effects[operation.status]}</p></div></div> : null}
        {operation.changes.map((change, index) => <div key={index}>
          <strong>{change.entity} {change.entityId}</strong>
          {change.entity === "sourcePlanBaseline" && change.evidenceScope === "addressedEntries" ? <p>{strings.sourcePlanEntries}</p> : null}
          {change.implicit ? <p>{strings.unarchive}</p> : null}
          <div className="changeset-before-after"><div><h4>{strings.before}</h4><pre>{JSON.stringify(change.before ?? null, null, 2)}</pre></div><div><h4>{strings.after}</h4><pre>{JSON.stringify(change.after ?? null, null, 2)}</pre></div></div>
        </div>)}
      </article>)}</div>
      {!data.closed ? <div className="changeset-actions button-row" onFocusCapture={() => { actionFocus.current = true; }} onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) actionFocus.current = false; }}>
        <button type="button" aria-disabled={!state.canApprove || decide.isPending || selected.length === 0} onClick={() => state.decideAction("approve")}>{strings.approve}</button>
        <button type="button" aria-disabled={!state.canApply || decide.isPending || selected.length === 0} onClick={() => state.decideAction("apply")}>{strings.apply}</button>
        <button type="button" className="secondary" aria-disabled={!fresh || state.writePending || data.presentationStatus === "stale"} onClick={() => state.decideAction("reject")}>{strings.reject}</button>
      </div> : null}
    </>}
    {state.message ? <p role="alert">{state.message}</p> : null}
  </section>;
}
