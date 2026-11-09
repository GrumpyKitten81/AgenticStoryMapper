import { useState } from "react";
import { Bot, Github, Settings, User } from "lucide-react";
import type { Card, CardHistoryEntry } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

const HISTORY_PREVIEW_LENGTH = 240;
const HISTORY_PREVIEW_LINES = 6;
const ACTOR_ICONS = { human: User, agent: Bot, github: Github, system: Settings };
const FIELD_LABELS = {
  cardType: "Card type", title: strings.title, description: strings.description, status: strings.status,
  parked: strings.historyParked, priority: strings.priority, businessValue: strings.businessValue,
  effort: strings.effort, estimate: strings.estimate, color: strings.color, assignee: strings.assignee,
  releaseId: strings.release, parentId: strings.historyParent, position: strings.historyPosition
} satisfies Partial<Record<keyof Card, string>>;

export function CardHistoryEntryView({ entry }: { entry: CardHistoryEntry }) {
  const fields = Object.keys(FIELD_LABELS).filter((field) => entry.previousSnapshot === null || entry.changedFields.includes(field)) as Array<keyof typeof FIELD_LABELS>;
  const ActorIcon = ACTOR_ICONS[entry.actorType];
  return <li className="card-history-entry">
    <h3>{strings.historyVersion(entry.version)}</h3>
    <p className="card-history-attribution"><span><ActorIcon size={16} aria-hidden="true" /> {strings.historyActor(entry.actorType, entry.actor)}</span>{entry.mcpSessionId ? <span>{strings.historySession(entry.mcpSessionId)}</span> : null}<time dateTime={entry.createdAt}>{strings.historyTime(entry.createdAt)}</time></p>
    {entry.previousSnapshot === null ? <p>{strings.historyCreated}</p> : null}
    {fields.length === 0 ? <p>{strings.noCardFieldChanges}</p> :
      <dl className="card-history-fields">{fields.map((field) => <div key={field}>
        <dt>{FIELD_LABELS[field]}</dt>
        <dd><span>{strings.historyBefore}</span><HistoryValue value={entry.previousSnapshot?.[field]} label={strings.historyValueLabel(entry.version, FIELD_LABELS[field], strings.historyBefore)} /></dd>
        <dd><span>{strings.historyAfter}</span><HistoryValue value={entry.snapshot[field]} label={strings.historyValueLabel(entry.version, FIELD_LABELS[field], strings.historyAfter)} /></dd>
      </div>)}</dl>}
  </li>;
}

function HistoryValue({ value, label }: { value: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = value === undefined || value === null || value === "" ? strings.historyEmptyValue : typeof value === "boolean" ? (value ? strings.historyTrue : strings.historyFalse) : String(value);
  const preview = text.split("\n").slice(0, HISTORY_PREVIEW_LINES).join("\n").slice(0, HISTORY_PREVIEW_LENGTH);
  const long = preview.length < text.length;
  return <div className="card-history-value"><pre>{long && !expanded ? strings.historyPreview(preview) : text}</pre>{long ? <button type="button" className="secondary" aria-label={strings.historyExpansionLabel(expanded, label)} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? strings.collapseHistoryValue : strings.expandHistoryValue}</button> : null}</div>;
}
