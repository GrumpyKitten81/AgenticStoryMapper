import { ListChecks, Clock3, LoaderCircle, History, CircleX, RotateCcw, CircleAlert, AlertTriangle } from "lucide-react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { CardReviewPanel } from "@storymapper/web/features/card-review/CardReviewPanel";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CardReviewCommand, type CardReviewQuery, type CardReviewsResponse } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { cardReviewStrings as strings } from "@storymapper/web/ui-strings/card-review";

export function useReviewQuery(projectId: string, storyMapId: string, options: Omit<CardReviewQuery, "storyMapId"> = { summaryOnly: true }) {
  return useQuery({ queryKey: ["card-reviews", projectId, storyMapId, options], queryFn: ({ signal }) => api.getCardReviews(projectId, storyMapId, signal, options) });
}
function useReviewState(projectId: string, storyMapId: string, preview: boolean) {
  const [activeCardId, setActiveCardId] = useState("");
  const client = useQueryClient();
  const query = useReviewQuery(projectId, storyMapId);
  const summariesByCardId = useMemo(() => new Map(query.data?.summaries.map((summary) => [summary.cardId, summary])), [query.data]);
  const mutation = useMutation({ mutationFn: (command: CardReviewCommand) => {
    if (preview) throw new Error("Preview is read-only.");
    return api.commandCardReview(projectId, command);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["card-reviews", projectId] }); } });
  return { projectId, storyMapId, preview, query, mutation, summariesByCardId, activeCardId, setActiveCardId };
}
const ReviewContext = createContext<ReturnType<typeof useReviewState> | null>(null);
export function CardReviewProvider({ projectId, storyMapId, preview = false, children }: { projectId: string; storyMapId: string; preview?: boolean; children: ReactNode }) {
  const value = useReviewState(projectId, storyMapId, preview);
  return <ReviewContext.Provider value={value}>{children}{value.activeCardId ? <Dialog title={strings.title} onClose={() => value.setActiveCardId("")}><CardReviewPanel key={value.activeCardId} cardId={value.activeCardId} showHeading={false} /></Dialog> : null}</ReviewContext.Provider>;
}
export function useCardReviewContext() { return useContext(ReviewContext); }

export function CardReviewBadge({ cardId }: { cardId: string }) {
  const context = useCardReviewContext();
  const summary = context?.summariesByCardId.get(cardId);
  if (!summary || summary.state === "missing") return null;
  const label = `${strings.title}: ${strings.states[summary.state]}, ${summary.unresolvedCount} ${strings.findings.toLowerCase()}${summary.highestSeverity ? `, ${strings[summary.highestSeverity]}` : ""}`;
  const icons = { pending: Clock3, running: LoaderCircle, error: CircleX, stale: History, awaiting_verification: RotateCcw };
  const Icon = summary.state === "reviewed" ? summary.highestSeverity === "blocker" ? CircleAlert : summary.highestSeverity === "warning" ? AlertTriangle : ListChecks : icons[summary.state];
  return <button type="button" className="secondary button-compact" aria-label={label} title={label} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); context?.setActiveCardId(cardId); }}><Icon size={14} aria-hidden="true" />{summary.unresolvedCount}</button>;
}
export function reviewInstruction(projectId: string, requestIds: string[], fixIds: string[] = [], planId?: string): string {
  return `Run the installed card-dor-review skill (version 1) with Agentic Story Mapper MCP. Project ${projectId}. Review request IDs: ${requestIds.join(", ") || "read GetCardReviews for pending requests"}.${planId ? ` Immutable Dry Run: ${planId}.` : ""}${fixIds.length ? ` Correction request IDs: ${fixIds.join(", ")}. Propose only the selected corrections with CardReview/proposeFix; leave human approval and Apply separate.` : ""} Read captured evidence only; submit complete versioned results using CardReview/submit. Do not launch another model or publish remotely.`;
}
export function ReviewInstruction({ data, cardId, planId }: { data: CardReviewsResponse; cardId?: string; planId?: string }) {
  const context = useCardReviewContext();
  const [message, setMessage] = useState("");
  const pendingRequestIds = [...new Set([...data.summaries.filter((summary) => (!cardId || summary.cardId === cardId) && ["pending", "running"].includes(summary.state)).flatMap((summary) => summary.requestId ?? []), ...data.requests.filter((request) => (!cardId || request.cardId === cardId) && (!planId || request.planId === planId) && !data.reports.some((report) => report.requestId === request.id)).map((request) => request.id)])];
  const instruction = reviewInstruction(context?.projectId ?? data.requests[0]?.projectId ?? "", pendingRequestIds, data.fixes.filter((fix) => (!cardId || fix.cardId === cardId) && !fix.changeSetId).map((fix) => fix.id), planId);
  const pending = pendingRequestIds.length > 0 || data.requests.some((request) => (!cardId || request.cardId === cardId) && (!planId || request.planId === planId) && !data.reports.some((report) => report.requestId === request.id)) || data.fixes.some((fix) => (!cardId || fix.cardId === cardId) && !fix.changeSetId);
  if (!pending) return null;
  return <div className="form-stack"><p>{strings.waiting}</p><textarea aria-label={strings.copy} readOnly value={instruction} /><button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(instruction).then(() => setMessage(strings.copied), (error: unknown) => setMessage(error instanceof Error ? error.message : strings.error)); }}>{strings.copy}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
