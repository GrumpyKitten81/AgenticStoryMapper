import { useState, type ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PlanState, PlanStateComparison as Comparison } from "@storymapper/contracts";
import { buildSlicesReport } from "@storymapper/core";
import { storyMapStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { capturePlanState, usePlanStateComparison, usePlanStates } from "@storymapper/web/app/plan-state-api";
import { SliceLane } from "@storymapper/web/features/story-map/components/SliceLane";
import { SliceDependencyCues, sliceCuesByCard } from "@storymapper/web/features/story-map/components/SliceDependencyCues";

export function PlanStateComparison({ storyMapId, readOnly }: { storyMapId: string; readOnly: boolean }): ReactElement {
  const client = useQueryClient();
  const states = usePlanStates(storyMapId);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const comparison = usePlanStateComparison(storyMapId, beforeId, afterId);
  const capture = useMutation({ mutationFn: () => capturePlanState(storyMapId), onSuccess: async (state) => { await client.invalidateQueries({ queryKey: ["plan-states", storyMapId] }); await client.invalidateQueries({ queryKey: ["activity"] }); setAfterId(state.id); } });
  const busy = states.isFetching || comparison.isFetching || capture.isPending;
  return <section className="plan-state-comparison form-stack" aria-busy={busy}>
    {busy ? <p role="status">{panelStrings.loading}</p> : null}
    <button type="button" disabled={readOnly || capture.isPending} onClick={() => capture.mutate()}>{strings.recordPlanState}</button>
    {states.data?.length === 0 ? <p>{strings.noPlanStates}</p> : null}
    <div className="plan-state-selectors">{([{ label: strings.beforePlanState, value: beforeId, change: setBeforeId }, { label: strings.afterPlanState, value: afterId, change: setAfterId }]).map((side) => <label key={side.label}>{side.label}<select value={side.value} onChange={(event) => side.change(event.target.value)}><option value="">{strings.choosePlanState}</option>{states.data?.map((state) => <option key={state.id} value={state.id}>{strings.recordedStateOption(state.capturedAt, state.id)}</option>)}</select></label>)}</div>
    {[states.error, capture.error, comparison.error].map((error, index) => error ? <p key={index} role="alert">{strings.planStateFailed(error.message)}</p> : null)}
    {comparison.data && !comparison.error ? <>
      {comparison.data.changes.length === 0 ? <p role="status">{strings.noMembershipChanges}</p> : null}
      <div className="plan-state-columns"><CapturedPlan state={comparison.data.before} label={strings.before} comparison={comparison.data} /><CapturedPlan state={comparison.data.after} label={strings.after} comparison={comparison.data} /></div>
    </> : null}
  </section>;
}

function releaseName(state: PlanState, releaseId: string | null): string {
  return releaseId === null ? strings.unscheduled : state.payload.releases.find((release) => release.id === releaseId)!.name;
}

function CapturedPlan({ state, label, comparison }: { state: PlanState; label: string; comparison: Comparison }): ReactElement {
  const report = buildSlicesReport(state.payload);
  const cues = sliceCuesByCard(report.dependencies);
  const cards = new Map(state.payload.cards.map((card) => [card.id, card]));
  const changes = new Map(comparison.changes.map((change) => [change.cardId, change]));
  return <section aria-label={label}><h2>{label}</h2><p>{state.id}<br /><time dateTime={state.capturedAt}>{state.capturedAt}</time></p>{report.lanes.map((lane) => <SliceLane key={lane.releaseId ?? "unscheduled"} lane={lane} dependencies={report.dependencies} cards={cards}>{lane.storyIds.map((id) => {
    const card = cards.get(id)!;
    const selectedChange = changes.get(id);
    const change = selectedChange?.kind === "moved" && label === strings.before ? undefined : selectedChange;
    return <article key={id} className="captured-story"><strong>{strings.sliceStoryTitle(card.key, card.title)}</strong><p>{strings.sliceStoryStatus(card.status, card.estimate)}</p><p>{card.description}</p><SliceDependencyCues cues={cues.get(id) ?? []} />{change ? <p className={`plan-change-${change.kind}`}>{change.kind === "added" ? strings.addedStory : change.kind === "removed" ? strings.removedStory : strings.movedBetweenSlices(releaseName(comparison.before, change.beforeReleaseId), releaseName(comparison.after, change.afterReleaseId))}</p> : null}</article>;
  })}</SliceLane>)}</section>;
}
