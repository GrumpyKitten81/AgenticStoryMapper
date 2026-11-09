import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import { CardTypeField } from "@storymapper/web/features/card-review";
import type { CardType } from "@storymapper/contracts";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TicketCardComposer } from "@storymapper/web/features/story-map/components/TicketCardComposer";
import { TemplatePicker } from "@storymapper/web/features/customization";
import type { CardLevel, CreateCardRequest } from "@storymapper/contracts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

interface CardComposerProps {
  state: StoryMapBoardState;
  level: CardLevel;
  initialParentId?: string | null;
  initialReleaseId?: string | null;
  onClose: () => void;
  onSelectCard: (cardId: string) => void;
  returnFocus?: HTMLElement | null;
}

export function CardComposer({ state, level, initialParentId = null, initialReleaseId = null, onClose, onSelectCard, returnFocus }: CardComposerProps) {
  const { snapshot, createCard } = state;
  const client = useQueryClient();
  const ticketLock = useRef(false);
  const manualLock = useRef(false);
  const [ticketPending, setTicketPending] = useState(false);
  const pending = createCard.isPending || ticketPending;
  const changeTicketPending = useCallback((value: boolean) => { ticketLock.current = value; setTicketPending(value); }, []);
  const isPending = () => manualLock.current || ticketLock.current || createCard.isPending || client.isMutating({ mutationKey: ["github-incoming-write", snapshot.storyMap.id], exact: true }) > 0;
  function admitTicket() { if (isPending()) return false; changeTicketPending(true); return true; }
  const [cardType, setCardType] = useState<CardType | "">("");
  const [title, setTitle] = useState("");
  const [templateDefaults, setTemplateDefaults] = useState<Pick<CreateCardRequest, "description" | "status" | "estimate">>({});
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [releaseId, setReleaseId] = useState(initialReleaseId ?? "");
  const appendPosition = (parent: string, release: string) => snapshot.cards.filter((card) => card.parentId === (parent || null) && card.level === level && (level !== "story" || card.releaseId === (release || null))).reduce((position, card) => Math.max(position, card.position + 1), 0);
  const [position, setPosition] = useState(() => appendPosition(parentId, releaseId));
  const parents = state.boardCards.filter((card) => level === "step" ? card.level === "activity" : level === "story" ? card.level === "step" : level === "note" && (card.level === "activity" || card.level === "step"));
  const request: CreateCardRequest = { ...(level !== "note" && cardType ? { cardType } : {}), storyMapId: snapshot.storyMap.id, level, title: title.trim(), parentId: parentId || null, releaseId: releaseId || null, position, ...templateDefaults };
  function submit() {
    if (isPending()) return;
    manualLock.current = true;
    createCard.mutate(request, { onSuccess: onClose, onSettled: () => { manualLock.current = false; } });
  }
  return <Dialog title={strings.createRole(cardLevelMeta[level].label)} returnFocus={returnFocus} onClose={() => { if (!isPending()) onClose(); }}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!isPending()) submit(); }}>
      <p>{mapConceptStrings.fieldValue(mapConceptStrings.level, cardLevelMeta[level].label)}</p>
      <label>{strings.title}<input disabled={pending} required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      {level !== "note" ? <CardTypeField value={cardType} onChange={setCardType} disabled={pending} /> : null}
      <TemplatePicker level={level} onApplyDescription={(description) => setTemplateDefaults((value) => ({ ...value, description }))} templates={snapshot.storyTemplates} dirty={Boolean(templateDefaults.description)} disabled={pending} onApply={(template) => setTemplateDefaults({ description: template.descriptionTemplate, status: template.defaultStatus, ...(template.defaultEstimate === null ? {} : { estimate: template.defaultEstimate }) })} />
      {templateDefaults.description !== undefined ? <label>{strings.description}<textarea disabled={pending} value={templateDefaults.description} onChange={(event) => setTemplateDefaults((value) => ({ ...value, description: event.target.value }))} /></label> : null}
      <label>{strings.parent}<select disabled={pending || level === "activity"} value={parentId} onChange={(event) => {
        setParentId(event.target.value);
        setPosition(appendPosition(event.target.value, releaseId));
      }}><option value="">{strings.root}</option>{parents.map((card) => <option key={card.id} value={card.id}>{strings.parentCard(cardLevelMeta[card.level].label, card.title)}</option>)}</select></label>
      <label>{strings.position}<input disabled={pending} required type="number" min="0" step="1" value={position} onChange={(event) => setPosition(event.target.valueAsNumber)} /></label>
      <label>{strings.release}<select disabled={pending} value={releaseId} onChange={(event) => {
        setReleaseId(event.target.value);
        if (level === "story") setPosition(appendPosition(parentId, event.target.value));
      }}><option value="">{strings.unscheduled}</option>{snapshot.releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>
      {createCard.error ? <p role="alert">{createCard.error.message}</p> : null}
      <button type="submit" disabled={pending || !title.trim()}>{createCard.isPending ? strings.creatingCard : strings.createCard}</button>
    </form>
    {level !== "note" ? <TicketCardComposer snapshot={snapshot} request={request} onPopulate={(nextTitle, description) => { setTitle(nextTitle); setTemplateDefaults((defaults) => ({ ...defaults, description })); }} onPendingChange={changeTicketPending} admitWrite={admitTicket} disabled={createCard.isPending} onCreated={onClose} onSelectCard={(cardId) => { onClose(); onSelectCard(cardId); }} /> : null}
  </Dialog>;
}
