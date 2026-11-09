---
title: Live board updates
type: feature
created: 2026-10-09
status: done
baseline_revision: 84e0df91dc492c26064e5052c39fde8381c45fbc
review_loop_iteration: 0
followup_review_recommended: true
context: [AGENTS.md, .wolf/OPENWOLF.md, .wolf/cerebrum.md, _bmad-output/implementation-artifacts/epic-3-context.md]
warnings: [oversized]
deferred: []
---

Reproducing statement: Implement Story 3.10 through bmad-build-auto: committed metadata-only live updates, durable replay/reset, shared browser-profile stream, coalesced invalidation and accessible interaction holds. Never write, stage, unstage or revert sprint-status.yaml; its rows do not establish verification. Date: 2026-10-09. Version: 2. Changelog: Preserved frozen plan; completed implementation, independent review repairs and final verification.

<intent-contract>

## Intent

**Problem:** Open Views do not receive committed Agent, GitHub sync or other-tab changes without reload. Uncontrolled snapshot refetches can replace editor drafts or move the focused board.

**Approach:** Persist ordered transaction metadata with Activity sequences, expose a post-commit SSE stream, and coordinate one profile-wide stream relayed to tabs. Coalesce query invalidations and external announcements while holding visible changes during user interaction.

## Boundaries & Constraints

**Always:** Fulfill Story 3.10 and AD11. Activity UUIDs remain available; add an integer autoincrement seq inside the transaction. One committed transaction produces one content-free message with id epoch:seq, entityType/entityId/version tuples and originClientId. Include truthful actor and Project metadata needed for scoped invalidation/announcements; unversioned entities use explicit null rather than invented versions. Persist transaction grouping/final metadata for ordered replay across reconnect/server restart. Notify only after commit; rollback emits nothing. Retain coalesced Card version semantics and canonical root ownership. Epoch is database-wide and changes on successful restore/archive replacement. Validate SSE Accept plus existing Host/Origin. Preserve shutdown admission/drains, audit durability and exact audit-only insert/no-other-write acceptance. Contracts are shared; SQL stays in db. Every browser mutation, including restore and multipart import, carries a per-tab origin header. No polling. Preserve dirty text, focus, domain behavior and source provenance.

**Never:** Touch user databases, credentials, sprint-status.yaml, caller-owned staged spec-3-11, deferred-work.md or unrelated changes. Infer verified state from sprint bookkeeping. Add SaaS, telemetry, provider calls, prototype migration compatibility, interpreter/transport fallbacks or new dependencies merely for testing. Resolve Story3.11 concurrency/history semantics, implement the future What changed panel, commit or push. This run hands source/spec/evidence back for orchestrator finalization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Commit / rollback | Multi-operation UoW, coalesced save, owned-child edit, shifted siblings, deleted root | One final canonical metadata message per successful transaction; monotonically ordered Activity seq; no content | Rollback emits/persists no committed message |
| Replay | Matching Last-Event-ID including restart/leader handoff | Missed transactions replay once in order; current live stream continues | Invalid cursor/Accept explicitly rejected; foreign epoch receives reset |
| Lifecycle | Successful or failed restore/archive replacement; idle/shutdown | Successful replacement resets all Views; failed candidate does not masquerade as success; heartbeat every 15s; streams close after drain before DB close | Stopping/restoring/unavailable admission refuses; disconnect releases resources |
| Shared tabs | Six actual tabs, new follower, leader closure and reconnect | One active stream per browser profile, every tab catches up, ordinary API remains responsive | Unsupported required platform/transport failure visible; reconnect is bounded without polling |
| Incoming changes | Agent/sync/other-tab commit, 30-operation burst | Visible within 2s when unheld; 100ms invalidation coalescing yields at most one refetch per query | Correlated ordinary application errors retained |
| Dirty / own echo | Unsaved text, own unrelated mutation, typing during save | Draft survives snapshot refetches and own event echo; no own announcement | Failed save retains typed text |
| Interaction holds | Dialog/popover/drag/text focus, focused tile move/delete, Hold updates | Queue shape updates; distinct affected count shown; apply after every hold ends; focus stays put | Drag cancel/unmount clears its hold; received cursor does not drop queued changes |
| Announcements | External actor/count burst and own echo | Central status announcements trailing-coalesced and at most once/5s; truthful actor/count, own echo silent | Existing safety announcements do not duplicate SSE notices |

</intent-contract>

## Code Map

- `packages/db/src/connection.ts:42`, `schema/tables.ts:344` — development DDL and Drizzle Activity schema must agree. AD9 permits disposable pre-tag in-place development schema changes, with exact restore/archive fingerprint matching.
- `packages/db/src/database-handle.ts:109`, `unit-of-work.ts:12` — synchronous transaction/beforeCommit and existing post-success hook. createdRoots/bumpedRoots alone miss coalesced saves; read exact repositories/tests before changing tracking.
- `packages/db/src/repositories/audit-repository.ts:40,68`, `root-versions.ts`, `cards-repository.ts:408,425`, `releases-repository.ts:80` — durable Activity insert, canonical versions, sibling updates and coalescing. Audit-only batches must retain one insert per tool call/no additional writes. Replay uses seq rather than timestamp paging.
- `packages/db/src/restore-history.ts:20,46`, `restore-project.ts:81`, `archive-database.ts:71` — preserved Activity copies, regenerated epochs and successful holder publication. Keep durable transaction metadata coherent in restored data.
- `packages/contracts/src/schemas/domain.ts:14,632` and schema/index exports — actor origin and Activity sequence; add shared wire schemas for event/cursor/header projection.
- `apps/server/src/server.ts:65`, `http/routes/application-route.ts`, `http/request-security.ts`, `http/restore-request-gate.ts:22`, `http/routes/infrastructure-routes.ts`, `services/project-archive.ts` — wire stream to current holder/UoW; all mutation actor paths; passive SSE exemption; drain then close streams.
- `apps/web/src/app/api.ts:96,133,149,527,575`, `app/routes/RootLayout.tsx:17` — all mutation helpers and multipart/restore paths; shared story-map query and stable header/coordinator mount.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:40,143`, `DescriptionEditor.tsx:24` — current remote identity effect resets drafts. Preserve editing baseline by selected Card identity, clean refresh and explicit successful matching save; protect typing during in-flight save.
- `apps/web/src/features/story-map/components/CardTile.tsx:56,104,135,168`, `DiscoveryMatrix.tsx:260`, `BacklogList.tsx:52`, `SwimlaneGrid.tsx:51`, `components/Dialog.tsx:115` — tile/popover identity, DnD lifecycle, portaled layers. Observe document-wide interaction; conservatively hold affected map while a tile is focused.
- `apps/web/src/app/stores/announcement-store.ts`, `features/safety/SafetySwitchStrip.tsx`, `ui-strings/index.ts` — central status region, avoid duplicate safety notices, centralized English copy.
- Tests: DB UoW/root-versions/restore, server runtime-lifecycle/unit-of-work/archive/restore/audit budgets, web card-detail/router/ui-strings. Chrome is installed; disposable headless Chrome with native Node WebSocket/CDP can verify actual tabs without new packages. Graph tools unavailable in this session; exact source wins.

## Tasks & Acceptance

**Execution:**
Use subagents for cohesive DB/server and browser/UI work as needed; assign nonoverlapping files and agree shared contracts before edits. Run native tests/builds serially. All agents preserve orchestrator-owned files.
- [x] Contracts, DB schema/UoW/audit/root ownership/replay and restore/archive paths above — persist exact transaction metadata and ordered sequences; cover changed versions, same-version saves, deletion and rollback without payload leakage or extra audit-only writes.
- [x] Server route/security/actor/gate/runtime paths above — serve validated SSE, bounded ordered replay, heartbeat, origin forwarding, successful epoch resets and correctly ordered closure.
- [x] Web API/root coordinator/query invalidation/UI strings — per-tab origin, BroadcastChannel leader with exclusive Web Lock, cursor bootstrap/handoff, fetch-based SSE Last-Event-ID, state and 100ms pending-query sets. Keep stream cursor separate from per-Project last-seen review cursor.
- [x] Web board/modal/dialog/DnD/announcement paths above — dirty baseline retention, document-wide interaction holds, manual Hold updates/waiting count, focused tile retention and actor/count announcements (UX trailing1.5s, rate5s,120characters). Reset refetches Views rather than reloading documents/discarding drafts.
- [x] Focused meaningful DB/server/web tests plus disposable actual server/browser acceptance — cover every matrix row; measure actual two-client≤2s, six-tab single connection/API responsiveness, leader handoff, held editor/focus/manual updates, real restore reset and coalesced burst refetch/announcements.

**Acceptance Criteria:**
- Given committed or rolled-back mutations, when observing GET /api/events with the required Accept, then only committed transactions appear once with final metadata, origin and ordered epoch:seq IDs and no content.
- Given matching/foreign cursors or a restored database, when reconnecting, then ordered replay/reset works across runtime restart and every open View refetches on reset.
- Given actual Agent/sync/other-tab writes and unheld Views, when the transaction commits, then two actual clients show the new map within2s; six same-profile tabs share one stream without starving API calls.
- Given own mutations, a dirty editor or typing during save, when any snapshot refetch/event arrives, then unsaved text survives and own echoes are not announced.
- Given focused interactions/manual hold or tile displacement/removal, when metadata arrives, then queued changes and waiting count remain until focus/interaction/hold ends, without moving focus.
- Given a30-operation transaction and external actor, when delivered, then queries refetch at most once per100ms batch and truthful status messages occur at most once per5s.
- Given idle or shutting down runtime, when observing actual sockets, then15s heartbeats occur and streams close after admitted work drains before SQLite closure.

## Spec Change Log

- 2026-10-09, implementation refinement: a live commit arriving during an initial uncached map fetch now cancels the obsolete request before refetching. Active Project ownership covers initial queries without cached snapshots; unrelated cached Projects remain scoped. The frozen intent is unchanged.

## Review Triage Log

### 2026-10-09 — Review pass

- verdicts:22 findings — high2, medium13, low0, false7, maybe-false0.
- findings (reported layer order; shared roots retain separate rows):
  - `[medium]` `[patch]` Edge1: interaction begins during live refetch — `flush` checks holds only before awaiting the GET; its response can replace a focused tile. Cancel/requeue the active live batch on hold start.
  - `[medium]` `[patch]` Edge2: former leader answers stale welcomes — the lock callback exits on terminal failure without clearing `leader`. Clear it in `finally`; shares Blind1's root.
  - `[high]` `[patch]` Edge3: deleted edited Card loses dirty text — `makeDraft(null)` changes identity and `if (!card) return null` removes the editor after an own refetch observes deletion. Retain the selected editor baseline/draft across that disappearance.
  - `[medium]` `[patch]` Blind1: terminal former leader relays stale state — verified callback exit leaves the flag set. Same repair as Edge2.
  - `[medium]` `[patch]` Blind2: malformed stream leaves its request subscribed — parser `finally` releases the lock without canceling the body. Cancel the reader before releasing it.
  - `[medium]` `[patch]` Blind3: valid large transaction reconnects forever — unbounded metadata can exceed the output-plus-buffer threshold; the parser independently refuses a split large frame. Bound queued backpressure while permitting a valid single frame; remove the undocumented frame cap.
  - `[medium]` `[patch]` Blind4: a silent body remains connected — after metadata, no idle timer observes missing fifteen-second comments. Add a thirty-second byte-activity deadline feeding existing bounded reconnect/reporting.
  - `[medium]` `[patch]` Blind5: holds starting during refetch do not hold — verified pending GET is not canceled by interaction events. Same cancellation/requeue repair as Edge1.
  - `[medium]` `[patch]` Blind6: non-map focus/reconnect refetch bypasses manual hold — the other domain hooks retain TanStack defaults while the hold queue only gates SSE invalidation. Disable those triggers for live-managed hooks as already done for the map.
  - `[high]` `[patch]` Blind7: Product Context auto-refresh replaces dirty text — its timestamp effect unconditionally calls `setContextDraft`. Preserve an identity baseline/dirty draft and matching submitted-save semantics.
  - `[medium]` `[patch]` Blind8: clean selected Persona stays stale — detail state initializes only once under a stable key. Refresh clean fields from props while preserving edited fields.
  - `[medium]` `[patch]` Blind9: failed refetch is called applied — default invalidation resolves on fetch error, after the queue was cleared, then persists cursor/announces. Require successful completion, retain failed work and use existing failure reporting.
  - `[medium]` `[defer]` Blind10: own mutation omits dependent caches — baseline Persona callbacks already omit map/report invalidation. This inherited own-mutation issue is recorded once in frontmatter; external SSE delivery remains this story's scope.
  - `[medium]` `[patch]` Gap1: automated follower delivery is mocked away — filed evidence shows no-op `postMessage` and always-granted lock. Add functional multi-instance relay/serialized leadership assertions, including handoff.
  - `[medium]` `[patch]` Gap2: replacement safety-pill live path is unasserted — filed searches show fixed mocked values and no delivered safety event. Add real mounted strip/query assertions with Project isolation.
  - `[false]` `[reject]` Intent1: source diff cannot establish workflow/file-operation history — this is an evidence boundary, not a source defect. Parent tool history records the single activation and protected hashes are identical; no protected-file operation occurred.
  - `[false]` `[reject]` Intent2: no separate live GitHub timing measurement — the common post-commit UoW envelope is producer-independent and actual Agent/other-tab paths establish browser timing; no live-provider timing claim is made. No demonstrated failure requires provider mutation.
  - `[false]` `[reject]` Intent3: map cases do not enumerate every reset View — reset selection explicitly includes every registered non-static query except credential status and AI templates. The listed tests demonstrate concrete instances rather than claiming exhaustive per-hook UI assertions.
  - `[false]` `[reject]` Intent4: document-wide hold is conservative — this intentionally satisfies the interaction/focus requirement through coarse snapshots. No harmful outcome was identified merely from holding additional domain queries.
  - `[false]` `[reject]` Intent5: own echo is discarded — silent own echoes plus existing mutation refresh is a defensible implementation of the intent. The inherited dependency omission is separately verified and deferred as Blind10.
  - `[false]` `[reject]` Intent6: example What changed phrase omitted — the navigable panel belongs to later change-review scope; actor/count copy fulfills current announcement behavior without inventing navigation.
  - `[false]` `[reject]` Intent7: historical browser numbers differ from the latest artifact — evidence sections explicitly identify implementation and later independent runs; both pass, and the final section matches the current209.86ms/13.39ms JSON. Manual acceptance is permitted; missing automated relay/safety checks are separately patched as Gap1/Gap2.

Grouped repairs:12 entries (high2,medium10),14 finding rows. One inherited medium dependency omission is deferred; seven descriptive claims are rejected with the evidence above. All patch actions were applied by the original implementation agent and independently verified by the parent before completion.

### 2026-10-09 — Parent repair inspection

- verdicts:1 finding — high0,medium1,low0,false0,maybe-false0.
- `[medium]` `[patch]` Pending replay switched to live too soon — after adding asynchronous drain waits, `replaying=false` preceded queued-live drainage. A new live commit during the wait advanced the cursor past an older unsent pending event, causing that event to be skipped. Kept replay mode through repeated pending batches; the deterministic drain interleaving regression passes with every event once in order.

## Design Notes

Use existing beforeCommit/post-commit and holder lifecycle seams. Never assume a version bump or Activity payload implies every affected owner. A fetch SSE reader supports Last-Event-ID on a new profile leader; native EventSource cannot set that request header. Exclusive Web Locks plus BroadcastChannel relay avoid timer-election split brain without a fallback. Actor identity comes from transaction metadata rather than origin inference. Future What changed navigation is separate scope; current announcements must be truthful without an invented panel.

## Verification

- Run focused contracts/DB/server/web cases for every matrix row; all covering cases must actually pass, with output recorded here.
- Execute isolated real Chromium/CDP acceptance and record actual timing, stream counts, query counts, leader handoff, hold/focus/dirty/restore evidence and cleanup. Use temporary disposable Projects only; do not add production configurability to enable tests.
- Run serially `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `node scripts/verify.mjs`, `git diff --check`. Preserve mandatory audit insert/count and absolute burst budgets; relative overhead is diagnostic per existing user decision.
- Verify diffs/hashes for sprint-status.yaml and caller-owned spec3.11 remain untouched by this run. Stage only reviewed task paths if workflow review requires; exclude caller-owned staged paths. No commit/push; orchestrator finalizes.

### Matrix coverage audit

Every covering case below ran and passed in the focused suites and browser acceptance. The final workspace rerun is recorded separately.

| Matrix row | Executed coverage |
|------------|-------------------|
| Commit / rollback | DB live-events: thirty-operation grouping, canonical versions, owned children, sibling normalization, deletion, rollback and post-commit hook failure |
| Replay | DB reopen replay; server durable restart replay and 450 missed commits followed by a live commit; browser follower cursor and leader handoff |
| Lifecycle | Server actual restore/archive replacement, invalid candidate refusal, fifteen-second heartbeat, asynchronous admitted-work drain and socket/storage shutdown order |
| Shared tabs | Actual Chrome six-tab single stream, twelve ordinary API requests and leader replacement; transport cursor/reconnect/empty-EOF tests |
| Incoming changes | Mounted Project-scoped thirty-operation coalescing; obsolete and initial uncached fetch cancellation; actual six-client Agent timing and bulk query counts |
| Dirty / own echo | Card-detail dirty title/description and typing during Save; mutation-origin helper test; actual dirty editor, browser Save and zero own announcements |
| Interaction holds | Six mounted tile/text/dialog/popover/drag/manual cases; held reset; actual manual hold and focused tile deletion retained until blur |
| Announcements | Trailing/rate/actor/count/length unit test; mounted own-echo suppression; actual thirty-Card transaction emits one truthful status |

### Implementation evidence — 2026-10-09

Reproducing statement: Implement the frozen Story3.10 contract above, preserve caller-owned sprint/spec3.11 state, and verify durable committed transport plus actual shared-browser behavior. Evidence version:2. Changelog: Added implemented source and executed verification; orchestrator review/finalization remains separate.

- Contracts/DB: shared content-free event/header/cursor schemas; Activity autoincrement sequences/transaction grouping; database-wide singleton epoch; canonical final versions including coalesced saves, normalized siblings, owned children and deletion. Isolated writes receive one Activity record; existing audit writes remain unduplicated. Successful restore/archive replacement resets subscribers; rollback/failed replacement emits nothing.
- Server: validated `/api/events`, bounded200-transaction replay pages, request-origin propagation including async terminal audit batches,15-second heartbeats and admitted-work drain before stream/storage closure. Real sockets cover450 missed commits followed by a live commit, restart replay, actual restore/archive reset and shutdown.
- Browser: one exclusive Web Lock/BroadcastChannel-relayed fetch stream per profile, monotonic transport cursor and separate applied Project cursors,100ms query sets, bounded reconnect, document-wide holds/manual hold/waiting count, dirty-baseline retention and typing-during-save protection. Actor/count announcements use1.5-second trailing coalescing,5-second rate limits and120-character maximum; own echoes remain silent.
- Full `corepack pnpm test`:849 passed plus2 inherited Windows permission skips before the final empty-EOF transport correction (Scripts75,Contracts26,Core30,Importers2,Web124,DB242,Server350). After that correction the entire Web suite passes125; focused parser/stream6 cases pass. Every final changed behavior has passing coverage. The orchestrator will independently rerun the full final range.
- All five strict audit workloads pass exact100 inserts/no other writes and every burst<1second; largest full-gate median757.48ms. Relative overhead remains diagnostic. The1000-Card concurrent health request measured99.50ms with79.91ms actual snapshot processing.
- `corepack pnpm typecheck`, `corepack pnpm check-capabilities` (108), `corepack pnpm build`, full final `node scripts/verify.mjs`, `git diff --check` and task-scoped staged whitespace checks pass. The caller-owned staged spec3.11 has its pre-existing blank-line-at-EOF warning and was left untouched. Existing Zod/Rollup annotation and bundle-size advisories remain.
- Fresh actual Chrome/CDP acceptance passes; durable results are in `evidence-3-10-browser.json`: six actual tabs share one active stream; twelve ordinary API requests finish in12.62ms; Agent changes appear in all six tabs in180.94ms. Closing the leader leaves one replacement stream/five updated tabs. Manual hold and focused deletion retain visible state/focus until released. Dirty editor text survives incoming changes. A real browser Save carries its tab UUID, updates four other tabs and produces zero own announcements. A30-Card transaction produces exactly one snapshot GET per tab and one truthful30-Card status message. Actual snapshot restore refetches each of five Views once; zero browser exceptions. Own disposable Chrome/server processes close cleanly; fixture/evidence folders are retained in system temp.
- Earlier browser attempts corrected harness navigation readiness, actual delete/restore request shapes and isolation of prior trailing external announcements; they did not expose an application failure. No user databases/credentials, sprint-status.yaml, caller-owned spec3.11, deferred-work.md, commit or push were touched. Only task source/spec/context/evidence paths were staged for tracked-file verification fixtures.

### Independent parent verification — 2026-10-09

Reproducing statement: Independently inspect and verify the complete implementation, including the initial uncached-fetch repair, without changing orchestrator bookkeeping. Version:3. Changelog: Adds final source, browser and package evidence.

- The parent read the complete baseline diff, reproduced the uncached first-fetch race, reviewed its three-file repair and verified its mounted AbortSignal regression. All final package suites pass:776 tests (Contracts26,Core30,Importers2,Web126,DB242,Server350). Launcher/script coverage totals75 passing cases plus2 inherited Windows permission skips: the combined run had74 passes and one transient4317 collision; all six runtime-port cases subsequently passed unchanged in isolation. No test expectation was weakened. The earlier independent full workspace run passed850 before the final one-case UI repair.
- Final workspace typecheck,108-capability parity, build and full `node scripts/verify.mjs` pass. Working-tree and task-scoped staged whitespace checks pass. Protected sprint/spec3.11 SHA256 hashes still match their session-start values; HEAD is unchanged.
- Final actual Chrome evidence replaces the earlier run in `evidence-3-10-browser.json`: six tabs/one stream, Agent visibility209.86ms, twelve ordinary API requests13.39ms, one stream after leader closure, holds/focus/dirty preservation, real browser Save/zero own announcements, one refetch per tab for the thirty-Card transaction and actual restore, zero browser exceptions. Disposable processes closed cleanly.

## Auto Run Result

Reproducing statement: Complete Story3.10 through the invoked automatic build skill, independently inspect and verify committed live updates, and preserve orchestrator-owned files. Date:2026-10-09. Version:1. Changelog: Final reviewed implementation and executed evidence.

Implemented durable metadata-only committed transactions,replay/reset and database epochs; validated SSE with origin attribution,heartbeats,backpressure and orderly shutdown; one browser-profile stream; coalesced scoped refreshes,interaction holds,truthful announcements and preserved editor drafts.

- Review:23 triaged findings. Fifteen rows were repaired in13 root entries (high2,medium11); one inherited medium own-Persona dependency invalidation is deferred; seven descriptive findings are rejected individually with reasons in the triage log. No finding was dropped.
- Follow-up review recommended:true. Two high draft-loss entries and eleven medium entries were repaired. Additional actual-browser timing combinations involving hold-start cancellation and editor disappearance during an own refetch remain unverified beyond mounted regressions and the exercised Chrome map flow; a fresh review should focus on those interactions.
- Final full `corepack pnpm test`:874 passed plus2 inherited Windows permission skips (Scripts75,Contracts26,Core30,Importers2,Web145,DB242,Server354). All matrix rows have executed passing coverage. A later typecheck caught a test-only Node overload; adding explicit default UTF8 encoding preserves behavior, and its exact drain regression/workspace typecheck passed again.
- Final `corepack pnpm typecheck`,`check-capabilities` (108),`build` and full `node scripts/verify.mjs` pass. All five audit workloads retain exact100 inserts/no other writes and every burst<1s; largest median771.11ms. Task whitespace checks pass; caller spec3.11's pre-existing staged EOF warning remains untouched.
- Final Chrome:221.39ms Agent delivery across6 actual tabs/1 stream;twelve ordinary API requests12.88ms;one stream after leader closure;manual/focus/dirty holds;real Save with zero own announcements;one refetch/tab for30-Card bulk and actual restore;zero browser exceptions. Disposable processes closed; final JSON evidence and temporary harness/fixture folders are retained.
- Frozen intent SHA256 remains82a208a8e80a821ef15d0ba94d2240eb427e436a9ab28dfd35a14b5f673fc2cc. Sprint/spec3.11 hashes and HEAD match their session-start values. No user database/credential,orchestrator sprint/caller spec,or deferred ledger was changed.
- Source/spec/evidence are staged for orchestrator finalization. No commit/push: the frozen contract and global commit policy govern finalization. Caller-owned staged changes remain as received; they are not defects to clean up. Existing Rollup advisories and platform skips remain. OpenWolf scan refreshed new source entries and preserved unvisited entries when its scan was partial.

### Changed files

| File | Change |
|------|--------|
| [.wolf/STATUS.md](../../.wolf/STATUS.md) | Current quest, executed verification and orchestrator handoff. |
| [.wolf/anatomy-index.json](../../.wolf/anatomy-index.json) | Generated structured source metadata; retained unvisited entries. |
| [.wolf/anatomy.md](../../.wolf/anatomy.md) | Generated source navigation index for new live/editor files. |
| [.wolf/buglog.json](../../.wolf/buglog.json) | Fourteen verified implementation/harness/verification observations. |
| [.wolf/cerebrum.md](../../.wolf/cerebrum.md) | Learnings on initial fetches, holds, audit origin and replay drainage. |
| [.wolf/memory.md](../../.wolf/memory.md) | One-line session outcome with protected-file ownership. |
| [_bmad-output/implementation-artifacts/epic-3-context.md](../../_bmad-output/implementation-artifacts/epic-3-context.md) | Regenerated Epic3 implementation constraints and dependencies. |
| [_bmad-output/implementation-artifacts/evidence-3-10-browser.json](../../_bmad-output/implementation-artifacts/evidence-3-10-browser.json) | Final isolated actual Chrome acceptance measurements. |
| [_bmad-output/implementation-artifacts/spec-3-10-live-board-updates.md](../../_bmad-output/implementation-artifacts/spec-3-10-live-board-updates.md) | Frozen contract, matrix audit, all review dispositions and results. |
| [apps/server/src/http/live-events.test.ts](../../apps/server/src/http/live-events.test.ts) | Twelve real-socket/replay/restore/heartbeat/backpressure cases. |
| [apps/server/src/http/live-events.ts](../../apps/server/src/http/live-events.ts) | Validated SSE, bounded ordered replay, heartbeats and drain-aware output. |
| [apps/server/src/http/request-origin.ts](../../apps/server/src/http/request-origin.ts) | AsyncLocalStorage request origin propagation. |
| [apps/server/src/http/restore-request-gate.ts](../../apps/server/src/http/restore-request-gate.ts) | Passive SSE admission during ordinary lifecycle gates. |
| [apps/server/src/http/routes/export-routes.ts](../../apps/server/src/http/routes/export-routes.ts) | Origin-aware archive operation actor context. |
| [apps/server/src/http/routes/infrastructure-routes.ts](../../apps/server/src/http/routes/infrastructure-routes.ts) | Database-wide epoch in runtime health. |
| [apps/server/src/http/routes/restore-points.ts](../../apps/server/src/http/routes/restore-points.ts) | Origin-aware restore operation actor context. |
| [apps/server/src/mcp/tools/tool-call-recorder.ts](../../apps/server/src/mcp/tools/tool-call-recorder.ts) | Retained async context and origin-partitioned terminal audit batches. |
| [apps/server/src/server.ts](../../apps/server/src/server.ts) | Origin installation, stream runtime wiring and ordered shutdown. |
| [apps/server/src/services/project-archive.test.ts](../../apps/server/src/services/project-archive.test.ts) | Archive replacement epoch assertions. |
| [apps/web/src/app/api.ts](../../apps/web/src/app/api.ts) | Per-tab mutation origin, query cancellation and live-domain refetch policy. |
| [apps/web/src/app/live/live-announcements.test.ts](../../apps/web/src/app/live/live-announcements.test.ts) | Trailing/rate/actor/count/length assertions. |
| [apps/web/src/app/live/live-announcements.ts](../../apps/web/src/app/live/live-announcements.ts) | Central coalesced actor/count status notices. |
| [apps/web/src/app/live/live-client-id.ts](../../apps/web/src/app/live/live-client-id.ts) | Per-tab UUID origin identity. |
| [apps/web/src/app/live/live-interaction-store.ts](../../apps/web/src/app/live/live-interaction-store.ts) | Manual/drag/document interaction holds and waiting count. |
| [apps/web/src/app/live/live-origin.test.ts](../../apps/web/src/app/live/live-origin.test.ts) | JSON,DELETE,restore and multipart mutation-origin coverage. |
| [apps/web/src/app/live/live-query-invalidation.ts](../../apps/web/src/app/live/live-query-invalidation.ts) | Project/entity-scoped query sets including initial reads. |
| [apps/web/src/app/live/live-stream-reader.test.ts](../../apps/web/src/app/live/live-stream-reader.test.ts) | Framing,malformed cancellation,large frame and heartbeat idle cases. |
| [apps/web/src/app/live/live-stream-reader.ts](../../apps/web/src/app/live/live-stream-reader.ts) | Shared-schema SSE parsing,reader cleanup and byte-idle deadline. |
| [apps/web/src/app/live/live-stream.test.ts](../../apps/web/src/app/live/live-stream.test.ts) | Cursor/bootstrap,backoff,functional relay and leader handoff. |
| [apps/web/src/app/live/live-stream.ts](../../apps/web/src/app/live/live-stream.ts) | One locked profile stream,channel relay and bounded reconnect. |
| [apps/web/src/app/live/live-updates.test.tsx](../../apps/web/src/app/live/live-updates.test.tsx) | Nineteen scoped invalidation,hold/fetch race,failure and safety cases. |
| [apps/web/src/app/live/useLiveUpdates.ts](../../apps/web/src/app/live/useLiveUpdates.ts) | Pending batches,hold-start cancellation and successful applied cursors. |
| [apps/web/src/app/routes/RootLayout.tsx](../../apps/web/src/app/routes/RootLayout.tsx) | Live coordinator,status and Hold updates controls. |
| [apps/web/src/features/ai-mcp/context-draft.test.ts](../../apps/web/src/features/ai-mcp/context-draft.test.ts) | Product Context clean/dirty/save/scope assertions. |
| [apps/web/src/features/ai-mcp/useAiMcpPanelState.ts](../../apps/web/src/features/ai-mcp/useAiMcpPanelState.ts) | Product Context draft baseline and matching submitted-save handling. |
| [apps/web/src/features/personas/PersonaDetail.test.ts](../../apps/web/src/features/personas/PersonaDetail.test.ts) | Persona clean-field refresh,dirty preservation and save cases. |
| [apps/web/src/features/personas/PersonaDetail.tsx](../../apps/web/src/features/personas/PersonaDetail.tsx) | Per-field baseline refresh preserving subsequent edits. |
| [apps/web/src/features/releases/ReleaseKanban.tsx](../../apps/web/src/features/releases/ReleaseKanban.tsx) | Focused Card identity markers. |
| [apps/web/src/features/restore-points/restore-points.test.ts](../../apps/web/src/features/restore-points/restore-points.test.ts) | Mutation-origin and live-coordinator fixture alignment. |
| [apps/web/src/features/safety/SafetySwitchStrip.tsx](../../apps/web/src/features/safety/SafetySwitchStrip.tsx) | Central live safety refresh replacing duplicate channel notices. |
| [apps/web/src/features/story-map/components/BacklogList.tsx](../../apps/web/src/features/story-map/components/BacklogList.tsx) | Drag hold lifecycle wiring. |
| [apps/web/src/features/story-map/components/CardDetailModal.tsx](../../apps/web/src/features/story-map/components/CardDetailModal.tsx) | Dirty/save baselines and retained editor when selected Card disappears. |
| [apps/web/src/features/story-map/components/CardTile.tsx](../../apps/web/src/features/story-map/components/CardTile.tsx) | Focused Card and popover interaction markers. |
| [apps/web/src/features/story-map/components/DiscoveryMatrix.tsx](../../apps/web/src/features/story-map/components/DiscoveryMatrix.tsx) | Drag hold lifecycle wiring. |
| [apps/web/src/features/story-map/components/SwimlaneGrid.tsx](../../apps/web/src/features/story-map/components/SwimlaneGrid.tsx) | Drag hold lifecycle wiring. |
| [apps/web/src/features/story-map/components/TreeGrid.tsx](../../apps/web/src/features/story-map/components/TreeGrid.tsx) | Focused Card identity markers. |
| [apps/web/src/features/story-map/components/card-detail.test.ts](../../apps/web/src/features/story-map/components/card-detail.test.ts) | Draft refetch,typing during Save and deleted editor regressions. |
| [apps/web/src/ui-strings/index.ts](../../apps/web/src/ui-strings/index.ts) | Central live connection,hold/waiting and actor/count copy. |
| [packages/contracts/src/events/live-events.test.ts](../../packages/contracts/src/events/live-events.test.ts) | Strict content-free envelopes,cursors and origins. |
| [packages/contracts/src/events/live-events.ts](../../packages/contracts/src/events/live-events.ts) | Single shared live envelope/header/cursor schemas. |
| [packages/contracts/src/index.ts](../../packages/contracts/src/index.ts) | Export shared live schemas and types. |
| [packages/contracts/src/schemas/domain.ts](../../packages/contracts/src/schemas/domain.ts) | Optional origin context and Activity sequence. |
| [packages/db/src/archive-database.ts](../../packages/db/src/archive-database.ts) | Replacement database epoch regeneration. |
| [packages/db/src/connection.ts](../../packages/db/src/connection.ts) | Activity sequence/grouping DDL and database-wide singleton epoch. |
| [packages/db/src/database-handle.ts](../../packages/db/src/database-handle.ts) | Transaction identity and canonical live tracking context. |
| [packages/db/src/index.ts](../../packages/db/src/index.ts) | Export durable live cursor/replay APIs. |
| [packages/db/src/live-change-tracking.ts](../../packages/db/src/live-change-tracking.ts) | Canonical root ownership and final versions. |
| [packages/db/src/live-events.test.ts](../../packages/db/src/live-events.test.ts) | Eight durable grouping/version/rollback/audit/restore cases. |
| [packages/db/src/live-events.ts](../../packages/db/src/live-events.ts) | Persist final transaction metadata and ordered grouped replay. |
| [packages/db/src/repositories/audit-repository.ts](../../packages/db/src/repositories/audit-repository.ts) | Sequence/group/origin metadata in audit INSERTs. |
| [packages/db/src/repositories/cards-repository.ts](../../packages/db/src/repositories/cards-repository.ts) | Track coalesced Card writes and changed siblings. |
| [packages/db/src/repositories/customizations-repository.ts](../../packages/db/src/repositories/customizations-repository.ts) | Track owned customization changes. |
| [packages/db/src/repositories/getting-started-store.ts](../../packages/db/src/repositories/getting-started-store.ts) | Track settings-only checklist changes. |
| [packages/db/src/repositories/project-repository.ts](../../packages/db/src/repositories/project-repository.ts) | Track Product Context/project-owned changes. |
| [packages/db/src/repositories/projects-repository.ts](../../packages/db/src/repositories/projects-repository.ts) | Track Project changes and shared epoch access. |
| [packages/db/src/repositories/root-versions.ts](../../packages/db/src/repositories/root-versions.ts) | Live root tracking alongside unchanged concurrency semantics. |
| [packages/db/src/repositories/row-mappers.ts](../../packages/db/src/repositories/row-mappers.ts) | Project Activity sequence into domain records. |
| [packages/db/src/repositories/work-item-repository.ts](../../packages/db/src/repositories/work-item-repository.ts) | Track isolated remote links/conflicts without duplicate audit. |
| [packages/db/src/restore-history.ts](../../packages/db/src/restore-history.ts) | Retain UUID/group history while allocating replacement sequences. |
| [packages/db/src/restore-recovery.ts](../../packages/db/src/restore-recovery.ts) | Validate database-wide epoch metadata in recovery candidates. |
| [packages/db/src/schema/classification.ts](../../packages/db/src/schema/classification.ts) | Classify database metadata as a runtime table. |
| [packages/db/src/schema/tables.ts](../../packages/db/src/schema/tables.ts) | Drizzle Activity grouping/sequence and singleton metadata schema. |
| [packages/db/src/unit-of-work.ts](../../packages/db/src/unit-of-work.ts) | Finalize canonical metadata before commit;notify only after commit. |

## Post-Done Follow-up (2026-10-09)

- Deferred own-Persona dependency omission repaired: `PersonaDetail` update/delete now invalidates cached Story Map and Card report queries, covered by a test against previously cached queries.
- AD-7 Card version semantics changed by `docs/adr/0002-bump-card-version-on-coalesced-save.md`: the line "Retain coalesced Card version semantics" is superseded; live events carry the bumped version. `live-events.test.ts` follows the new semantics; no live-layer code changed.
