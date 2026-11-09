import { PushReviewControls } from "@storymapper/web/features/card-review";
import { useEffect, useRef, useState } from "react";
import type { RemotePushExecution, RemotePushPlan } from "@storymapper/contracts";
import { remotePushStrings as strings } from "@storymapper/web/ui-strings/remote-push";

export function RemotePushReview({ plan, execution: suppliedExecution, pending = false, focusResult = false, onConfirm, onResume, onCancel }: { plan: RemotePushPlan; execution?: RemotePushExecution | undefined; pending?: boolean | undefined; focusResult?: boolean | undefined; onConfirm?: (() => void) | undefined; onResume?: (() => void) | undefined; onCancel?: (() => HTMLElement | undefined) | undefined }) {
  const [overridden, setOverridden] = useState<RemotePushExecution | undefined>();
  const execution = overridden?.planId === plan.id ? overridden : suppliedExecution;
  const heading = useRef<HTMLHeadingElement>(null);
  const review = useRef<HTMLElement>(null);
  useEffect(() => { if (focusResult || !execution) heading.current?.focus(); }, [focusResult, plan.id, execution?.status]);
  return <section ref={review} className="github-dry-run-list" aria-label={strings.title} data-live-suspended-draft={!execution || execution.status !== "completed" ? "" : undefined}>
    <h3 ref={heading} tabIndex={-1}>{strings.title}</h3>
    <p>{strings.reviewRequired} <code>{plan.id}</code></p>
    <PushReviewControls plan={plan} execution={execution} onExecuted={setOverridden} />
    {plan.blockers.length ? <div role="alert"><strong>{strings.blockers}</strong><ul>{plan.blockers.map((message) => <li key={message}>{message}</li>)}</ul></div> : null}
    {plan.items.map((item) => {
      const result = execution?.items.find((row) => row.itemId === item.id);
      return <article className="github-dry-run" key={item.id}>
        <strong>{strings.effectTitle(item.action, item.kind, item.payload.title)}</strong>
        <code>{item.id}</code>
        {item.kind === "issue" ? <>
          <span>{strings.detail(strings.issueType, item.payload.issueType)}</span>
          <span>{strings.remoteStates[item.payload.remoteState]}</span>
          <span>{strings.listDetail(strings.addLabels, item.labelAdditions)}</span>
          <span>{strings.listDetail(strings.removeLabels, item.labelRemovals)}</span>
        </> : null}
        <pre>{JSON.stringify(item.payload, null, 2)}</pre>
        {item.dependencies.length ? <span>{strings.listDetail(strings.dependencies, item.dependencies)}</span> : null}
        {result ? <div aria-label={strings.result}><strong>{strings.executionStates[result.state]}</strong>{result.error ? <p role="alert">{result.error}</p> : null}{result.url ? <a href={result.url} target="_blank" rel="noreferrer">{strings.open}</a> : null}</div> : null}
      </article>;
    })}
    {plan.exclusions.length ? <div><strong>{strings.exclusions}</strong><ul>{plan.exclusions.map((item) => <li key={item.entityId}>{strings.detail(item.entityId, item.reason)}</li>)}</ul></div> : null}
    {onConfirm && (!execution || execution.status === "reviewed") ? <button type="button" aria-disabled={pending || plan.blockers.length > 0} onClick={() => { if (!pending && !plan.blockers.length) onConfirm(); }}>{strings.confirm}</button> : null}
    {onCancel && !execution ? <button type="button" className="secondary" disabled={pending} onClick={() => {
      const ownsFocus = review.current?.contains(document.activeElement);
      const origin = onCancel();
      if (ownsFocus && origin?.isConnected && !origin.matches(":disabled")) origin.focus();
    }}>{strings.cancel}</button> : null}
    {onResume && execution && ["running", "interrupted"].includes(execution.status) ? <button type="button" aria-disabled={pending} onClick={() => { if (!pending) onResume(); }}>{strings.resume}</button> : null}
  </section>;
}
