import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import type { ActivityChange } from "@storymapper/contracts";
import { ActorBadge } from "@storymapper/web/components/ActorBadge";
import { formatLocalDateTime } from "@storymapper/web/app/format-date-time";
import { captureGroups, type ChangeGroup, type TargetReceipt } from "@storymapper/web/features/what-changed/model";
import { changeDescription, groupCardLabel, groupDescription, groupEvidence } from "@storymapper/web/features/what-changed/presentation";
import { whatChangedStrings as strings } from "@storymapper/ui-strings";

interface DrawerProps {
  open: boolean; projectId: string; groups: ChangeGroup[]; loading: boolean; error: string;
  scope: "map" | "project"; setScope: (scope: "map" | "project") => void;
  close: () => void; mark: (receipts: TargetReceipt[]) => void; retry: () => void;
  openCard: (group: ChangeGroup) => void;
}
export function WhatChangedDrawer(props: DrawerProps) {
  const { open, projectId, groups, loading, error, scope, setScope, close, mark, retry, openCard } = props;
  const root = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const filtered = groups.filter((group) => !search || group.card && groupCardLabel(group.card).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const shown = filtered.slice(0, limit);
  const markSeen = useCallback((receipts: TargetReceipt[]) => {
    const heldFocus = Boolean(root.current?.contains(document.activeElement));
    mark(receipts);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (heldFocus && !root.current?.hidden && (active === document.body || active instanceof HTMLButtonElement && active.disabled)) root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  }, [mark]);
  useEffect(() => { if (open) root.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  return <aside ref={root} hidden={!open} role={open ? "dialog" : undefined} aria-modal={open ? false : undefined} aria-label={open ? strings.title : undefined} data-what-changed-drawer={open ? true : undefined} data-what-changed-content className="what-changed-drawer form-stack" onKeyDown={(event) => containKeys(event, root.current, close)}>
    <header><h2>{strings.count(strings.title, groups.filter((group) => group.card).length)}</h2><button type="button" className="secondary" onClick={close}>{strings.close}</button></header>
    {error ? <p role="alert">{error} <button type="button" className="secondary" onClick={retry}>{strings.retry}</button></p> : null}
    <label>{strings.scope}<select value={scope} onChange={(event) => { setScope(event.target.value as "map" | "project"); setLimit(25); }}><option value="map">{strings.currentMap}</option><option value="project">{strings.project}</option></select></label>
    <label>{strings.search}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(25); }} /></label>
    <button type="button" disabled={!shown.length || Boolean(error)} onClick={() => markSeen(captureGroups(shown))}>{strings.allSeen}</button>
    {!filtered.length && !loading ? <p>{strings.empty}</p> : null}
    {loading ? <p role="status">{strings.loading}</p> : null}
    {open ? <>
      <ul className="what-changed-groups">{shown.filter((group) => group.card).map((group) => <ChangeRow key={group.target} group={group} projectId={projectId} projectScope={scope === "project"} error={error} mark={markSeen} openCard={openCard} close={close} />)}</ul>
      {shown.some((group) => !group.card) ? <section><h3>{strings.projectChanges}</h3><ul className="what-changed-groups">{shown.filter((group) => !group.card).map((group) => <ChangeRow key={group.target} group={group} projectId={projectId} error={error} mark={markSeen} openCard={openCard} close={close} />)}</ul></section> : null}
      {filtered.length > limit ? <button type="button" className="secondary" onClick={() => setLimit(limit + 25)}>{strings.more}</button> : null}
    </> : null}
  </aside>;
}

function containKeys(event: KeyboardEvent, root: HTMLElement | null, close: () => void): void {
  event.stopPropagation();
  if (event.key === "Escape") { event.preventDefault(); close(); }
  if (event.key !== "Tab") return;
  const controls = [...root!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, summary')].filter((element) => !element.closest("details:not([open])") || element.tagName === "SUMMARY");
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function ChangeRow({ group, projectId, projectScope, error, mark, openCard, close }: {
  group: ChangeGroup; projectId: string; projectScope?: boolean; error: string;
  mark: (receipts: TargetReceipt[]) => void; openCard: (group: ChangeGroup) => void; close: () => void;
}) {
  const latest = group.events[0]!;
  const [expanded, setExpanded] = useState(false);
  const card = group.card;
  const label = card ? groupCardLabel(card) : group.project?.subject.name ?? latest.subject?.name ?? "Project change";
  const availability = card?.availability ?? card?.navigation?.availability;
  return <li className="what-changed-affected-group form-stack">
    {card?.navigation?.availability === "available" ? <button type="button" className="secondary what-changed-card-link" onClick={() => openCard(group)}>{label}</button> : <strong>{label}</strong>}
    {card && availability && availability !== "available" ? <p>{availability === "deleted" ? strings.deleted : availability === "archived" ? strings.archived : strings.inaccessible}</p> : null}
    {projectScope && card ? <p>{card.navigation?.mapName ?? strings.mapNameMissing}</p> : null}
    <p className="what-changed-summary">{groupDescription(group)}</p>
    <div className="button-row"><ActorBadge type={latest.actorType} /><span>{latest.actor === "local-user" ? strings.localUser : latest.actor === "local-mcp-host" ? strings.localMcpAgent : /^[a-f0-9-]{36}$/i.test(latest.actor) ? strings.actors[latest.actorType] : latest.actor}</span><time dateTime={latest.createdAt}>{formatLocalDateTime(latest.createdAt)}</time></div>
    <button type="button" className="secondary" disabled={Boolean(error)} onClick={() => mark(captureGroups([group]))}>{strings.seen}</button>
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>{strings.details}{strings.detailSeparator}{strings.changes(group.events.length)}</summary>{expanded ? <ul>{group.events.map((event) => <ChangeDetail key={event.id} event={event} group={group} projectId={projectId} close={close} />)}</ul> : null}</details>
  </li>;
}

function ChangeDetail({ event, group, projectId, close }: { event: ActivityChange; group: ChangeGroup; projectId: string; close: () => void }) {
  return <li><p>{changeDescription(event, groupEvidence(event, group))}</p><p>{strings.actors[event.actorType]}{strings.detailSeparator}<time dateTime={event.createdAt}>{formatLocalDateTime(event.createdAt)}</time></p>
    {event.restorePoint ? event.restorePoint.available ? <Link to="/projects/$projectId/audit" params={{ projectId }} search={{ restorePoint: event.restorePoint.fileName }} onClick={close}>{strings.restore}</Link> : <p>{strings.unavailable}</p> : null}
    <details><summary>{strings.technicalDetails}</summary><p>{event.action}</p><p>{event.actor}</p>{event.mcpSessionId ? <p>{event.mcpSessionId}</p> : null}<p>{event.id}</p></details>
  </li>;
}
