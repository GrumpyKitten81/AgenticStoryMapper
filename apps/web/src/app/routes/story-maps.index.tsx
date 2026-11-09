import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { appStrings as strings, gettingStartedStrings } from "@storymapper/ui-strings";
import { api, useGettingStartedChecklist, useProjects, useStoryMaps } from "@storymapper/web/app/api";
import { enabledStoryMapViews } from "@storymapper/web/app/feature-flags";
import { ProjectArchivePanel } from "@storymapper/web/features/project-archive/ProjectArchivePanel";
import { GettingStartedChecklist } from "@storymapper/web/features/onboarding/GettingStartedChecklist";

export function StoryMapsIndexRoute() {
  return renderStoryMapsIndexRoute(useStoryMapsIndexRouteState());
}

function useStoryMapsIndexRouteState() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const gettingStarted = useGettingStartedChecklist(projectId);
  const project = useProjects().data?.projects.find((candidate) => candidate.id === projectId);
  const storyMaps = useStoryMaps(projectId, gettingStarted.isFetched);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const creationPending = useRef(false);
  const [name, setName] = useState("");
  const createStoryMap = useMutation({
    mutationFn: api.createStoryMap,
    onSuccess: (data) => {
      setName("");
      void navigate({ to: `/projects/$projectId/story-maps/$storyMapId/${enabledStoryMapViews[0]!}`, params: { projectId, storyMapId: data.id } });
      queryClient.invalidateQueries({ queryKey: ["story-maps", projectId] });
      queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
    },
    onSettled: () => { creationPending.current = false; }
  });
  const deleteStoryMap = useMutation({
    mutationFn: (input: { storyMapId: string; baseVersion: number }) => api.deleteStoryMap(input.storyMapId, input.baseVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-maps", projectId] });
      queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
    }
  });

  function addStoryMap() {
    const trimmed = name.trim();
    if (!trimmed || creationPending.current || createStoryMap.isPending) return;
    creationPending.current = true;
    createStoryMap.mutate({ projectId, name: trimmed });
  }
  const sampleStoryMapId = gettingStarted.data?.checklist.sampleStoryMapId;
  const orderedStoryMaps = [...(storyMaps.data?.storyMaps ?? [])].sort((left, right) => Number(left.id === sampleStoryMapId) - Number(right.id === sampleStoryMapId));
  return { gettingStarted, storyMaps, orderedStoryMaps, sampleStoryMapId, project, name, setName, addStoryMap, createStoryMap, deleteStoryMap, projectId };
}

type StoryMapsIndexState = ReturnType<typeof useStoryMapsIndexRouteState>;

function renderStoryMapsIndexRoute(model: StoryMapsIndexState) {
  const { gettingStarted, storyMaps, deleteStoryMap } = model;
  return (
    <section className="form-stack">
      <ProjectDetails {...model} />
      <section className="panel form-stack" aria-labelledby="owned-story-maps-heading">
      <div className="panel-heading-row"><h2 id="owned-story-maps-heading">{strings.storyMapsInProject(storyMaps.data?.storyMaps.length ?? 0)}</h2></div>
      <p>{strings.storyMapRole}</p>
      <StoryMapCreateForm {...model} />
      {gettingStarted.isPending ? <p role="status">{gettingStartedStrings.loading}</p> : null}
      {gettingStarted.isError ? <p role="alert">{gettingStartedStrings.loadFailed(gettingStarted.error.message)}</p> : null}
      {deleteStoryMap.isError ? <p role="alert">{deleteStoryMap.error.message}</p> : null}
      {storyMaps.isError ? <p role="alert">{storyMaps.error.message}</p> : null}
      {storyMaps.isLoading ? <div className="empty-state">{strings.loadingStoryMaps}</div> : null}
      {storyMaps.isSuccess && !storyMaps.data.storyMaps.length ? (
        <p>{strings.noStoryMaps}</p>
      ) : null}
      <StoryMapList {...model} />
      </section>
      {gettingStarted.data ? <GettingStartedChecklist checklist={gettingStarted.data.checklist} storyMapId={storyMaps.data?.storyMaps[0]?.id} /> : null}
    </section>
  );
}

function StoryMapCreateForm({ name, setName, addStoryMap, createStoryMap }: StoryMapsIndexState) {
  return (
      <div className="form-stack">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); addStoryMap(); }}>
          <label htmlFor="new-story-map">{strings.newStoryMapName}
            <input id="new-story-map" required disabled={createStoryMap.isPending} placeholder={strings.newStoryMap} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" disabled={!name.trim() || createStoryMap.isPending}><Plus size={16} />{createStoryMap.isPending ? strings.creatingStoryMap : strings.createStoryMap}</button>
        </form>
        {createStoryMap.isError ? <p role="alert">{createStoryMap.error.message}</p> : null}
      </div>
  );
}

function StoryMapList({ orderedStoryMaps, sampleStoryMapId, deleteStoryMap, projectId }: StoryMapsIndexState) {
  return (
      <div className="story-map-list">
        {orderedStoryMaps.map((storyMap) => (
          <div key={storyMap.id} className={storyMap.id === sampleStoryMapId ? "story-map-list-row sample" : "story-map-list-row"}>
            <Link
              className="story-map-list-item"
              to={`/projects/$projectId/story-maps/$storyMapId/${enabledStoryMapViews[0]!}`}
              params={{ projectId, storyMapId: storyMap.id }}
            >
              <strong>{storyMap.name}{storyMap.id === sampleStoryMapId ? <span className="story-map-sample-badge">{gettingStartedStrings.sample}</span> : null}</strong>
              <span>{storyMap.description}</span>
            </Link>
            {storyMap.id === sampleStoryMapId ? (
              <button type="button" className="danger icon-button" aria-label={gettingStartedStrings.deleteSample} title={gettingStartedStrings.deleteSample} disabled={deleteStoryMap.isPending} onClick={() => deleteStoryMap.mutate({ storyMapId: storyMap.id, baseVersion: storyMap.version })}><Trash2 size={15} /></button>
            ) : null}
          </div>
        ))}
      </div>
  );
}

function ProjectDetails({ project, projectId }: StoryMapsIndexState) {
  return (
      <section className="panel form-stack" aria-labelledby="active-project-heading">
        <div className="panel-heading-row">
          <div className="project-panel-identity">
            <span className="project-panel-label">{strings.project}</span>
            <h2 id="active-project-heading">{project?.name ?? strings.loadingProject}</h2>
          </div>
          <Link className="button-link secondary" to="/agent-setup">{strings.agentSetup}</Link>
        </div>
        <p>{strings.projectRole}</p>
        <details className="disclosure">
          <summary>{strings.projectStorageArchive}</summary>
          <div className="form-stack">
            {project ? <code className="path-display">{project.localPath}</code> : null}
            <p className="project-archive-hint">{strings.singleProjectHint}</p>
            <ProjectArchivePanel projectId={projectId} />
          </div>
        </details>
      </section>
  );
}
