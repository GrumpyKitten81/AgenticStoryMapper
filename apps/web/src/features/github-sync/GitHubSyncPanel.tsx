import { invalidateRemotePushQueries } from "@storymapper/web/app/remote-push-queries";
import { GitHubSyncStatus, type SyncHealthFilter } from "@storymapper/web/features/github-sync/GitHubSyncStatus";
import type { ReviewedSyncValues } from "@storymapper/web/features/github-sync/SyncConflictDiff";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { IncomingGitHubError } from "@storymapper/web/app/incoming-github-error";
import { IncomingGitHubResults } from "@storymapper/web/features/github-sync/IncomingGitHubResults";
import { IncomingGitHubReview } from "@storymapper/web/features/github-sync/IncomingGitHubReview";
import { incomingGitHubStrings } from "@storymapper/web/ui-strings/incoming-github";
import type { Card, SyncConflict, GitHubLink, PlanWorkItemSyncRequest, Release, RemoteWorkItemLink, RemotePushPlan, RemotePushPlanResponse, IncomingGitHubCommandResponse } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Download, GitBranch, Play, RefreshCcw, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useConnectorConnections, useSafetySettings, useWorkItemSyncHealth } from "@storymapper/web/app/api";
import { RemotePushReview } from "@storymapper/web/features/github-sync/RemotePushReview";
import { remotePushStrings } from "@storymapper/web/ui-strings/remote-push";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { githubSyncSelectionStrings } from "@storymapper/web/ui-strings/github-sync-selection";

interface ReviewedScope { scope: string; reviewedEpoch: string | undefined; revision: number }

interface GitHubSyncPanelProps {
  projectId?: string | undefined;
  storyMapId?: string | undefined;
  storyMapName: string;
  storyMapVersion: number;
  defaultConnectionId?: string | null | undefined;
  selectedCardIds?: string[] | undefined;
  cards: Card[];
  releases: Release[];
  links: GitHubLink[];
}

export function GitHubSyncPanel(props: GitHubSyncPanelProps) {
  return renderGitHubSyncPanel(useGitHubSyncPanelState(props));
}

function useGitHubSyncPanelState(props: GitHubSyncPanelProps) {
  const context = useGitHubIncomingActions(props);
  return { ...context };
}

function renderGitHubSyncPanel(model: ReturnType<typeof useGitHubSyncPanelState>) {
  const { busy, review, executionResult, resultScope, interactionRevision, storyMapName, connectionParams, storyMapId, legacyLinkCount, health, selectionIsExplicit, healthFilter, setHealthFilter, incomingAction, message, connectorEnabled, connections, selectedConnectionId, invalidateScope, setSelectedConnectionId, defaultConnectionId, setDefaultConnection, operationDraft, setOperationDraft, releases, scopeIds, eligibleCardIds, scopeCards, storyCards, requestPlan, canWriteGitHub, pushReviewedPlan, plan, restorePending, selectedConnectionReadOnly, savedPlanId, setSavedPlanId, currentResultScope, operationPending, reviewOrigin, readPlan, epoch, incomingFailure, incomingReview, setIncomingPending, currentScopeKey, resumeReviewedPlan, cards, visibleCardIds, projectId, quickReview, resolveReviewedConflict } = model;
  return (
    <section className="panel github-sync-panel" data-live-suspended-draft={busy || review || executionResult?.scope === resultScope && executionResult.revision === interactionRevision.current && executionResult.result.execution.status !== "completed" ? "" : undefined}>
      {renderGitHubSyncHeading(model)}

      <div className="github-health-grid">
        <div><span>{panelStrings.legacyLinks}</span><strong>{legacyLinkCount}</strong></div>
        <div><span>{panelStrings.remoteLinks}</span><strong>{health.data?.totalLinks ?? 0}</strong></div>
        <div><span>{panelStrings.synced}</span><strong>{health.data?.stateCounts.synced ?? 0}</strong></div>
        <div><span>{panelStrings.stale}</span><strong>{health.data?.stateCounts.stale ?? 0}</strong></div>
        <div><span>{syncConflictStrings.conflictedLinks}</span><strong>{health.data?.stateCounts.conflict ?? 0}</strong></div>
        <div><span>{panelStrings.deleted}</span><strong>{health.data?.deletedLinks.length ?? 0}</strong></div>
      </div>
      {!selectionIsExplicit ? renderGitHubHealthToolbar(model) : null}

      {health.data?.lastRun ? <p>{syncConflictStrings.lastRun(health.data.lastRun.createdAt, health.data.lastRun.summary)}</p> : null}
      {health.error ? <p role="alert">{health.error.message}</p> : null}
      {message ? <p className="sync-message">{message}</p> : null}

      {!connectorEnabled || (connections.data?.connections.length ?? 0) === 0 ? (
        <section className="panel-section">
          <p>
            <AlertTriangle size={16} /> {connectorEnabled ? panelStrings.noGitHubConnectionIsConfiguredYet : panelStrings.theGitHubConnectorIsDisabled} {connectionParams && storyMapId ? <Link to="/projects/$projectId/github" params={connectionParams} search={{ storyMapId }}>{panelStrings.openTheGitHubTabToManageConnections}</Link> : connectionParams ? <Link to="/projects/$projectId/github" params={connectionParams}>{panelStrings.openTheGitHubTabToManageConnections}</Link> : null}
          </p>
        </section>
      ) : null}

      {renderGitHubSyncForm(model)}

      <div className="github-form form-stack"><label>{remotePushStrings.savedPlanId}<input value={savedPlanId} onChange={(event) => setSavedPlanId(event.target.value)} /></label><button type="button" className="secondary" disabled={!savedPlanId.trim() || busy || restorePending} onClick={() => { if (currentResultScope.current !== resultScope || operationPending.current || restorePending) return; operationPending.current = true; reviewOrigin.current = null; readPlan.mutate({ planId: savedPlanId.trim(), scope: resultScope, reviewedEpoch: epoch, revision: interactionRevision.current }); }}>{remotePushStrings.readPlan}</button></div>
      {incomingFailure?.scope === resultScope && incomingFailure.revision === interactionRevision.current ? <IncomingGitHubResults items={incomingFailure.error.items} /> : null}
      {incomingReview?.scope === resultScope && incomingReview.revision === interactionRevision.current ? <IncomingGitHubReview command={incomingReview.command} mutationKey={["github-incoming-write", storyMapId]} isCurrent={() => currentResultScope.current === incomingReview.scope && incomingReview.revision === interactionRevision.current && !useLiveInteractionStore.getState().restorePending} onPendingChange={setIncomingPending} onPrepareOutgoing={incomingReview.outbound ? () => requestPlan("sync") : undefined} /> : null}
      {plan && "id" in plan ? <RemotePushReview plan={plan} pending={busy} onConfirm={pushReviewedPlan} onCancel={() => {
        if (busy || operationPending.current || !review || review.scopeKey !== currentScopeKey.current || epoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
        const origin = reviewOrigin.current;
        reviewOrigin.current = null;
        invalidateScope();
        return origin ?? undefined;
      }} /> : null}
      {executionResult?.scope === resultScope && executionResult.revision === interactionRevision.current ? <RemotePushReview plan={executionResult.result.plan} execution={executionResult.result.execution} focusResult pending={busy} onResume={resumeReviewedPlan} /> : null}

      {!selectionIsExplicit ? <GitHubSyncStatus cards={cards} health={health.data} filter={healthFilter} connections={connections.data?.connections ?? []} visibleCardIds={visibleCardIds} connectorEnabled={connectorEnabled} pending={busy || restorePending} scope={JSON.stringify([epoch, projectId, storyMapId, connectorEnabled])} onQuickReview={quickReview} onResolve={resolveReviewedConflict} /> : null}
    </section>
  );
}

function useGitHubSyncSelection({ projectId, storyMapId, storyMapName, storyMapVersion, defaultConnectionId, selectedCardIds, cards, releases, links }: GitHubSyncPanelProps) {
  const queryClient = useQueryClient();
  const connections = useConnectorConnections(projectId);
  const health = useWorkItemSyncHealth(storyMapId);
  const privacy = useSafetySettings(projectId);
  const connectorEnabled = privacy.data?.settings.github ?? false;
  const visibleCardList = useMemo(() => visibleCards(cards), [cards]);
  const storyCards = visibleCardList.filter((card) => card.level !== "note");
  const visibleCardIds = new Set(visibleCardList.map((card) => card.id));
  const legacyLinkCount = links.filter((link) => !link.cardId || visibleCardIds.has(link.cardId)).length;
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const selectedConnection = connections.data?.connections.find((connection) => connection.id === selectedConnectionId);
  const [operationDraft, setOperationDraft] = useState({ releaseId: "", query: "", cardIds: [] as string[] });
  return { projectId, storyMapId, storyMapName, storyMapVersion, defaultConnectionId, selectedCardIds, cards, releases, queryClient, connections, health, connectorEnabled, visibleCardList, storyCards, visibleCardIds, legacyLinkCount, selectedConnectionId, setSelectedConnectionId, selectedConnection, operationDraft, setOperationDraft };
}

function useGitHubSyncScopes(props: GitHubSyncPanelProps) {
  const context = useGitHubSyncSelection(props);
  const { projectId, storyMapId, storyMapVersion, selectedCardIds, cards, connectorEnabled, visibleCardList, storyCards, selectedConnectionId, selectedConnection, operationDraft } = context;
  const [review, setReview] = useState<{ plan: RemotePushPlan; request: PlanWorkItemSyncRequest; scopeKey: string }>();
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const [executionResult, setExecutionResult] = useState<{ result: RemotePushPlanResponse; scope: string; revision: number }>();
  const [incomingReview, setIncomingReview] = useState<{ command: IncomingGitHubCommandResponse; scope: string; outbound: boolean; revision: number }>();
  const [incomingFailure, setIncomingFailure] = useState<{ error: IncomingGitHubError; scope: string; revision: number }>();
  const [incomingPending, setIncomingPending] = useState(false);
  const [planMode, setPlanMode] = useState<PlanWorkItemSyncRequest["mode"]>("push");
  const planSequence = useRef(0);
  const operationPending = useRef(false);
  const reviewOrigin = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState("");
  const [savedPlanId, setSavedPlanId] = useState("");
  const [healthFilter, setHealthFilter] = useState<SyncHealthFilter>("all");
  const selectionIsExplicit = selectedCardIds !== undefined;
  const wholeMap = !selectionIsExplicit && operationDraft.cardIds.length === 0;
  const scopeIds = selectedCardIds ?? operationDraft.cardIds;
  const scopeCards = scopeIds.map((id) => cards.find((card) => card.id === id));
  const inRelease = (card: Card) => !operationDraft.releaseId || card.releaseId === operationDraft.releaseId;
  const eligibleCardIds = (wholeMap ? visibleCardList.filter((card) => card.level !== "note") : storyCards.filter((card) => scopeIds.includes(card.id))).filter(inRelease).map((card) => card.id);
  const requestCardIds = wholeMap ? undefined : [...scopeIds];
  function reviewScope(mode: PlanWorkItemSyncRequest["mode"], rootCards = cards, version = storyMapVersion) {
    const eligible = visibleCards(rootCards).filter((card) => card.level !== "note" && (wholeMap || scopeIds.includes(card.id)) && inRelease(card)).map((card) => card.id);
    return JSON.stringify([storyMapId, connectorEnabled, selectedConnection, operationDraft, selectedCardIds, mode, eligible, version, rootCards.map((card) => [card.id, card.version]), epoch, restorePending]);
  }
  const scopeKey = reviewScope(planMode);
  const resultScope = JSON.stringify([projectId, storyMapId, selectedConnectionId, selectedConnection, connectorEnabled, selectedCardIds, operationDraft, epoch]);
  const currentResultScope = useRef(resultScope);
  const interactionRevision = useRef(0);
  if (currentResultScope.current !== resultScope) { currentResultScope.current = resultScope; interactionRevision.current += 1; }
  const currentScopeKey = useRef(scopeKey);
  if (currentScopeKey.current !== scopeKey) {
    currentScopeKey.current = scopeKey;
    planSequence.current += 1;
  }
  useEffect(() => setReview(undefined), [scopeKey]);
  const plan = review?.scopeKey === scopeKey ? review.plan : undefined;
  return { ...context, review, setReview, epoch, restorePending, executionResult, setExecutionResult, incomingReview, setIncomingReview, incomingFailure, setIncomingFailure, incomingPending, setIncomingPending, setPlanMode, planSequence, operationPending, reviewOrigin, message, setMessage, savedPlanId, setSavedPlanId, healthFilter, setHealthFilter, selectionIsExplicit, scopeIds, scopeCards, eligibleCardIds, requestCardIds, scopeKey, resultScope, currentResultScope, interactionRevision, currentScopeKey, plan };
}

function useGitHubPushPlanning(props: GitHubSyncPanelProps) {
  const context = useGitHubSyncScopes(props);
  const { storyMapId, defaultConnectionId, queryClient, connections, selectedConnectionId, setSelectedConnectionId, setReview, planSequence, operationPending, setMessage, scopeKey, currentResultScope, interactionRevision, currentScopeKey } = context;

  useEffect(() => {
    const availableConnections = connections.data?.connections ?? [];
    const initialConnection = availableConnections.find((connection) => connection.id === defaultConnectionId) ?? availableConnections[0];
    if (!selectedConnectionId && initialConnection) setSelectedConnectionId(initialConnection.id);
  }, [connections.data?.connections, defaultConnectionId, selectedConnectionId]);

  const invalidate = () => invalidateRemotePushQueries(queryClient, storyMapId);

  function currentResult(input: ReviewedScope): boolean {
    const live = useLiveInteractionStore.getState();
    return input.scope === currentResultScope.current && input.reviewedEpoch === live.epoch && input.revision === interactionRevision.current && !live.restorePending;
  }

  const buildPlan = useMutation({
    mutationFn: async ({ request, scopeKey, sequence, reviewedEpoch, revision }: { request: PlanWorkItemSyncRequest; scopeKey: string; sequence: number; reviewedEpoch: string | undefined; revision: number }) => {
      if (scopeKey !== currentScopeKey.current || sequence !== planSequence.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch || revision !== interactionRevision.current || useLiveInteractionStore.getState().restorePending) throw new Error(remotePushStrings.scopeChanged);
      const response = await api.planWorkItemSync(request);
      return { ...response, request, scopeKey, sequence, reviewedEpoch, revision };
    },
    onSuccess: (result) => {
      if (result.revision !== interactionRevision.current || (result.scopeKey !== currentScopeKey.current || result.sequence !== planSequence.current) || result.reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
      if (!("id" in result.plan)) { setMessage(panelStrings.planFailed); return; }
      setReview({ plan: result.plan, request: result.request, scopeKey: result.scopeKey });
      setMessage(panelStrings.workItemsPlanned(result.plan.items.length));
    },
    onError: (error, input) => { if (input.scopeKey === currentScopeKey.current && input.sequence === planSequence.current && input.reviewedEpoch === useLiveInteractionStore.getState().epoch && input.revision === interactionRevision.current && !useLiveInteractionStore.getState().restorePending) setMessage(error.message); },
    onSettled: () => { operationPending.current = false; }
  });
  return { ...context, invalidate, currentResult, buildPlan };
}

function useGitHubPushExecution(props: GitHubSyncPanelProps) {
  const context = useGitHubPushPlanning(props);
  const { projectId, storyMapId, selectedConnectionId, operationDraft, setReview, setExecutionResult, operationPending, setMessage, requestCardIds, currentScopeKey, plan, invalidate, currentResult } = context;
  const pushWorkItems = useMutation({
    mutationFn: async ({ planId, resume, ...input }: { planId: string; resume: boolean } & ReviewedScope) => {
      if (!currentResult(input)) throw new Error(remotePushStrings.scopeChanged);
      return { result: await (resume ? api.resumeRemotePushPlan(planId) : api.confirmRemotePushPlan(planId)), ...input };
    },
    onSuccess: ({ result, ...input }) => {
      if (!currentResult(input)) return;
      const { scope } = input;
      setExecutionResult({ result, scope, revision: input.revision });
      setMessage(result.execution.status === "completed" ? remotePushStrings.completed : remotePushStrings.interrupted);
      setReview(undefined);
      invalidate();
    },
    onError: (error, input) => { if (currentResult(input)) setMessage(error.message); },
    onSettled: () => { operationPending.current = false; }
  });
  const readPlan = useMutation({
    mutationFn: async ({ planId, ...input }: { planId: string } & ReviewedScope) => {
      if (!currentResult(input)) throw new Error(remotePushStrings.scopeChanged);
      return { result: await api.readRemotePushPlan(planId), ...input };
    },
    onSuccess: ({ result, ...input }) => {
      if (!currentResult(input)) return;
      const { scope, reviewedEpoch } = input;
      const plan = result.plan;
      const selection = JSON.stringify({ cardIds: requestCardIds?.slice().sort(), releaseId: operationDraft.releaseId || undefined });
      const savedSelection = JSON.stringify({ cardIds: plan.selection.cardIds?.slice().sort(), releaseId: plan.selection.releaseId });
      if (plan.storyMapId !== storyMapId || plan.projectId !== projectId || plan.connectionId !== selectedConnectionId || reviewedEpoch && plan.epoch !== reviewedEpoch || selection !== savedSelection) { setMessage(remotePushStrings.scopeChanged); return; }
      if (result.execution.status === "reviewed") setReview({ plan, request: { storyMapId: plan.storyMapId, connectionId: plan.connectionId, mode: "push", ...plan.selection }, scopeKey: currentScopeKey.current });
      else setExecutionResult({ result, scope, revision: input.revision });
    },
    onError: (error, input) => { if (currentResult(input)) setMessage(error.message); },
    onSettled: () => { operationPending.current = false; }
  });
  return { ...context, pushWorkItems, readPlan };
}

function useGitHubIncomingPlanning(props: GitHubSyncPanelProps) {
  const context = useGitHubPushExecution(props);
  const { storyMapId, setReview, setExecutionResult, setIncomingReview, setIncomingFailure, operationPending, setMessage, currentResultScope, interactionRevision, currentScopeKey, invalidate, currentResult } = context;
  const prepareIncoming = useMutation({
    mutationFn: async ({ execute, outbound, ...input }: { execute: () => Promise<IncomingGitHubCommandResponse>; outbound: boolean } & ReviewedScope) => {
      if (!currentResult(input)) throw new Error(remotePushStrings.scopeChanged);
      return { command: await execute(), outbound, ...input };
    },
    onSuccess: ({ command, outbound, ...input }) => {
      if (!currentResult(input)) return;
      setIncomingReview({ command, scope: input.scope, outbound, revision: input.revision });
      setMessage(incomingGitHubStrings.review);
    },
    onError: (error, input) => {
      if (!currentResult(input)) return;
      const { scope } = input;
      setMessage(error.message);
      if (error instanceof IncomingGitHubError) setIncomingFailure({ error, scope, revision: input.revision });
    },
    onSettled: () => { operationPending.current = false; }
  });
  const resolveConflict = useMutation({
    mutationKey: ["github-incoming-write", storyMapId],
    meta: { ownsConflict: true },
    mutationFn: async ({ conflict, reviewed, resolution, scope, reviewedEpoch, revision }: { conflict: SyncConflict; reviewed: ReviewedSyncValues; resolution: "local" | "remote"; scope: string; reviewedEpoch: string | undefined; revision: number }) => {
      if (scope !== currentResultScope.current || revision !== interactionRevision.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) throw new Error(remotePushStrings.scopeChanged);
      return { result: await api.resolveSyncConflict(conflict.id, { storyMapId: storyMapId ?? "", resolution, reviewed: { localValue: reviewed.localValue, remoteValue: reviewed.remoteValue }, apply: false }), scope, reviewedEpoch, revision };
    },
    onSuccess: ({ result, scope, reviewedEpoch, revision }) => {
      if (scope !== currentResultScope.current || revision !== interactionRevision.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
      if ("changeSetId" in result) {
        setIncomingReview({ command: { ...result, items: result.items ?? [] }, scope, outbound: false, revision });
        setMessage(incomingGitHubStrings.review);
      } else if ("plan" in result) {
        setReview({ plan: result.plan, request: { storyMapId: result.plan.storyMapId, connectionId: result.plan.connectionId, mode: "push", ...result.plan.selection }, scopeKey: currentScopeKey.current });
        setExecutionResult(undefined);
      } else void invalidate();
    },
    onSettled: () => { operationPending.current = false; }
  });
  return { ...context, prepareIncoming, resolveConflict };
}

function useGitHubSyncAvailability(props: GitHubSyncPanelProps) {
  const context = useGitHubIncomingPlanning(props);
  const { projectId, storyMapId, storyMapVersion, queryClient, connectorEnabled, selectedConnectionId, selectedConnection, setReview, setExecutionResult, setIncomingReview, setIncomingFailure, incomingPending, planSequence, setMessage, currentResultScope, interactionRevision, currentScopeKey, invalidate, buildPlan, pushWorkItems, readPlan, prepareIncoming, resolveConflict } = context;
  const setDefaultConnection = useMutation({
    mutationFn: () => {
      if (!storyMapId || !selectedConnectionId) throw new Error(panelStrings.connectionIsRequired);
      return api.updateStoryMap(storyMapId, { defaultConnectionId: selectedConnectionId }, storyMapVersion);
    },
    onSuccess: () => {
      setMessage(panelStrings.defaultConnectionSetForThisStoryMap);
      invalidate();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.updateFailed)
  });

  const selectedConnectionReadOnly = selectedConnection?.readOnly ?? true;
  const canWriteGitHub = Boolean(connectorEnabled && selectedConnectionId && storyMapId && !selectedConnectionReadOnly);
  const connectionParams = projectId ? { projectId } : undefined;

  const incomingWritePending = () => queryClient.isMutating({ mutationKey: ["github-incoming-write", storyMapId], exact: true }) > 0;
  const sharedIncomingPending = useIsMutating({ mutationKey: ["github-incoming-write", storyMapId], exact: true }) > 0;
  const busy = sharedIncomingPending || resolveConflict.isPending || readPlan.isPending || buildPlan.isPending || pushWorkItems.isPending || prepareIncoming.isPending || incomingPending;

  function invalidateScope() {
    planSequence.current += 1;
    interactionRevision.current += 1;
    currentScopeKey.current = "";
    currentResultScope.current = "";
    setReview(undefined);
    setExecutionResult(undefined);
    setIncomingReview(undefined);
    setIncomingFailure(undefined);
  }
  return { ...context, setDefaultConnection, selectedConnectionReadOnly, canWriteGitHub, connectionParams, incomingWritePending, busy, invalidateScope };
}

function useGitHubPushActions(props: GitHubSyncPanelProps) {
  const context = useGitHubSyncAvailability(props);
  const { storyMapId, storyMapVersion, selectedCardIds, cards, connectorEnabled, selectedConnectionId, selectedConnection, operationDraft, review, setReview, epoch, restorePending, setExecutionResult, setPlanMode, planSequence, operationPending, reviewOrigin, eligibleCardIds, requestCardIds, scopeKey, resultScope, interactionRevision, currentScopeKey, plan, buildPlan, pushWorkItems, canWriteGitHub, incomingWritePending, busy } = context;

  function requestPlan(mode: PlanWorkItemSyncRequest["mode"], origin?: HTMLElement) {
    if (currentScopeKey.current !== scopeKey || !storyMapId || !selectedConnectionId || !connectorEnabled || restorePending || busy || incomingWritePending() || operationPending.current || (mode !== "import" && (!canWriteGitHub || (eligibleCardIds.length === 0 && !operationDraft.releaseId)))) return;
    operationPending.current = true;
    reviewOrigin.current = origin ?? null;
    setReview(undefined);
    setExecutionResult(undefined);
    setPlanMode(mode);
    const request: PlanWorkItemSyncRequest = mode !== "import"
      ? { storyMapId, connectionId: selectedConnectionId, cardIds: requestCardIds, releaseId: operationDraft.releaseId || undefined, mode }
      : { storyMapId, connectionId: selectedConnectionId, query: operationDraft.query || undefined, mode };
    const nextScopeKey = JSON.stringify([storyMapId, connectorEnabled, selectedConnection, operationDraft, selectedCardIds, mode, eligibleCardIds, storyMapVersion, cards.map((card) => [card.id, card.version]), epoch, restorePending]);
    currentScopeKey.current = nextScopeKey;
    buildPlan.mutate({ request, scopeKey: nextScopeKey, sequence: ++planSequence.current, reviewedEpoch: epoch, revision: interactionRevision.current });
  }

  function pushReviewedPlan() {
    if (!canWriteGitHub || restorePending || busy || incomingWritePending() || operationPending.current || !review || review.scopeKey !== currentScopeKey.current || !plan || !("id" in plan) || plan.blockers.length > 0) return;
    operationPending.current = true;
    pushWorkItems.mutate({ planId: plan.id, resume: false, scope: resultScope, reviewedEpoch: epoch, revision: interactionRevision.current });
  }
  return { ...context, requestPlan, pushReviewedPlan };
}

function useGitHubQuickActions(props: GitHubSyncPanelProps) {
  const context = useGitHubPushActions(props);
  const { projectId, storyMapId, storyMapVersion, selectedCardIds, cards, connections, connectorEnabled, setSelectedConnectionId, operationDraft, setOperationDraft, setReview, epoch, restorePending, setExecutionResult, setIncomingFailure, setPlanMode, planSequence, operationPending, reviewOrigin, currentResultScope, interactionRevision, currentScopeKey, buildPlan, prepareIncoming, incomingWritePending, busy } = context;

  function quickReview(link: RemoteWorkItemLink, mode: "push" | "sync" = "push") {
    if (!storyMapId || !link.cardId || busy || incomingWritePending() || operationPending.current || restorePending) return;
    const connection = connections.data?.connections.find((row) => row.id === link.connectionId);
    if (!connection) return;
    reviewOrigin.current = null;
    const draft = { ...operationDraft, cardIds: [link.cardId], releaseId: "" };
    const eligible = [link.cardId];
    const nextScopeKey = JSON.stringify([storyMapId, connectorEnabled, connection, draft, selectedCardIds, mode, eligible, storyMapVersion, cards.map((card) => [card.id, card.version]), epoch, restorePending]);
    setOperationDraft(draft);
    setSelectedConnectionId(connection.id);
    setPlanMode(mode);
    setReview(undefined);
    setExecutionResult(undefined);
    currentScopeKey.current = nextScopeKey;
    const nextResultScope = JSON.stringify([projectId, storyMapId, connection.id, connection, connectorEnabled, selectedCardIds, draft, epoch]);
    if (currentResultScope.current !== nextResultScope) { currentResultScope.current = nextResultScope; interactionRevision.current += 1; }
    operationPending.current = true;
    setIncomingFailure(undefined);
    if (mode === "sync") prepareIncoming.mutate({ execute: () => api.syncWorkItems({ storyMapId, connectionId: connection.id, cardIds: eligible, confirm: true, apply: false }), scope: nextResultScope, outbound: !connection.readOnly, reviewedEpoch: epoch, revision: interactionRevision.current });
    else buildPlan.mutate({ request: { storyMapId, connectionId: connection.id, cardIds: eligible, mode }, scopeKey: nextScopeKey, sequence: ++planSequence.current, reviewedEpoch: epoch, revision: interactionRevision.current });
  }
  return { ...context, quickReview };
}

function useGitHubConflictActions(props: GitHubSyncPanelProps) {
  const context = useGitHubQuickActions(props);
  const { projectId, storyMapId, storyMapVersion, selectedCardIds, cards, connections, connectorEnabled, visibleCardIds, setSelectedConnectionId, operationDraft, setOperationDraft, setReview, epoch, restorePending, executionResult, setExecutionResult, setIncomingReview, setPlanMode, operationPending, reviewOrigin, resultScope, currentResultScope, interactionRevision, currentScopeKey, pushWorkItems, resolveConflict, incomingWritePending, busy } = context;

  async function resolveReviewedConflict(conflict: SyncConflict, reviewed: ReviewedSyncValues, resolution: "local" | "remote", origin: HTMLElement) {
    const connection = connections.data?.connections.find((row) => row.id === conflict.connectionId);
    if (!storyMapId || !connectorEnabled || !connection || !conflict.cardId || !visibleCardIds.has(conflict.cardId) || resolution === "local" && connection.readOnly || restorePending || busy || incomingWritePending() || operationPending.current || epoch !== useLiveInteractionStore.getState().epoch) return;
    operationPending.current = true;
    reviewOrigin.current = origin;
    const draft = { ...operationDraft, cardIds: [conflict.cardId], releaseId: "" };
    const nextScopeKey = JSON.stringify([storyMapId, connectorEnabled, connection, draft, selectedCardIds, "push", [conflict.cardId], storyMapVersion, cards.map((card) => [card.id, card.version]), epoch, restorePending]);
    const nextResultScope = JSON.stringify([projectId, storyMapId, connection.id, connection, connectorEnabled, selectedCardIds, draft, epoch]);
    setOperationDraft(draft);
    setSelectedConnectionId(connection.id);
    setPlanMode("push");
    setReview(undefined);
    setIncomingReview(undefined);
    setExecutionResult(undefined);
    currentScopeKey.current = nextScopeKey;
    if (currentResultScope.current !== nextResultScope) { currentResultScope.current = nextResultScope; interactionRevision.current += 1; }
    const revision = interactionRevision.current;
    try {
      return await resolveConflict.mutateAsync({ conflict, reviewed, resolution, scope: nextResultScope, reviewedEpoch: epoch, revision });
    } catch (error) {
      if (nextResultScope === currentResultScope.current && revision === interactionRevision.current && epoch === useLiveInteractionStore.getState().epoch && !useLiveInteractionStore.getState().restorePending) throw error;
    }
  }

  function resumeReviewedPlan() {
    if (!executionResult || executionResult.scope !== resultScope || executionResult.revision !== interactionRevision.current || busy || incomingWritePending() || operationPending.current || restorePending) return;
    operationPending.current = true;
    pushWorkItems.mutate({ planId: executionResult.result.plan.id, resume: true, scope: resultScope, reviewedEpoch: epoch, revision: interactionRevision.current });
  }
  return { ...context, resolveReviewedConflict, resumeReviewedPlan };
}

function useGitHubIncomingActions(props: GitHubSyncPanelProps) {
  const context = useGitHubConflictActions(props);
  const { storyMapId, connectorEnabled, selectedConnectionId, operationDraft, setReview, epoch, restorePending, setExecutionResult, setIncomingReview, setIncomingFailure, operationPending, requestCardIds, resultScope, interactionRevision, prepareIncoming, canWriteGitHub, incomingWritePending, busy } = context;

  function incomingAction(mode: "import" | "sync" | "pull") {
    if (!connectorEnabled || !storyMapId || busy || incomingWritePending() || operationPending.current || restorePending || mode !== "pull" && !selectedConnectionId) return;
    operationPending.current = true;
    setReview(undefined);
    setExecutionResult(undefined);
    setIncomingReview(undefined);
    setIncomingFailure(undefined);
    const execute = mode === "import"
      ? () => api.importWorkItems({ storyMapId, connectionId: selectedConnectionId, query: operationDraft.query || undefined, apply: false })
      : mode === "pull" ? () => api.pullStoryMapWorkItems({ storyMapId, confirm: true, apply: false })
        : () => api.syncWorkItems({ storyMapId, connectionId: selectedConnectionId, cardIds: requestCardIds, releaseId: operationDraft.releaseId || undefined, confirm: true, apply: false });
    prepareIncoming.mutate({ execute, scope: resultScope, outbound: mode !== "pull" && canWriteGitHub, reviewedEpoch: epoch, revision: interactionRevision.current });
  }
  return { ...context, incomingAction };
}

function renderGitHubCardPicker(model: ReturnType<typeof useGitHubSyncPanelState>) {
  const { storyCards, operationDraft, invalidateScope, setOperationDraft } = model;
  return <div className="card-pick-list">
    {storyCards.map((card) => (
      <label key={card.id} className="checkbox-row">
        <input
          type="checkbox"
          checked={operationDraft.cardIds.includes(card.id)}
          onChange={(event) => {
            invalidateScope(); setOperationDraft((draft) => ({
              ...draft,
              cardIds: event.target.checked ? [...draft.cardIds, card.id] : draft.cardIds.filter((id) => id !== card.id)
            }));
          }}
        />
        {card.key} {card.title}
      </label>
    ))}
  </div>;
}

function renderGitHubSyncForm(model: ReturnType<typeof useGitHubSyncPanelState>) {
  const { selectedConnectionId, invalidateScope, setSelectedConnectionId, connections, selectionIsExplicit, storyMapId, defaultConnectionId, setDefaultConnection, operationDraft, setOperationDraft, releases, scopeIds, eligibleCardIds, scopeCards, requestPlan, canWriteGitHub, busy, incomingAction, connectorEnabled, pushReviewedPlan, plan, restorePending, selectedConnectionReadOnly } = model;
  return <section className="github-form form-stack">
    <h3>{panelStrings.syncThisStoryMap}</h3>
    <label>
      {panelStrings.connectionForThisStoryMap}<select value={selectedConnectionId} onChange={(event) => { invalidateScope(); setSelectedConnectionId(event.target.value); }}>
        <option value="">{panelStrings.selectConnection}</option>
        {(connections.data?.connections ?? []).map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
      </select>
    </label>
    {!selectionIsExplicit ? <button type="button" className="secondary" title={panelStrings.defaultConnectionHint} disabled={!selectedConnectionId || !storyMapId || selectedConnectionId === defaultConnectionId || setDefaultConnection.isPending} onClick={() => setDefaultConnection.mutate()}>{selectedConnectionId === defaultConnectionId ? panelStrings.defaultConnection : panelStrings.useAsDefaultForThisStoryMap}</button> : null}
    <label>
      {panelStrings.release}<select value={operationDraft.releaseId} onChange={(event) => { invalidateScope(); setOperationDraft((draft) => ({ ...draft, releaseId: event.target.value })); }}>
        <option value="">{panelStrings.allStories}</option>
        {releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
      </select>
    </label>
    {!selectionIsExplicit ? <label>{panelStrings.importQuery}<input value={operationDraft.query} onChange={(event) => { invalidateScope(); setOperationDraft((draft) => ({ ...draft, query: event.target.value })); }} placeholder={panelStrings.optionalTitleFilterSearch} /></label> : null}
    {selectionIsExplicit ? <section aria-label={githubSyncSelectionStrings.scope}>
      <p role="status">{githubSyncSelectionStrings.count(scopeIds.length, eligibleCardIds.length)}</p>
      <ul>{scopeIds.map((id, index) => <li key={id}>{scopeCards[index] ? `${scopeCards[index]!.key} ${scopeCards[index]!.title}` : id}{eligibleCardIds.includes(id) ? "" : githubSyncSelectionStrings.excludedSuffix}</li>)}</ul>
    </section> : null}
    {!selectionIsExplicit ? renderGitHubCardPicker(model) : null}
    <div className="button-row">
      <p className="section-hint">{selectionIsExplicit ? githubSyncSelectionStrings.operationsHint : panelStrings.syncOperationsHint}</p>
      <button type="button" title={panelStrings.planHint} onClick={(event) => requestPlan("push", event.currentTarget)} disabled={!canWriteGitHub || (eligibleCardIds.length === 0 && !operationDraft.releaseId) || busy}>
        <GitBranch size={16} /> {panelStrings.plan}</button>
      {!selectionIsExplicit ? <button type="button" className="secondary" title={panelStrings.previewImportHint} onClick={() => incomingAction("import")} disabled={!connectorEnabled || !selectedConnectionId || !storyMapId || busy}>
        <Download size={16} /> {panelStrings.previewImport}</button> : null}
      <button type="button" title={panelStrings.pushHint} onClick={pushReviewedPlan} disabled={!canWriteGitHub || !plan || !("id" in plan) || plan.blockers.length > 0 || restorePending || busy}>
        <Play size={16} /> {panelStrings.push}</button>
      {!selectionIsExplicit ? <button type="button" title={selectedConnectionReadOnly ? panelStrings.pullHint : panelStrings.syncHint} onClick={() => incomingAction("sync")} disabled={!connectorEnabled || !selectedConnectionId || !storyMapId || eligibleCardIds.length === 0 || busy}>
        <RefreshCcw size={16} /> {selectedConnectionReadOnly ? panelStrings.pull : panelStrings.sync}
      </button> : null}
    </div>
  </section>;
}

function renderGitHubHealthToolbar(model: ReturnType<typeof useGitHubSyncPanelState>) {
  const { health, healthFilter, setHealthFilter, selectionIsExplicit, incomingAction, storyMapId, busy } = model;
  return <div className="sync-health-toolbar button-row">
    <span>{panelStrings.lastRun}{health.data?.lastRun ? `${health.data.lastRun.mode} ${health.data.lastRun.status}` : panelStrings.noRun}</span>
    <select aria-label={githubSyncSelectionStrings.syncState} value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as SyncHealthFilter)}>
      <option value="all">{panelStrings.allStates}</option>
      <option value="synced">{panelStrings.synced}</option>
      <option value="unsynced">{panelStrings.unsynced}</option>
      <option value="stale">{panelStrings.stale}</option>
      <option value="conflict">{panelStrings.conflict}</option>
      <option value="remote_deleted">{panelStrings.remoteDeleted}</option>
      <option value="local_deleted">{panelStrings.localDeleted}</option>
    </select>
    {!selectionIsExplicit ? <button type="button" className="secondary" title={panelStrings.pullAllHint} onClick={() => incomingAction("pull")} disabled={!storyMapId || (health.data?.totalLinks ?? 0) === 0 || busy}>
      <RefreshCcw size={16} /> {panelStrings.pullAllGitHubLinks}</button> : null}
  </div>;
}

function renderGitHubSyncHeading(model: ReturnType<typeof useGitHubSyncPanelState>) {
  const { storyMapName, connectionParams, storyMapId } = model;
  return <div className="panel-heading-row">
    <div>
      <h2>{panelStrings.gitHubSync}</h2>
      <p className="muted">{panelStrings.storyMap}{storyMapName}</p>
    </div>
    <div className="button-row compact">
      {connectionParams && storyMapId ? <Link className="button-link secondary" to="/projects/$projectId/github" params={connectionParams} search={{ storyMapId }}><Settings size={16} /> {panelStrings.manageConnections}</Link> : null}
    </div>
  </div>;
}
