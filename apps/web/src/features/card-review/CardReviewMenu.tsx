import { useState } from "react";
import type { Card, CardReviewSettings } from "@storymapper/contracts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { cardReviewStrings as strings } from "@storymapper/web/ui-strings/card-review";
import { CardReviewPanel } from "@storymapper/web/features/card-review/CardReviewPanel";
import { ReviewInstruction, useCardReviewContext } from "@storymapper/web/features/card-review/review-context";

export function CardReviewMenu({ cards, selectedIds }: { cards: Card[]; selectedIds: ReadonlySet<string> }) {
  const context = useCardReviewContext();
  const [open, setOpen] = useState(false);
  if (!context) return null;
  return <><button type="button" className="secondary" onClick={() => setOpen(true)}>{strings.menu}</button>{open ? <Dialog title={strings.menu} onClose={() => setOpen(false)}><ReviewMenuContents cards={cards} selectedIds={selectedIds} /></Dialog> : null}</>;
}
function ReviewMenuContents({ cards, selectedIds }: { cards: Card[]; selectedIds: ReadonlySet<string> }) {
  const context = useCardReviewContext()!;
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState(() => [...selectedIds].filter((id) => cards.some((card) => card.id === id && card.level !== "note")));
  const [cardId, setCardId] = useState("");
  const data = context.query.data;
  if (!data) return <p role={context.query.error ? "alert" : "status"}>{context.query.error?.message ?? strings.refresh}</p>;
  const summaries = data.summaries.filter((summary) => { const card = cards.find((row) => row.id === summary.cardId); return card && `${card.key} ${card.title}`.toLowerCase().includes(search.toLowerCase()) && (!state || summary.state === state) && (!severity || summary.highestSeverity === severity); });
  return <div className="form-stack">
    <label>{strings.search}<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label>{strings.state}<select value={state} onChange={(event) => setState(event.target.value)}><option value="">{strings.all}</option>{Object.entries(strings.states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>{strings.severity}<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">{strings.all}</option><option value="blocker">{strings.blocker}</option><option value="warning">{strings.warning}</option></select></label>
    {summaries.map((summary) => <div className="button-row" key={summary.cardId}><label className="checkbox-row"><input type="checkbox" disabled={context.preview} checked={selected.includes(summary.cardId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, summary.cardId] : current.filter((id) => id !== summary.cardId))} />{cards.find((card) => card.id === summary.cardId)?.key}</label><button type="button" className="secondary" onClick={() => setCardId(summary.cardId)}>{strings.details(cards.find((card) => card.id === summary.cardId)?.title, strings.states[summary.state], summary.unresolvedCount)}</button></div>)}
    <button type="button" disabled={context.preview || context.mutation.isPending || !selected.length} onClick={() => context.mutation.mutate({ action: "request", cardIds: selected })}>{strings.requestSelected}</button>
    <button type="button" className="secondary" onClick={() => { void context.query.refetch(); }}>{strings.refresh}</button>
    {context.mutation.error ? <p role="alert">{context.mutation.error.message}</p> : null}
    {cardId ? <CardReviewPanel key={cardId} cardId={cardId} /> : null}
    {!cardId ? <ReviewInstruction data={data} /> : null}
    <ReviewSettings key={JSON.stringify(data.settings)} settings={data.settings} />
  </div>;
}
function ReviewSettings({ settings }: { settings: CardReviewSettings }) {
  const context = useCardReviewContext()!;
  const [draft, setDraft] = useState(settings);
  const labels = { reviewBeforeAgentPush: strings.beforePush, reviewAfterAgentCreate: strings.afterCreate, reviewAfterAgentContentChange: strings.afterChange, allowHumanPushOverride: strings.allowOverride };
  return <details><summary>{strings.settings}</summary><div className="form-stack">{(Object.keys(labels) as Array<keyof CardReviewSettings>).map((key) => <label className="checkbox-row" key={key}><input type="checkbox" disabled={context.preview} checked={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))} />{labels[key]}</label>)}<button type="button" disabled={context.preview || context.mutation.isPending} onClick={() => context.mutation.mutate({ action: "settings", settings: draft })}>{strings.saveSettings}</button></div></details>;
}
