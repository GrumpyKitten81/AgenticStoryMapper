import type { GettingStartedChecklist as GettingStartedState } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gettingStartedStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";

interface GettingStartedChecklistProps {
  checklist: GettingStartedState;
  storyMapId?: string | undefined;
}

export function GettingStartedChecklist({ checklist, storyMapId }: GettingStartedChecklistProps) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => api.dismissGettingStartedChecklist(checklist.projectId),
    onSuccess: (data) => queryClient.setQueryData(["getting-started", checklist.projectId], data)
  });
  if (checklist.dismissed) return null;
  const projectPath = `/projects/${checklist.projectId}`;
  const items = [
    { key: "createStoryMap", label: strings.createStoryMap, href: "#new-story-map" },
    { key: "addCards", label: strings.addCards, href: storyMapId ? `${projectPath}/story-maps/${storyMapId}/discovery` : "#new-story-map" }
  ] as const;
  return (
    <details className="panel disclosure">
      <summary>{strings.title}</summary>
      <div className="form-stack">
        <ol className="status-list">
          {items.map((item) => {
            const complete = checklist.completed[item.key];
            return (
              <li key={item.key}>
                <a href={item.href}>{item.label}</a>
                <span className={complete ? "status-badge complete" : "status-badge"}>{complete ? strings.complete : strings.pending}</span>
              </li>
            );
          })}
        </ol>
        <p className="helper-text">{strings.optionalActions}<a href={`${projectPath}/github`}>{strings.connectGitHub}</a>{strings.optionalActionSeparator}<a href="#project-archive">{strings.export}</a></p>
        <div className="button-row">
          <button type="button" className="secondary" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>{strings.dismiss}</button>
        </div>
        {dismiss.isError ? <p role="alert">{dismiss.error.message}</p> : null}
      </div>
    </details>
  );
}
