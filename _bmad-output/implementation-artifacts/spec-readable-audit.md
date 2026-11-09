---
title: 'Readable activity and restore history'
status: 'done'
baseline_commit: '6ea890faa8c7342733471c0f042606ff6d088516'
created: '2026-10-31'
route: 'dispatch'
---

Reproducing statement: Implement the approved readable audit plan after separately committing prior design fixes. Version1.

## Approved intent

Both Activity and Restore points should answer what happened, who, what object, when, result and needed action. Default Activity view changes/problems; all events remain selectable. IDs/hashes/session IDs/UTC metadata only in collapsed technical details. Existing paging, visibility, Restore safety, focus and mutation guards remain unchanged. UI English. No DB migration, raw payload disclosure, live mutations or external network calls. Audit implementation remains uncommitted.

## Interfaces and ownership

Backend handoff owns contracts/core/db/server ONLY. Add optional view:'changes'|'all' query; absence retains complete historical API behavior. Filter only known successful read tool calls before limit/cursor, keep unknown calls/problems. Classify with authoritative existing tool permissions, not name prefixes. Enrich ActivitySummary with optional subject:{type:string,id:string,key?:string,name?:string} and changes?:{field:string,before?:string|number|boolean|null,after?:string|number|boolean|null}[] from historical snapshots. Never use present names as historical names or expose arbitrary snapshot fields. Limit to name/title/status/assignee/estimate/goal/release dates/parked/released; identity/name/key from appropriate supported domain entity snapshots. Successful tools mean tool executed, not necessarily data changed. Reuse existing audit machinery. Backend tests cover successful known read exclusion, error/rejection/unknown retention, filter-before-page cursor and safe historical summary. No frontend edits.

Restore UI handoff owns restore-points frontend components, helper and relevant tests ONLY. Main row: friendly cause for manual/pre-migration/pre-restore/pre-apply, shared local date, human byte size, secondary Restore action; collapsed Technical details holds raw filename/class/schema/UTC. Deep-link selection messages hide filenames under details and focus still works. Confirmation names cause and local timestamp with unchanged all-projects warning and safety flow. Replace dialog-actions with button-row. Do not invent ChangeSet association; only existing unequivocal metadata would permit it. Shared local date helper is apps/web/src/app/format-date-time.ts, export formatLocalDateTime(value:string):string. Parent creates it. No backend/CSS/ui-strings edits; own English UI strings in dedicated restore-point-presentation.ts helper. Tests preserve actual Restore guard behavior, details and formatting.

Parent owns Activity route/components, frontend API filter plumbing, CSS, date helper and verification. Readable action mapping for known domain actions/tool names; unknown actions neutral explicit description, never fabricate facts. Subject historical key/name if supplied otherwise name not recorded. Show first3 recorded changes and expandable remainder. Technical details omit raw payloads. ChangeSet history uses normal title plus separate secondary Show details button. Dates use Intl en-US dateStyle medium/timeStyle short in browser zone, exact UTC under details. Existing export/report panels retained as independent sections. Default view changes, applied alongside actor/tool filter; switching resets paging through query key. No client-side hiding of fetched pages.

## Acceptance

- [x] Default changes/problems paging returns relevant events even amid many reads; All exposes complete history.
- [x] Human summary, result and timestamp replace identifier walls, with safe unknown/missing-name behavior.
- [x] ChangeSet titles never serve as huge button labels; compact separate action and grouped layouts at desktop/390px.
- [x] Restore causes/timestamps/sizes readable and technical metadata collapsible; confirmations/focus/guards preserved.
- [x] Tests, typecheck/build, source hygiene and live read-only browser inspection pass; no Restore or connector execution.

## Verification

Focused contracts/core/db/server audit tests; frontend activity/restore/changeset tests; web typecheck/build/a11y. Browser desktop/390px, cancel dialogs. Source/audit proofs must not expose sensitive payload fields. Preserve unknown historical events. No automatic commit of new audit work.

## Results — 2026-10-31, Version2

Prior design fixes committed separately as6ea890faa8c7342733471c0f042606ff6d088516. Audit work remains uncommitted. Query view defaults preserve existing clients; UI requests changes. Permissions-based SQL filtering occurs before pagination. Historical summaries use strict entity identity and field allowlists, including exactly-one canonical operation changes; multi/malformed payloads never manufacture subjects. No present-name lookups or migrations.

Activity shows action/subject/scalar changes, actor/result/local time and closed technical evidence. ChangeSet titles have separate secondary36px actions with contextual accessible labels. Restore rows/results/selection/confirmation use readable cause/time/size and shared collapsed metadata. All-project scope and recovery/focus guards remain intact.

Verification: contracts/core/DB/server focused suites pass (including core6 and DB32 final canonical regressions); backend typechecks and boundary check pass. Frontend53 activity/restore/copy tests,46 style tests, export tests and285 a11y tests pass; web build/typecheck, source hygiene and whitespace pass. Existing unrelated58-line function size-policy issue remains.

Independent review found query-effect missing view dependency, outcome-implying tool wording, and inherited prototype label lookup. Fixed each and covered view round-trip reset and toString/constructor cases. Final reviewer found no residual demonstrated privacy/paging/Restore issues.

Live browser: changes/all transitions work; hash/session/object identifiers remain collapsed; ChangeSet buttons36px.390px Activity technical details and Restore rows have no overflow. Restore confirmation names readable cause/time and all-project scope; cancelled without mutation. Local server restarted gracefully to load API additions and left running. Viewport reset. No external connector or auth actions.
