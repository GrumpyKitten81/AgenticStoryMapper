import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RemotePushExecution, RemotePushPlan } from "@storymapper/contracts";
import { invalidateRemotePushQueries } from "@storymapper/web/app/remote-push-queries";
import { api } from "@storymapper/web/app/api";
import { cardReviewStrings as strings } from "@storymapper/web/ui-strings/card-review";
import { reviewInstruction, useReviewQuery, useCardReviewContext } from "@storymapper/web/features/card-review/review-context";

export function PushReviewControls({ plan, execution, onExecuted }: { plan: RemotePushPlan; execution?: RemotePushExecution | undefined; onExecuted: (execution: RemotePushExecution) => void }) {
  const preview = useCardReviewContext()?.preview ?? false;
  const query = useReviewQuery(plan.projectId, plan.storyMapId, { planId: plan.id, summaryOnly: true });
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const mutation = useMutation({ mutationFn: () => { if (preview) throw new Error("Preview is read-only."); return execution && ["running", "interrupted"].includes(execution.status) ? api.resumeRemotePushPlan(plan.id, { confirmed: true, reason }) : api.confirmRemotePushPlan(plan.id, { confirmed: true, reason }); }, onSuccess: async (result) => { onExecuted(result.execution); await invalidateRemotePushQueries(client, plan.storyMapId); } });
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">{strings.refresh}</p>;
  const data = query.data;
  const readiness = data.pushReadiness;
  const instruction = reviewInstruction(plan.projectId, readiness?.cards.filter((card) => !card.ready).flatMap((card) => card.summary.requestId ?? []) ?? [], [], plan.id);
  const complete = execution?.status === "completed";
  return <section className="form-stack" aria-label={strings.title}>
    <h3>{strings.title}</h3><p>{plan.actor.actorType === "agent" && data.settings.reviewBeforeAgentPush ? strings.pushGate : plan.actor.actorType === "agent" ? strings.agentReviewDisabled : strings.humanPush}</p>
    {readiness?.required ? <p role="status">{readiness.ready ? strings.pushReady : strings.pushNotReady}</p> : null}
    <ul>{readiness?.cards.map(({ cardId, key, summary }) => <li key={cardId}>{strings.outgoingStatus(key, strings.states[summary.state], summary.unresolvedCount)}</li>)}</ul>
    {!readiness ? <p role="status">{strings.refresh}</p> : null}
    {plan.actor.actorType === "agent" && !complete && readiness?.required && !readiness.ready ? <><textarea readOnly aria-label={strings.copy} value={instruction} /><button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(instruction).then(() => setMessage(strings.copied), (error: unknown) => setMessage(error instanceof Error ? error.message : strings.error)); }}>{strings.copy}</button></> : null}
    {plan.actor.actorType === "agent" && data.settings.allowHumanPushOverride && !complete ? <details><summary>{strings.override}</summary><div className="form-stack"><label>{strings.overrideReason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{strings.confirmOverride}</label><button type="button" className="danger" disabled={preview || !confirmed || !reason.trim() || mutation.isPending || plan.blockers.length > 0} onClick={() => mutation.mutate()}>{strings.override}</button></div></details> : null}
    {mutation.error ? <p role="alert">{mutation.error.message}</p> : null}{message ? <p role="status">{message}</p> : null}
  </section>;
}
