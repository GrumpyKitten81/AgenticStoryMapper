import { ReleaseTimelineChart } from "@storymapper/web/features/releases";
import { useStoryMapSnapshot } from "@storymapper/web/app/routes/story-map-shell";

export function TimelineView() {
  const snapshot = useStoryMapSnapshot();
  return (
    <section className="route-panel">
      <ReleaseTimelineChart storyMapId={snapshot.storyMap.id} />
    </section>
  );
}
