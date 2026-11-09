import { visibleCards } from "@storymapper/core";
import { Link, Outlet, useLocation, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, Bot, Compass, FileText, GitBranch, LayoutDashboard, Map, MapPinned, Info, PanelTop, Pause, Pencil, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { appStrings as strings, liveUpdateStrings } from "@storymapper/ui-strings";
import { useLiveUpdates } from "@storymapper/web/app/live/useLiveUpdates";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { api, useApiHealth, useProjects } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { Announcements } from "@storymapper/web/app/components/Announcements";
import { SafetySwitchStrip } from "@storymapper/web/features/safety/SafetySwitchStrip";
import { RestoreResultDialog } from "@storymapper/web/features/restore-points/RestoreResultDialog";
import { useWorkspaceScope } from "@storymapper/web/app/routes/use-workspace-scope";
import { StoryMapViews } from "@storymapper/web/app/routes/story-map-views";
import { routeHeading } from "@storymapper/web/app/routes/route-heading";
import { CardKeyPrefixEditor } from "@storymapper/web/app/routes/CardKeyPrefixEditor";
import { RestoreProgressDialog } from "@storymapper/web/features/restore-points/RestoreProgressDialog";
import { isPersonasEnabled, isReleasesViewEnabled, isRoadmapsViewEnabled, isSourcesViewEnabled } from "@storymapper/web/app/feature-flags";

export function RootLayout() {
  return renderRootLayout(useRootLayoutState());
}

function useRootLayoutState() {
  const { search, apiHealth, activeProjectId, activeStoryMapId, snapshot, urlStoryMapId, live, heldUpdates, setHeldUpdates, waitingUpdates, heading, headingRef, activeStoryMap, projectParams, storyMapParams, lastStoryMapParams, isActiveStoryMapRoute, projectName } = useRootWorkspaceScope();
  const storyMapName = activeStoryMap.data?.storyMap.name;
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const renameStoryMap = useMutation({
    mutationFn: (name: string) => api.updateStoryMap(activeStoryMapId as string, { name }, activeStoryMap.data!.storyMap.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-map", activeStoryMapId] });
      queryClient.invalidateQueries({ queryKey: ["card-reviews"] });
      if (activeProjectId) queryClient.invalidateQueries({ queryKey: ["story-maps", activeProjectId] });
    }
  });

  useEffect(() => {
    setEditingTitle(false);
  }, [activeStoryMapId]);

  function startTitleEdit() {
    setTitleDraft(storyMapName ?? "");
    setEditingTitle(true);
  }

  function submitTitleEdit() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (next && next !== storyMapName) renameStoryMap.mutate(next);
  }
  return { lastStoryMapParams, isActiveStoryMapRoute, projectParams, storyMapParams, search, headingRef, heading, editingTitle, titleDraft, setTitleDraft, submitTitleEdit, setEditingTitle, storyMapName, startTitleEdit, snapshot, activeProjectId, live, heldUpdates, setHeldUpdates, waitingUpdates, projectName, activeStoryMap, apiHealth, urlStoryMapId };
}

function renderRootLayout(model: ReturnType<typeof useRootLayoutState>) {
  const { lastStoryMapParams, isActiveStoryMapRoute, projectParams, storyMapParams, search, headingRef, heading, editingTitle, titleDraft, setTitleDraft, submitTitleEdit, setEditingTitle, storyMapName, startTitleEdit, snapshot, activeProjectId, live, heldUpdates, setHeldUpdates, waitingUpdates, projectName, activeStoryMap, apiHealth, urlStoryMapId } = model;
  return (
    <div className="shell">
      <a className="skip-link" href="#workspace" onClick={() => document.getElementById("workspace")?.focus()}>{strings.skipToWorkspace}</a>
      {renderWorkspaceNavigation(model)}
      <section className="workspace">
        {renderWorkspaceHeader(model)}
        {live.failed && !apiHealth.isError ? <div className="api-health-banner" role="alert">{liveUpdateStrings.unavailable}</div> : null}
        {apiHealth.isError ? (
          <div className="api-health-banner" role="alert" aria-live="polite">
            <AlertTriangle size={16} />
            <span>{strings.apiUnavailable}</span>
          </div>
        ) : null}
        <Announcements />
        <RestoreResultDialog />
        <RestoreProgressDialog />
        <main aria-labelledby="workspace-heading" id="workspace" className="workspace-content" tabIndex={-1}>
          {!urlStoryMapId || !storyMapParams ? <StoryMapViews params={storyMapParams} /> : null}
          <Outlet />
        </main>
      </section>
    </div>
  );
}

function useRootWorkspaceScope() {
  const location = useLocation();
  const search = useSearch({ strict: false }) as { storyMapId?: string; preview?: string };
  const apiHealth = useApiHealth();
  const projects = useProjects();
  const { projectId: activeProjectId, storyMapId: activeStoryMapId, storyMap: snapshot, urlStoryMapId } = useWorkspaceScope(projects.data?.projects[0]?.id);
  const live = useLiveUpdates(activeProjectId);
  const heldUpdates = useLiveInteractionStore((state) => state.manualHold);
  const setHeldUpdates = useLiveInteractionStore((state) => state.setManualHold);
  const waitingUpdates = useLiveInteractionStore((state) => state.waiting);
  const setActiveStoryMap = useActiveStoryMapStore((state) => state.setActiveStoryMap);
  const heading = routeHeading(location.pathname);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setActiveStoryMap({ projectId: activeProjectId, storyMapId: activeStoryMapId });
  }, [activeProjectId, activeStoryMapId, setActiveStoryMap]);
  useEffect(() => { if (!document.querySelector('[aria-modal="true"]')) headingRef.current?.focus(); }, [location.pathname, search.storyMapId]);
  useEffect(() => {
    document.title = strings.pageTitle(heading, snapshot?.storyMap.name);
  }, [heading, snapshot?.storyMap.name]);
  const activeStoryMap = { data: snapshot };
  const projectParams = activeProjectId ? { projectId: activeProjectId } : undefined;
  const storyMapParams = activeProjectId && activeStoryMapId ? { projectId: activeProjectId, storyMapId: activeStoryMapId } : undefined;
  const isStoryMapsList = location.pathname === `/projects/${activeProjectId}/story-maps`;
  const lastStoryMapParams = isStoryMapsList ? undefined : storyMapParams;
  const isActiveStoryMapRoute = Boolean(urlStoryMapId && storyMapParams);
  const projectName = projects.data?.projects.find((project) => project.id === activeProjectId)?.name ?? strings.loadingProject;
  return { search, apiHealth, activeProjectId, activeStoryMapId, snapshot, urlStoryMapId, live, heldUpdates, setHeldUpdates, waitingUpdates, heading, headingRef, activeStoryMap, projectParams, storyMapParams, lastStoryMapParams, isActiveStoryMapRoute, projectName };
}

function renderLiveStatus(model: ReturnType<typeof useRootLayoutState>) {
  const { live, heldUpdates, setHeldUpdates, waitingUpdates, projectName, activeStoryMap, activeProjectId } = model;
  const summary = [projectName, strings.cardCount(visibleCards(activeStoryMap.data?.cards ?? []).length), strings.releaseCount(activeStoryMap.data?.releases.length ?? 0)].join(strings.listSeparator);
  return <div className="status-strip">
    <span role="img" className={`live-dot live-${live.connection}`} title={liveUpdateStrings.connection[live.connection]} aria-label={liveUpdateStrings.connection[live.connection]} />
    <button type="button" className="secondary icon-button" aria-pressed={heldUpdates} aria-label={liveUpdateStrings.holdUpdates} title={liveUpdateStrings.holdUpdates} onClick={() => setHeldUpdates(!heldUpdates)}><Pause size={16} /></button>
    {waitingUpdates > 0 ? <span>{liveUpdateStrings.waiting(waitingUpdates)}</span> : null}
    <span className="status-info" tabIndex={0} role="img" title={summary} aria-label={summary}><Info size={16} /></span>
    <SafetySwitchStrip projectId={activeProjectId} />
  </div>;
}

function renderWorkspaceNavigation(model: ReturnType<typeof useRootLayoutState>) {
  const { lastStoryMapParams, isActiveStoryMapRoute, projectParams, storyMapParams, search } = model;
  return <aside className="sidebar">
    <div className="brand">
      <Map size={22} />
      <span>{strings.brand}</span>
    </div>
    <nav aria-label={strings.mainNavigation}>
      <h2 className="navigation-group">{strings.work}</h2>
      {lastStoryMapParams ? (
        <Link to="/projects/$projectId/story-maps/$storyMapId/discovery" params={lastStoryMapParams} className={isActiveStoryMapRoute ? "active" : undefined} aria-current={isActiveStoryMapRoute ? "location" : undefined} activeProps={{ className: "active" }}>
          <LayoutDashboard size={18} />{strings.storyMaps}</Link>
      ) : projectParams ? (
        <Link to="/projects/$projectId/story-maps" params={projectParams} activeProps={{ className: "active" }}>
          <LayoutDashboard size={18} />{strings.storyMaps}</Link>
      ) : <Link to="/"><LayoutDashboard size={18} />{strings.storyMaps}</Link>}
      {isSourcesViewEnabled && projectParams ? <Link to="/projects/$projectId/sources" params={projectParams} activeProps={{ className: "active" }}>
        <FileText size={18} />{strings.sources}</Link> : null}
      {isReleasesViewEnabled && storyMapParams ? <Link to="/projects/$projectId/story-maps/$storyMapId/releases" params={storyMapParams} activeProps={{ className: "active" }}>
        <PanelTop size={18} />{strings.releases}</Link> : null}
      {isRoadmapsViewEnabled && storyMapParams ? <Link to="/projects/$projectId/story-maps/$storyMapId/roadmaps" params={storyMapParams} activeProps={{ className: "active" }}>
        <MapPinned size={18} />{strings.roadmaps}<span className="experimental-label">{strings.experimental}</span></Link> : null}
      <h2 className="navigation-group">{strings.setup}</h2>
      <Link to="/agent-setup" activeProps={{ className: "active" }}><Bot size={18} />{strings.agentSetup}</Link>
      {projectParams ? isActiveStoryMapRoute && storyMapParams ? (
        <Link to="/projects/$projectId/github" params={projectParams} search={{ storyMapId: storyMapParams.storyMapId }} activeProps={{ className: "active" }}>
          <GitBranch size={18} />{strings.connections}</Link>
      ) : (
        <Link to="/projects/$projectId/github" params={projectParams} activeProps={{ className: "active" }}>
          <GitBranch size={18} />{strings.connections}</Link>
      ) : null}
      {projectParams && isPersonasEnabled ? <Link to="/projects/$projectId/personas" params={projectParams} activeProps={{ className: "active" }}>
        <Users size={18} />{strings.personas}</Link> : null}
      {projectParams ? <Link to="/projects/$projectId/customize" params={projectParams} activeProps={{ className: "active" }}>
        <SlidersHorizontal size={18} />{strings.customize}</Link> : null}
      {storyMapParams ? <Link to="/projects/$projectId/story-maps/$storyMapId/ai-mcp" params={storyMapParams} activeProps={{ className: "active" }}>
        <Activity size={18} />{strings.aiMcp}</Link> : null}
      <h2 className="navigation-group">{strings.trust}</h2>
      {projectParams ? <Link to="/projects/$projectId/audit" params={projectParams} activeProps={{ className: "active" }}>
        <ShieldCheck size={18} />{strings.activity}</Link> : null}
      <Link to="/onboarding" activeProps={{ className: "active" }}>
        <Compass size={18} />{strings.onboarding}</Link>
    </nav>
  </aside>;
}

function renderWorkspaceHeader(model: ReturnType<typeof useRootLayoutState>) {
  const { headingRef, heading, storyMapParams, editingTitle, titleDraft, setTitleDraft, submitTitleEdit, setEditingTitle, storyMapName, startTitleEdit, snapshot, search } = model;
  return <header className="topbar" role="banner">
    <div className="topbar-heading">
      <h1 id="workspace-heading" ref={headingRef} tabIndex={-1}>{heading}</h1>
      {storyMapParams ? (
        <Link className="back-link" to="/projects/$projectId/story-maps" params={{ projectId: storyMapParams.projectId }}>
          <ArrowLeft size={14} />{strings.allStoryMaps}</Link>
      ) : null}
      {editingTitle && storyMapParams ? (
        <input
          className="topbar-title-input"
          autoFocus
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={submitTitleEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitTitleEdit();
            }
            if (event.key === "Escape") {
              setEditingTitle(false);
            }
          }}
          aria-label={strings.storyMapName}
        />
      ) : (
        <>
          {storyMapName ? <span className="topbar-map-name">{storyMapName}</span> : null}
          {storyMapParams && storyMapName ? (
            <button type="button" className="secondary icon-button topbar-title-edit" title={strings.renameStoryMap} aria-label={strings.renameStoryMapLabel(storyMapName)} onClick={startTitleEdit}>
              <Pencil size={16} />
            </button>
          ) : null}
          <CardKeyPrefixEditor storyMap={snapshot?.storyMap} readOnly={Boolean(search.preview)} />
        </>
      )}
    </div>
    {renderLiveStatus(model)}
  </header>;
}
