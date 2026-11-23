import { Navigate } from "@tanstack/react-router";
import { appStrings as strings } from "@storymapper/ui-strings";
import { ProjectPicker } from "@storymapper/web/features/onboarding/ProjectPicker";
import { useProjects } from "../api";

export function RootIndexRoute() {
  const projects = useProjects();
  const list = projects.data?.projects ?? [];

  if (projects.isLoading) return <div className="empty-state">{strings.loadingLocalStoryMap}</div>;
  if (list.length === 0) return <div className="empty-state">{strings.noProject}</div>;
  if (list.length === 1) return <Navigate to="/projects/$projectId/story-maps" params={{ projectId: list[0]!.id }} />;

  return (
    <section className="onboarding">
      <section className="panel onboarding-panel">
        <h2>{strings.chooseProject}</h2>
        <ProjectPicker projects={list} />
      </section>
    </section>
  );
}
