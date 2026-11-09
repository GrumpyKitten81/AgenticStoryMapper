import { Navigate } from "@tanstack/react-router";
import { appStrings as strings } from "@storymapper/ui-strings";
import { useProjects } from "../api";

export function RootIndexRoute() {
  const projects = useProjects();
  const project = projects.data?.projects[0];

  if (projects.isLoading) return <div className="empty-state">{strings.loadingLocalStoryMap}</div>;
  if (!project) return <div className="empty-state">{strings.noProject}</div>;

  return <Navigate to="/projects/$projectId/story-maps" params={{ projectId: project.id }} />;
}
