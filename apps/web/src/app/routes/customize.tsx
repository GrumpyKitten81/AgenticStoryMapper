import { appStrings as strings } from "@storymapper/ui-strings";
import { useParams } from "@tanstack/react-router";
import { CustomizationPanel } from "@storymapper/web/features/customization/CustomizationPanel";
import { useWorkspaceScope } from "@storymapper/web/app/routes/use-workspace-scope";

export function CustomizeRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const scope = useWorkspaceScope();
  if (scope.error && !scope.storyMap) return <p role="alert">{scope.error.message}</p>;
  if (scope.isLoading) return <div className="empty-state">{strings.loadingLocalStoryMap}</div>;
  return (
    <section className="route-panel">
      {scope.error ? <p role="alert">{scope.error.message}</p> : null}
      <CustomizationPanel key={projectId} projectId={projectId} storyMapId={scope.storyMapId} />
    </section>
  );
}
