import { activityHistoryCopy as copy } from "@storymapper/web/ui-strings/activity-history";
import { changeSetStrings } from "@storymapper/ui-strings";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";

export function ChangeSetHistoryReview({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return <article className="changeset-history-entry"><div className="activity-event-heading"><strong>{title}</strong><button type="button" className="secondary" aria-label={copy.reviewLabel(title, open)} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? copy.hideDetails : copy.showDetails}</button></div>{open ? <HistoryReview id={id} /> : null}</article>;
}

function HistoryReview({ id }: { id: string }) {
  const state = useChangeSetReview(id);
  const preview = state.preview.data;
  return <>
    {preview && !preview.closed ? preview.boards.map(({ snapshot }) => <Link key={snapshot.storyMap.id} className="button-link secondary" to="/projects/$projectId/story-maps/$storyMapId/tree" params={{ projectId: snapshot.storyMap.projectId, storyMapId: snapshot.storyMap.id }} search={{ preview: id }}>{changeSetStrings.board(snapshot.storyMap.name)}</Link>) : null}
    <ChangeSetReview state={state} />
  </>;
}
