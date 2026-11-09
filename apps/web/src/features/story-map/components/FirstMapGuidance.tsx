import { EpicContextPanel } from "@storymapper/web/features/story-map/components/EpicContextPanel";
import { MapConceptGuide } from "@storymapper/web/features/story-map/components/MapConceptGuide";
import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { CardComposer } from "@storymapper/web/features/story-map/components/CardComposer";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import type { Card } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export interface FirstMapAction {
  level: "activity" | "step" | "story";
  parentId?: string;
}

export function nextFirstMapAction(cards: readonly Card[]): FirstMapAction | null {
  const visible = visibleCards(cards);
  const activities = visible.filter((card) => card.level === "activity" && card.parentId === null);
  if (!activities.length) return { level: "activity" };
  const activityIds = new Set(activities.map((card) => card.id));
  const steps = visible.filter((card) => card.level === "step" && card.parentId !== null && activityIds.has(card.parentId));
  if (!steps.length) return { level: "step", parentId: activities[0]!.id };
  const stepIds = new Set(steps.map((card) => card.id));
  if (visible.some((card) => card.level === "story" && card.parentId !== null && stepIds.has(card.parentId))) return null;
  return { level: "story", parentId: steps[0]!.id };
}

export function FirstMapGuidance({ state, onSelectCard }: { state: StoryMapBoardState; onSelectCard: (cardId: string) => void }) {
  const [composer, setComposer] = useState<FirstMapAction | null>(null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = nextFirstMapAction(state.snapshot.cards);
  return <>
    <button ref={trigger} type="button" className="secondary icon-button" aria-label={strings.firstMapGuidance} title={strings.firstMapGuidance} aria-haspopup="dialog" onClick={() => setOpen(true)}><HelpCircle size={16} /></button>
    {open ? <Dialog title={strings.firstMapGuidance} onClose={() => setOpen(false)}>
      <div className="form-stack">
        <p role="status" aria-live="polite">{action ? strings.firstMapHelp[action.level] : strings.firstMapComplete}</p>
        <p>{strings.localAutosave}</p>
        <MapConceptGuide />
        <EpicContextPanel map={state.snapshot.storyMap} disabled={Boolean(state.preview)} actionOnly />
        <div className="button-row">
          {action ? <button type="button" disabled={Boolean(state.preview) || state.createCard.isPending} onClick={() => { state.createCard.reset(); setOpen(false); setComposer(action); }}>{strings.firstMapAction[action.level]}</button> : null}
          <button type="button" className="secondary" onClick={() => setOpen(false)}>{strings.close}</button>
        </div>
      </div>
    </Dialog> : null}
    {composer && !state.preview ? <CardComposer state={state} level={composer.level} initialParentId={composer.parentId ?? null} returnFocus={trigger.current} onClose={() => setComposer(null)} onSelectCard={onSelectCard} /> : null}
  </>;
}
