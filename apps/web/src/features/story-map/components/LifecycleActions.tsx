import { isCardArchived } from "@storymapper/core/story-map/github-status";
import type { Card, StoryMapSnapshot } from "@storymapper/contracts";
import { useState } from "react";
import { LifecycleDialog, type LifecycleAction } from "@storymapper/web/features/story-map/components/LifecycleDialog";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

interface LifecycleActionsProps {
  card: Card;
  snapshot: StoryMapSnapshot;
  onComplete?: () => void;
  onNotice?: (message: string) => void;
  disabled?: boolean;
}

export function LifecycleActions({ card, snapshot, onComplete, onNotice, disabled = false }: LifecycleActionsProps) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  return <>
    {card.level === "activity" && !card.parked && !isCardArchived(card) ? <button type="button" className="secondary" disabled={disabled} onClick={() => setAction("park")}>{strings.park}</button> : null}
    {!isCardArchived(card) ? <button type="button" className="secondary" disabled={disabled} onClick={() => setAction("archive")}>{strings.archive}</button> : null}
    <button type="button" className="danger" disabled={disabled} onClick={() => setAction("delete")}>{strings.deletePermanent}</button>
    {action ? <LifecycleDialog card={card} snapshot={snapshot} action={action} onClose={() => setAction(null)} {...(onComplete ? { onComplete } : {})} {...(onNotice ? { onNotice } : {})} /> : null}
  </>;
}
