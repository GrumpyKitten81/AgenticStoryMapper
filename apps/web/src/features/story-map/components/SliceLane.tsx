import type { ReactElement, ReactNode } from "react";
import type { Card, SlicesReport } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function SliceLane({ lane, dependencies, cards, children }: { lane: SlicesReport["lanes"][number]; dependencies: SlicesReport["dependencies"]; cards: ReadonlyMap<string, Card>; children: ReactNode }): ReactElement {
  const storyIds = new Set(lane.storyIds);
  const order = new Map<string, string[]>();
  for (const cue of dependencies) if (cue.blockedOrder && storyIds.has(cue.cardId)) { const keys = order.get(cue.cardId) ?? []; keys.push(cue.prerequisite.key); order.set(cue.cardId, keys); }
  return <section className="slice-lane" aria-label={lane.name}>
    <header><h2>{lane.name}</h2><p>{strings.sliceCountEstimate(lane.storyCount, lane.estimateTotal)}</p>
      <div className="slice-status-bar" aria-hidden="true">{Object.entries(lane.statusCounts).map(([status, count]) => <span key={status} style={{ flexGrow: count }} />)}</div>
      <div className="slice-status-counts">{Object.entries(lane.statusCounts).map(([status, count]) => <span key={status}>{strings.sliceStatusCount(status, count)}</span>)}</div>
    </header>
    {order.size ? <div className="slice-order-summary" aria-label={strings.blockedOrderSummary}><strong>{strings.blockedOrderSummary}</strong><ul>{[...order].map(([cardId, keys]) => <li key={cardId}>{strings.blockedOrderStory(cards.get(cardId)!.key, keys)}</li>)}</ul></div> : null}
    <div className="slice-stories">{children}</div>
    <details><summary>{strings.activityProgress}</summary><ul>{lane.activities.map((activity) => <li key={activity.activityId ?? "unassigned"}>{strings.activityProgressNamed(activity.name, activity.doneCount, activity.storyCount)}</li>)}</ul></details>
  </section>;
}
