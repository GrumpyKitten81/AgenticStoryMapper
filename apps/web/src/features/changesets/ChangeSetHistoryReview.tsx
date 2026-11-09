import { activityHistoryCopy as copy } from "@storymapper/web/ui-strings/activity-history";
import { useState } from "react";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";

export function ChangeSetHistoryReview({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return <article className="changeset-history-entry"><div className="activity-event-heading"><strong>{title}</strong><button type="button" className="secondary" aria-label={copy.reviewLabel(title, open)} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? copy.hideDetails : copy.showDetails}</button></div>{open ? <HistoryReview id={id} /> : null}</article>;
}
function HistoryReview({ id }: { id: string }) { return <ChangeSetReview state={useChangeSetReview(id)} />; }
