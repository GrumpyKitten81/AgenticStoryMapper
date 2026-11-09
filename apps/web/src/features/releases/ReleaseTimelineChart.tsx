import { CalendarDays } from "lucide-react";
import { panelStrings } from "@storymapper/ui-strings";
import { useReleaseTimeline } from "../../app/api";
import { ReleaseDateFields } from "./ReleaseDateFields";

interface ReleaseTimelineChartProps {
  storyMapId?: string;
}

export function ReleaseTimelineChart({ storyMapId }: ReleaseTimelineChartProps) {
  const releaseTimeline = useReleaseTimeline(storyMapId);

  return (
    <section className="release-timeline" data-story-map-export-target="timeline">
      <div className="release-timeline-heading">
        <CalendarDays size={15} />
        <strong>{panelStrings.timeline}</strong>
        <span>{panelStrings.timelineDates(releaseTimeline.data?.startDate ?? panelStrings.noDates, releaseTimeline.data?.endDate)}</span>
      </div>
      {(releaseTimeline.data?.items ?? []).map((item) => (
        <article className="release-timeline-row" key={item.release.id}>
          <div className="release-timeline-meta">
            <strong>{item.release.name}</strong>
            <span>{panelStrings.releaseProgress(item.doneStories, item.totalStories, item.progressRatio)}</span>
          </div>
          <div className="release-timeline-bar-track">
            <div
              className="release-timeline-bar"
              style={{
                marginLeft: `${Math.min(item.startOffsetDays * 8, 72)}px`,
                width: `${Math.max(36, item.durationDays * 12)}px`
              }}
            />
          </div>
          <ReleaseDateFields release={item.release} storyMapId={storyMapId} />
        </article>
      ))}
      {(releaseTimeline.data?.items ?? []).length === 0 ? <p className="kanban-empty">{panelStrings.noReleasesYet}</p> : null}
    </section>
  );
}
