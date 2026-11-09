import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import type { ActivityAffectedCard, ActivityChange } from "@storymapper/contracts";
import { readChanges } from "@storymapper/web/features/what-changed/api";
import { acknowledgeTargets, captureGroups, groupChanges, isSeenStorageError, readSeen, reconcileSeen, writeSeen, type ChangeGroup, type SeenState, type TargetReceipt } from "@storymapper/web/features/what-changed/model";
import { WhatChangedDrawer } from "@storymapper/web/features/what-changed/WhatChangedDrawer";
import { whatChangedStrings as strings } from "@storymapper/ui-strings";
import "@storymapper/web/features/what-changed/what-changed.css";

interface ChangesContext { events: ActivityChange[]; cardIds: Set<string>; open: (trigger: HTMLElement) => void; error: string; confirm: (cardId: string, storyMapId: string) => void; unavailable: (cardId: string, storyMapId: string) => void; }
const Context = createContext<ChangesContext>({ events: [], cardIds: new Set(), open: () => { }, error: "", confirm: () => {}, unavailable: () => {} });
export function WhatChangedCardOpened({ cardId, storyMapId }: { cardId: string; storyMapId: string }) {
  const { confirm } = useContext(Context);
  useEffect(() => { confirm(cardId, storyMapId); }, [confirm, cardId, storyMapId]);
  return null;
}
export function WhatChangedMissingCard({ cardId, storyMapId }: { cardId: string; storyMapId: string }) {
  const { unavailable } = useContext(Context);
  useEffect(() => { unavailable(cardId, storyMapId); }, [unavailable, cardId, storyMapId]);
  return null;
}
export function useCardChangeDescription(cardId: string): string {
  const { events } = useContext(Context);
  const actors = [...new Set(events.filter((event) => event.cards?.some((card) => card.id === cardId)).map((event) => event.actor))];
  return actors.length ? strings.changedBy(actors.join(", ")) : "";
}
export function ChangedMarker({ cardId }: { cardId: string }) {
  const { cardIds } = useContext(Context);
  return cardIds.has(cardId) ? <span className="changed-marker" title={strings.changed}><span aria-hidden="true">{strings.glyph}</span>{strings.changed}</span> : null;
}
export function WhatChangedButton() {
  const { cardIds, open, error } = useContext(Context);
  return <button type="button" className="secondary" aria-label={strings.indicator(cardIds.size, Boolean(error))} title={strings.indicator(cardIds.size, Boolean(error))} onClick={(event) => open(event.currentTarget)}><Bell size={16} />{strings.indicatorCount(cardIds.size, Boolean(error))}</button>;
}
interface ProviderProps { projectId: string; storyMapId: string; preview?: string | undefined; navigateCard: (card: ActivityAffectedCard) => Promise<boolean>; children: ReactNode; }
export function WhatChangedProvider(props: ProviderProps) {
  return <ProjectChanges key={props.projectId} {...props} />;
}
function useChangesFeed(projectId: string) {
  const [stored, setStored] = useState<{ state: SeenState | null; error: string }>(() => {
    try { return { state: readSeen(localStorage, projectId), error: "" }; }
    catch (error) { if (!isSeenStorageError(error)) throw error; return { state: null, error: `${strings.storageError} ${String(error)}` }; }
  });
  const query = useQuery({ queryKey: ["activity-changes", projectId], queryFn: ({ signal }) => readChanges(projectId, signal, stored.state), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const state = useMemo(() => query.data ? reconcileSeen(stored.state, query.data) : null, [stored.state, query.data]);
  const error = stored.error || (query.error ? String(query.error) : "");
  const mark = useCallback((receipts: TargetReceipt[], epoch?: string) => {
    if (!query.data || !state || stored.error) return;
    if (epoch && epoch !== query.data.epoch) return;
    try { const next = acknowledgeTargets(state, query.data, receipts); writeSeen(localStorage, projectId, next); setStored({ state: next, error: "" }); }
    catch (error) { if (!isSeenStorageError(error)) throw error; setStored((previous) => ({ ...previous, error: `${strings.storageError} ${String(error)}` })); }
  }, [query.data, state, stored.error, projectId]);
  useEffect(() => {
    if (!query.data || !state || stored.error) return;
    const compacted = acknowledgeTargets(state, query.data, []);
    if (JSON.stringify(compacted) !== JSON.stringify(state) || stored.state && stored.state.epoch !== query.data.epoch) mark([]);
  }, [query.data, state, stored.state, stored.error, mark]);
  function retry() {
    try { setStored({ state: readSeen(localStorage, projectId), error: "" }); void query.refetch(); }
    catch (error) { if (!isSeenStorageError(error)) throw error; setStored((previous) => ({ ...previous, error: `${strings.storageError} ${String(error)}` })); }
  }
  return { query, state, error, mark, retry };
}

function ProjectChanges({ projectId, storyMapId, preview, navigateCard, children }: ProviderProps) {
  const feed = useChangesFeed(projectId);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"map" | "project">("map");
  const trigger = useRef<HTMLElement | null>(null);
  const allGroups = useMemo(() => feed.state && feed.query.data ? groupChanges(feed.state, feed.query.data.events) : [], [feed.state, feed.query.data]);
  const mapGroups = allGroups.filter((group) => group.card && (group.card.navigation?.storyMapId ?? group.card.storyMapId) === storyMapId);
  const groups = scope === "map" ? mapGroups : allGroups;
  const events = [...new Map(mapGroups.flatMap((group) => group.events).map((event) => [event.id, event])).values()];
  const cardIds = new Set(mapGroups.flatMap((group) => group.card ? [group.card.id] : []));
  const navigation = useCardNavigation({ preview, navigateCard, epoch: feed.query.data?.epoch, mark: feed.mark, hide: () => setOpen(false) });
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  const openDrawer = useCallback((element: HTMLElement) => { trigger.current = element; setOpen(true); }, []);
  const error = feed.error || navigation.error;
  const recovery = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (navigation.error && !open) recovery.current?.focus(); }, [navigation.error, open]);
  const context = { events, cardIds, error, open: openDrawer, confirm: navigation.confirm, unavailable: navigation.unavailable };
  return <Context.Provider value={context}>{children}{navigation.pending ? <p role="status">{strings.opening}</p> : null}{navigation.error && !open ? <p role="alert">{navigation.error} <button ref={recovery} type="button" className="secondary" onClick={() => { navigation.clearError(); setOpen(true); }}>{strings.returnToChanges}</button></p> : null}<WhatChangedDrawer open={open} projectId={projectId} groups={groups} scope={scope} setScope={setScope} loading={feed.query.isPending || feed.query.isFetching} error={error} close={close} mark={feed.mark} retry={() => { navigation.clearError(); feed.retry(); }} openCard={navigation.openCard} /></Context.Provider>;
}

interface NavigationOptions { preview: string | undefined; navigateCard: ProviderProps["navigateCard"]; epoch: string | undefined; mark: (receipts: TargetReceipt[], epoch?: string) => void; hide: () => void; }
function useCardNavigation({ preview, navigateCard, epoch, mark, hide }: NavigationOptions) {
  const pending = useRef<{ cardId: string; storyMapId: string; epoch: string; receipts: TargetReceipt[] } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  function fail() { pending.current = null; setOpening(false); setError(strings.openFailed); }
  const confirm = useCallback((cardId: string, mapId: string) => {
    const intent = pending.current;
    if (!intent || intent.cardId !== cardId || intent.storyMapId !== mapId) return;
    pending.current = null; setOpening(false);
    if (intent.epoch !== epoch) { setError(strings.projectChanged); return; }
    mark(intent.receipts, intent.epoch);
  }, [mark, epoch]);
  function unavailable(cardId: string, mapId: string) { if (pending.current?.cardId === cardId && pending.current.storyMapId === mapId) fail(); }
  async function openCard(group: ChangeGroup) {
    const card = group.card, target = card?.navigation;
    if (preview) { setError(strings.previewBlocked); return; }
    if (!epoch || !card || target?.availability !== "available") { fail(); return; }
    pending.current = { cardId: card.id, storyMapId: target.storyMapId, epoch, receipts: captureGroups([group]) };
    setError(""); setOpening(true); hide();
    try {
      if (!await navigateCard(card) && pending.current) fail();
    } catch (cause) { fail(); setError(`${strings.openFailed} ${String(cause)}`); }
  }
  return { pending: opening, error, confirm, unavailable, openCard, clearError: () => setError("") };
}
