import { ColorNamesContext } from "@storymapper/web/features/story-map/color-names-context";
import { ColorNames } from "@storymapper/web/features/story-map/components/ColorNames";
import { EpicContextPanel } from "@storymapper/web/features/story-map/components/EpicContextPanel";
import { CardReviewMenu, CardReviewProvider } from "@storymapper/web/features/card-review";
import { FilterMatchesContext } from "@storymapper/web/features/story-map/filter-context";
import { FirstMapGuidance } from "@storymapper/web/features/story-map/components/FirstMapGuidance";
import { WhatChangedProvider, WhatChangedButton, WhatChangedMissingCard } from "@storymapper/web/features/what-changed/WhatChangedProvider";
import { SyncFieldLocksProvider } from "@storymapper/web/features/github-sync/SyncFieldLocks";
import { visibleCards } from "@storymapper/core";
import type { ActivityAffectedCard, StoryMapSnapshot, ChangeSetPreviewBoard } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useParams, useSearch, useNavigate, useRouter } from "@tanstack/react-router";
import { RefreshCcw, Search } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { appStrings as strings, storyMapStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { RequestError } from "@storymapper/web/app/conflicts";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { changeSetStrings, conflictStrings } from "@storymapper/ui-strings";
import { StoryMapViews } from "@storymapper/web/app/routes/story-map-views";
import { useWorkspaceScope } from "@storymapper/web/app/routes/use-workspace-scope";
import { DiscoveryBoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { DiscoveryViewControls } from "@storymapper/web/app/routes/DiscoveryViewControls";
import { hasActiveBoardFilters } from "@storymapper/web/features/story-map/board-filters";
import { CardDetailModal } from "@storymapper/web/features/story-map/components/CardDetailModal";
import { StoryMapExportActions } from "@storymapper/web/features/story-map/components/StoryMapExportActions";
import type { StoryMapViewKind } from "@storymapper/web/features/story-map/export/story-map-view-export";
import { useStoryMapBoardState, type StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { enabledStoryMapViews } from "@storymapper/web/app/feature-flags";

const PreviewBoardContext = createContext<ChangeSetPreviewBoard | undefined>(undefined);
export function usePreviewBoard() { return useContext(PreviewBoardContext); }
const StoryMapSnapshotContext = createContext<StoryMapSnapshot | null>(null);
const StoryMapBoardStateContext = createContext<StoryMapBoardState | null>(null);

export function useStoryMapSnapshot() {
  const snapshot = useContext(StoryMapSnapshotContext);
  if (!snapshot) {
    throw new Error("useStoryMapSnapshot must be used below StoryMapShell.");
  }
  return snapshot;
}

export function useStoryMapBoardStateContext() {
  const boardState = useContext(StoryMapBoardStateContext);
  if (!boardState) {
    throw new Error("useStoryMapBoardStateContext must be used below StoryMapShell.");
  }
  return boardState;
}

export function StoryMapShell() {
  const { projectId, storyMapId } = useParams({ strict: false }) as { projectId: string; storyMapId: string };
  const search = useSearch({ strict: false }) as { card?: string; preview?: string };
  const scope = useWorkspaceScope();
  const navigateCard = useChangedCardNavigation(projectId, storyMapId);
  return <CardReviewProvider projectId={projectId} storyMapId={storyMapId} preview={Boolean(search.preview)}><WhatChangedProvider projectId={projectId} storyMapId={storyMapId} preview={search.preview} navigateCard={navigateCard}><StoryMapShellScope scope={scope} projectId={projectId} storyMapId={storyMapId} search={search} /></WhatChangedProvider></CardReviewProvider>;
}

function useChangedCardNavigation(projectId: string, storyMapId: string) {
  const navigate = useNavigate(), router = useRouter();
  return async (card: ActivityAffectedCard): Promise<boolean> => {
    const target = card.navigation!;
    const currentView = router.state.location.pathname.split("/").at(-1);
    const view = target.storyMapId === storyMapId && enabledStoryMapViews.some((item) => item === currentView) ? currentView : enabledStoryMapViews[0]!;
    await (navigate as (options: unknown) => Promise<void>)({ to: `/projects/$projectId/story-maps/$storyMapId/${view}`, params: { projectId, storyMapId: target.storyMapId }, search: { card: card.id } });
    const location = router.state.location;
    return location.pathname.includes(`/story-maps/${target.storyMapId}/`) && location.search.card === card.id;
  };
}

function StoryMapShellScope({ scope, projectId, storyMapId, search }: { scope: ReturnType<typeof useWorkspaceScope>; projectId: string; storyMapId: string; search: { card?: string; preview?: string } }) {
  if (!scope.storyMap || scope.storyMapId !== storyMapId) {
    if (scope.error) return <>{search.card ? <WhatChangedMissingCard cardId={search.card} storyMapId={storyMapId} /> : null}<p role="alert">{scope.error.message}</p></>;
    if (scope.isLoading) return <div className="empty-state">{strings.loadingLocalStoryMap}</div>;
    return <>{search.card ? <WhatChangedMissingCard cardId={search.card} storyMapId={storyMapId} /> : null}<div className="empty-state">{strings.noStoryMap}</div></>;
  }

  const baseParams = { projectId, storyMapId };

  return (
    <>
      {scope.error ? <p role="alert">{scope.error.message}</p> : null}
      <StoryMapShellContent storyMap={scope.storyMap} projectId={projectId} storyMapId={storyMapId} previewId={search.preview} selectedCardId={search.card} baseParams={baseParams} />
    </>
  );
}

function StoryMapShellContent(props: { storyMap: StoryMapSnapshot; projectId: string; storyMapId: string; previewId: string | undefined; selectedCardId: string | undefined; baseParams: { projectId: string; storyMapId: string } }) {
  return renderStoryMapShellContent(useStoryMapShellContentState(props));
}

function useStoryMapShellContentState({ storyMap, projectId, previewId, selectedCardId, baseParams }: { storyMap: StoryMapSnapshot; projectId: string; storyMapId: string; previewId: string | undefined; selectedCardId: string | undefined; baseParams: { projectId: string; storyMapId: string } }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string; preview?: string };
  const location = useLocation();
  const review = useChangeSetReview(previewId);
  const [closedNotice, setClosedNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const closedNoticeRef = useRef<HTMLParagraphElement>(null);
  const closingPreview = useRef(false);
  const projection = (location.pathname.endsWith("/tree") || location.pathname.endsWith("/planning") || location.pathname.endsWith("/slices") || location.pathname.endsWith("/graph") || location.pathname.endsWith("/tracking") || location.pathname.endsWith("/releases") || location.pathname.endsWith("/backlog") || location.pathname.endsWith("/discovery")) && review.fresh && !review.preview.data?.closed ? review.preview.data?.boards.find((board) => board.snapshot.storyMap.id === storyMap.storyMap.id) : undefined;
  useEffect(() => {
    if (!previewId || (!review.preview.data?.closed && !(review.preview.error instanceof RequestError && review.preview.error.status === 404))) return;
    closingPreview.current = true;
    setClosedNotice(review.preview.data?.explanation ?? (review.preview.error ? changeSetStrings.missing : changeSetStrings.closed));
    const { preview: _, ...remaining } = search;
    void (navigate as (options: unknown) => Promise<void>)({ search: remaining, replace: true });
  }, [previewId, review.preview.data?.closed, review.preview.data?.explanation, review.preview.error, navigate, search]);
  useEffect(() => {
    if (previewId || !closingPreview.current) return;
    closingPreview.current = false;
    if (!selectedCardId) closedNoticeRef.current?.focus();
  }, [previewId, selectedCardId]);
  const activeViewKind = getStoryMapViewKind(location.pathname);
  const isDiscovery = activeViewKind === "discovery";
  const boardPreview = previewId ? projection ?? { snapshot: storyMap, markers: [] } : undefined;
  const boardState = useStoryMapBoardState(boardPreview?.snapshot ?? storyMap, projectId, boardPreview);
  const pullGitHubLinks = useMutation({
    mutationFn: () => api.pullStoryMapWorkItems({ storyMapId: storyMap.storyMap.id, confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-reviews", projectId] });
      queryClient.invalidateQueries({ queryKey: ["story-map", storyMap.storyMap.id] });
      queryClient.invalidateQueries({ queryKey: ["work-item-sync-health", storyMap.storyMap.id] });
      queryClient.invalidateQueries({ queryKey: ["github-sync-health", storyMap.storyMap.id] });
      queryClient.invalidateQueries({ queryKey: ["backlog-health", storyMap.storyMap.id] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  });
  const visibleCardIds = new Set(visibleCards(storyMap.cards).map((card) => card.id));
  const visibleLinks = storyMap.remoteWorkItemLinks.filter((link) => !link.cardId || visibleCardIds.has(link.cardId));
  const linkedCount = visibleLinks.length;
  const outOfSyncCount = visibleLinks.filter((link) => link.syncState !== "synced").length;
  const searchVisible = searchOpen || hasActiveBoardFilters(boardState.filters);
  return { searchVisible, setSearchOpen, projectId, storyMap, boardState, projection, isDiscovery, baseParams, search, activeViewKind, linkedCount, outOfSyncCount, pullGitHubLinks, boardPreview, queryClient, closedNotice, closedNoticeRef, previewId, navigate, review, selectedCardId };
}

function renderStoryMapShellContent({ searchVisible, setSearchOpen, projectId, storyMap, boardState, projection, isDiscovery, baseParams, search, activeViewKind, linkedCount, outOfSyncCount, pullGitHubLinks, boardPreview, queryClient, closedNotice, closedNoticeRef, previewId, navigate, review, selectedCardId }: ReturnType<typeof useStoryMapShellContentState>) {
  return (
    <ColorNamesContext.Provider value={(boardPreview?.snapshot ?? storyMap).storyMap.colorCategoryNames}><SyncFieldLocksProvider snapshot={storyMap}><StoryMapSnapshotContext.Provider value={storyMap}>
      <FilterMatchesContext.Provider value={boardState.filtered.matchingCardIds}><StoryMapBoardStateContext.Provider value={boardState}><PreviewBoardContext.Provider value={projection}>
        <div data-story-map-board tabIndex={-1} className={`story-map-shell${isDiscovery ? " story-map-shell-fill" : ""}`}>
          <div className="story-map-view-header">
            <div className="view-tabs story-map-view-toolbar">
              <WhatChangedButton /><StoryMapViews params={baseParams} search={search} />
              <div className="view-toolbar-actions">
                  {!previewId ? <ColorNames key={storyMap.storyMap.id} map={storyMap.storyMap} /> : null}
                  {!previewId ? <CardReviewMenu cards={storyMap.cards} selectedIds={boardState.selectedIds} /> : null}
                  <FirstMapGuidance key={storyMap.storyMap.id} state={boardState} onSelectCard={(cardId) => { void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } }); }} />
                  {activeViewKind ? <>
                  {isDiscovery ? <DiscoveryViewControls snapshot={storyMap} /> : null}
                  {isDiscovery && !boardPreview ? <button type="button" className="secondary icon-button" aria-pressed={searchVisible} aria-label={storyMapStrings.toggleSearch} title={storyMapStrings.toggleSearch} onClick={() => setSearchOpen(!searchVisible)}><Search size={16} /></button> : null}
                  <StoryMapExportActions projectId={projectId} storyMapName={storyMap.storyMap.name} viewKind={activeViewKind} />
                  {linkedCount > 0 ? <button type="button" className="secondary icon-button" aria-label={strings.pullGithub} title={`${strings.githubLinksHint(linkedCount, outOfSyncCount)} ${strings.pullGithubHint(linkedCount)}`} onClick={() => pullGitHubLinks.mutate()} disabled={Boolean(boardPreview) || pullGitHubLinks.isPending}>
                    <RefreshCcw size={16} /></button> : null}
                  </> : null}
              </div>
            </div>
            <EpicContextPanel key={storyMap.storyMap.id} map={boardPreview?.snapshot.storyMap ?? storyMap.storyMap} disabled={Boolean(boardPreview)} />
            {isDiscovery && !boardPreview ? <DiscoveryBoardToolbar state={boardState} searchVisible={searchVisible} /> : null}
          </div>
          {boardState.moveCard.error ? <p role="alert">{boardState.moveCard.error.message} <button type="button" onClick={() => { boardState.moveCard.reset(); void queryClient.invalidateQueries({ queryKey: ["story-map", storyMap.storyMap.id] }); }}>{conflictStrings.reload}</button></p> : null}
          {closedNotice ? <p ref={closedNoticeRef} tabIndex={-1} role="status">{closedNotice} <Link to="/projects/$projectId/audit" params={{ projectId }}>{changeSetStrings.activity}</Link></p> : null}
          {previewId ? <><p>{changeSetStrings.readOnly}</p><button type="button" className="secondary" onClick={() => { const { preview: _, ...remaining } = search; void (navigate as (options: unknown) => Promise<void>)({ search: remaining }); }}>{changeSetStrings.close}</button><ChangeSetReview state={review} /></> : null}
          <Outlet />
        </div>
        <CardDetailModal suspended={Boolean(previewId)} cardId={selectedCardId} snapshot={storyMap} projectId={projectId} onNotice={boardState.setLifecycleNotice} />
      </PreviewBoardContext.Provider></StoryMapBoardStateContext.Provider></FilterMatchesContext.Provider>
    </StoryMapSnapshotContext.Provider></SyncFieldLocksProvider></ColorNamesContext.Provider>
  );
}

function getStoryMapViewKind(pathname: string): StoryMapViewKind | null {
  if (pathname.endsWith("/discovery")) return "discovery";
  if (pathname.endsWith("/tree")) return "tree";
  if (pathname.endsWith("/planning")) return "planning";
  if (pathname.endsWith("/backlog")) return "backlog";
  if (pathname.endsWith("/tracking")) return "tracking";
  if (pathname.endsWith("/timeline")) return "timeline";
  return null;
}
