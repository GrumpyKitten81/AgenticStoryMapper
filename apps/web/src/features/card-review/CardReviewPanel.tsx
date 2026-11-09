import { useEffect, useState } from "react";
import type { CardReviewReport, CardReviewsResponse } from "@storymapper/contracts";
import { cardReviewStrings as strings } from "@storymapper/web/ui-strings/card-review";
import { ReviewInstruction, useCardReviewContext, useReviewQuery } from "@storymapper/web/features/card-review/review-context";

export function CardReviewPanel({ cardId, showHeading = true }: { cardId: string; showHeading?: boolean }) {
  const context = useCardReviewContext();
  if (!context) return null;
  return <CardReviewDetails cardId={cardId} showHeading={showHeading} />;
}
function CardReviewDetails({ cardId, showHeading }: { cardId: string; showHeading: boolean }) {
  const context = useCardReviewContext()!;
  const query = useReviewQuery(context.projectId, context.storyMapId, { cardId });
  const data = query.data;
  if (!data) return <p role={query.error ? "alert" : "status"}>{query.error?.message ?? strings.refresh}</p>;
  const summary = data.summaries.find((row) => row.cardId === cardId);
  if (!summary) return null;
  const request = data.requests.find((row) => row.id === summary.requestId);
  const report = data.reports.find((row) => row.id === summary.reportId);
  return <section className="source-link-section form-stack" aria-label={strings.title}>
    {showHeading ? <h2>{strings.title}</h2> : null}{request ? <strong>{strings.details(request.input.card.key, request.input.card.title)}</strong> : null}<p role="status">{strings.reviewStatus(strings.states[summary.state], summary.unresolvedCount)}</p>
    <button type="button" className="secondary" disabled={context.preview || context.mutation.isPending} onClick={() => context.mutation.mutate({ action: "request", cardIds: [cardId] })}>{strings.request}</button>
    {context.mutation.error ? <p role="alert">{context.mutation.error.message}</p> : null}
    {report ? <ReviewFindings key={report.id} report={report} data={data} disabled={context.preview || context.mutation.isPending || summary.state !== "reviewed"} ignored={summary.ignoredFindingIds} /> : null}
    <p>{strings.manual}</p>
    {data.fixes.filter((fix) => fix.cardId === cardId).map((fix) => <p key={fix.id}>{fix.changeSetId ? <a href={`/projects/${context.projectId}/story-maps/${context.storyMapId}/discovery?preview=${fix.changeSetId}`}>{strings.proposal}</a> : strings.pendingFix}</p>)}
    {summary.state === "awaiting_verification" ? <p>{strings.verify}</p> : null}
    <ReviewInstruction data={data} cardId={cardId} />
    <ReviewExceptions cardId={cardId} data={data} />
    <details><summary>{strings.historical}</summary>{data.reports.filter((row) => row.cardId === cardId && row.id !== report?.id).map((row) => <details key={row.id}><summary>{strings.details(row.createdAt, row.status)}</summary><pre className="structured-evidence">{JSON.stringify(row.results, null, 2)}</pre></details>)}</details>
  </section>;
}
function ReviewFindings({ report, data, disabled, ignored }: { report: CardReviewReport; data: CardReviewsResponse; disabled: boolean; ignored: string[] }) {
  const context = useCardReviewContext()!;
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"occurrence" | "rule">("occurrence");
  const findings = report.results.filter((result) => result.outcome === "finding" || result.outcome === "unknown");
  const selectedFindings = selected.filter((id) => !ignored.includes(id) && findings.some((finding) => finding.id === id));
  const corrections = selectedFindings.filter((id) => findings.some((finding) => finding.id === id && finding.outcome === "finding"));
  useEffect(() => { setSelected((current) => current.filter((id) => !ignored.includes(id))); }, [ignored.join(",")]);
  return <div className="form-stack">
    {report.status === "error" ? <p role="alert">{report.error}</p> : null}
    <p>{strings.versions(report.createdAt, report.criteriaVersion, report.skillVersion)}</p>
    {!findings.length && report.status === "success" ? <p>{strings.noFindings}</p> : null}
    {findings.map((finding) => <article className="form-stack" key={finding.id}><label className="checkbox-row"><input type="checkbox" checked={selectedFindings.includes(finding.id)} disabled={disabled || ignored.includes(finding.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, finding.id] : current.filter((id) => id !== finding.id))} />{strings.details(finding.ruleId, strings.outcomes[finding.outcome], strings[finding.severity], ignored.includes(finding.id) ? strings.ignore : undefined)}</label><ul>{finding.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul><p>{finding.advice}</p>{finding.suggestion ? <pre className="structured-evidence">{JSON.stringify(finding.suggestion, null, 2)}</pre> : null}</article>)}
    <button type="button" disabled={disabled || !corrections.length} onClick={() => context.mutation.mutate({ action: "fix", reportId: report.id, findingIds: corrections })}>{strings.fix}</button>
    <label>{strings.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label>{strings.ignore}<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="occurrence">{strings.occurrence}</option><option value="rule">{strings.forever}</option></select></label>
    <button type="button" className="secondary" disabled={disabled || selectedFindings.length !== 1 || !reason.trim()} onClick={() => context.mutation.mutate({ action: "ignore", reportId: report.id, findingId: selectedFindings[0]!, scope, reason })}>{strings.ignore}</button>
    <details><summary>{strings.rules}</summary><ul>{report.results.map((result) => <li key={result.id}>{strings.details(result.ruleId, strings.outcomes[result.outcome], strings[result.severity])}</li>)}</ul></details>
    <details><summary>{strings.provenance}</summary><pre className="structured-evidence">{JSON.stringify({ reportId: report.id, requestId: report.requestId, inputFingerprint: report.inputFingerprint, agent: report.actor, origin: data.requests.find((request) => request.id === report.requestId)?.initiatedBy, changeSetId: data.requests.find((request) => request.id === report.requestId)?.changeSetId, criteriaVersion: report.criteriaVersion, skillVersion: report.skillVersion }, null, 2)}</pre></details>
  </div>;
}
function ReviewExceptions({ cardId, data }: { cardId: string; data: CardReviewsResponse }) {
  const context = useCardReviewContext()!;
  const [reason, setReason] = useState("");
  const revoked = new Set(data.decisions.flatMap((decision) => decision.revokedDecisionId ?? []));
  const decisions = data.decisions.filter((decision) => decision.cardId === cardId && !decision.revokedDecisionId && !revoked.has(decision.id));
  if (!decisions.length) return null;
  return <details><summary>{strings.exceptions}</summary><label>{strings.reason}<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>{decisions.map((decision) => <div className="form-stack" key={decision.id}><p>{strings.details(decision.ruleId, decision.scope, decision.reason)}</p><button type="button" className="secondary" disabled={context.preview || context.mutation.isPending || !reason.trim()} onClick={() => context.mutation.mutate({ action: "revoke", decisionId: decision.id, reason })}>{strings.revoke}</button></div>)}</details>;
}
