import { isCardArchived } from "@storymapper/core/story-map/github-status";
import type { Card, StoryMapSnapshot } from "@storymapper/contracts";
import { useState } from "react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { LifecycleDialog, type LifecycleAction } from "@storymapper/web/features/story-map/components/LifecycleDialog";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function LifecycleInventory({ kind, snapshot, onClose, onNotice }: { kind: "parked" | "archived"; snapshot: StoryMapSnapshot; onClose: () => void; onNotice: (message: string) => void }) {
  const [target, setTarget] = useState<Card | null>(null);
  const [action, setAction] = useState<LifecycleAction>(kind === "parked" ? "unpark" : "restore");
  const [notice, setNotice] = useState("");
  const restoreLabel = kind === "parked" ? strings.unpark : strings.restore;
  const announce = (message: string) => { setNotice(message); onNotice(message); };
  const cards = snapshot.cards.filter((card) => kind === "parked" ? card.level === "activity" && card.parked : isCardArchived(card));
  return <Dialog title={kind === "parked" ? strings.parked : strings.archivedList} description={kind === "parked" ? strings.parkedListDescription : strings.archivedListDescription} onClose={onClose}>
    <p role="status">{notice}</p>
    {cards.length === 0 ? <p>{strings.noHiddenCards}</p> : <ul className="lifecycle-inventory">{cards.map((card) => <li key={card.id}><span>{card.key}{" "}{card.title}</span><button type="button" aria-label={`${restoreLabel} ${card.title}`} onClick={() => { setAction(kind === "parked" ? "unpark" : "restore"); setTarget(card); }}>{restoreLabel}</button><button type="button" className="danger" aria-label={`${strings.deletePermanent} ${card.title}`} onClick={() => { setAction("delete"); setTarget(card); }}>{strings.deletePermanent}</button></li>)}</ul>}
    <button type="button" className="secondary" onClick={onClose}>{strings.close}</button>
    {target ? <LifecycleDialog card={target} snapshot={snapshot} action={action} onClose={() => setTarget(null)} onNotice={announce} /> : null}
  </Dialog>;
}
