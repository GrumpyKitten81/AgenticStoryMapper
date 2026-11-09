import type { CardType } from "@storymapper/contracts";
import { cardStatusIdentity, cardIsCompleted, localStatusOptions } from "@storymapper/web/features/story-map/status-filters";
import { includePreviewGhosts } from "@storymapper/web/features/story-map/preview-cards";
import { changeSetStrings, storyMapStrings as strings } from "@storymapper/ui-strings";
import { dependencyKeysByCard } from "@storymapper/web/components/CardDependencyBadges";
import type { ChangeSetPreviewBoard, BulkUpdateCardsRequest, Card, CardLevel, DeleteCardRequest, DeleteCardsCommand, ExternalRef, GitHubLink, RemoteWorkItemLink, MoveCardRequest, StoryMapSnapshot, UpdateCardRequest, UpdateReleaseRequest, WorkItemProvider } from "@storymapper/contracts";
import { getStoryMapColumns, visibleCards } from "@storymapper/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { conflictStrings } from "@storymapper/ui-strings";
import { useLatestVersions } from "@storymapper/web/features/conflicts";
import { invalidateCardReports } from "@storymapper/web/features/story-map/card-query-invalidation";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

import { DEFAULT_CARD_COLOR } from "@storymapper/web/features/story-map/card-visual-options";
import { defaultBoardFilters, type BoardFilters, type GitHubFilter } from "@storymapper/web/features/story-map/board-filters";

export interface MutationEpoch { epoch?: string | undefined }

export function useStoryMapBoardState(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const model = useBoardBulkActions(snapshot, projectId, preview);
  const { setBulkSelectedIds, bulkValidationError, lifecycleNotice, setLifecycleNotice, planningShowAllReleases, setPlanningShowAllReleases, filters, setFilters, bulkPatch, setBulkPatch, statusOptions, personaNamesByCardId, releaseNameById, dependencyKeys, sourceCounts, githubIssueByCardId, githubStatusByCardId, workItemProviderByCardId, externalRefsByCardId, externalRefsByReleaseId, boardCards, filtered, activities, selectedIds, selectedVisibleIds, invalidate, invalidatePlanningReports, cardVersion, createCard, updateCard, archiveCard, moveCard, createRelease, updateRelease, deleteRelease, deleteCard, deleteCards, parkCard, unparkCard, bulkUpdateCards, bulkError, toggleBulkSelection, clearFilters, runBulkUpdate } = model;

  return {
    ...boardSelectionPresentation(model, snapshot, preview),
    createCard,
    updateCard,
    archiveCard,
    moveCard,
    captureMoveVersion: cardVersion,
    createRelease,
    updateRelease,
    deleteRelease,
    deleteCard,
    deleteCards,
    parkCard,
    unparkCard,
    dependencyKeys,
    sourceCounts,
    githubIssueByCardId,
    githubStatusByCardId,
    externalRefsByCardId,
    externalRefsByReleaseId,
    workItemProviderByCardId,
    releaseNameById,
    invalidate,
    invalidatePlanningReports
  };
}

export type StoryMapBoardState = ReturnType<typeof useStoryMapBoardState>;

export const encodeFilterValue = (value: string): string => `value:${value}`;
export const decodeFilterValue = (value: string): string => value.startsWith("value:") ? value.slice(6) : value;

export function filterStoryMap(input: StoryMapFilterInput): { cards: Card[]; visibleCardIds: Set<string>; matchingCardIds: Set<string> } {
  const remoteByCard = new Map<string, RemoteWorkItemLink[]>();
  for (const link of input.remoteWorkItemLinks ?? []) if (link.cardId) remoteByCard.set(link.cardId, [...(remoteByCard.get(link.cardId) ?? []), link]);
  const releaseNameById = new Map(input.releases.map((release) => [release.id, release.name]));
  const childrenByParentId = input.cards.reduce<Record<string, Card[]>>((children, card) => {
    const key = card.parentId ?? "root";
    children[key] = [...(children[key] ?? []), card];
    return children;
  }, {});
  const priorityAllowedIds = collectPriorityAllowedIds(input.cards, childrenByParentId, input.filters.priority);
  const matchingCardIds = new Set(
    input.cards
      .filter((card) => cardMatchesFilters({
        card,
        releaseName: card.releaseId ? releaseNameById.get(card.releaseId) : undefined,
        personaNames: (input.personaLinksByCardId[card.id] ?? []).map((personaId) => input.personaById.get(personaId)?.name ?? ""),
        annotationNames: (input.annotationLinksByCardId[card.id] ?? []).map((annotationId) => input.annotationById.get(annotationId)?.name ?? ""),
        personaIds: input.personaLinksByCardId[card.id] ?? [],
        annotationIds: input.annotationLinksByCardId[card.id] ?? [],
        sourceSearchText: input.sourceSearchTextByCardId[card.id] ?? [],
        githubLinks: input.githubLinksByCardId[card.id] ?? [],
        remoteLinks: remoteByCard.get(card.id) ?? [],
        externalRefs: input.externalRefsByCardId[card.id] ?? [],
        workflowStatuses: input.workflowStatuses,
        priorityAllowedIds,
        filters: input.filters
      }))
      .map((card) => card.id)
  );
  const visibleCardIds = new Set<string>();

  function includeMatches(card: Card): boolean {
    const childMatches = (childrenByParentId[card.id] ?? []).map(includeMatches).some(Boolean);
    const directMatch = matchingCardIds.has(card.id);
    if (directMatch || childMatches) {
      visibleCardIds.add(card.id);
      return true;
    }
    return false;
  }

  for (const activity of childrenByParentId.root ?? []) includeMatches(activity);
  return { cards: input.cards.filter((card) => visibleCardIds.has(card.id)), visibleCardIds, matchingCardIds };
}

function cardMatchesFilters(input: {
  card: Card;
  releaseName: string | undefined;
  personaNames: string[];
  annotationNames: string[];
  personaIds: string[];
  annotationIds: string[];
  sourceSearchText: string[];
  githubLinks: GitHubLink[];
  remoteLinks: RemoteWorkItemLink[];
  externalRefs: ExternalRef[];
  workflowStatuses?: StoryMapSnapshot["workflowStatuses"] | undefined;
  priorityAllowedIds: Set<string> | null;
  filters: BoardFilters;
}): boolean {
  const { card, filters } = input;
  const statusKey = cardStatusIdentity(card, input.remoteLinks, input.workflowStatuses ?? []);
  if (filters.hideCompleted && cardIsCompleted(card, input.remoteLinks, input.workflowStatuses ?? [])) return false;
  if (filters.statuses?.length && (filters.statusMode === "exclude" ? filters.statuses.includes(statusKey) : !filters.statuses.includes(statusKey))) return false;
  const search = filters.search.trim().toLowerCase();
  const sourceText = input.sourceSearchText.join(" ");
  const remoteText = input.remoteLinks.map((link) => `${link.provider} ${link.remoteId} ${link.remoteNumber ?? ""} ${link.url} ${link.syncState}`).join(" ");
  const githubLinks = input.githubLinks;
  const githubText = input.githubLinks.map((link) => `${link.repo} ${link.issueNumber ?? ""} ${link.url} ${link.milestone ?? ""} ${link.syncState}`).join(" ");
  const externalRefText = input.externalRefs.map((ref) => `${ref.system}:${ref.externalId}`).join(" ");
  const haystack = [card.key, card.title, card.description, card.status, input.releaseName ?? "", isPersonasEnabled ? input.personaNames.join(" ") : "", input.annotationNames.join(" "), sourceText, githubText, remoteText, externalRefText].join(" ").toLowerCase();

  if (search && !haystack.includes(search)) return false;
  if (filters.color !== "all" && (card.color ?? DEFAULT_CARD_COLOR) !== decodeFilterValue(filters.color)) return false;
  if (filters.level !== "all" && card.level !== filters.level) return false;
  if (input.priorityAllowedIds && !input.priorityAllowedIds.has(card.id)) return false;
  if (filters.release === "unscheduled" && card.releaseId !== null) return false;
  if (filters.release !== "all" && filters.release !== "unscheduled" && card.releaseId !== decodeFilterValue(filters.release)) return false;
  if (filters.source === "linked" && input.sourceSearchText.length === 0) return false;
  if (filters.source === "unlinked" && input.sourceSearchText.length > 0) return false;
  if (filters.github === "linked" && githubLinks.length === 0) return false;
  if (filters.github === "unlinked" && githubLinks.length > 0) return false;
  if (filters.github !== "all" && filters.github !== "linked" && filters.github !== "unlinked" && !githubLinks.some((link) => link.syncState === filters.github)) return false;
  if (filters.estimate === "estimated" && (card.estimate === undefined || card.estimate === null)) return false;
  if (filters.estimate === "unestimated" && card.estimate !== undefined && card.estimate !== null) return false;
  if (isPersonasEnabled && filters.persona === "none" && input.personaIds.length > 0) return false;
  if (isPersonasEnabled && filters.persona !== "all" && filters.persona !== "none" && !input.personaIds.includes(decodeFilterValue(filters.persona))) return false;
  if (filters.annotation === "none" && input.annotationIds.length > 0) return false;
  if (filters.annotation !== "all" && filters.annotation !== "none" && !input.annotationIds.includes(decodeFilterValue(filters.annotation))) return false;
  return true;
}

function collectPriorityAllowedIds(cards: Card[], childrenByParentId: Record<string, Card[]>, priority: BoardFilters["priority"]): Set<string> | null {
  if (priority === "all") return null;
  const threshold = Number(priority);
  const allowed = new Set<string>();
  const addSubtree = (card: Card): void => {
    if (card.level === "note" || allowed.has(card.id)) return;
    allowed.add(card.id);
    for (const child of childrenByParentId[card.id] ?? []) addSubtree(child);
  };
  for (const card of cards) {
    if (card.level !== "note" && card.priority && Number(card.priority) <= threshold) addSubtree(card);
  }
  return allowed;
}

function groupExternalRefs(refs: ExternalRef[], entityType: ExternalRef["entityType"]): Record<string, ExternalRef[]> {
  return refs.reduce<Record<string, ExternalRef[]>>((grouped, ref) => {
    if (ref.entityType === entityType && ref.system !== "github") grouped[ref.entityId] = [...(grouped[ref.entityId] ?? []), ref];
    return grouped;
  }, {});
}

function groupLinksByCard<T extends { cardId: string } & Record<string, unknown>>(links: T[]): Record<string, string[]> {
  return links.reduce<Record<string, string[]>>((groups, link) => {
    const linkedId = "personaId" in link ? String(link.personaId) : String(link.annotationId);
    groups[link.cardId] = [...(groups[link.cardId] ?? []), linkedId];
    return groups;
  }, {});
}

function useBoardPresentationState(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const queryClient = useQueryClient();
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const selectionMap = useRef(snapshot.storyMap.id);
  const [bulkValidationError, setBulkValidationError] = useState("");
  const [lifecycleNotice, setLifecycleNotice] = useState("");
  const [planningShowAllReleases, setPlanningShowAllReleases] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(defaultBoardFilters);
  const [bulkPatch, setBulkPatch] = useState({
    cardType: "" as CardType | "" | "__none",
    status: "",
    releaseId: "",
    estimate: "",
    color: "",
    addPersonaId: "",
    removePersonaId: "",
    addAnnotationId: "",
    removeAnnotationId: ""
  });
  const statusOptions = useMemo(() => localStatusOptions(snapshot), [snapshot.workflowStatuses, snapshot.cards]);
  const personaById = useMemo(() => new Map(snapshot.personas.map((persona) => [persona.id, persona])), [snapshot.personas]);
  const annotationById = useMemo(() => new Map(snapshot.annotations.map((annotation) => [annotation.id, annotation])), [snapshot.annotations]);
  const personaLinksByCardId = useMemo(() => groupLinksByCard(snapshot.cardPersonas), [snapshot.cardPersonas]);
  const personaNamesByCardId = useMemo(() => isPersonasEnabled ? Object.fromEntries(Object.entries(personaLinksByCardId).map(([cardId, ids]) => [cardId, ids.map((id) => personaById.get(id)!.name)])) : {}, [personaLinksByCardId, personaById]);
  const annotationLinksByCardId = useMemo(() => groupLinksByCard(snapshot.cardAnnotations), [snapshot.cardAnnotations]);
  const releaseNameById = useMemo(() => new Map(snapshot.releases.map((release) => [release.id, release.name])), [snapshot.releases]);
  const dependencyKeys = useMemo(() => dependencyKeysByCard(snapshot), [snapshot.cards, snapshot.cardDependencies]);
  const sourceCounts = useMemo(() => {
    return snapshot.sourceLinks.reduce<Record<string, number>>((counts, link) => {
      counts[link.cardId] = (counts[link.cardId] ?? 0) + 1;
      return counts;
    }, {});
  }, [snapshot.sourceLinks]);
  return { queryClient, bulkSelectedIds, setBulkSelectedIds, selectionMap, bulkValidationError, setBulkValidationError, lifecycleNotice, setLifecycleNotice, planningShowAllReleases, setPlanningShowAllReleases, filters, setFilters, bulkPatch, setBulkPatch, statusOptions, personaById, annotationById, personaLinksByCardId, personaNamesByCardId, annotationLinksByCardId, releaseNameById, dependencyKeys, sourceCounts };
}

function useBoardLinkIndexes(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardPresentationState(snapshot, projectId, preview);
  const githubIssueByCardId = useMemo(() => {
    return snapshot.githubLinks.reduce<Record<string, number>>((issues, link) => {
      if (link.cardId && link.issueNumber) issues[link.cardId] = link.issueNumber;
      return issues;
    }, {});
  }, [snapshot.githubLinks]);
  const githubStatusByCardId = useMemo(() => {
    return snapshot.githubLinks.reduce<Record<string, string>>((states, link) => {
      if (link.cardId) states[link.cardId] = link.syncState;
      return states;
    }, {});
  }, [snapshot.githubLinks]);
  const workItemProviderByCardId = useMemo(() => {
    const providers: Record<string, WorkItemProvider> = {};
    for (const link of snapshot.githubLinks) {
      if (link.cardId) providers[link.cardId] = "github";
    }
    return providers;
  }, [snapshot.githubLinks]);
  const githubLinksByCardId = useMemo(() => {
    return snapshot.githubLinks.reduce<Record<string, GitHubLink[]>>((links, link) => {
      if (link.cardId) links[link.cardId] = [...(links[link.cardId] ?? []), link];
      return links;
    }, {});
  }, [snapshot.githubLinks]);
  const externalRefsByCardId = useMemo(() => groupExternalRefs(snapshot.externalRefs, "card"), [snapshot.externalRefs]);
  const externalRefsByReleaseId = useMemo(() => groupExternalRefs(snapshot.externalRefs, "release"), [snapshot.externalRefs]);
  const sourceSearchTextByCardId = useMemo(() => {
    const chunkById = new Map(snapshot.sourceChunks.map((chunk) => [chunk.id, chunk]));
    return snapshot.sourceLinks.reduce<Record<string, string[]>>((links, link) => {
      const chunk = link.kind === "chunk" ? chunkById.get(link.chunkId) : undefined;
      links[link.cardId] = [
        ...(links[link.cardId] ?? []),
        link.kind === "chunk" ? chunk ? `${chunk.locator} ${chunk.heading ?? ""} ${chunk.text}` : link.chunkId : link.kind === "note" ? link.note : `${link.repoFullName} ${link.issueNumber} ${link.url}`
      ];
      return links;
    }, {});
  }, [snapshot.sourceChunks, snapshot.sourceLinks]);
  const boardCards = useMemo(() => preview ? includePreviewGhosts(snapshot.cards, preview) : visibleCards(snapshot.cards), [snapshot.cards, preview]);
  return { ...context, githubIssueByCardId, githubStatusByCardId, workItemProviderByCardId, githubLinksByCardId, externalRefsByCardId, externalRefsByReleaseId, sourceSearchTextByCardId, boardCards };
}

function useBoardFilteredCards(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardLinkIndexes(snapshot, projectId, preview);
  const { queryClient, bulkSelectedIds, selectionMap, filters, personaById, annotationById, personaLinksByCardId, annotationLinksByCardId, githubLinksByCardId, externalRefsByCardId, sourceSearchTextByCardId, boardCards } = context;
  const filtered = useMemo(() => filterStoryMap({
    workflowStatuses: snapshot.workflowStatuses,
    cards: boardCards,
    releases: snapshot.releases,
    personaById,
    annotationById,
    personaLinksByCardId,
    annotationLinksByCardId,
    sourceSearchTextByCardId,
    githubLinksByCardId,
    externalRefsByCardId,
    remoteWorkItemLinks: snapshot.remoteWorkItemLinks,
    filters
  }), [annotationById, annotationLinksByCardId, externalRefsByCardId, filters, githubLinksByCardId, personaById, personaLinksByCardId, boardCards, snapshot.releases, snapshot.remoteWorkItemLinks, sourceSearchTextByCardId]);
  const activities = useMemo(() => preview ? filtered.cards.filter((card) => card.level === "activity" && card.parentId === null).sort((left, right) => left.position - right.position) : getStoryMapColumns(filtered.cards), [filtered.cards, preview]);
  const selectedIds = useMemo(() => {
    if (selectionMap.current !== snapshot.storyMap.id || preview) return new Set<string>();
    const eligible = new Set(boardCards.map((card) => card.id));
    return new Set([...bulkSelectedIds].filter((id) => eligible.has(id)));
  }, [bulkSelectedIds, boardCards, snapshot.storyMap.id, preview]);
  const selectedVisibleIds = useMemo(() => {
    const visible = new Set<string>();
    for (const cardId of selectedIds) {
      if (filtered.visibleCardIds.has(cardId)) visible.add(cardId);
    }
    return visible;
  }, [selectedIds, filtered.visibleCardIds]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["story-map", snapshot.storyMap.id] });
  const invalidatePlanningReports = () => invalidateCardReports(queryClient);
  const afterCardChange = () => Promise.all([invalidate(), invalidatePlanningReports()]);
  const moveFocusFrame = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (moveFocusFrame.current !== undefined) cancelAnimationFrame(moveFocusFrame.current); }, []);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const boardScope = { id: `board:${snapshot.storyMap.id}` };
  const latest = useLatestVersions();
  const cardVersion = (cardId: string) => latest.resolve(cardId, snapshotRef.current.cards.find((card) => card.id === cardId)!.version);
  const releaseVersion = (releaseId: string) => latest.resolve(releaseId, snapshotRef.current.releases.find((release) => release.id === releaseId)!.version);
  return { ...context, filtered, activities, selectedIds, selectedVisibleIds, invalidate, invalidatePlanningReports, afterCardChange, moveFocusFrame, snapshotRef, boardScope, latest, cardVersion, releaseVersion };
}

function useBoardCardMutations(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardFilteredCards(snapshot, projectId, preview);
  const { queryClient, afterCardChange, snapshotRef, boardScope, latest, cardVersion } = context;
  const createCard = useMutation({
    mutationFn: api.createCard,
    onSuccess: () => Promise.all([
      afterCardChange(),
      queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] })
    ])
  });
  const captureEpoch = (input: MutationEpoch) => {
    input.epoch = useLiveInteractionStore.getState().epoch;
    return { epoch: input.epoch };
  };
  const requireCurrentEpoch = (input: MutationEpoch) => {
    if (input.epoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) throw new Error(conflictStrings.changed(snapshotRef.current.storyMap.name));
  };
  const updateCard = useMutation({
    scope: boardScope,
    onMutate: captureEpoch,
    mutationFn: (input: { cardId: string; patch: UpdateCardRequest; baseVersion?: number; epoch?: string | undefined }) => {
      requireCurrentEpoch(input);
      return api.updateCard(input.cardId, input.patch, input.baseVersion ?? cardVersion(input.cardId));
    },
    onSuccess: (saved, _input, context) => {
      if (context?.epoch !== useLiveInteractionStore.getState().epoch) return;
      latest.record(saved.id, saved.version);
      return afterCardChange();
    }
  });
  const archiveCard = useMutation({
    scope: boardScope, onMutate: captureEpoch, mutationFn: (input: { cardId: string } & MutationEpoch) => { requireCurrentEpoch(input); return api.archiveCard(input.cardId, cardVersion(input.cardId)); }, onSuccess: (saved, _input, context) => { if (context?.epoch !== useLiveInteractionStore.getState().epoch) return; latest.record(saved.id, saved.version); return afterCardChange(); }
  });
  return { ...context, createCard, captureEpoch, requireCurrentEpoch, updateCard, archiveCard };
}

function useBoardMoveReleaseMutations(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardCardMutations(snapshot, projectId, preview);
  const { setLifecycleNotice, afterCardChange, moveFocusFrame, snapshotRef, boardScope, latest, cardVersion, releaseVersion, captureEpoch, requireCurrentEpoch } = context;
  const moveCard = useMutation({
    scope: boardScope,
    mutationFn: (input: { cardId: string; patch: MoveCardRequest; baseVersion?: number } & MutationEpoch) => {
      requireCurrentEpoch(input);
      if (preview) throw new Error(changeSetStrings.readOnly);
      return api.moveCard(input.cardId, input.patch, input.baseVersion === undefined ? cardVersion(input.cardId) : latest.resolve(input.cardId, input.baseVersion));
    },
    onMutate: (input) => {
      const current = snapshotRef.current;
      const card = current.cards.find((card) => card.id === input.cardId)!;
      const parent = current.cards.find((card) => card.id === input.patch.parentId);
      const releaseId = input.patch.releaseId === undefined ? card.releaseId : input.patch.releaseId;
      const release = current.releases.find((release) => release.id === releaseId);
      if (input.patch.parentId && !parent) throw new Error(strings.moveUnavailableParent);
      if (releaseId && !release) throw new Error(strings.moveUnavailableRelease);
      return { ...captureEpoch(input), parent: parent?.title ?? strings.moveRoot, release: release?.name ?? strings.unscheduled };
    },
    onSuccess: async (saved, _input, destination) => {
      if (destination?.epoch !== useLiveInteractionStore.getState().epoch) return;
      latest.record(saved.id, saved.version);
      setLifecycleNotice(strings.moveCardDone(saved.key, destination!.parent, destination!.release, saved.position));
      await afterCardChange();
      moveFocusFrame.current = requestAnimationFrame(() => {
        if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) document.querySelector<HTMLButtonElement>(`button[data-card-id="${saved.id}"]`)?.focus();
      });
    }
  });
  const createRelease = useMutation({ mutationFn: api.createRelease, onSuccess: afterCardChange });
  const updateRelease = useMutation({
    scope: boardScope, onMutate: captureEpoch,
    mutationFn: (input: { releaseId: string; patch: UpdateReleaseRequest } & MutationEpoch) => { requireCurrentEpoch(input); return api.updateRelease(input.releaseId, input.patch, releaseVersion(input.releaseId)); },
    onSuccess: (saved, _input, context) => { if (context?.epoch !== useLiveInteractionStore.getState().epoch) return; latest.record(saved.id, saved.version); return afterCardChange(); }
  });
  const deleteRelease = useMutation({
    scope: boardScope, onMutate: captureEpoch, mutationFn: (input: { releaseId: string } & MutationEpoch) => { requireCurrentEpoch(input); return api.deleteRelease(input.releaseId, releaseVersion(input.releaseId)); }, onSuccess: (_saved, _input, context) => { if (context?.epoch === useLiveInteractionStore.getState().epoch) return afterCardChange(); }
  });
  return { ...context, moveCard, createRelease, updateRelease, deleteRelease };
}

function useBoardLifecycleMutations(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardMoveReleaseMutations(snapshot, projectId, preview);
  const { setBulkSelectedIds, afterCardChange, boardScope, latest, cardVersion, captureEpoch, requireCurrentEpoch } = context;
  const deleteCard = useMutation({
    scope: boardScope, onMutate: captureEpoch,
    mutationFn: (input: { cardId: string; strategy: DeleteCardRequest["strategy"] } & MutationEpoch) => { requireCurrentEpoch(input); return api.deleteCard(input.cardId, { strategy: input.strategy }, cardVersion(input.cardId)); },
    onSuccess: (_saved, _input, context) => { if (context?.epoch === useLiveInteractionStore.getState().epoch) return afterCardChange(); }
  });
  const deleteCards = useMutation({
    scope: boardScope, onMutate: captureEpoch,
    mutationFn: (input: DeleteCardsCommand & MutationEpoch) => {
      requireCurrentEpoch(input);
      if (preview) throw new Error(changeSetStrings.readOnly);
      const acknowledged = (card: DeleteCardsCommand["cards"][number]) => ({ ...card, baseVersion: latest.resolve(card.id, card.baseVersion) });
      const { epoch: _epoch, ...command } = input;
      return api.deleteCards({ ...command, cards: input.cards.map(acknowledged), affectedCards: input.affectedCards.map(acknowledged) });
    },
    onSuccess: (_saved, input, context) => { if (context?.epoch !== useLiveInteractionStore.getState().epoch) return; setBulkSelectedIds((current) => new Set([...current].filter((id) => !input.cards.some((card) => card.id === id)))); return afterCardChange(); }
  });
  const parkCard = useMutation({
    scope: boardScope, onMutate: captureEpoch,
    mutationFn: (input: { cardId: string; childStrategy: DeleteCardRequest["strategy"] } & MutationEpoch) => { requireCurrentEpoch(input); return api.parkCard(input.cardId, { childStrategy: input.childStrategy }, cardVersion(input.cardId)); },
    onSuccess: (saved, _input, context) => { if (context?.epoch !== useLiveInteractionStore.getState().epoch) return; latest.record(saved.id, saved.version); return afterCardChange(); }
  });
  const unparkCard = useMutation({
    scope: boardScope, onMutate: captureEpoch, mutationFn: (input: { cardId: string } & MutationEpoch) => { requireCurrentEpoch(input); return api.unparkCard(input.cardId, cardVersion(input.cardId)); }, onSuccess: (saved, _input, context) => { if (context?.epoch !== useLiveInteractionStore.getState().epoch) return; latest.record(saved.id, saved.version); return afterCardChange(); }
  });
  const bulkBusy = useRef(false);
  return { ...context, deleteCard, deleteCards, parkCard, unparkCard, bulkBusy };
}

function useBoardBulkMutation(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardLifecycleMutations(snapshot, projectId, preview);
  const { setBulkSelectedIds, setBulkValidationError, selectedIds, afterCardChange, boardScope, latest, cardVersion, captureEpoch, requireCurrentEpoch, bulkBusy } = context;
  const bulkUpdateCards = useMutation({
    onMutate: captureEpoch,
    onSettled: () => { bulkBusy.current = false; },
    scope: boardScope,
    mutationFn: (input: { storyMapId: string; cardIds: string[]; patch: BulkUpdateCardsRequest["patch"] } & MutationEpoch) => {
      requireCurrentEpoch(input);
      if (preview) throw new Error(changeSetStrings.readOnly);
      return api.bulkUpdateCards({ storyMapId: input.storyMapId, patch: input.patch, cards: input.cardIds.map((id) => ({ id, baseVersion: cardVersion(id) })) });
    },
    onSuccess: (saved, input, context) => {
      if (context?.epoch !== useLiveInteractionStore.getState().epoch) return;
      for (const card of saved.cards) latest.record(card.id, card.version);
      setBulkSelectedIds((current) => new Set([...current].filter((id) => !input.cardIds.includes(id))));
      return afterCardChange();
    }
  });

  const selectionKey = [...selectedIds].sort().join(",");
  useEffect(() => {
    setBulkValidationError("");
    if (!bulkBusy.current) bulkUpdateCards.reset();
  }, [selectionKey]);
  const bulkError = selectionKey === bulkUpdateCards.variables?.cardIds.slice().sort().join(",") ? bulkUpdateCards.error : null;
  return { ...context, bulkUpdateCards, bulkError };
}

function useBoardSelectionEffects(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardBulkMutation(snapshot, projectId, preview);
  const { setBulkSelectedIds, selectionMap, setBulkValidationError, setPlanningShowAllReleases, setFilters, boardCards } = context;

  useEffect(() => {
    if (selectionMap.current !== snapshot.storyMap.id) {
      selectionMap.current = snapshot.storyMap.id;
      setPlanningShowAllReleases(false);
      setBulkSelectedIds(new Set());
      setBulkValidationError("");
      return;
    }
    const eligible = new Set(boardCards.map((card) => card.id));
    setBulkSelectedIds((current) => {
      const next = new Set([...current].filter((id) => !preview && eligible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [boardCards, snapshot.storyMap.id, preview]);

  function toggleBulkSelection(cardId: string) {
    if (preview || !boardCards.some((card) => card.id === cardId)) return;
    setBulkSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function clearFilters() {
    setFilters(defaultBoardFilters);
  }
  return { ...context, toggleBulkSelection, clearFilters };
}

function useBoardBulkActions(snapshot: StoryMapSnapshot, projectId?: string, preview?: ChangeSetPreviewBoard) {
  const context = useBoardSelectionEffects(snapshot, projectId, preview);
  const { setBulkValidationError, bulkPatch, selectedIds, bulkBusy, bulkUpdateCards } = context;

  function runBulkUpdate(mode: "patch" | "archive") {
    if (preview || bulkUpdateCards.isPending || bulkBusy.current) return;
    setBulkValidationError("");
    const cardIds = [...selectedIds];
    if (cardIds.length === 0) return;
    if (mode === "archive") {
      bulkBusy.current = true;
      bulkUpdateCards.mutate({ storyMapId: snapshot.storyMap.id, cardIds, patch: { archived: true } });
      return;
    }
    const patch: Parameters<typeof bulkUpdateCards.mutate>[0]["patch"] = {};
    if (bulkPatch.cardType) patch.cardType = bulkPatch.cardType === "__none" ? null : bulkPatch.cardType;
    if (bulkPatch.status) patch.status = bulkPatch.status;
    if (bulkPatch.releaseId) patch.releaseId = bulkPatch.releaseId === "__none" ? null : decodeFilterValue(bulkPatch.releaseId);
    if (bulkPatch.estimate.trim()) {
      const estimate = Number(bulkPatch.estimate);
      if (!Number.isFinite(estimate)) { setBulkValidationError(strings.invalidCardNumber(strings.estimate)); return; }
      patch.estimate = estimate;
    }
    if (bulkPatch.color.trim()) patch.color = bulkPatch.color.trim();
    if (isPersonasEnabled && bulkPatch.addPersonaId) patch.addPersonaId = bulkPatch.addPersonaId;
    if (isPersonasEnabled && bulkPatch.removePersonaId) patch.removePersonaId = bulkPatch.removePersonaId;
    if (bulkPatch.addAnnotationId) patch.addAnnotationId = bulkPatch.addAnnotationId;
    if (bulkPatch.removeAnnotationId) patch.removeAnnotationId = bulkPatch.removeAnnotationId;
    if (Object.keys(patch).length === 0) return;
    bulkBusy.current = true;
    bulkUpdateCards.mutate({ storyMapId: snapshot.storyMap.id, cardIds, patch });
  }
  return { ...context, runBulkUpdate };
}

interface StoryMapFilterInput {
  workflowStatuses?: StoryMapSnapshot["workflowStatuses"] | undefined;
  cards: Card[];
  releases: StoryMapSnapshot["releases"];
  personaById: Map<string, StoryMapSnapshot["personas"][number]>;
  annotationById: Map<string, StoryMapSnapshot["annotations"][number]>;
  personaLinksByCardId: Record<string, string[]>;
  annotationLinksByCardId: Record<string, string[]>;
  sourceSearchTextByCardId: Record<string, string[]>;
  githubLinksByCardId: Record<string, GitHubLink[]>;
  externalRefsByCardId: Record<string, ExternalRef[]>;
  remoteWorkItemLinks?: RemoteWorkItemLink[];
  filters: BoardFilters;
}

function boardSelectionPresentation(model: ReturnType<typeof useBoardBulkActions>, snapshot: StoryMapSnapshot, preview: ChangeSetPreviewBoard | undefined) {
  const { planningShowAllReleases, setPlanningShowAllReleases, personaNamesByCardId, lifecycleNotice, setLifecycleNotice, filtered, boardCards, activities, filters, setFilters, clearFilters, statusOptions, bulkPatch, setBulkPatch, selectedVisibleIds, selectedIds, bulkUpdateCards, bulkValidationError, bulkError, setBulkSelectedIds, toggleBulkSelection, runBulkUpdate } = model;
  return {
    planningShowAllReleases,
    setPlanningShowAllReleases,
    personaNamesByCardId,
    preview,
    snapshot,
    lifecycleNotice,
    setLifecycleNotice,
    filtered,
    boardCards,
    activities,
    filters,
    setFilters,
    clearFilters,
    statusOptions,
    bulkPatch,
    setBulkPatch,
    selectedVisibleIds,
    selectedIds,
    bulkUpdateCards,
    bulkValidationError,
    bulkError,
    setBulkSelectedIds,
    toggleBulkSelection,
    runBulkUpdate,
  };
}
