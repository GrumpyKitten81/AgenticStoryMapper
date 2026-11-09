import type { QueryClient } from "@tanstack/react-query";
import { liveEventIdSchema, type LiveReset, type LiveTransaction } from "@storymapper/contracts";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";
import { createLiveAnnouncements } from "@storymapper/web/app/live/live-announcements";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { affectedLiveQueries } from "@storymapper/web/app/live/live-query-invalidation";
import { startLiveStream, type LiveConnectionState } from "@storymapper/web/app/live/live-stream";

interface LiveUpdateOptions {
  client: QueryClient;
  projectId: string | undefined;
  announce: (message: string, kind: "status" | "alert") => void;
  setFailed: (failed: boolean) => void;
  setConnection: (state: LiveConnectionState) => void;
}

interface LiveUpdateSession extends LiveUpdateOptions {
  failureTimer: ReturnType<typeof setTimeout> | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  reset: boolean;
  baseline: LiveReset | undefined;
  closed: boolean;
  generation: number;
  refetchFailed: boolean;
  activeQueries: ReturnType<typeof affectedLiveQueries> | undefined;
  metadataOnly: boolean;
  pending: Map<string, LiveTransaction>;
  announcements: ReturnType<typeof createLiveAnnouncements>;
}

type StreamMessage = Parameters<Parameters<typeof startLiveStream>[0]["receive"]>[0];

export function startLiveUpdateSession(options: LiveUpdateOptions): () => void {
  const session: LiveUpdateSession = {
    ...options,
    failureTimer: undefined,
    timer: undefined,
    reset: false,
    baseline: undefined,
    closed: false,
    generation: 0,
    refetchFailed: false,
    activeQueries: undefined,
    metadataOnly: false,
    pending: new Map(),
    announcements: createLiveAnnouncements((message) => options.announce(message, "status"))
  };
  const schedule = () => scheduleLiveUpdates(session);
  const stopStream = startLiveStream({ receive: (message) => receiveLiveUpdate(session, message), state: (state) => updateConnection(session, state) });
  const unsubscribe = useLiveInteractionStore.subscribe(schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "role", "data-live-popover"] });
  document.addEventListener("focusin", schedule, true);
  document.addEventListener("focusout", schedule, true);
  return () => {
    session.closed = true;
    const queries = session.activeQueries;
    if (queries) void session.client.cancelQueries({ predicate: (query) => queries.has(query) });
    stopStream();
    unsubscribe();
    observer.disconnect();
    document.removeEventListener("focusin", schedule, true);
    document.removeEventListener("focusout", schedule, true);
    clearTimeout(session.timer);
    clearTimeout(session.failureTimer);
    session.announcements.close();
    useLiveInteractionStore.getState().setWaiting(0);
  };
}

function reportFailure(session: LiveUpdateSession): void {
  session.setFailed(true);
}

function waiting(session: LiveUpdateSession): void {
  const changes: Record<string, number | null> = {};
  for (const { entities } of session.pending.values()) for (const { entityType, entityId, version } of entities) {
    if (entityType === "activity") continue;
    const key = `${entityType}:${entityId}`;
    changes[key] = key in changes && (changes[key] ?? 0) > (version ?? 0) ? changes[key]! : version;
  }
  useLiveInteractionStore.getState().setWaiting(Object.keys(changes).length + (session.reset ? 1 : 0), changes);
}

async function flushLiveUpdates(session: LiveUpdateSession): Promise<void> {
  session.timer = undefined;
  const pending = [...session.pending.values()];
  const changesBoard = session.reset || pending.some((transaction) => transaction.entities.some((entity) => entity.entityType !== "activity"));
  const held = changesBoard && liveUpdatesHeld(document);
  const metadataOnly = held && !reviewMetadataHeld();
  const transactions = metadataOnly ? pending.map((transaction) => ({ ...transaction, entities: transaction.entities.filter((entity) => entity.entityType === "cardReview") })).filter((transaction) => transaction.entities.length) : pending;
  if (session.closed || held && (!metadataOnly || !transactions.length)) { waiting(session); return; }
  const appliedBaseline = metadataOnly ? undefined : session.baseline;
  const queries = affectedLiveQueries(session.client, transactions, metadataOnly ? false : session.reset, session.projectId);
  if (metadataOnly) for (const query of queries) if (query.queryKey[0] !== "card-reviews") queries.delete(query);
  const discardInactiveEpochCaches = () => {
    const live = useLiveInteractionStore.getState();
    if (appliedBaseline && live.restorePending && live.epoch === appliedBaseline.epoch) {
      session.client.removeQueries({ predicate: (query) => queries.has(query) && !query.isActive() });
    }
  };
  session.generation += 1;
  const attempt = session.generation;
  session.activeQueries = queries;
  session.metadataOnly = metadataOnly;
  await session.client.cancelQueries({ predicate: (query) => queries.has(query) });
  if (session.closed || attempt !== session.generation) return;
  discardInactiveEpochCaches();
  try {
    await session.client.invalidateQueries({ predicate: (query) => queries.has(query) }, { throwOnError: true });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (!session.closed && attempt === session.generation) { session.activeQueries = undefined; session.refetchFailed = true; reportFailure(session); }
    return;
  }
  if (!session.closed && attempt === session.generation) {
    discardInactiveEpochCaches();
    session.activeQueries = undefined;
    session.setFailed(false);
    consumeTransactions(session, transactions, metadataOnly);
    if (!metadataOnly && session.baseline === appliedBaseline) { session.reset = false; session.baseline = undefined; }
    if (appliedBaseline) useLiveInteractionStore.getState().finishEpoch(appliedBaseline.epoch);
    waiting(session);
    const relevant = transactions.filter((transaction) => transaction.entities.some((entity) => entity.projectId === session.projectId));
    if (!metadataOnly || !session.pending.size && !session.reset) recordAppliedCursor(session.projectId, relevant.at(-1) ?? appliedBaseline);
    session.announcements.add(relevant);
  }
}

function recordAppliedCursor(projectId: string | undefined, applied: LiveReset | LiveTransaction | undefined): void {
  if (projectId && applied) {
    const key = `storymapper-live-applied-cursor:${projectId}`;
    const previous = liveEventIdSchema.safeParse(localStorage.getItem(key));
    if (!previous.success || previous.data.epoch !== applied.epoch || previous.data.seq < applied.seq) localStorage.setItem(key, applied.id);
  }
}

function scheduleLiveUpdates(session: LiveUpdateSession): void {
  if (session.activeQueries && (session.metadataOnly ? reviewMetadataHeld() : liveUpdatesHeld(document))) {
    const queries = session.activeQueries;
    session.activeQueries = undefined;
    session.generation += 1;
    void session.client.cancelQueries({ predicate: (query) => queries.has(query) });
    waiting(session);
  }
  if ((session.pending.size || session.reset) && !session.timer && !session.refetchFailed && !session.activeQueries) session.timer = setTimeout(() => void flushLiveUpdates(session), 100);
}

function receiveLiveUpdate(session: LiveUpdateSession, message: StreamMessage): void {
  if (message.kind === "transaction") {
    if (message.value.originClientId === getLiveClientId()) return;
    session.pending.set(message.value.id, message.value);
  } else {
    useLiveInteractionStore.getState().recordEpoch(message.value.epoch);
    if (message.kind === "reset") { session.generation += 1; session.pending.clear(); session.announcements.close(); }
    session.reset = true;
    session.baseline = message.value;
  }
  const affectsReview = message.kind !== "transaction" || message.value.entities.some((entity) => entity.entityType !== "activity" && entity.entityType !== "cardReview");
  if (affectsReview) {
    useLiveInteractionStore.getState().invalidateReviews();
    void session.client.cancelQueries({ queryKey: ["changeset-preview"] });
    void session.client.invalidateQueries({ queryKey: ["changeset-preview"], refetchType: "none" });
  }
  session.refetchFailed = false;
  if (session.activeQueries) {
    const queries = session.activeQueries;
    session.activeQueries = undefined;
    session.generation += 1;
    void session.client.cancelQueries({ predicate: (query) => queries.has(query) });
  }
  waiting(session);
  scheduleLiveUpdates(session);
}

function updateConnection(session: LiveUpdateSession, state: LiveConnectionState): void {
  session.setConnection(state);
  if (state === "connected") { clearTimeout(session.failureTimer); session.failureTimer = undefined; session.setFailed(false); }
  else if (state === "failed") { clearTimeout(session.failureTimer); reportFailure(session); }
  else if (!session.failureTimer) session.failureTimer = setTimeout(() => reportFailure(session), 30_000);
}

function reviewMetadataHeld(): boolean {
  const { manualHold, dragging, restorePending } = useLiveInteractionStore.getState();
  return manualHold || dragging || restorePending;
}

function consumeTransactions(session: LiveUpdateSession, transactions: LiveTransaction[], metadataOnly: boolean): void {
  for (const transaction of transactions) {
    const pending = session.pending.get(transaction.id)!;
    const entities = metadataOnly ? pending.entities.filter((entity) => entity.entityType !== "cardReview") : [];
    if (entities.some((entity) => entity.entityType !== "activity")) session.pending.set(transaction.id, { ...pending, entities });
    else session.pending.delete(transaction.id);
  }
}
