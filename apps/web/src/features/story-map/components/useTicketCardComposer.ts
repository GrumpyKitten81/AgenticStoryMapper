import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseGitHubTicketSelector, type CreateCardRequest, type LookupGitHubTicketResponse, type IncomingGitHubCommandResponse, type StoryMapSnapshot, type StoredChangeSet } from "@storymapper/contracts";
import { api, useConnectorConnections, useSafetySettings } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { invalidateCardReports } from "@storymapper/web/features/story-map/card-query-invalidation";
import { ticketComposerStrings as strings } from "@storymapper/web/ui-strings/ticket-composer";

export function useTicketCardComposer(props: { snapshot: StoryMapSnapshot; request: CreateCardRequest; onCreated: () => void; admitWrite: () => boolean; onPendingChange: (pending: boolean) => void; disabled: boolean }) {
  const { snapshot, request, admitWrite, onPendingChange, disabled, client, projectId, connections, safety, live, available, setConnectionId, selectedId, connection, selector, setSelector, connectOpen, setConnectOpen, lookup, setLookup, review, setReview, message, setMessage, lookingUp, textReviewed, setTextReviewed, reviewPending, setReviewPending, writeLock, mutationKey, sharedPending, placement, enabled, session, scope, commandScope, current, isCurrent, sessionCurrent, invalidate, cancelLookup, findTicket, refreshQueries, finishCreated } = useTicketLookupActions(props);
  const create = useMutation({
    mutationKey,
    mutationFn: () => {
      if (!lookup || !isCurrent(lookup.scope) || !textReviewed) throw new Error(strings.stale);
      return api.importGitHubTicket({ storyMapId: snapshot.storyMap.id, connectionId: selectedId, selector, placement, reviewEvidence: lookup.data.reviewEvidence, title: request.title, description: request.description ?? "", ...(request.status === undefined ? {} : { status: request.status }), ...(request.estimate === undefined ? {} : { estimate: request.estimate }), apply: true });
    },
    onSuccess: async (result) => {
      if (!isCurrent(scope) || current.current.commandScope !== commandScope) { if (result.outcome === "applied") await refreshQueries(); return; }
      if (result.outcome === "already_linked") { setLookup({ scope, data: { ...lookup!.data, existingCardId: result.cardId } }); setMessage(strings.duplicate); return; }
      if (result.outcome === "applied") { await finishCreated(session); return; }
      setReview({ command: result, scope: commandScope, session }); setMessage(strings.proposed);
    },
    onError: (error) => { if (isCurrent(scope)) setMessage(error.message); },
    onSettled: () => { writeLock.current = false; onPendingChange(false); }
  });
  function createLinked() {
    if (connections.isFetching || safety.isFetching || writeLock.current || client.isMutating({ mutationKey, exact: true }) || !lookup || !isCurrent(lookup.scope) || !textReviewed || !request.title.trim() || lookup.data.existingCardId) return;
    if (!admitWrite()) return;
    writeLock.current = true; onPendingChange(true); setMessage(""); create.mutate();
  }
  function onApplied(applied: StoredChangeSet) {
    if (!review || current.current.session !== review.session || !sessionCurrent() || useLiveInteractionStore.getState().restorePending) return;
    const createdCard = review.command.changeSet.operations.find((operation) => operation.op === "create" && operation.entity === "card");
    const execution = applied.execution;
    const created = createdCard && execution?.selectedOperationIds.includes(createdCard.operationId) && execution.operationResults.some((result) => result.operationId === createdCard.operationId && result.entityIds.length > 0);
    if (created) void finishCreated(review.session);
    else { setMessage(strings.appliedWithoutCard); setTextReviewed(false); }
  }
  const freshLookup = lookup && lookup.scope === scope && !live.restorePending ? lookup.data : undefined;
  const currentReview = review && review.scope === commandScope ? review : undefined;
  return { connections, safety, projectId, available, connection, selectedId, selector, setSelector: (value: string) => { invalidate(); setSelector(value); }, setConnectionId: (value: string) => { invalidate(); setConnectionId(value); }, connectOpen, setConnectOpen, enabled, lookup: freshLookup, stale: Boolean((lookup && !freshLookup) || (review && !currentReview)), review, isReviewCurrent: () => Boolean(review && current.current.commandScope === review.scope && sessionCurrent() && !useLiveInteractionStore.getState().restorePending), onApplied, message, lookingUp, findTicket, cancelLookup, textReviewed, isLookupCurrent: () => Boolean(lookup && isCurrent(lookup.scope)), confirmText: () => { if (lookup && isCurrent(lookup.scope)) setTextReviewed(true); }, reviewPending, setReviewPending, createLinked, mutationKey, pending: disabled || create.isPending || reviewPending || sharedPending, blocked: live.restorePending || connections.isFetching || safety.isFetching, invalidate };
}

function useTicketLookupState({ snapshot, request, onCreated, admitWrite, onPendingChange, disabled }: { snapshot: StoryMapSnapshot; request: CreateCardRequest; onCreated: () => void; admitWrite: () => boolean; onPendingChange: (pending: boolean) => void; disabled: boolean }) {
  const client = useQueryClient();
  const projectId = snapshot.storyMap.projectId;
  const connections = useConnectorConnections(projectId);
  const safety = useSafetySettings(projectId);
  const live = useLiveInteractionStore();
  const available = connections.data?.connections.filter((connection) => connection.provider === "github") ?? [];
  const [connectionId, setConnectionId] = useState(snapshot.storyMap.defaultConnectionId ?? "");
  const selectedId = connectionId || (available.length === 1 ? available[0]?.id : "") || "";
  const connection = available.find((item) => item.id === selectedId);
  const [selector, setSelector] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [lookup, setLookup] = useState<{ data: LookupGitHubTicketResponse; scope: string }>();
  const [review, setReview] = useState<{ command: IncomingGitHubCommandResponse; scope: string; session: string }>();
  const [message, setMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [textReviewed, setTextReviewed] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const writeLock = useRef(false);
  const mutationKey = ["github-incoming-write", snapshot.storyMap.id];
  const sharedPending = useIsMutating({ mutationKey, exact: true }) > 0;
  const placement = { level: request.level as "activity" | "step" | "story", parentId: request.parentId ?? null, releaseId: request.releaseId ?? null, position: request.position ?? 0 };
  const enabled = safety.data?.settings.github === true;
  const session = JSON.stringify([projectId, snapshot.storyMap.id, live.epoch, live.restoreRevision, live.reviewRevision]);
  const scope = JSON.stringify([session, snapshot, connection, enabled, safety.data, selector, placement]);
  const commandScope = JSON.stringify([scope, request]);
  const current = useRef({ scope, commandScope, session });
  current.current = { scope, commandScope, session };
  return { snapshot, request, onCreated, admitWrite, onPendingChange, disabled, client, projectId, connections, safety, live, available, setConnectionId, selectedId, connection, selector, setSelector, connectOpen, setConnectOpen, lookup, setLookup, review, setReview, message, setMessage, lookingUp, setLookingUp, textReviewed, setTextReviewed, reviewPending, setReviewPending, controller, mounted, writeLock, mutationKey, sharedPending, placement, enabled, session, scope, commandScope, current };
}

function useTicketLookupActions(props: { snapshot: StoryMapSnapshot; request: CreateCardRequest; onCreated: () => void; admitWrite: () => boolean; onPendingChange: (pending: boolean) => void; disabled: boolean }) {
  const context = useTicketLookupState(props);
  const { snapshot, onCreated, disabled, client, connections, safety, live, selectedId, connection, selector, setLookup, setReview, setMessage, lookingUp, setLookingUp, setTextReviewed, controller, mounted, writeLock, sharedPending, placement, enabled, scope, current } = context;
  const isCurrent = (origin: string) => mounted.current && current.current.scope === origin && !useLiveInteractionStore.getState().restorePending && sessionCurrent();
  function sessionCurrent() {
    const latest = useLiveInteractionStore.getState();
    return latest.epoch === live.epoch && latest.restoreRevision === live.restoreRevision && latest.reviewRevision === live.reviewRevision;
  }
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { controller.current?.abort(); controller.current = undefined; setLookingUp(false); setTextReviewed(false); }, [scope]);
  function invalidate() { current.current.scope = ""; current.current.commandScope = ""; controller.current?.abort(); controller.current = undefined; setLookingUp(false); setLookup(undefined); setReview(undefined); setMessage(""); setTextReviewed(false); }
  function cancelLookup() { invalidate(); setMessage(strings.cancelled); }
  async function findTicket() {
    if (disabled || connections.isFetching || safety.isFetching || !enabled || !connection || lookingUp || controller.current || writeLock.current || sharedPending || live.restorePending) return;
    if (!parseGitHubTicketSelector(selector, connection)) { setMessage(strings.invalidSelector); return; }
    const origin = scope;
    const abort = new AbortController(); controller.current = abort;
    setLookingUp(true); setLookup(undefined); setReview(undefined); setMessage(""); setTextReviewed(false);
    try {
      const data = await api.lookupGitHubTicket({ storyMapId: snapshot.storyMap.id, connectionId: selectedId, selector, placement }, abort.signal);
      if (!abort.signal.aborted && isCurrent(origin)) { setLookup({ data, scope: origin }); setMessage(data.existingCardId ? strings.duplicate : strings.lookupSucceeded(data.ticket.number)); }
    } catch (error) {
      if (!abort.signal.aborted && isCurrent(origin)) setMessage(error instanceof Error ? error.message : strings.failed);
    } finally {
      if (controller.current === abort) { controller.current = undefined; if (mounted.current) setLookingUp(false); }
    }
  }
  const refreshQueries = () => Promise.all([client.invalidateQueries({ queryKey: ["story-map", snapshot.storyMap.id] }), client.invalidateQueries({ queryKey: ["changesets"] }), invalidateCardReports(client)]);
  async function finishCreated(originSession: string) {
    await refreshQueries();
    if (mounted.current && current.current.session === originSession && sessionCurrent() && !useLiveInteractionStore.getState().restorePending) onCreated();
  }
  return { ...context, isCurrent, sessionCurrent, invalidate, cancelLookup, findTicket, refreshQueries, finishCreated };
}
