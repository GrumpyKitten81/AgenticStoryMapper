import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { PlanDriftReport } from "@storymapper/contracts";
import { planDriftStrings as strings } from "@storymapper/ui-strings";
import { usePlanDrift, usePlanDriftSystems } from "@storymapper/web/features/reports/plan-drift-api";
import "@storymapper/web/features/reports/plan-drift.css";

const DRIFT_PAGE_SIZE = 50;

export function PlanDriftDrawer({ storyMapId, readOnly }: { storyMapId: string; readOnly: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const retryFocus = useRef<HTMLButtonElement | null>(null);
  const systems = usePlanDriftSystems(storyMapId, open && !readOnly);
  const selected = system || systems.data?.[0] || "";
  const available = Boolean(selected && systems.data?.includes(selected));
  const report = usePlanDrift(storyMapId, selected, open && available && !systems.error && !readOnly);
  const error = systems.error?.message || report.error?.message;
  const missing = Boolean(selected && systems.data && !available);
  const loading = systems.isFetching || report.isFetching;
  const close = (): void => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => { if (!system && systems.data?.[0]) setSystem(systems.data[0]); }, [system, systems.data]);
  useEffect(() => { if (open) drawer.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  useEffect(() => { if (readOnly) setOpen(false); }, [readOnly]);
  useEffect(() => {
    const removed = retryFocus.current;
    if (error || !removed) return;
    if (!removed.isConnected && document.activeElement === document.body) drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    retryFocus.current = null;
  }, [error, loading]);
  function keyboard(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...drawer.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)')];
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
  }
  return <div className="plan-drift-control">
    <button ref={trigger} type="button" disabled={readOnly} aria-label={strings.open} title={readOnly ? strings.preview : undefined} onClick={() => setOpen(true)}>{strings.title}</button>
    {open ? <aside ref={drawer} role="dialog" aria-modal={false} aria-label={strings.title} aria-busy={loading} data-plan-drift-drawer className="plan-drift-drawer" onKeyDown={keyboard}>
    <header><h2>{strings.title}</h2><button type="button" className="secondary" onClick={close}>{strings.close}</button></header>
      <label>{strings.system}<select aria-label={strings.system} value={selected} disabled={!systems.data?.length} onChange={(event) => setSystem(event.target.value)}>
        {!selected ? <option value="">{strings.system}</option> : null}
        {missing ? <option value={selected}>{selected}</option> : null}
        {systems.data?.map((name) => <option key={name} value={name}>{name}</option>)}
      </select></label>
      {error ? <p role="alert">{strings.failed(error)} <button type="button" onClick={(event) => { retryFocus.current = event.currentTarget; void (systems.error ? systems.refetch() : report.refetch()); }}>{strings.retry}</button></p> : null}
      {missing ? <p role="alert">{strings.missingSystem(selected)}</p> : null}
      {loading ? <p role="status">{strings.loading}</p> : null}
      {!loading && !error && !missing && systems.data?.length === 0 ? <p>{strings.noSystems}</p> : null}
      {!error && !missing && available && report.data ? <DriftChanges key={selected} report={report.data} /> : null}
    </aside> : null}
  </div>;
}

function DriftChanges({ report }: { report: PlanDriftReport }): ReactElement {
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const focusedPage = useRef<HTMLButtonElement | null>(null);
  const boundaryFocus = useRef<"next" | "previous" | null>(null);
  const previous = useRef<HTMLButtonElement>(null), next = useRef<HTMLButtonElement>(null);
  const count = report.changes.length, lastPage = Math.max(0, Math.ceil(count / DRIFT_PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage), start = current * DRIFT_PAGE_SIZE;
  useEffect(() => { setPage(0); }, [report.baselineId, report.baselineVersion]);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
    if (boundaryFocus.current) { (boundaryFocus.current === "next" ? next : previous).current?.focus(); boundaryFocus.current = null; }
    if (focusedPage.current && (!focusedPage.current.isConnected || focusedPage.current.disabled) && (document.activeElement === document.body || document.activeElement === focusedPage.current)) root.current?.closest("aside")?.querySelector<HTMLSelectElement>("select")?.focus();
  }, [page, lastPage]);
  function changePage(target: number, button: HTMLButtonElement): void {
    setPage(target);
    if (document.activeElement === button && (target === 0 || target === lastPage)) boundaryFocus.current = target === 0 ? "next" : "previous";
    const drawer = root.current?.closest("aside");
    if (drawer) drawer.scrollTop = 0;
  }
  return <div ref={root} className="plan-drift-changes">
    <p role="status">{report.changes.length ? strings.summary(report.changes.length) : strings.empty}</p>
    {count > DRIFT_PAGE_SIZE ? <nav aria-label={strings.pages} className="plan-drift-pages">
      <button ref={previous} type="button" disabled={current === 0} onFocus={(event) => { focusedPage.current = event.currentTarget; }} onClick={(event) => changePage(current - 1, event.currentTarget)}>{strings.previousPage}</button>
      <span role="status">{strings.pageRange(start + 1, Math.min(start + DRIFT_PAGE_SIZE, count), count)}</span>
      <button ref={next} type="button" disabled={current === lastPage} onFocus={(event) => { focusedPage.current = event.currentTarget; }} onClick={(event) => changePage(current + 1, event.currentTarget)}>{strings.nextPage}</button>
    </nav> : null}
    {report.changes.slice(start, start + DRIFT_PAGE_SIZE).map((change) => {
      const identity = change.after?.identity ?? change.before!.identity;
      return <article key={change.cardId} className="plan-drift-change">
        <h3>{strings.identity(identity.key, identity.title)}</h3>
        <p>{change.kinds.map((kind) => <span key={kind} className="plan-drift-kind">{strings.kinds[kind]}</span>)}{change.reason !== "active" ? <span>{strings.reasons[change.reason]}</span> : null}</p>
        <DriftValues change={change} />
      </article>;
    })}
  </div>;
}

function DriftValues({ change }: { change: PlanDriftReport["changes"][number] }): ReactElement {
  const before = change.before?.card, after = change.after?.card;
  const rows: { field: string; before: string; after: string }[] = (["title", "description", "status"] as const).flatMap((field) => before?.[field] !== after?.[field] ? [{ field: strings.fields[field], before: before ? before[field] || strings.emptyValue : strings.absent, after: after ? after[field] || strings.emptyValue : strings.absent }] : []);
  if (change.kinds.some((kind) => kind !== "changed")) rows.push({ field: strings.fields.slice,
    before: before ? change.beforeReleaseName ?? (before.releaseId ? strings.unavailableSlice : strings.unscheduled) : strings.absent,
    after: after ? change.afterReleaseName ?? (after.releaseId ? strings.unavailableSlice : strings.unscheduled) : strings.absent });
  return <table><thead><tr><th>{strings.field}</th><th>{strings.before}</th><th>{strings.after}</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.field}><th scope="row">{row.field}</th><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table>;
}
