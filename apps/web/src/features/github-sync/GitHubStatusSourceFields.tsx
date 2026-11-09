import { githubStatusStrings as strings } from "@storymapper/web/ui-strings/github-status";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "@storymapper/web/app/api";
import { createConnectionPayload, type ConnectionDraft } from "@storymapper/web/features/github-sync/connection-draft";

export function GitHubStatusSourceFields({ projectId, draft, setDraft }: { projectId: string; draft: ConnectionDraft; setDraft: Dispatch<SetStateAction<ConnectionDraft>> }) {
  const [discovered, setProjects] = useState<{ scope: string; projects: Array<{ id: string; name: string; fieldId: string }> }>();
  const scope = JSON.stringify([projectId, draft.owner, draft.repository, draft.authMode]);
  const current = useRef(scope);
  current.current = scope;
  const discovery = useMutation({ mutationFn: async () => ({ scope, result: await api.listGitHubStatusProjects(createConnectionPayload(projectId, draft)) }), onSuccess: ({ scope, result }) => { if (scope === current.current) setProjects({ scope, projects: result.projects }); } });
  const previous = useRef(scope);
  const source = draft.statusSource ?? { kind: "repository" as const };
  useEffect(() => {
    if (previous.current !== scope) {
      setProjects(undefined);
      discovery.reset();
    }
    previous.current = scope;
  }, [scope, discovery.reset]);
  const projects = discovered?.scope === scope ? discovered.projects : [];
  const available = source.kind === "project" && !projects.some((project) => project.id === source.projectId && project.fieldId === source.fieldId) ? [...projects, { id: source.projectId, name: source.projectName, fieldId: source.fieldId }] : projects;
  return <fieldset className="form-stack"><legend>{strings.sourceHeading}</legend>
    <label>{strings.source}<select value={source.kind === "repository" ? "repository" : JSON.stringify([source.projectId, source.fieldId])} onChange={(event) => {
      const selected = available.find((project) => JSON.stringify([project.id, project.fieldId]) === event.target.value);
      setDraft((draft) => ({ ...draft, statusSource: selected ? { kind: "project", projectId: selected.id, projectName: selected.name, fieldId: selected.fieldId } : { kind: "repository" } }));
    }}><option value="repository">{strings.repository}</option>{available.map((project) => <option key={JSON.stringify([project.id, project.fieldId])} value={JSON.stringify([project.id, project.fieldId])}>{project.name}</option>)}</select></label>
    <button type="button" className="secondary" disabled={!projectId || !draft.owner || !draft.repository || discovery.isPending} onClick={() => discovery.mutate()}>{strings.loadProjects}</button>
    {discovery.error ? <p role="alert">{discovery.error.message}</p> : null}
    <p>{strings.sourceHint}</p>
  </fieldset>;
}
