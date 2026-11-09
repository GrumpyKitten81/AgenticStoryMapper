import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import { CardReviewPanel } from "@storymapper/web/features/card-review";
import { CardTypeField } from "@storymapper/web/features/card-review";
import type { ConnectorConnection } from "@storymapper/contracts";
import { GitHubCardBinding } from "@storymapper/web/features/github-sync";
import { githubStatusStrings as statusStrings } from "@storymapper/web/ui-strings/github-status";
import { ChipSection, DetailSourceSections } from "@storymapper/web/features/story-map/components/CardDetailSections";
import { makeDraft, validateNumbers, buildBreadcrumb } from "@storymapper/web/features/story-map/components/card-detail-model";
import { useManagedAnnotationSyncLocks, useSyncFieldLockHint, useSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { localStatusOptions } from "@storymapper/web/features/story-map/status-filters";
import { IncomingGitHubError } from "@storymapper/web/app/incoming-github-error";
import { IncomingGitHubResults } from "@storymapper/web/features/github-sync";
import { IncomingGitHubReview } from "@storymapper/web/features/github-sync";
import { RemotePushReview } from "@storymapper/web/features/github-sync";
import { remotePushStrings } from "@storymapper/web/ui-strings/remote-push";
import { TemplatePicker } from "@storymapper/web/features/customization";
import { CardDependenciesSection } from "@storymapper/web/features/story-map/components/CardDependenciesSection";
import { cardSchema, type Card, type CardSourceLink, type CreateCardSourceLinkRequest, type StoryMapSnapshot, type RemotePushPlan, type RemotePushPlanResponse, type IncomingGitHubCommandResponse, type UpdateCardRequest } from "@storymapper/contracts";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { RefreshCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useCardAttachments, useConnectorConnections, useProjectGitHubIssues, useSourceDocumentDetails, useSourceDocuments } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { Dialog } from "@storymapper/web/components/Dialog";
import { ChangeAlert } from "@storymapper/web/features/conflicts";
import { ConflictAlert } from "@storymapper/web/features/conflicts";
import { mergeSavedDraft } from "@storymapper/web/features/conflicts";
import { githubSyncStateHint } from "@storymapper/web/features/github-sync";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import { CARD_COLORS, CARD_PRIORITY_OPTIONS } from "@storymapper/web/features/story-map/card-visual-options";
import { DescriptionEditor } from "@storymapper/web/features/story-map/components/DescriptionEditor";
import { CardHistoryPanel } from "@storymapper/web/features/story-map/components/CardHistoryPanel";
import { LifecycleActions } from "@storymapper/web/features/story-map/components/LifecycleActions";
import { invalidateCardReports } from "@storymapper/web/features/story-map/card-query-invalidation";
import { changeSetStrings, liveUpdateStrings, storyMapStrings as strings } from "@storymapper/ui-strings";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";
import { WhatChangedCardOpened, WhatChangedMissingCard } from "@storymapper/web/features/what-changed";

interface CardDetailModalProps {
  cardId: string | undefined;
  suspended?: boolean;
  snapshot: StoryMapSnapshot;
  projectId: string | undefined;
  onNotice?: (message: string) => void;
}

export function CardDetailModal(props: CardDetailModalProps) {
  const result = useCardDetailModalState(props);
  if (result === null || !("card" in result)) return result;
  return renderCardDetailModal(result);
}

function useCardDetailModalState(props: CardDetailModalProps) {
  const model = useCardDraftSynchronization(props);
  if (!model.card) return props.cardId ? <WhatChangedMissingCard cardId={props.cardId} storyMapId={props.snapshot.storyMap.id} /> : null;
  return buildCardDetailEditor({ ...model, card: model.card });
}

function renderCardDetailModal(model: Exclude<ReturnType<typeof useCardDetailModalState>, import("react").ReactElement | null>) {
  const { card, cardId, requestClose, save, editableDirty, writesPending, restorePending, snapshot, isDirty, completeLifecycle, onNotice, saveError, breadcrumb, syncLocks, fieldLockHint, draft, setDraft, documents, selectedDocumentId, setSelectedDocumentId, linkedSourceLinks, selectedChunks, selectedChunkById, projectIssues, createSourceLink, deleteSourceLink, statusOptions, linkedPersonaIds, deletePersona, setPersona, annotationLocks, linkedAnnotationIds, deleteAnnotation, setAnnotation, linkedGitHubLinks, linkedRemoteWorkItemLinks, githubConnections, projectId, search, writableConnections, effectiveConnectionId, reviewedPushScope, currentPushScope, setConnectionChoice, setPushPreview, setPushResult, pushPreview, startCardPush, incomingFailure, pushIdentity, outgoingFailure, pushScope, incomingReviews, currentPushIdentity, suspendedRef, pushPending, hasPendingWrites, setOutgoingFailure, previewLinkedOutgoing, linkedPushPlans, createGitHubIssue, pushResult, hasWritableLink, setIncomingFailure, pullCardGitHubLinks, attachments, deleteAttachment, attachmentDraft, setAttachmentDraft, createAttachment, versionedPending, setDependencyPending, invalidate, draftRef, baseVersion, confirmation } = model;
  return <Dialog title={card.title} cardId={card.id} className="card-detail-modal" onClose={requestClose}>
      <WhatChangedCardOpened cardId={card.id} storyMapId={snapshot.storyMap.id} />
      <div className="modal-heading">
        <div>
          <span>{card.key}{" "}{strings.middleDot}{" "}{mapConceptStrings.fieldValue(mapConceptStrings.level, cardLevelMeta[card.level].label)}</span>
        </div>
        <div className="modal-heading-actions">
          <button type="button" onClick={() => save()} disabled={!editableDirty || writesPending || restorePending}>{strings.save}</button>
          <LifecycleActions card={card} snapshot={snapshot} disabled={isDirty || writesPending} onComplete={completeLifecycle} {...(onNotice ? { onNotice } : {})} />
          <button type="button" className="secondary icon-button" aria-label={strings.closeCardDetail} onClick={requestClose}><X size={17} /></button>
        </div>
      </div>
      {saveError}
      <div className="card-detail-modal-grid">
        {renderCardMainFields(model)}
        <aside className="card-detail-side">
          <label>{strings.status}<select disabled={syncLocks.has("status")} title={fieldLockHint("status")} value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          {renderGitHubStatusOwnership(card, snapshot, githubConnections)}{card.level !== "note" ? <CardTypeField value={draft.cardType} onChange={(cardType) => setDraft((value) => ({ ...value, cardType }))} /> : null}
          <label>{strings.assignee}<input placeholder={strings.unassigned} value={draft.assignee} onChange={(event) => setDraft((value) => ({ ...value, assignee: event.target.value }))} /></label>
          <label>{strings.estimateLabel(snapshot.storyMap.estimationUnit)}<input inputMode="decimal" value={draft.estimate} onChange={(event) => setDraft((value) => ({ ...value, estimate: event.target.value }))} /></label>
          <label>{strings.release}<select disabled={syncLocks.has("milestone")} title={fieldLockHint("milestone")} value={draft.releaseId} onChange={(event) => setDraft((value) => ({ ...value, releaseId: event.target.value }))}><option value="">{strings.unscheduled}</option>{snapshot.releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>
          <label>{strings.priority}<select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value }))}><option value="">{strings.emptyValue}</option>{draft.priority && !CARD_PRIORITY_OPTIONS.some((priority) => priority === draft.priority) ? <option value={draft.priority}>{draft.priority}</option> : null}{CARD_PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
          {renderCardColorField(model)}
          <label>{strings.businessValue}<input inputMode="numeric" value={draft.businessValue} onChange={(event) => setDraft((value) => ({ ...value, businessValue: event.target.value }))} /></label>
          <label>{strings.effort}<input inputMode="numeric" value={draft.effort} onChange={(event) => setDraft((value) => ({ ...value, effort: event.target.value }))} /></label>
          {isPersonasEnabled ? <ChipSection title={strings.personas} items={snapshot.personas} linkedIds={linkedPersonaIds} onToggle={(id, linked) => linked ? deletePersona.mutate({ cardId: card.id, personaId: id }) : setPersona.mutate({ cardId: card.id, personaId: id })} /> : null}
          <ChipSection disabledIds={annotationLocks} title={strings.annotations} items={snapshot.annotations} linkedIds={linkedAnnotationIds} onToggle={(id, linked) => linked ? deleteAnnotation.mutate({ cardId: card.id, annotationId: id }) : setAnnotation.mutate({ cardId: card.id, annotationId: id })} />
          {renderCardGitHubLinks(model)}
          <section className="source-link-section">
            <h2>{strings.attachments}</h2>
            {(attachments.data?.attachments ?? []).map((attachment) => <div className="source-link-row" key={attachment.id}><span>{attachment.label}{" "}{strings.separator}{" "}{attachment.filePath}</span><button type="button" className="secondary" onClick={() => deleteAttachment.mutate({ cardId: card.id, attachmentId: attachment.id })}>{strings.remove}</button></div>)}
            {(attachments.data?.attachments ?? []).length === 0 ? <p>{strings.noAttachmentsYet}</p> : null}
            <div className="attachment-form">
              <input placeholder={strings.label} value={attachmentDraft.label} onChange={(event) => setAttachmentDraft((value) => ({ ...value, label: event.target.value }))} />
              <input placeholder={strings.attachmentPathPlaceholder} value={attachmentDraft.filePath} onChange={(event) => setAttachmentDraft((value) => ({ ...value, filePath: event.target.value }))} />
              <input placeholder={strings.type} value={attachmentDraft.mimeType} onChange={(event) => setAttachmentDraft((value) => ({ ...value, mimeType: event.target.value }))} />
              <button type="button" disabled={!attachmentDraft.label.trim() || !attachmentDraft.filePath.trim()} onClick={() => createAttachment.mutate({ cardId: card.id, label: attachmentDraft.label.trim(), filePath: attachmentDraft.filePath.trim(), ...(attachmentDraft.mimeType.trim() ? { mimeType: attachmentDraft.mimeType.trim() } : {}) })}>{strings.addAttachment}</button>
            </div>
          </section>
          <CardDependenciesSection key={`dependencies:${card.id}`} card={card} snapshot={snapshot} disabled={versionedPending} onPendingChange={setDependencyPending} invalidate={invalidate} onSaved={(saved, submittedVersion) => {
            if (draftRef.current.cardId === saved.id && baseVersion.current === submittedVersion) baseVersion.current = saved.version;
          }} />
          <CardReviewPanel key={`review:${card.id}`} cardId={card.id} /><CardHistoryPanel key={card.id} cardId={card.id} />
        </aside>
      </div>
      {confirmation}
    </Dialog>;
}

function useCardDetailDraft({ cardId, snapshot, projectId, onNotice, suspended = false }: CardDetailModalProps) {
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { card?: string };
  const currentCard = useMemo(() => snapshot.cards.find((item) => item.id === cardId) ?? null, [cardId, snapshot.cards]);
  const retainedCard = useRef(currentCard);
  if (currentCard || retainedCard.current?.id !== cardId) retainedCard.current = currentCard;
  const card = currentCard ?? retainedCard.current;
  const syncLocks = useSyncFieldLocks(card?.id);
  const annotationLocks = useManagedAnnotationSyncLocks(new Set(card ? [card.id] : []));
  const lockHint = useSyncFieldLockHint();
  const fieldLockHint = (field: "title" | "description" | "status" | "labels" | "milestone") => lockHint(card?.id, field);
  const statusOptions = useMemo(() => localStatusOptions(snapshot), [snapshot.workflowStatuses, snapshot.cards]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [attachmentDraft, setAttachmentDraft] = useState({ label: "", filePath: "", mimeType: "" });
  const documents = useSourceDocuments(projectId);
  const projectIssues = useProjectGitHubIssues(card ? projectId ?? snapshot.storyMap.projectId : undefined);
  const selectedDocument = useSourceDocumentDetails(selectedDocumentId || undefined);
  const attachments = useCardAttachments(card?.id);
  const [draft, setDraft] = useState(() => makeDraft(card));
  const baseline = useRef(makeDraft(card));
  const baseVersion = useRef(card?.version ?? 0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const [dependencyPending, setDependencyPending] = useState(false);
  const remoteVersion = useLiveInteractionStore((state) => card ? state.pendingChanges[`card:${card.id}`] : undefined);
  const [keptRemote, setKeptRemote] = useState("");
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);
  const editableDirty = Object.entries(draft).some(([field, value]) => value !== baseline.current[field as keyof typeof draft] && !syncLocks.has((field === "releaseId" ? "milestone" : field) as "title" | "description" | "status" | "milestone"));
  return { cardId, snapshot, projectId, onNotice, suspended, suspendedRef, queryClient, navigate, router, search, card, syncLocks, annotationLocks, fieldLockHint, statusOptions, selectedDocumentId, setSelectedDocumentId, attachmentDraft, setAttachmentDraft, documents, projectIssues, selectedDocument, attachments, draft, setDraft, baseline, baseVersion, draftRef, closeConfirm, setCloseConfirm, validationError, setValidationError, dependencyPending, setDependencyPending, remoteVersion, keptRemote, setKeptRemote, isDirty, editableDirty };
}

function useCardDetailGitHubScope(props: CardDetailModalProps) {
  const context = useCardDetailDraft(props);
  const { snapshot, projectId, card, selectedDocument } = context;
  const selectedChunks = selectedDocument.data?.chunks ?? [];
  const selectedChunkById = new Map([...snapshot.sourceChunks, ...selectedChunks].map((chunk) => [chunk.id, chunk]));
  const linkedSourceLinks = card ? snapshot.sourceLinks.filter((link) => link.cardId === card.id) : [];
  const linkedGitHubLinks = card ? snapshot.githubLinks.filter((link) => link.cardId === card.id) : [];
  const linkedRemoteWorkItemLinks = card ? snapshot.remoteWorkItemLinks.filter((link) => link.cardId === card.id) : [];
  const linkedPersonaIds = new Set(card ? snapshot.cardPersonas.filter((link) => link.cardId === card.id).map((link) => link.personaId) : []);
  const linkedAnnotationIds = new Set(card ? snapshot.cardAnnotations.filter((link) => link.cardId === card.id).map((link) => link.annotationId) : []);
  const connections = useConnectorConnections(projectId);
  const githubConnections = (connections.data?.connections ?? []).filter((connection) => connection.provider === "github");
  const writableConnections = githubConnections.filter((connection) => !connection.readOnly);
  const defaultConnectionId = snapshot.storyMap.defaultConnectionId ?? "";
  const [connectionChoice, setConnectionChoice] = useState<string>("");
  const [pushPreview, setPushPreview] = useState<RemotePushPlan | null>(null);
  const [pushResult, setPushResult] = useState<RemotePushPlanResponse | null>(null);
  const [linkedPushPlans, setLinkedPushPlans] = useState<RemotePushPlan[]>([]);
  const [incomingReviews, setIncomingReviews] = useState<Array<{ command: IncomingGitHubCommandResponse; connectionId: string; identity: string }>>([]);
  const [incomingFailure, setIncomingFailure] = useState<{ error: Error; identity: string }>();
  const [outgoingFailure, setOutgoingFailure] = useState<{ error: Error; identity: string; scope: string }>();
  const pushPending = useRef(false);
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const effectiveConnectionId = connectionChoice
    || (writableConnections.some((connection) => connection.id === defaultConnectionId) ? defaultConnectionId : writableConnections[0]?.id)
    || "";
  const scopeForSnapshot = (root: StoryMapSnapshot) => JSON.stringify([epoch, root.storyMap.id, card?.id, root.cards.find((item) => item.id === card?.id)?.version, root.storyMap.version, effectiveConnectionId, githubConnections]);
  const pushScope = scopeForSnapshot(snapshot);
  const currentPushScope = useRef(pushScope);
  currentPushScope.current = pushScope;
  const reviewedPushScope = useRef<string | undefined>(undefined);
  const pushIdentity = JSON.stringify([epoch, snapshot.storyMap.id, card?.id, effectiveConnectionId, githubConnections]);
  const currentPushIdentity = useRef(pushIdentity);
  currentPushIdentity.current = pushIdentity;
  useEffect(() => { if (reviewedPushScope.current !== pushScope) { setPushPreview(null); setLinkedPushPlans([]); } }, [pushScope]);
  useEffect(() => setPushResult(null), [pushIdentity]);
  const hasWritableLink = linkedRemoteWorkItemLinks.some((link) => {
    const connection = (connections.data?.connections ?? []).find((candidate) => candidate.id === link.connectionId);
    return connection ? !connection.readOnly : false;
  });
  return { ...context, selectedChunks, selectedChunkById, linkedSourceLinks, linkedGitHubLinks, linkedRemoteWorkItemLinks, linkedPersonaIds, linkedAnnotationIds, githubConnections, writableConnections, setConnectionChoice, pushPreview, setPushPreview, pushResult, setPushResult, linkedPushPlans, setLinkedPushPlans, incomingReviews, setIncomingReviews, incomingFailure, setIncomingFailure, outgoingFailure, setOutgoingFailure, pushPending, epoch, restorePending, effectiveConnectionId, pushScope, currentPushScope, reviewedPushScope, pushIdentity, currentPushIdentity, hasWritableLink };
}

function useCardDetailUpdate(props: CardDetailModalProps) {
  const context = useCardDetailGitHubScope(props);
  const { cardId, snapshot, suspendedRef, queryClient, card, setDraft, baseline, baseVersion, draftRef, dependencyPending, epoch } = context;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["story-map", snapshot.storyMap.id] }),
      queryClient.invalidateQueries({ queryKey: ["github-links"] }),
      invalidateCardReports(queryClient)
    ]);
  };
  const updateCard = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: (input: { cardId: string; baseVersion: number; patch: UpdateCardRequest; submitted: ReturnType<typeof makeDraft>; baseline: ReturnType<typeof makeDraft>; reviewedEpoch: string | undefined }) => {
      if (input.reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending || suspendedRef.current) throw new Error(changeSetStrings.readOnly);
      return api.updateCard(input.cardId, input.patch, input.baseVersion);
    },
    meta: { ownsConflict: true },
    onSuccess: async (response, input) => {
      if (input.reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
      await invalidate();
      if (input.reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending || draftRef.current.cardId !== input.cardId) return;
      const saved = makeDraft(response);
      baseline.current = saved;
      baseVersion.current = response.version;
      setDraft((value) => mergeSavedDraft(value, input.submitted, input.baseline, saved, input.patch));
    }
  });
  const currentUpdateError = updateCard.variables?.reviewedEpoch === epoch ? updateCard.error : null;
  const dependencyMutations = useIsMutating({ mutationKey: ["card-dependencies", card?.id], exact: true });
  const versionedPending = updateCard.isPending || dependencyPending || dependencyMutations > 0;
  const pendingNavigation = useRef<((blocked: boolean) => void) | null>(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  return { ...context, invalidate, updateCard, currentUpdateError, versionedPending, pendingNavigation, navigationBlocked, setNavigationBlocked };
}

function useCardNavigationActions(props: CardDetailModalProps) {
  const context = useCardDetailUpdate(props);
  const { suspendedRef, queryClient, navigate, search, card, dependencyPending } = context;
  function hasPendingWrites() {
    return dependencyPending || queryClient.isMutating({ mutationKey: ["card-dependencies", card?.id], exact: true }) > 0
      || queryClient.isMutating({ mutationKey: ["card-owned-write", card?.id], exact: true }) > 0;
  }

  function close() {
    if (suspendedRef.current) return;
    const next = { ...search };
    delete next.card;
    void (navigate as (options: unknown) => Promise<void>)({ search: next, ignoreBlocker: true });
  }
  return { ...context, hasPendingWrites, close };
}

function useCardNavigationBlocker(props: CardDetailModalProps) {
  const context = useCardNavigationActions(props);
  const { snapshot, projectId, router, card, closeConfirm, setCloseConfirm, isDirty, pendingNavigation, navigationBlocked, setNavigationBlocked, hasPendingWrites } = context;
  useBlocker({
    enableBeforeUnload: () => Boolean(card && (isDirty || hasPendingWrites())),
    shouldBlockFn: ({ next }) => {
      if (pendingNavigation.current) {
        settleRefusedNavigation();
        return true;
      }
      const sameEditor = "storyMapId" in next.params && next.params.storyMapId === snapshot.storyMap.id
        && "projectId" in next.params && next.params.projectId === projectId
        && "card" in next.search && next.search.card === card?.id;
      if (!card || !(isDirty || hasPendingWrites()) || sameEditor) return false;
      return new Promise<boolean>((resolve) => {
        pendingNavigation.current = resolve;
        setNavigationBlocked(true);
      });
    }
  });
  const confirming = closeConfirm || navigationBlocked;
  function resolveNavigation(blocked: boolean) {
    const resolve = pendingNavigation.current;
    pendingNavigation.current = null;
    setNavigationBlocked(false);
    resolve?.(blocked);
    if (blocked && resolve) settleRefusedNavigation();
  }
  function settleRefusedNavigation() {
    // DESIGN: TanStack settles commit promises in load(); refused history writes emit no load event.
    void router.load();
  }
  function cancelClose() {
    resolveNavigation(true);
    setCloseConfirm(false);
  }
  return { ...context, confirming, resolveNavigation, cancelClose };
}

function useCardEvidenceMutations(props: CardDetailModalProps) {
  const context = useCardNavigationBlocker(props);
  const { cardId, queryClient, card, selectedDocumentId, setCloseConfirm, invalidate, pendingNavigation, hasPendingWrites, close, resolveNavigation } = context;
  function finishClose() {
    if (hasPendingWrites()) return;
    setCloseConfirm(false);
    if (pendingNavigation.current) resolveNavigation(false);
    else close();
  }
  const createSourceLink = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: (input: { cardId: string; evidence: CreateCardSourceLinkRequest }) => api.createCardSourceLink(input.cardId, input.evidence),
    onSuccess: () => {
      invalidate();
      if (selectedDocumentId) queryClient.invalidateQueries({ queryKey: ["source-document", selectedDocumentId] });
    }
  });
  const deleteSourceLink = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: (input: { cardId: string; evidence: Pick<CardSourceLink, "kind" | "id"> }) => api.deleteCardSourceLink(input.cardId, input.evidence),
    onSuccess: () => {
      invalidate();
      if (selectedDocumentId) queryClient.invalidateQueries({ queryKey: ["source-document", selectedDocumentId] });
    }
  });
  const setPersona = useMutation({ mutationKey: ["card-owned-write", card?.id], mutationFn: (input: { cardId: string; personaId: string }) => api.setCardPersona(input.cardId, input.personaId), onSuccess: invalidate });
  const deletePersona = useMutation({ mutationKey: ["card-owned-write", card?.id], mutationFn: (input: { cardId: string; personaId: string }) => api.deleteCardPersona(input.cardId, input.personaId), onSuccess: invalidate });
  const setAnnotation = useMutation({ mutationKey: ["card-owned-write", card?.id], mutationFn: (input: { cardId: string; annotationId: string }) => api.setCardAnnotation(input.cardId, input.annotationId), onSuccess: invalidate });
  const deleteAnnotation = useMutation({ mutationKey: ["card-owned-write", card?.id], mutationFn: (input: { cardId: string; annotationId: string }) => api.deleteCardAnnotation(input.cardId, input.annotationId), onSuccess: invalidate });
  return { ...context, finishClose, createSourceLink, deleteSourceLink, setPersona, deletePersona, setAnnotation, deleteAnnotation };
}

function useCardAttachmentMutations(props: CardDetailModalProps) {
  const context = useCardEvidenceMutations(props);
  const { cardId, queryClient, card, setAttachmentDraft, invalidate } = context;
  const createAttachment = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: (input: { cardId: string; label: string; filePath: string; mimeType?: string }) => api.createCardAttachment(input.cardId, {
      label: input.label,
      filePath: input.filePath,
      ...(input.mimeType ? { mimeType: input.mimeType } : {})
    }),
    onSuccess: () => {
      setAttachmentDraft({ label: "", filePath: "", mimeType: "" });
      if (card?.id) queryClient.invalidateQueries({ queryKey: ["card-attachments", card.id] });
      invalidate();
    }
  });
  const deleteAttachment = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: (input: { cardId: string; attachmentId: string }) => api.deleteCardAttachment(input.cardId, input.attachmentId),
    onSuccess: () => {
      if (card?.id) queryClient.invalidateQueries({ queryKey: ["card-attachments", card.id] });
      invalidate();
    }
  });
  return { ...context, createAttachment, deleteAttachment };
}

function useCardIncomingSync(props: CardDetailModalProps) {
  const context = useCardAttachmentMutations(props);
  const { snapshot, suspendedRef, card, linkedRemoteWorkItemLinks, setLinkedPushPlans, setIncomingReviews, setIncomingFailure, pushPending, pushScope, currentPushScope, currentPushIdentity } = context;
  const pullCardGitHubLinks = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: async (requestedIdentity: string) => {
      if (requestedIdentity !== currentPushIdentity.current) throw new Error(remotePushStrings.scopeChanged);
      if (!card) throw new Error(strings.cardRequired);
      if (currentPushScope.current !== pushScope) throw new Error(remotePushStrings.scopeChanged);
      const connectionIds = [...new Set(linkedRemoteWorkItemLinks.map((link) => link.connectionId))];
      const identity = currentPushIdentity.current;
      const reviewedEpoch = useLiveInteractionStore.getState().epoch;
      const commands: Array<{ command: IncomingGitHubCommandResponse; connectionId: string; identity: string }> = [];
      const assertScope = () => {
        if (identity !== currentPushIdentity.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending || suspendedRef.current) throw new Error(remotePushStrings.scopeChanged);
      };
      assertScope();
      for (const connectionId of connectionIds) {
        const command = await api.syncWorkItems({ storyMapId: snapshot.storyMap.id, connectionId, cardIds: [card.id], confirm: true, apply: false });
        assertScope();
        commands.push({ command, connectionId, identity });
      }
      return { commands, identity, reviewedEpoch };
    },
    onSuccess: ({ commands, identity, reviewedEpoch }) => {
      if (identity !== currentPushIdentity.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
      setIncomingReviews(commands);
      setLinkedPushPlans([]);
    },
    onError: (error, identity) => {
      if (identity === currentPushIdentity.current && !useLiveInteractionStore.getState().restorePending) setIncomingFailure({ error, identity });
    },
    onSettled: () => { pushPending.current = false; }
  });
  return { ...context, pullCardGitHubLinks };
}

function useCardOutgoingReview(props: CardDetailModalProps) {
  const context = useCardIncomingSync(props);
  const { snapshot, suspendedRef, card, setPushPreview, setPushResult, setLinkedPushPlans, setOutgoingFailure, pushPending, effectiveConnectionId, pushScope, currentPushScope, reviewedPushScope, currentPushIdentity } = context;
  const previewLinkedOutgoing = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: async ({ connectionId, scope, identity }: { connectionId: string; scope: string; identity: string }) => {
      if (!card || scope !== currentPushScope.current || identity !== currentPushIdentity.current || suspendedRef.current || useLiveInteractionStore.getState().restorePending) throw new Error(remotePushStrings.scopeChanged);
      const response = await api.planWorkItemSync({ storyMapId: snapshot.storyMap.id, connectionId, cardIds: [card.id], mode: "sync" });
      return { ...response, scope, identity };
    },
    onSuccess: ({ plan, scope, identity }) => {
      if (scope !== currentPushScope.current || identity !== currentPushIdentity.current || useLiveInteractionStore.getState().restorePending || !("id" in plan)) return;
      reviewedPushScope.current = scope;
      setLinkedPushPlans((plans) => [...plans.filter((row) => row.connectionId !== plan.connectionId), plan]);
    },
    onError: (error, { identity, scope }) => {
      if (identity === currentPushIdentity.current && scope === currentPushScope.current && !useLiveInteractionStore.getState().restorePending) setOutgoingFailure({ error, identity, scope });
    },
    onSettled: () => { pushPending.current = false; }
  });
  const previewGitHubIssue = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: async () => {
      if (!card || !effectiveConnectionId) throw new Error(strings.connectionRequired);
      if (currentPushScope.current !== pushScope) throw new Error(remotePushStrings.scopeChanged);
      if (useLiveInteractionStore.getState().restorePending || suspendedRef.current) throw new Error(remotePushStrings.scopeChanged);
      const scope = currentPushScope.current;
      const reviewedEpoch = useLiveInteractionStore.getState().epoch;
      return { ...(await api.planWorkItemSync({ storyMapId: snapshot.storyMap.id, connectionId: effectiveConnectionId, cardIds: [card.id], mode: "push" })), scope, reviewedEpoch };
    },
    onSuccess: (result) => {
      if (result.scope !== currentPushScope.current || result.reviewedEpoch !== useLiveInteractionStore.getState().epoch || !("id" in result.plan)) return;
      reviewedPushScope.current = result.scope;
      setPushPreview(result.plan);
      setPushResult(null);
    },
    onSettled: () => { pushPending.current = false; }
  });
  return { ...context, previewLinkedOutgoing, previewGitHubIssue };
}

function useCardOutgoingExecution(props: CardDetailModalProps) {
  const context = useCardOutgoingReview(props);
  const { suspendedRef, card, pushPreview, setPushPreview, pushResult, setPushResult, setLinkedPushPlans, pushPending, epoch, pushScope, currentPushScope, reviewedPushScope, currentPushIdentity, invalidate, versionedPending, hasPendingWrites, previewGitHubIssue } = context;
  const createGitHubIssue = useMutation({
    mutationKey: ["card-owned-write", card?.id],
    mutationFn: async ({ plan, resume }: { plan: RemotePushPlan; resume: boolean }) => {
      const scope = currentPushScope.current;
      const identity = currentPushIdentity.current;
      const reviewedEpoch = epoch;
      if (scope !== pushScope || (!resume && reviewedPushScope.current !== scope) || useLiveInteractionStore.getState().epoch !== reviewedEpoch || useLiveInteractionStore.getState().restorePending || suspendedRef.current) throw new Error(remotePushStrings.scopeChanged);
      return { result: await (resume ? api.resumeRemotePushPlan(plan.id) : api.confirmRemotePushPlan(plan.id)), scope, identity, reviewedEpoch };
    },
    onSuccess: ({ result, scope, identity, reviewedEpoch }) => {
      if (identity !== currentPushIdentity.current || reviewedEpoch !== useLiveInteractionStore.getState().epoch) return;
      setPushPreview(null);
      setLinkedPushPlans((plans) => plans.filter((plan) => plan.id !== result.plan.id));
      setPushResult(result);
      invalidate();
    },
    onSettled: () => { pushPending.current = false; }
  });
  function startCardPush(resume = false) {
    if (pushPending.current || hasPendingWrites() || suspendedRef.current || currentPushScope.current !== pushScope) return;
    pushPending.current = true;
    if (resume || pushPreview) {
      const plan = resume ? pushResult?.plan : pushPreview;
      if (!plan) { pushPending.current = false; return; }
      createGitHubIssue.mutate({ plan, resume });
    }
    else previewGitHubIssue.mutate();
  }

  const ownedMutations = useIsMutating({ mutationKey: ["card-owned-write", card?.id], exact: true });
  const writesPending = versionedPending || ownedMutations > 0;
  return { ...context, createGitHubIssue, startCardPush, writesPending };
}

function useCardDraftSynchronization(props: CardDetailModalProps) {
  const context = useCardOutgoingExecution(props);
  const { card, setDraft, baseline, baseVersion, draftRef, setCloseConfirm, setValidationError, setConnectionChoice, setPushPreview } = context;

  useEffect(() => {
    const next = makeDraft(card);
    if (baseline.current.cardId === next.cardId && JSON.stringify(draftRef.current) !== JSON.stringify(baseline.current)) return;
    baseline.current = next;
    baseVersion.current = card?.version ?? 0;
    setDraft(next);
    setPushPreview(null);
    setConnectionChoice("");
    setCloseConfirm(false);
    setValidationError(undefined);
  }, [card]);

  return { ...context };
}

function buildCardDetailEditor(props: ReturnType<typeof useCardDraftSynchronization> & { card: Card }) {
  const context = buildCardSaveFeedback(props);
  const { cardId, suspended, card, syncLocks, fieldLockHint, isDirty, editableDirty, restorePending, updateCard, confirming, cancelClose, finishClose, writesPending, save, saveError } = context;

  const confirmation = confirming ? (
    <Dialog title={strings.unsavedChanges} description={strings.unsavedChangesQuestion} alert cardId={card.id} className="card-close-confirm" onClose={() => { if (!updateCard.isPending) cancelClose(); }}>
      <div className="card-close-confirm-actions">
        <button type="button" onClick={() => save(true)} disabled={!editableDirty || suspended || writesPending || restorePending}>{strings.save}</button>
        <button type="button" className="danger" disabled={writesPending} onClick={finishClose}>{strings.discard}</button>
        <button type="button" className="secondary" data-dialog-cancel disabled={updateCard.isPending} onClick={cancelClose}>{strings.cancel}</button>
      </div>
      {saveError}
      {!editableDirty ? [...syncLocks].map((field) => <p key={field}>{fieldLockHint(field)}</p>) : null}
    </Dialog>
  ) : null;
  if (suspended) return <>{isDirty || writesPending ? <span hidden data-live-suspended-draft /> : null}{confirmation}</>;
  return { ...context, confirmation };
}

function buildCardCloseActions(model: ReturnType<typeof useCardDraftSynchronization> & { card: Card }) {
  const { snapshot, card, isDirty, writesPending, setCloseConfirm, close, draftRef, draft, baseline, pendingNavigation, resolveNavigation } = model;

  const breadcrumb = buildBreadcrumb(snapshot.cards, card);

  function requestClose() {
    if (isDirty || writesPending) setCloseConfirm(true);
    else close();
  }

  function completeLifecycle() {
    if (JSON.stringify(draftRef.current) !== JSON.stringify(draft) && JSON.stringify(draftRef.current) !== JSON.stringify(baseline.current)) {
      setCloseConfirm(true);
      return;
    }
    if (pendingNavigation.current) resolveNavigation(false);
    else close();
  }
  return { ...model, breadcrumb, requestClose, completeLifecycle };
}

function buildCardSaveActions(props: ReturnType<typeof useCardDraftSynchronization> & { card: Card }) {
  const context = buildCardCloseActions(props);
  const { suspendedRef, card, syncLocks, draft, baseline, baseVersion, draftRef, setCloseConfirm, setValidationError, remoteVersion, keptRemote, isDirty, epoch, updateCard, versionedPending, pendingNavigation, hasPendingWrites, close, resolveNavigation } = context;

  function save(closeAfter = false) {
    if (!card || epoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending || suspendedRef.current || hasPendingWrites() || versionedPending) return;
    const invalid = validateNumbers(draft, baseline.current);
    setValidationError(invalid);
    if (invalid) return;
    const patch: UpdateCardRequest = {};
    if (draft.cardType !== baseline.current.cardType) patch.cardType = draft.cardType || null;
    if (!syncLocks.has("title") && draft.title !== baseline.current.title) patch.title = draft.title;
    if (!syncLocks.has("description") && draft.description !== baseline.current.description) patch.description = draft.description;
    if (!syncLocks.has("status") && draft.status !== baseline.current.status) patch.status = draft.status;
    if (draft.assignee !== baseline.current.assignee) patch.assignee = draft.assignee.trim();
    if (!syncLocks.has("milestone") && draft.releaseId !== baseline.current.releaseId) patch.releaseId = draft.releaseId || null;
    if (draft.estimate.trim() && draft.estimate !== baseline.current.estimate) patch.estimate = Number(draft.estimate);
    if (draft.priority.trim() !== baseline.current.priority.trim()) patch.priority = draft.priority.trim();
    if (draft.color !== baseline.current.color) patch.color = draft.color || undefined;
    if (draft.businessValue.trim() && draft.businessValue !== baseline.current.businessValue) patch.businessValue = Number(draft.businessValue);
    if (draft.effort.trim() && draft.effort !== baseline.current.effort) patch.effort = Number(draft.effort);
    if (Object.keys(patch).length === 0) return;
    if (closeAfter) {
      const retainedDraft = Object.entries(draft).some(([key, value]) => !(key in patch) && value !== baseline.current[key as keyof typeof draft]);
      const submitted = { ...draft };
      updateCard.mutate({ cardId: card.id, baseVersion: baseVersion.current, patch, submitted, baseline: { ...baseline.current }, reviewedEpoch: epoch }, {
        onSuccess: () => {
          if (retainedDraft || epoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
          if (JSON.stringify(draftRef.current) !== JSON.stringify(submitted) && JSON.stringify(draftRef.current) !== JSON.stringify(baseline.current)) return;
          if (pendingNavigation.current) {
            setCloseConfirm(false);
            resolveNavigation(false);
          } else {
            setCloseConfirm(false);
            close();
          }
        }
      });
    } else {
      updateCard.mutate({ cardId: card.id, baseVersion: baseVersion.current, patch, submitted: { ...draft }, baseline: { ...baseline.current }, reviewedEpoch: epoch });
    }
  }

  const remoteChanged = isDirty && typeof remoteVersion === "number" && remoteVersion > baseVersion.current && keptRemote !== `${card.id}:${remoteVersion}`;
  return { ...context, save, remoteChanged };
}

function buildCardSaveFeedback(props: ReturnType<typeof useCardDraftSynchronization> & { card: Card }) {
  const context = buildCardSaveActions(props);
  const { card, setDraft, baseline, baseVersion, validationError, remoteVersion, setKeptRemote, invalidate, updateCard, currentUpdateError, versionedPending, confirming, save, remoteChanged } = context;
  const saveError = (
    <>
      {remoteChanged ? (
        <ChangeAlert
          message={liveUpdateStrings.cardChanged}
          disabled={versionedPending}
          onReload={() => {
            setDraft(baseline.current);
            void invalidate();
          }}
          onKeepMine={() => {
            baseVersion.current = remoteVersion!;
            setKeptRemote(`${card.id}:${remoteVersion}`);
          }}
        />
      ) : null}
      <ConflictAlert
        error={currentUpdateError}
        entityId={card.id}
        name={card.key}
        disabled={versionedPending}
        onReload={(conflict) => {
          const current = makeDraft(cardSchema.parse(conflict.current));
          baseline.current = current;
          baseVersion.current = conflict.currentVersion;
          setDraft(current);
          updateCard.reset();
          void invalidate();
        }}
        onKeepMine={(conflict) => {
          baseVersion.current = conflict.currentVersion;
          updateCard.reset();
          save(confirming);
        }}
      />
      {validationError ? <p role="alert">{validationError}</p> : null}
      {currentUpdateError && !isConflictError(currentUpdateError) ? <p role="alert">{currentUpdateError.message}</p> : null}
    </>
  );
  return { ...context, saveError };
}

function renderCardMainFields(model: Exclude<ReturnType<typeof useCardDetailModalState>, import("react").ReactElement | null>) {
  const { breadcrumb, syncLocks, fieldLockHint, draft, setDraft, card, snapshot, isDirty, writesPending, documents, selectedDocumentId, setSelectedDocumentId, linkedSourceLinks, selectedChunks, selectedChunkById, projectIssues, createSourceLink, deleteSourceLink } = model;
  return <div className="card-detail-main">
    <p className="detail-breadcrumb">{breadcrumb}</p>
    <label>{strings.title}<input disabled={syncLocks.has("title")} title={fieldLockHint("title")} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} />
    </label>
    {[...syncLocks].map((field) => <p key={field} className="section-hint">{fieldLockHint(field)}</p>)}
    <div className="detail-description-field"><span>{strings.description}</span><DescriptionEditor disabled={syncLocks.has("description")} value={draft.description} onChange={(description) => setDraft((value) => ({ ...value, description }))} />
    </div>
    <div className="detail-actions">
      <button type="button" className="secondary" disabled={syncLocks.has("description")} onClick={() => setDraft((value) => ({ ...value, description: value.description.trim() || strings.structuredCardTemplate(card.title) }))}>{strings.useStructuredMarkdown}</button>
      {(
        <TemplatePicker level={card.level} onApplyDescription={(description) => setDraft((value) => ({ ...value, description }))} templates={snapshot.storyTemplates} dirty={isDirty} descriptionDirty={Boolean(draft.description.trim())} disabled={writesPending} descriptionDisabled={syncLocks.has("description")} onApply={(template) => setDraft((value) => ({ ...value, description: syncLocks.has("description") ? value.description : template.descriptionTemplate || value.description, status: syncLocks.has("status") ? value.status : template.defaultStatus || value.status, estimate: template.defaultEstimate === null ? value.estimate : String(template.defaultEstimate) }))} />
      )}
    </div>
    <DetailSourceSections
      key={card.id}
      card={card}
      documents={documents.data?.documents ?? []}
      selectedDocumentId={selectedDocumentId}
      setSelectedDocumentId={setSelectedDocumentId}
      linkedSourceLinks={linkedSourceLinks}
      selectedChunks={selectedChunks}
      selectedChunkById={selectedChunkById}
      githubLinks={[...snapshot.githubLinks, ...projectIssues.links.filter((issue) => !snapshot.githubLinks.some((link) => link.id === issue.id))]}
      error={createSourceLink.error?.message ?? deleteSourceLink.error?.message ?? projectIssues.error?.message}
      pending={createSourceLink.isPending || deleteSourceLink.isPending}
      createSourceLink={(evidence, onSuccess) => { deleteSourceLink.reset(); createSourceLink.mutate({ cardId: card.id, evidence }, onSuccess ? { onSuccess } : undefined); }}
      deleteSourceLink={(evidence) => { createSourceLink.reset(); deleteSourceLink.mutate({ cardId: card.id, evidence }); }}
    />
  </div>;
}

function renderCardGitHubLinks(model: Exclude<ReturnType<typeof useCardDetailModalState>, import("react").ReactElement | null>) {
  const { card, linkedGitHubLinks, linkedRemoteWorkItemLinks, githubConnections, projectId, search, snapshot, writableConnections, effectiveConnectionId, reviewedPushScope, currentPushScope, setConnectionChoice, setPushPreview, setPushResult, pushPreview, writesPending, startCardPush, incomingFailure, pushIdentity, outgoingFailure, pushScope, incomingReviews, currentPushIdentity, suspendedRef, pushPending, hasPendingWrites, setOutgoingFailure, previewLinkedOutgoing, linkedPushPlans, createGitHubIssue, pushResult, hasWritableLink, setIncomingFailure, pullCardGitHubLinks } = model;
  return <section className="source-link-section">
    <h2>{strings.gitHub}</h2>
    <p className="section-hint">{strings.gitHubCardNotice}</p>
    {card.level === "note" ? <p>{strings.notesNotPushed}</p> : null}
    {linkedGitHubLinks.length === 0 && linkedRemoteWorkItemLinks.length === 0 && card.level !== "note" ? (
      githubConnections.length === 0 ? (
        <p>{strings.noGitHubConnection}{projectId ? <> <Link to="/projects/$projectId/github" params={{ projectId }} search={{ storyMapId: snapshot.storyMap.id }}>{strings.openTheGitHubTab}</Link>{" "}{strings.toAddOne}</> : null}</p>
      ) : writableConnections.length === 0 ? (
        <p>{strings.readOnlyRepositoryNotice}{projectId ? <>{" "}{strings.enableWritingInThe}{" "}<Link to="/projects/$projectId/github" params={{ projectId }} search={{ storyMapId: snapshot.storyMap.id }}>{strings.gitHubTab}</Link>{strings.period}</> : null}</p>
      ) : (
        <div className="github-create">
          {writableConnections.length > 1 ? <select title={strings.targetRepository} value={effectiveConnectionId} onChange={(event) => { reviewedPushScope.current = undefined; currentPushScope.current = ""; setConnectionChoice(event.target.value); setPushPreview(null); setPushResult(null); }}>{writableConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}{" "}{strings.openParenthesis}{connection.owner}{connection.repository ? strings.repositorySuffix(connection.repository) : ""}{strings.closeParenthesis}</option>)}</select> : null}
          {pushPreview ? <RemotePushReview plan={pushPreview} pending={writesPending} onConfirm={() => startCardPush()} /> : null}
          <button type="button" title={!pushPreview ? strings.previewGitHubIssue : strings.createGitHubIssue} disabled={!effectiveConnectionId || writesPending} onClick={() => startCardPush()}>{!pushPreview ? strings.previewGitHubTicket : strings.createGitHubTicket}</button>
          {pushPreview ? <button type="button" className="secondary" title={strings.discardThePreview} onClick={() => setPushPreview(null)}>{strings.cancel}</button> : null}
        </div>
      )
    ) : null}
    {incomingFailure?.identity === pushIdentity ? <><p role="alert">{incomingFailure.error.message}</p>{incomingFailure.error instanceof IncomingGitHubError ? <IncomingGitHubResults items={incomingFailure.error.items} /> : null}</> : null}
    {outgoingFailure?.identity === pushIdentity && outgoingFailure.scope === pushScope ? <p role="alert">{outgoingFailure.error.message}</p> : null}
    {incomingReviews.filter((review) => review.identity === pushIdentity).map((review) => <IncomingGitHubReview key={review.command.changeSetId} command={review.command} mutationKey={["card-owned-write", card.id]} isCurrent={() => review.identity === currentPushIdentity.current && !suspendedRef.current && !useLiveInteractionStore.getState().restorePending} onPrepareOutgoing={githubConnections.some((connection) => connection.id === review.connectionId && !connection.readOnly) ? () => { if (pushPending.current || hasPendingWrites()) return; pushPending.current = true; setOutgoingFailure(undefined); previewLinkedOutgoing.mutate({ connectionId: review.connectionId, identity: pushIdentity, scope: pushScope }); } : undefined} />)}
    {linkedPushPlans.map((plan) => <RemotePushReview key={plan.id} plan={plan} pending={writesPending} onConfirm={() => { if (pushPending.current || hasPendingWrites()) return; pushPending.current = true; createGitHubIssue.mutate({ plan, resume: false }); }} />)}
    {pushResult ? <RemotePushReview plan={pushResult.plan} execution={pushResult.execution} focusResult pending={writesPending} onResume={() => startCardPush(true)} /> : null}
    {linkedRemoteWorkItemLinks.map((link) => <p key={link.id}>{mapConceptStrings.observedDetails(link.issueType ?? mapConceptStrings.unknownType, link.syncState)}</p>)}
    {card.level !== "note" ? <GitHubCardBinding card={card} connections={githubConnections} links={linkedRemoteWorkItemLinks} disabled={writesPending || model.isDirty} /> : null}
    {linkedRemoteWorkItemLinks.length > 0 ? <button type="button" className="secondary" title={hasWritableLink ? strings.syncCardGitHubHint : strings.pullCardGitHubHint} onClick={() => { if (pushPending.current || hasPendingWrites() || suspendedRef.current || useLiveInteractionStore.getState().restorePending) return; pushPending.current = true; setIncomingFailure(undefined); pullCardGitHubLinks.mutate(pushIdentity); }} disabled={writesPending}><RefreshCcw size={16} /> {hasWritableLink ? strings.syncWithGitHub : strings.pullFromGitHub}</button> : null}
    {linkedGitHubLinks.map((link) => <div className="source-link-row" key={link.id}><span title={githubSyncStateHint(link.syncState)}>{link.issueNumber ? strings.legacyIssueLabel(link.repo, link.issueNumber) : link.repo}{" "}{strings.separator}{" "}{link.syncState}</span><a href={link.url} target="_blank" rel="noreferrer">{strings.open}</a></div>)}
  </section>;
}

function renderCardColorField(model: Exclude<ReturnType<typeof useCardDetailModalState>, import("react").ReactElement | null>) {
  const { draft, setDraft } = model;
  return <div className="detail-color-field">
    {draft.color && !CARD_COLORS.some((category) => category.value === draft.color) ? <span>{draft.color}</span> : null}
    <span>{strings.color}</span>
    <div className="detail-color-row">
      {CARD_COLORS.map((category) => (
        <button
          type="button"
          key={category.value}
          className={draft.color === category.value ? "detail-color-option selected" : "detail-color-option"}
          style={{ background: category.value }}
          title={category.label}
          aria-label={category.label}
          aria-pressed={draft.color === category.value}
          onClick={() => setDraft((value) => ({ ...value, color: category.value }))}
        />
      ))}
    </div>
  </div>;
}

function renderGitHubStatusOwnership(card: Card, snapshot: StoryMapSnapshot, connections: ConnectorConnection[]) {
  return snapshot.remoteWorkItemLinks.filter((link) => link.cardId === card.id).map((link) => {
    const source = link.statusEvidence?.source ?? connections.find((connection) => connection.id === link.connectionId)?.statusSource;
    return <p key={link.id}>{statusStrings.ownership(source?.kind === "project" ? source.projectName : "Repository (Open / Closed)")}{link.statusEvidence?.membership === "missing" ? ` ${statusStrings.missingMembership}` : ""}{!link.statusEvidence ? ` ${statusStrings.adoptionPending}` : ""}</p>;
  });
}
