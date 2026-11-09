---
title: One writer, health and orderly shutdown
type: feature
created: 2026-10-08
status: done
baseline_revision: 322e7d7112e1026b25947af739ef301f5de8ceda
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: [oversized]
deferred:
  - summary: >-
      Imported raw GitHub title/body hashes can appear stale in the existing normalized sync-health report.
    evidence: |-
      Baseline Python insert_links and update_existing_card hashed raw detail.title/detail.body. The HTTP transport retains those baselines; core sync-health compares normalized Card titles and formatted bodies. Changing that inherited representation requires separate sync semantics work.
    location: >-
      packages/db/src/repositories/tool-proposals-repository.ts; packages/core/src/reports/sync-health.ts
    severity: medium
  - summary: >-
      Existing orphan Story placement in the board tool conflicts with the skill's Not assigned authoring policy.
    evidence: |-
      Baseline Python resolved_parent used the Parking lot Step for orphan Stories, whereas both baseline skill copies specify Not assigned. This story preserves both established behavior and authoring instructions rather than silently choosing a new policy.
    location: >-
      tools/import_github_board_view.py; .agents/skills/github-board-import/SKILL.md; .claude/skills/github-board-import/SKILL.md
    severity: medium
  - summary: >-
      Map copies do not retain direct GitHub issue relationships, matching the pre-existing copy tool.
    evidence: |-
      Baseline tools/copy_story_map.py did not copy GitHub link tables. Current copies retain Source links and attachments and record sourceStoryMapId in the auditable copy action, but no per-Card direct GitHub link. A provenance-only relationship design must distinguish source attribution from remote sync ownership.
    location: >-
      packages/db/src/repositories/map-copy-repository.ts
    severity: medium
  - summary: >-
      Actual POSIX operating-system signal acceptance remains unexecuted on the Windows host.
    evidence: |-
      Windows tests run the installed Node signal handlers through fixture IPC, plus real owned IPC shutdown and durable audits. Real SIGINT/SIGTERM branches exist but require a POSIX run; Windows evidence does not prove those platform boundaries.
    location: >-
      apps/server/src/runtime-lifecycle.test.ts
    severity: medium (unverified)
---

Reproducing statement: Implement Story 3.9 through bmad-build-auto: exclusive writer ownership, operational health and doctor, SQLite pragmas, rotating sanitized logs, orderly shutdown, and HTTP-only local data tools. Preserve orchestrator ownership of sprint-status.yaml; never write, stage or revert it, or infer verification from its rows. Date: 2026-10-13. Version: 3. Changelog: Verify existing done status and record the actual orchestrator finalization commit; preserve historical execution evidence.

<intent-contract>

## Intent

**Problem:** The server opens SQLite without exclusive Project ownership, exposes only basic discovery health, and closes without an explicit checkpoint. Two Python tools independently open SQLite and bypass the server's writer and audit controls.

**Approach:** Acquire an exclusive owned Project lock before opening its writable database; retain ownership through runtime database replacements. Expose contract-backed operational health, configure pragmas and sanitized rotating logs, drain before checkpoint/close and ownership cleanup, and route local data tools through scoped HTTP proposal/apply commands.

## Boundaries & Constraints

**Always:** Follow AD-12 and existing contracts/application/repository/UoW boundaries. One server remains the only writer. Lock metadata contains PID and process start time; live-owner refusal names both, dead-owner takeover is logged. Acquire ownership before any writable open, including archive-import replacement; retain the startup directory lock for runtime discovery. Use shared persisted epoch and existing schema fingerprint, truthful pending migration (null while no migration journal exists), and actual write-gate state. Preserve loopback/security, human-only controls, real MCP session/audit drains, restore and archive lifecycle, provenance and script transaction semantics. External/script changes produce a ChangeSet first, with separately auditable application. Logs are under the startup Project logs directory, five total files capped at 10 MB each, without credentials, full payloads or personal paths. All scripts/skills touching Agentic Story Mapper use HTTP; ordinary GitHub-only dry-run may remain offline.

**Never:** Change sprint-status.yaml, user databases, credentials or unrelated debt. Add SaaS, telemetry, LLM providers, new persistence mechanisms, universal Epic 4 executor routing, backward compatibility, silent cleanup failures or speculative configuration. Treat status rows as proof. Push or run live GitHub mutations for acceptance. Add an SSE feature ahead of Story 3.10; close existing MCP streams.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| First/second writer | Available Project / live lock | First owns lock before DB open; second refuses with owner's PID/start time | No second DB write or runtime-file deletion |
| Dead or invalid owner | Dead PID / malformed lock | Dead owner is reclaimed with a log entry; malformed ownership refuses explicitly | Never overwrite an unproved/live owner |
| Ownership races | Concurrent starts or replaced owned file | Exactly one writer; cleanup removes only this runtime's owned files | Explicit refusal/failure, preserve other owner |
| Database replacement | Restore or imported sibling Project | Same-path restore retains lock; imported DB locked before opening; startup discovery retained | Failed switch cleans candidate ownership and preserves original usable writer |
| Operational health | Running, restoring or unavailable writer | Version/schema/epoch/write-gate/pending-migration reflect current runtime without personal paths | Typed/bounded report; no fabricated epoch |
| Shutdown/startup failure | Signal/IPC, admitted long or disconnected call, failed listen/publication | Stop admission, await work and durable audits, close streams, checkpoint/close current DB, remove owned lock/port | Failure explicit; repeated shutdown shares completion |
| Tool proposal/apply | Board import/sync or complete map copy | HTTP reads/proposal then separate auditable apply; preserve copied relationships, import source links and sync baselines atomically | Validation/refusal applies nothing; no direct SQLite or file backup |

</intent-contract>

## Code Map

- `apps/server/src/server.ts:buildServer`, `main.ts:shutDown/startupFailure`, `config/runtime-port.ts:installRuntimePort` — writable open precedes ownership; reverse close-hook order can remove .port too early; preserve UUID-owner cleanup and stable startup identity.
- `packages/db/src/connection.ts:openStoryMapperDb/openExistingStoryMapperDb`, `database-handle.ts:DatabaseHandle` — set requested pragmas on both opens; reuse exclusive gate and request draining, expose truthful lifecycle state. `restore-project` keeps same-path ownership.
- `apps/server/src/services/project-archive.ts:importProjectArchive/switchDatabase` — publishes imported sibling, closes old and assigns handle.current; lock candidate before open, keep startup lock and release superseded imported ownership only after DB close.
- `apps/server/src/http/restore-request-gate.ts`, `mcp/http.ts:preClose` — actual admission/request/session and durable audit draining; passive MCP GET is deliberately excluded. No /api/events yet.
- `apps/server/src/http/routes/infrastructure-routes.ts`, `packages/contracts/src/schemas` — add operational /api/health while retaining discovery /health. Existing DB developmentSchemaVersion and getSafetySettings epoch are authoritative.
- `scripts/runtime.mjs`, `diagnostics.mjs`, `doctor.mjs`, `launcher.mjs` — bounded/no-redirect runtime health and .port identity; doctor has seven independent checks; IPC stop currently force-kills after two seconds and can interrupt admitted work.
- `tools/import_github_board_view.py` — direct connections in import, sync planning and apply, plus raw database/WAL copies. Imports maps/cards/card versions/connectors/GitHub links and remote baselines. `tools/copy_story_map.py` copies maps/releases/cards/personas/statuses/annotations/templates/context and owned links/Roadmap children.
- `.agents/skills/github-board-import/SKILL.md`, `.claude/skills/github-board-import/SKILL.md` — update both direct SQLite instructions and stale scripts/ path. No other direct SQLite tool identified.
- Existing HTTP routes lack atomic board-import/copy commands and public remote-baseline creation; existing ChangeSet apply only handles Cards, Releases, Personas and Source links. Extend only the scoped operations required by these tools, retaining proposal/approval/application policy and manifests; do not replace with partially committing sequential calls.
- Tests: `server.test.ts`, `main.test.ts`, `mcp/http.test.ts`, `mcp/tools/tool-call-audit.test.ts`, `scripts/runtime-port.test.mjs`, `doctor.test.mjs`, DB restore/archive/pragmas tests. `restore-points.test.ts` supplies a real 1,000-Card fixture. Graph tools unavailable; summaries and exact source verification govern implementation.

## Tasks & Acceptance

**Execution:**
Use subagents as needed, as explicitly authorized by the user; coordinate shared files and run builds/tests serially.
- [x] Server runtime/config, main, DB handle/connection and archive service paths above — implement exclusive owned locks, takeover and lifecycle integration, explicit pragmas, safe rotating logging and ordered cleanup including startup failures.
- [x] Contracts, infrastructure routes, runtime/doctor/diagnostics — expose and consume operational health without duplicating schemas; preserve existing discovery and doctor failure/read-only behavior.
- [x] Server contracts/application/repositories/ChangeSet handlers and both Python tools — add scoped atomic HTTP proposal/apply paths as needed to preserve existing tool behavior; remove all direct SQLite opens/copies and convert sync planning to HTTP reads.
- [x] Both board-import skill copies — document actual HTTP commands, proposal/apply review, dry-run and server requirement; do not retain obsolete direct-DB workflow.
- [x] Meaningful acceptance tests — real competing processes/dead ownership/races, actual signals and long admitted calls, replacement/restore ownership, raw pragma reads, health/doctor fields, rotation/redaction, HTTP tools and static scan. All matrix rows must have passing covering suites.

**Acceptance Criteria:**
- Given a Project in use, when a second server starts, then it refuses before opening SQLite and names PID/start time from .lock; given a dead PID, when starting, then ownership is taken over with a log entry.
- Given either original or replacement DB connection, when opened, then raw pragma reads confirm explicit busy_timeout and WAL auto-checkpoint settings.
- Given GET /api/health, when called, then it returns version, schema version, epoch, write-gate state and pending migration; given a running owned server, when doctor runs, then it reports those values.
- Given server logs, when enough data is logged to rotate, then Project logs contain no more than five 10 MB files and no secrets or personal paths.
- Given SIGINT/SIGTERM or owned IPC stop with in-flight work, when stopping, then new work is refused, existing work/audits finish, streams close, current DB checkpoints/closes, and owned .lock/.port and -wal are absent; admitted work exceeds the old two-second launcher cutoff without forced truncation.
- Given tools and skill instructions, when scanned or actual board/copy operations execute against a disposable server, then no tool opens/copies SQLite; actual HTTP proposal/apply retains atomicity, data relationships, remote baselines and provenance.
- Given a real 1,000-Card fixture, when an actual map read runs concurrently, then an actual HTTP health response completes within 200 ms; record measured evidence and any limits.

## Spec Change Log

### 2026-10-08 — Review repair 1

Trigger: proposals did not provide concrete copy/cleanup previews or review/revalidate connector changes. This amended plan adds those requirements without altering the intent-contract. Known-bad states avoided: blind bulk deletion and overwriting connector state changed after approval.

KEEP: all runtime locking, takeover race protection, explicit pragmas, current health/doctor data, rotating safe logs, startup/discovery cleanup order, restore/archive ownership, durable admitted-call/audit drains, >2-second IPC shutdown, source/attachment/customization/Roadmap remapping, HTTP-only Python proposal/apply and atomic rollback, shared contracts/manifests and prior passing acceptance. The reviewed positive implementation is saved in `review-3-9-pass-1-preserved.patch`; apply it with `git apply --unidiff-zero` as the starting implementation, then make the required repairs below. Do not restore or touch sprint-status.yaml or deferred-work.md.

Re-derivation requirements:
- Copy previews identify the source/target and exact copied entity inventory; cleanup previews identify each map and its Card/owned-child inventory, sufficient for human review in the existing operation.after payload. Do not expose tokens/credentials, and retain original fingerprints and atomic drift refusal. Prefer names and counts to duplicating entire personal payloads.
- Preview affected GitHub connectors, including existing IDs and nonsecret reviewed read-only changes. Capture and revalidate only relevant connector state during apply, including an initial import; never put token values into the proposal or logs. A changed connector must conflict before any data mutation.
- Repair all demonstrated patch findings retained above: applied-state replay refusal (preserve established human re-approval of rejected proposals); existing deleteCard unassign for board removal; canonical repository matching; validate prefix-normalized titles via the existing Card title contract; numeric issue ordering; allow current operational health during shutdown admission; continuous writer log rotation, disconnected real HTTP lifecycle drain and copy-owned-child drift regression coverage.
- Keep tests mutation-sensitive: replay must not create another map, deletion must preserve valid hierarchy/positions/history, casing-only repeated sync must keep one identity, prefix-only proposal must reject atomically, connector drift must leave it unchanged, and review previews must name/count affected objects. All existing mandatory audit benchmarks and budgets remain unchanged.

### 2026-10-08 — Review repair 2

Trigger: selected sync Card removals/overwrites were not identified in proposal previews, and cleanup failure after completed archive database assignment could report an ordinary failed switch while the new database remained active. Amend those phases outside the frozen intent-contract; avoid blind destructive sync approval and an ambiguous active writer after ownership cleanup failure.

KEEP: the latest passing runtime, health through actual Fastify close, applied-only replay refusal (including established re-approval of rejected proposals), all source/relationship remapping, named/count copy/cleanup/connector previews and drift refusal, HTTP-only tools, admission/audit drains, safe log rotation and all existing budgets. Latest positive source is `review-3-9-pass-2-preserved.patch`; apply with `git apply --unidiff-zero` as the starting point. The earlier pass-1 patch remains historical evidence. Never write, stage or revert sprint-status.yaml or deferred-work.md.

Re-derivation requirements:
- Sync previews must identify every affected removal and overwrite by Card ID/key/title and bounded actual changed fields before/after. Use existing operation.after payload and normalized values matching apply; no new endpoint or generic executor. Preserve fingerprints, approval rules and atomic conflict refusal.
- Keep candidate-open and pre-assignment failures preserving the original usable writer. Once assignment completed, a failure releasing superseded imported ownership is a different phase: mark the existing DatabaseHandle unavailable and report an explicit ProjectArchiveError stating that the new Project was opened but previous ownership cleanup failed. Retain startup/current candidate ownership, preserve replaced/foreign old metadata, refuse subsequent ordinary work and expose unavailable health. Do not reopen an unproved old owner, silently log success, retry cleanup or invent configuration. Test a second import with replaced/corrupted old imported lock, truthful phase error, unavailable gate, no subsequent writes and preserved ownership.
- Reject a sync target where one Card is linked to multiple incoming issue identities on the same connector, before proposal persistence. Do not let two ordered updates overwrite its Card or remote baseline; preserve all existing state.
- Validate parentRepository with the existing repository syntax and require parentRepository/parentIssueNumber both absent or both present. Invalid pairs must fail HTTP validation atomically, rather than silently losing hierarchy.
- Preserve safe finite known error identifiers in sanitized runtime logs (known domain and SQLite codes/types); do not retain arbitrary names/codes that can contain paths or credentials. Exercise retained known identifiers and omitted unsafe values alongside existing privacy/rotation assertions.
- Execute the real 1000-Card concurrent HTTP health budget with production info logging/redaction enabled, retaining the200ms threshold.
- Cover the shutdown busy-checkpoint refusal using an actual read-only SQLite transaction pinned to WAL, then committed admitted writes. Verify explicit failure, retained owned .lock/.port and durable data without a second writable connection; native fixture access stays in packages/db.
- Extend selected-Project cleanup acceptance with a populated second Project and its map/children unchanged after apply. Do not broaden cleanup scope.
- Keep all existing workspace/release gates and five strict isolated audit benchmarks unchanged. POSIX OS signals remain explicitly unexecuted on this Windows host; raw GitHub baseline/orphan policy/direct copied-link debt remains deferred.

## Review Triage Log

### 2026-10-08 — Review pass 1
- verdicts: 22 findings — high 1, medium 12, low 2, false 7, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind: repeated tool application re-approves an applied ChangeSet and repeats initial import — Python always approves; status updater has no terminal guard, and an initial import has empty expected map scope. Add the demonstrated applied-state replay refusal; repair retained for re-derivation.
  - `[medium]` `[patch]` Blind: Feature removal nests surviving Stories below an Activity — direct reparent bypasses assertParentAllowed. Existing deleteCard unassign already handles versions/audits/positions; use it during re-derivation.
  - `[medium]` `[patch]` Blind: casing-only repositories duplicate connectors and links — issueKey lowercases while boardConnections/upsertIssueLinks compare exact strings. Match the same canonical identity during re-derivation.
  - `[medium]` `[patch]` Blind: prefix-only issue titles produce empty Cards — input permits TASK-1: and toCard/writeCardVersion do not validate the normalized value. Validate with the existing Card title contract before proposal persistence.
  - `[low]` `[patch]` Blind: lexicographic issue-key sorting changes numeric import ordering — baseline issue_sort_key used repository and integer number. Restore numeric comparison, a direct correction.
  - `[medium]` `[defer]` Blind: copied GitHub Cards lose direct issue provenance — baseline copy also omitted GitHub link tables; new copy retains source chunks/attachments and an auditable source map action. Record the pre-existing direct-link gap rather than introduce a remote-sync ownership design in this repair.
  - `[medium]` `[bad_spec]` Blind: copy and cleanup proposals do not contain concrete previews — operation.after exposes source IDs/fingerprints or cleanup=true, and OperationRow displays only after JSON. Amend the plan to store bounded identifying content/counts for copied and deleted maps, using the existing payload surface; preserve fingerprint refusal.
  - `[medium]` `[bad_spec]` Blind: unreviewed connector drift is overwritten during apply — boardConnections forces an existing connector readOnly=true, while expected fingerprints exclude connectors and initial imports have no map scope. Amend the plan to preview only affected connector changes and validate their exact state within apply, without capturing credentials.
  - `[low]` `[reject]` Blind: archive switch ignores checkpoint busy result — a separate external SQLite reader can prevent truncation; the writer is still closed before its lock is released, so no second writer or lost committed WAL follows. This checkpoint behavior predates the story; adding reader-specific refusal is unnecessary complexity for this rare condition. Shutdown already requires successful truncation.
  - `[medium]` `[patch]` Blind: stopping health is rejected by admission — stopping check precedes the health exemption. Move the existing exemption and exercise an HTTP health request during a held drain.
  - `[medium]` `[patch]` Edge: removing a Feature corrupts Story hierarchy — same demonstrated direct-reparent root cause as the blind finding; retain the existing-domain unassign correction.
  - `[medium]` `[patch]` Edge: repository casing changes duplicate issue links — same demonstrated identity mismatch as the blind finding; retain canonical matching correction.
  - `[medium]` `[patch]` Verification: rotation test cannot detect missing continuous byte accumulation — recreating the writer after external truncation masks bytes += length regressions. Add a single-writer threshold-crossing test using successive writes.
  - `[medium]` `[patch]` Verification: shutdown lacks a disconnected lifecycle-request drain test — existing tests exercise ordinary calls or completed imports; waitForDrain(false) would miss a pending admitted import. Pause a real import, disconnect its client, hold shutdown and check retained ownership through completion.
  - `[medium]` `[patch]` Verification: copy-owned-child drift is untested — existing board Card drift does not cover copy templates/Roadmap data fingerprints. Modify an owned child after proposal and require 409 with no target map.
  - `[false]` `[reject]` Intent: diff alone cannot prove skill execution — descriptive evidence limitation, not a code defect; parent executed the immutable renderer and workflow, with steps recorded in this session.
  - `[false]` `[reject]` Intent: original story is not independently supplied in reviewer evidence — parent read Epic 3 Story 3.9 at epics.md:1085 before planning; reviewer omission does not establish divergence.
  - `[false]` `[reject]` Intent: no final diff cannot prove zero intermediate sprint writes — parent never issued a sprint mutation/staging/revert command, and its staged/unstaged diff is empty; descriptive limitation proposes no defect.
  - `[false]` `[reject]` Intent: Windows handler tests do not prove POSIX OS signals — evidence expressly states this limit; platform acceptance is recorded separately as unverified, rather than falsely claimed.
  - `[false]` `[reject]` Intent: warm 1000-Card health does not prove arbitrary workload/platform latency — acceptance specifies the measured workload; no universal performance claim exists.
  - `[false]` `[reject]` Intent: HTTP conversion adds proposal/application semantics — the intent requires external changes first produce a ChangeSet with separate auditable apply, so this is required behavior.
  - `[false]` `[reject]` Intent: a diff is not an execution record — parent independently ran the full suite successfully (763 tests, two existing platform skips) and release gates; no completion is inferred from definitions or sprint rows.

Review execution limitation: fresh blind and edge reviewers ran independently. The environment's total thread cap rejected new verification/intent reviewers even after completion; available workers were reused with exact diff/prompts and instruction to disregard prior context. All four layers completed before triage. Verification remained source-backed; this is not a fully context-free four-worker pass.

### 2026-10-08 — Review pass 2

- verdicts: 20 findings — high 1, medium 10, low 1, false 8, maybe-false 0
- findings (each adjudicated before grouping):
  - `[medium]` `[patch]` Edge: one Card linked to two incoming issues on one connector is overwritten twice — existingIssueCards resolves both keys to one Card; Card/connection remote baseline upsert then replaces the first baseline. Reject the ambiguous input before proposing, preserving Card/link state.
  - `[low]` `[reject, carried]` Edge: archive old checkpoint ignores busy result — unchanged pass-1 finding and verdict. Closing the sole writer before releasing ownership preserves committed WAL; an independent reader preventing truncation creates neither another writer nor lost data. Shutdown separately refuses busy truncation. Do not reopen this rejected rare-condition guard.
  - `[false]` `[reject]` Blind: .env STORYMAPPER_URL is ignored — .env.example promises PORT, not this variable; tool commands document explicit --url or inherited process environment. The GitHub credential loader does not promise server URL configuration. Adding .env configuration would be speculative.
  - `[medium]` `[defer]` Blind: raw imported baselines appear immediately stale — baseline Python insert_links/update_existing_card already hash raw titles/bodies, while sync-health compares normalized/formatted values. Transport retains that pre-existing representation; record separate sync semantics debt.
  - `[medium]` `[defer]` Blind: orphan Stories use Parking lot Step despite skill policy — baseline resolved_parent and baseline skill Not assigned policy already disagree. Preserve established placement and instructions; defer a policy decision rather than silently change authoring rules.
  - `[medium]` `[bad_spec]` Blind: sync removals and overwrites have no identifying before preview — copy/cleanup requirements covered map inventories but selected sync Card effects remain opaque. Amend the existing payload preview plan for bounded identifiers and actual changed fields.
  - `[medium]` `[patch]` Blind: malformed or half-supplied parent identity loses hierarchy — main repository has syntax validation but parentRepository accepts arbitrary strings and nullable pair mismatch. Reuse repository syntax and require paired parent values atomically.
  - `[false]` `[reject]` Blind: PID reuse can keep an old lock unreclaimable — alive PID ownership cannot be disproved by the stored timestamp alone. Frozen intent expressly requires refusing unproved/live ownership; an OS-specific process probe or takeover would add unsupported recovery.
  - `[high]` `[bad_spec]` Blind: old imported lock-release failure occurs after active database assignment — releasePrevious is outside the candidate-switch failure phase, so an HTTP failure leaves a new active writer. Amend the plan to explicitly report completed assignment plus cleanup failure, mark unavailable, retain current/startup ownership and preserve foreign metadata; never reopen an unproved owner.
  - `[medium]` `[patch]` Blind: sanitized logs discard every safe error identifier — record.err becomes only Runtime operation failed. Retain finite known nonsecret domain/SQLite identifiers and reject arbitrary credential/path-shaped values.
  - `[medium]` `[patch]` Blind: health performance fixture disables production logging — LOG_LEVEL=error avoids synchronous info logging/redaction. Measure the same concrete workload with production info logging and unchanged budget.
  - `[medium]` `[patch]` Blind: shutdown busy-checkpoint refusal lacks real coverage — add an actual read-only WAL-pinned reader and committed writes, then require explicit shutdown failure, retained ownership/discovery and durability.
  - `[false]` `[reject]` Blind: empty acquisition claim after a crash blocks restart — an empty claim can also belong to a live contender between mkdir and metadata publication. Ownership cannot be proved dead; frozen malformed-owner refusal is intentional, not a reason for unsafe reclaim or invented manual recovery.
  - `[false]` `[reject]` Intent: diff cannot prove workflow history — descriptive limitation; parent executed immutable rendered steps, reviews and gates and issued no sprint mutation. No code divergence identified.
  - `[false]` `[reject]` Intent: cooperative lock cannot stop arbitrary SQLite clients — AD-12 ownership applies to participating runtime/tools; all tools are HTTP-only. No filesystem mandatory-lock guarantee is claimed.
  - `[false]` `[reject]` Intent: Windows installed-handler IPC does not prove POSIX signals — explicit unexecuted platform limitation is already deferred; real Windows owned IPC/drain is executed.
  - `[false]` `[reject]` Intent: warm health fixture is not a universal performance bound — acceptance names the real1000-Card workload; measurements are explicitly limited to warm Windows Node24.
  - `[false]` `[reject]` Intent: HTTP/CLI approval tests do not demonstrate browser interaction — generic existing ChangeSet UI displays the proposal payload; this story adds scoped data, with no browser UX redesign. No failed requirement demonstrated.
  - `[medium]` `[patch]` Verification: cleanup isolation test only has one Project — trusted source-backed gap. Add a populated second Project and compare its map/children before/after selected-Project cleanup, detecting a removed Project filter.
  - `[medium]` `[patch]` Verification: busy WAL checkpoint branch is unexercised — trusted source-backed gap; same root cause as Blind busy-checkpoint coverage, grouped into one real read-only reader regression.

Grouping/routes: two bad-spec groups, seven patch findings in six groups (busy-checkpoint findings deduplicated), two newly deferred inherited findings, nine rejects including the carried low finding. Bad-spec loopback makes lower patch work part of fresh re-derivation; the revised plan explicitly retains it.

Review execution: all four reviewers were fresh/context-free. The environment thread cap required staggered launches; blind, edge, intent and verification layers all completed before any triage. Parent verified contested source against baseline and current code rather than relying on review summaries.

### 2026-10-08 — Review pass 3

- verdicts: 20 findings — high 0, medium 8, low 2, false 10, maybe-false 0
- findings (report order, individual verdicts before grouping):
  - `[medium]` `[patch]` Edge: different repositories target one Card — repository-qualified uniqueness permitted two scalar overwrites and stale before snapshots. Card-only preflight now refuses before persistence; actual same/cross-repository regressions preserve all Card/link/proposal state.
  - `[medium]` `[patch]` Edge: duplicate removal IDs fail only at apply — the second deletion saw a missing Card and rolled back an accepted proposal. Shared-schema uniqueness now returns atomic400 before proposal; actual Python multi-link planning deduplicates the Card and applies one removal.
  - `[medium]` `[patch]` Verification: Python redirect refusal is untested — trusted regression gap; removing NoRedirect left all successful CLI tests green. Actual Python copy against two local listeners now verifies explicit redirect refusal, one source request and zero destination requests.
  - `[false]` `[reject, carried]` Intent: diff cannot prove workflow/status history — carried prior descriptive limitation. Parent executed the immutable workflow, source inspection and780 passing tests; no sprint mutation command or diff occurred. No implementation defect identified.
  - `[false]` `[reject, carried]` Intent: Windows signal-handler IPC is not POSIX delivery — carried explicit platform limit; actual owned IPC/drain is tested, POSIX OS signals remain deferred.
  - `[false]` `[reject, carried]` Intent: warm health is not a universal bound — carried concrete workload boundary. Production info logging is now included; actual1000-Card HTTP measurement67.04ms, without broader platform claims.
  - `[false]` `[reject, carried]` Intent: ownership does not stop arbitrary SQLite clients — carried AD-12 participating-runtime boundary; generic DB fixtures are not additional Agentic Story Mapper tool writers. No mandatory OS file-lock guarantee is claimed.
  - `[false]` `[reject]` Intent: local fixture transport is not live GitHub integration — original intent forbids live GitHub mutation for acceptance and asks HTTP local-tool migration. Original board/provider reads remain unchanged; no live authentication claim is made.
  - `[false]` `[reject]` Intent: selected inherited provenance/hash/placement semantics are incomplete — those specific pre-existing gaps are individually recorded in deferred frontmatter, with baseline evidence. The transport preserves existing semantics plus source/attachment relationships and audit provenance; no new regression demonstrated.
  - `[false]` `[reject]` Intent: null pending migration does not detect an actual migration — the frozen intent requires truthful null while no journal exists. Doctor's unknown presentation and null contract do not fabricate pending migration data.
  - `[medium]` `[patch]` Blind: cross-repository repeated Card sync loses one issue's scalar content — source/probe confirmed the same Edge root cause. Card-only preflight now rejects both repository cases atomically, preserving all existing state.
  - `[medium]` `[patch]` Blind: repeated removal Card fails approved application — same Edge duplicate-ID root cause. Shared validation and Python planning deduplication pass actual invalid-input/no-write and multi-link plan/apply regressions.
  - `[medium]` `[patch]` Blind: created import map identity cannot be recovered reliably — operation entityId was a surrogate while createStoryMap chose another UUID. Apply now persists the resolved map ID in existing entityId, retaining approved after input unchanged. Two actual Python identical-name imports identify distinct persisted maps without a new public response field/endpoint.
  - `[false]` `[reject, carried]` Blind: .env STORYMAPPER_URL is ignored — same pass-2 claim/code; explicit --url or inherited environment is documented, .env URL support is not promised. Do not add speculative configuration.
  - `[false]` `[reject, carried]` Blind: PID reuse blocks dead-owner recovery — same pass-2 claim/code; alive PID cannot be disproved by an approximate stored timestamp. Frozen intent requires refusing unproved/live ownership, without new OS probes.
  - `[false]` `[reject, carried]` Blind: empty acquisition claim requires recovery — same pass-2 claim/code; empty metadata can belong to a live publisher and cannot prove owner death. Explicit refusal remains intentional; no unsafe reclaim/manual recovery is added.
  - `[low]` `[reject, carried]` Blind: archive ignores busy old checkpoint — same pass-1/pass-2 claim/code. The sole writer closes before ownership release; committed WAL remains durable with an independent reader. Shutdown separately requires truncation success; no rare-reader replacement guard is justified.
  - `[medium]` `[patch]` Blind: unfinished body upload holds shutdown before handler execution — admission/preClose draining preceded socket closure; the real partial-body probe blocked until disconnect. Shutdown now finishes/destroys only incomplete nonrunning uploads. Actual partial socket close/no-write/owned-cleanup and existing durable executing-call drains pass; no timeout/configuration added.
  - `[medium]` `[patch]` Blind: health timing does not prove map processing overlaps — two fetch calls alone permitted health to run first. Explicit admitted-map/queued-health/real snapshot phases now prove measured health includes1000-Card processing; focused41.43ms includes29.40ms snapshot work with info logging and unchanged200ms budget.
  - `[low]` `[patch]` Blind: deleting a proposal source reports404 instead of drift conflict — throwing lookup exited before fingerprint comparison. Current Project map membership now routes missing reviewed sources through existing409 create-new-proposal conflict; actual deleted-source regression preserves maps/proposals/audits and adds no public surface.

Grouping/routes: nine patch findings in seven groups (six medium, one low), eleven rejects including eight carried findings. All four layers were fresh/context-free, with staggered launches due the thread cap; all launched and reported before triage. Parent checked changed source/callers and baseline for new claims; verification-gap evidence is trusted as filed. No new deferred entry or intent/spec repair is required.

### 2026-10-08 — Deterministic repair review

Four fresh lenses completed; thread limits staggered the intent auditor. Edge and verification found no issues; Blind supplied six findings and Intent eight descriptive boundaries. Fourteen findings: high zero, medium two, low two, false ten. Two local launcher fixes; no new deferred issue.

- `[low]` `[reject]` Blind: uv is a new test prerequisite — this invoked workflow already requires uv, and Verification supplies provisioning. Extending application setup adds unrelated bootstrap behavior; missing tooling still fails explicitly.
- `[low]` `[reject]` Blind: orchestration preflight does not check offline Python — provisioning and exact interpreter checks ran before acceptance. Adding preflight integration exceeds a direct correction and is unnecessary for this verified repair.
- `[false]` `[reject]` Blind: floating patch versions contradict determinism — compatible managed Python 3.12 is the requirement; 3.12.14 is the tested version. No full-patch guarantee or failing alternate patch was demonstrated.
- `[medium]` `[patch]` Blind: ambient .venv controls execution — reviewer reproduced its executable under the original flags. Added --isolated; real CLI acceptance retains every argument/assertion.
- `[medium]` `[patch]` Blind: ambient uv configuration prevents execution — parent reproduced invalid UV_CONFIG_FILE failure even with --no-config. Added --no-config and child-only removal of UV_CONFIG_FILE; twenty-one cases pass under alias-only PATH and malformed inherited configuration.
- `[false]` `[reject]` Blind: alias regression can return silently — the existing five CLI cases failed before repair and pass afterward under the alias environment; the exact orchestrator command also exercises them there. Their assertions detect a restored bare-python launch.
- `[false]` `[reject]` Intent: ownership assertions are unchanged — committed behavior is preserved; executed runtime tests cover live/malformed/dead/racing owners.
- `[false]` `[reject]` Intent: replacement/discovery depends on inherited code — actual restore/archive/runtime acceptance ran and passed; those behaviors are unchanged.
- `[false]` `[reject]` Intent: health/logging is outside the changed harness — executed runtime/doctor coverage includes coordinated HTTP health and privacy/rotation; only CLI selection changed.
- `[false]` `[reject, carried]` Intent: CLI cases do not prove shutdown — broader actual handler/IPC/disconnected/lifecycle drain tests pass; POSIX delivery stays explicitly unexecuted/deferred.
- `[false]` `[reject]` Intent: proposal/apply coverage is narrower than runtime intent — this incremental repair restores real HTTP/Python reachability; broader matrix tests separately ran.
- `[false]` `[reject]` Intent: loopback/security evidence is local — disposable local acceptance is required and live GitHub mutation prohibited; actual redirect/loopback/security cases pass.
- `[false]` `[reject, carried]` Intent: relationship/inventory behavior is inherited — unchanged inventory and atomic API tests ran; existing raw-baseline/orphan/copied-GitHub limitations remain deferred.
- `[false]` `[reject, carried]` Intent: prose/status alone cannot prove verification — parent executed commands and read successful outputs; no completion is inferred from status rows.

### 2026-10-08 — Follow-up review pass

Follow-up pass on a `done` spec. The diff since baseline `322e7d7` is the test-harness-only change to `tool-proposals.test.ts` (`runPython` uv launcher); orchestrator-owned `sprint-status.yaml`/`deferred-work.md` and OpenWolf bookkeeping were excluded from the reviewed diff and not touched.

- verdicts: 20 findings — high 0, medium 0, low 8, false 12, maybe-false 0
- findings:
  - `[low]` `[reject, carried]` Blind: offline uv needs a pre-provisioned managed Python, so fresh machines fail obscurely — same claim as the logged "uv is a new test prerequisite" row; provisioning is in Verification and a missing tool fails explicitly; bootstrap extension is unrelated.
  - `[low]` `[reject, carried]` Blind: uv prerequisite not documented in AGENTS.md/runbook — same logged row; the fix edits agent-context files and unrelated bootstrap docs.
  - `[false]` `[reject]` Blind: UV_CONFIG_FILE override is redundant with --no-config and other UV_* variables leak — a prior parent run reproduced an invalid UV_CONFIG_FILE failing even with --no-config (logged), so the override is load-bearing; other UV_* leakage is speculative with no demonstrated failure.
  - `[low]` `[reject]` Blind: seven flags carry no HINT/DESIGN comment — cosmetic; the Design Notes and the logged repair evidence already record each flag's reason.
  - `[false]` `[reject]` Blind: other bare-python callers may exist — grep over apps, scripts, packages and tools finds no remaining `run/execFile/spawn("python")` call.
  - `[false]` `[reject]` Blind: per-call uv startup threatens the 30 s timeout — exact full workspace and focused runs pass 786 tests including this file; the tool imports are stdlib/local only, so uv builds no environment.
  - `[false]` `[reject]` Blind: uv-level failure can mask the HTTP 409 / redirect assertions — those assertions match the tool's own stderr text, which uv cannot produce; a uv failure fails the test rather than satisfying it.
  - `[low]` `[reject, carried]` Edge: uv or managed Python 3.12 missing makes every Python test fail — duplicate of the carried prerequisite row above.
  - `[false]` `[reject]` Edge: a third-party import would fail under --no-project --isolated — the tools import only stdlib and the local `storymapper_http`/`import_github_board_view` modules; no such import exists.
  - `[low]` `[reject]` Edge: uv-managed Python differs from the user's system python — deliberate per Design Notes (Windows Store alias made bare python non-deterministic); the alternative is a fallback, which AI-DO-NOT forbids.
  - `[false]` `[reject, carried]` Edge: uv stderr noise could change the 409/redirect assertions — duplicate of the Blind claim above; assertions match tool stderr text.
  - `[false]` `[reject]` Edge: fresh --isolated environment per call can exceed 30 s — no dependencies are resolved; passing full runs show ample headroom.
  - `[low]` `[reject]` Edge: run() has no timeout/maxBuffer — unchanged from the baseline `run("python")` calls, so not caused by this change; vitest timeouts bound it.
  - `[low]` `[reject, carried]` Edge: AGENTS.md lists only Node and pnpm as prerequisites — same logged prerequisite row; fix edits agent-context files.
  - `[false]` `[reject]` Edge: no test runs the bare user-facing `python` — the bare command resolved to the Windows Store alias in the failing feedback run; a bare-python case would reintroduce the demonstrated nondeterminism.
  - `[low]` `[reject, carried]` Verification: uv dependency undocumented — same logged prerequisite row.
  - `[false]` `[reject]` Verification: --isolated/--no-config/UV_CONFIG_FILE workarounds unverified — the parent reproduced both conditions and recorded the pass (Deterministic repair verification, Final isolation repair verification); Node `child_process` omits env entries whose value is undefined.
  - `[false]` `[reject, carried]` Intent: diff touches only the test launcher, not lock/health/log/shutdown surfaces — those are implemented in the baseline commit `322e7d7`; this pass reviews only the incremental verification repair, as the logged repair rows state.
  - `[false]` `[reject, carried]` Intent: tests need uv and offline managed Python — same logged prerequisite row; `--offline` governs uv only, not tool networking.
  - `[false]` `[reject]` Intent: sprint-status.yaml appears modified — the file is outside the reviewed diff and this run issued no write, stage or revert; the change is orchestrator bookkeeping.

Grouping/routes: no patch, bad_spec, intent_gap or defer entry; all 20 findings rejected, with nine carried or duplicating logged rows. Reviewers were fresh and context-free; all four completed before triage.

## Design Notes

### 2026-10-08 — Deterministic verification repair

Resume the existing implementation against feedback in `../../.bmad-loop/runs/20261008-132154-6706/feedback/3-9-one-writer-health-and-orderly-shutdown-1.md`. The orchestrator's server gate failed five actual Python CLI acceptance cases because bare `python` resolved to the Windows Store execution alias. Repair the test command invocation using the repository's available Python tooling so the same actual commands and assertions run under deterministic verification. Do not skip cases, weaken assertions, change budgets, add interpreter fallbacks or change the frozen intent. Independently reproduce and repair any remaining demonstrated verification failures. Preserve existing implementation and unrelated working-tree changes. Never write, stage or revert sprint-status.yaml or deferred-work.md. Do not create a commit; the orchestrator owns final commit bookkeeping.

Stable startup ownership protects discovery even after archive import changes the active DB. Keep active imported ownership too, and release it only after closing that connection. Restore keeps the same pathname lock through temporary closes. Health must read current schema/epoch, not stale startup data. Atomic scoped tool commands belong inside the existing server/UoW and must first produce reviewable ChangeSets; expanding universal command routing remains Epic 4 work.

### 2026-10-08 — Parent verification correction after repair 2

The full workspace run passed all preceding packages and305/306 server functional tests. The actual dead-owner competing-start test retained exactly one writer, but its losing process exposed raw Windows EPERM while unlinking acquisition metadata instead of the ownership-refusal diagnostic. Correct that demonstrated diagnostic boundary without retrying unproved ownership or weakening race assertions; rerun focused and full verification before review. The frozen intent and orchestrator bookkeeping remain unchanged.

The next full run exposed an unchanged root-version audit fixture that assumed order between equal wall-clock timestamps. Both independent before/after pairs were intact, reversed by the timestamp-only query. The fixture now gives saves distinct controlled times within the existing save window; all assertions remain unchanged and65 root-version tests pass. No production Activity ordering or unrelated domain behavior changed.

## Verification

- Provision the CLI acceptance interpreter once with `uv python install 3.12`; launches use uv-managed Python 3.12 offline, independent of Windows Store aliases. This repair installed CPython 3.12.14.
- Run relevant real-process/HTTP/DB/script tests for every matrix row, including both signal paths, launch failure cleanup, replacement ownership, privacy/rotation and actual converted tool operations. Use only disposable fixtures and read-only GitHub fixture inputs; no user DB.
- Run serially: `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `corepack pnpm test`, `node scripts/verify.mjs`, `git diff --check`; all must pass. Tests/build share dist. Mandatory existing strict audit benchmarks remain required and budgets unchanged.
- Run Node 24.20.0 and pnpm 9.15.4. Stage only reviewed task/spec/OpenWolf paths if workflow finalization requires; exclude sprint-status.yaml and unrelated concurrent changes. No push.

### Implementation evidence (2026-10-08)

- Runtime acceptance: `corepack pnpm --filter @storymapper/server exec vitest run src/runtime-lifecycle.test.ts` passes 12 tests. Covers live/malformed/replaced ownership, actual dead-process competing starts, recovery of a dead acquisition claim, raw pragmas, startup publication failure, restore and repeated archive ownership, available/restoring/unavailable health, log rotation/privacy, long admitted calls, disconnected calls and repeated shutdown. Actual HTTP 1,000-Card map read concurrent with health measured 55.10–68.31 ms across executed local runs; latest 64.78 ms. This is a warm disposable Node 24.20.0 Windows fixture, not a power-loss or other-platform measurement.
- Windows signal acceptance invokes the actual Node SIGINT/SIGTERM handlers through test fixture IPC, since Node's Windows `process.kill` signal path force-terminates. Actual owned IPC shutdown is executed both directly and through the launcher with a 2.6-second admitted HTTP agent call and reopened durable audit evidence. POSIX branches send real OS signals, but those branches have not been executed in this Windows session; no OS-signal acceptance is inferred from the Windows handler tests.
- Existing archive/restore/audit acceptance: `corepack pnpm --filter @storymapper/server exec vitest run src/services/project-archive.test.ts src/http/routes/restore-points.test.ts src/mcp/tools/tool-call-audit.test.ts` passes 68 tests, including failed candidate reopening with retained original ownership, passive MCP streams and disconnected durable audit drains. Existing server/MCP HTTP suites pass 26 tests.
- Scoped tool acceptance: `corepack pnpm --filter @storymapper/server exec vitest run src/http/routes/tool-proposals.test.ts` passes 6 tests, including actual Python HTTP import/sync/copy commands, relationship remapping, baseline preservation, human-only application, source/cleanup drift refusal and real mid-transaction SQLite-trigger rollback. No live GitHub mutations or user databases were used.
- Script acceptance initially exposed an eager Zod health-schema import before setup and a test-only wrong native-module resolution location. Those were corrected; all four affected fresh-setup/doctor/launcher cases pass when rerun. Full serial workspace gates and final independent review remain with the parent coordinator.

### Parent verification before review (2026-10-08)

- Read the complete staged/untracked baseline diff and verified the frozen intent is unchanged. Both skill copies preserve existing authoring/placement policy; all tools/skills are included in the static direct-SQLite scan.
- Every matrix row has executed passing coverage: runtime lifecycle 13, tool HTTP/CLI/static scan 7, actual launcher 6, archive/restore/audit 68, and capability parity 2. Parent corrected a test-native-import boundary, the explicit infrastructure inventory, and a demonstrated lock-release/discovery-cleanup race. All corresponding focused suites pass.
- All workspace suites passed across the full run and focused failure repairs: Scripts 74 (2 existing Windows permission skips), Contracts 24, Importers 2, Core 30, Web 105, DB 233, Server 289 functional before the additional cleanup-race regression plus 5 mandatory isolated benchmarks. Final focused runtime/tool/parity run passes 22 tests including the added regression. Full workspace typecheck, 108-capability parity, build, release verify and whitespace pass. Exact final full-suite rerun remains after review fixes.
- Health during a real 1,000-Card read: 52.54/57.25/60.01 ms in parent runs. All five strict audit benchmarks pass; maximum median overhead 14.31%, exactly 100 INSERTs/no other writes per burst and each burst below one second.

### Review repair evidence (2026-10-08)

- Reapplied the preserved implementation, then retained it as a zero-context patch; `git apply --check --cached --unidiff-zero` passes against the baseline index. The intent-contract, sprint-status.yaml and deferred-work.md were not changed.
- Tool HTTP/CLI suite passes 13 tests. Added mutation-sensitive acceptance for applied replay, Feature removal with preserved Story history/positions, canonical HTTP and actual Python sync identities, numeric Card placement, prefix-only atomic refusal, named/count copy and cleanup previews, initial-import connector identity/new-connector drift, and independent template/Roadmap-column drift with no target copy. Placement and creation both use numeric issue ordering; Python planning uses the same canonical repository identity.
- Runtime suite passes 16 tests; the three final added regressions also pass independently. Real HTTP health remains available during a held stopping drain; a disconnected real archive import retains ownership until its lifecycle work and durable import audit complete; successive writes from one log writer cross the rotation threshold. Concurrent real 1,000-Card HTTP health measured 63.47 ms on this warm Windows Node 24.20.0 fixture.
- DB and server typecheck and `git diff --check` pass after repairs. Final serial workspace/release gates remain with the parent coordinator. Existing POSIX OS-signal and direct copied-GitHub-relationship limitations remain recorded in frontmatter.

### Parent integration correction (2026-10-08)

The first repaired full workspace run passed all preceding packages and 298/299 server functional tests, but complete-surface.test.ts:132 failed: it intentionally re-approves a rejected proposal before human-authorized application. Applied-state replay is the demonstrated defect; changing rejected-state policy was an overbroad repair. Preserve that existing test unchanged, narrow refusal to already-applied ChangeSets, and retain the actual Python replay regression. This clarifies the repair plan outside the frozen intent; no public contract or orchestrator bookkeeping change is authorized.

### Parent verification after integration repairs (2026-10-08)

- Exact full workspace `corepack pnpm test` exited0:772 tests pass, two existing Windows permission skips; all five isolated audit budgets pass (maximum median overhead11.91%). Workspace typecheck,108-capability check and build pass.
- Applied-only replay correction passes31 focused tool/MCP tests, with the existing MCP integration test unchanged. All matrix acceptance runs pass, including16 runtime tests and13 actual HTTP/Python/static tool tests.
- Strengthened actual server.close health regression first failed503 before the hook; private Fastify closing configuration now leaves admission to the existing gate.32 runtime/server focused tests pass, proving current health200/stopping and ordinary503 during actual held close. Final full server acceptance and release verify are rerunning for this last server-only correction.
- Latest focused health during actual1000-Card read:63.07ms; warm Windows Node24.20.0 fixture. No POSIX signal execution is inferred.

- Final server-only rerun passes299 functional tests plus5 strict isolated audit benchmarks after the actual-close health fix; latest health67.47ms and maximum median audit overhead13.62%. Full release verify (hygiene/typecheck/build) exits0; whitespace passes. All matrix rows have executed passing coverage.

### Parent verification after repair 2 (2026-10-08)

- Parent read every source delta against the preserved pass-2 tree, plus the later acquisition-diagnostic and controlled-clock fixture corrections. Frozen intent comparison passes; sprint-status.yaml/deferred-work.md staged and unstaged diffs remain empty.
- Exact full workspace `corepack pnpm test` exits0:780 tests pass — Scripts74 (two existing permission skips), Contracts24, Importers2, Core30, Web105, DB233, Server307 functional plus5 mandatory isolated benchmarks. All matrix rows have executed passing coverage; runtime19, tools16, safe-log1 and deterministic acquisition-refusal1 cases pass within this full run.
- All five strict audit workloads pass with unchanged budgets: maximum median overhead16.80%, exactly100 INSERTs/no other writes per burst, every burst below1s and durable reopen. Real1000-Card HTTP health with production info logging measured67.04ms (200ms budget), warm Windows Node24.20.0.
- Workspace typecheck,108-capability check, build, full release `node scripts/verify.mjs` and both whitespace checks pass. The release gate reran full typecheck/build after the final source corrections. All child/test/build processes completed before review.
- Windows installed signal handlers and actual owned IPC are exercised; real POSIX OS-signal branches remain unexecuted and explicitly deferred. Four inherited/platform deferred entries remain; no live GitHub mutations, user DB changes or credential writes occurred.

### Deterministic repair verification (2026-10-08)

- Reproduced the feedback environment by removing pyenv and the bmad-loop tool interpreter from PATH and placing WindowsApps first: the original tool suite failed exactly five cases, with sixteen passing. Managed CPython 3.12.14 was provisioned with `uv python install 3.12`. All sixteen subprocess launches now use one offline uv-managed Python 3.12 helper; every CLI argument, assertion and budget is unchanged. The same constrained environment passes all twenty-one tool cases and server typecheck.
- Independent parent workspace typecheck, 108-capability parity and build pass. Exact full workspace `corepack pnpm test` exits zero: 786 passing tests, two existing Windows permission skips, including all twenty runtime lifecycle and twenty-one tool cases plus five strict isolated audit benchmarks. Maximum median audit overhead is 10.21%, with exactly 100 inserts per burst and unchanged budgets. Coordinated real 1000-Card HTTP health is 43.50 ms, including 33.86 ms snapshot processing.
- Frozen intent matches the repair baseline byte-for-byte after line-ending normalization. Actual POSIX signal execution remains the existing documented platform limit. The exact feedback server gate passes under constrained PATH (313 functional tests, then 103 MCP/archive/audit tests); coordinated health is 48.66 ms. Full release `node scripts/verify.mjs` and unstaged whitespace pass. Fresh review and staged whitespace completed in the final isolation pass below.

### Final isolation repair verification (2026-10-08)

- Parent confirmed --isolated bypasses the review fixture's .venv and uses the provisioned managed Python base. Child-only UV_CONFIG_FILE removal plus --no-config bypasses demonstrated malformed inherited configuration. Every original CLI argument, assertion and budget remains unchanged.
- Workspace typecheck, 108-capability parity and build pass after the final source edit. Full workspace tests under WindowsApps-only bare Python PATH and malformed inherited uv configuration exit zero: 786 passes and two existing Windows permission skips. Twenty runtime and twenty-one tool cases pass; five strict isolated audit benchmarks pass with maximum median overhead 11.83% and exact 100 inserts per burst. Coordinated health is 46.43 ms, including 36.33 ms real snapshot processing.
- The exact feedback command also exits zero on the final source under those adverse conditions: 313 functional tests, then 103 MCP/archive/audit cases. All seven matrix rows have executed covering tests; Windows installed signal handlers/IPC run, while the existing POSIX delivery limitation remains deferred. Remaining orchestrator contract/core/MCP and lint commands also exited zero. Final full release verification exits zero; bookkeeping whitespace passes.

## Auto Run Result

Status: done

- Summary: Story 3.9 is implemented and committed at baseline `322e7d7` (exclusive owned writer lock, operational `/api/health` and doctor, explicit pragmas, sanitized rotating logs, orderly drained shutdown, HTTP-only proposal/apply Python tools). The follow-up pass reviewed only the incremental change since that baseline: the `runPython` uv launcher in the server tool-proposal tests, which makes the actual Python CLI acceptance cases independent of the Windows Store `python` alias and ambient uv configuration.
- Files changed in the reviewed diff: `apps/server/src/http/routes/tool-proposals.test.ts` (route all Python CLI launches through one offline uv-managed Python 3.12 helper; arguments and assertions unchanged).
- Review findings: 20 findings (low 8, false 12); patches applied 0; items deferred 0; all 20 rejected on the reasons recorded in the Follow-up review pass triage log (nine carried from earlier passes, the rest refuted or cosmetic).
- Follow-up review recommendation: `false` (no patch applied on this follow-up pass; patched counts high 0, medium 0, low 0).
- Verification: no code changed in this pass. Source checks this pass: grep found no remaining bare-`python` launches in apps, scripts, packages or tools; the tool scripts import only stdlib and local modules. Prior parent runs recorded in this spec (786 workspace tests passing with two existing Windows permission skips, typecheck, 108-capability parity, build, release verify, constrained-PATH and malformed-uv-config reruns) cover the same tree.
- Residual risks: tests require `uv` with a provisioned managed CPython 3.12 (`uv python install 3.12`); POSIX OS-signal delivery remains unexecuted on this Windows host (deferred); the four inherited deferred entries stay open.
- Finalization: no commit was created by this run, following the spec's standing instruction that the orchestrator owns final commit bookkeeping. `sprint-status.yaml` and `deferred-work.md` were not written, staged or reverted.


## Current completion bookkeeping (2026-10-13)

User requested verification and correction of the Story3.9 completion status. Spec frontmatter, terminal Auto Run Result and sprint entry `3-9-one-writer-health-and-orderly-shutdown` all already say `done`. The completed implementation/review was committed by the orchestrator as `fcba3f9321521a00f5ae95efc5ce813d29e64399`; that commit is an ancestor of current main. The historical statement above that the dev session did not create a commit describes that session only; finalization is complete. No sprint status transition or source repair is required. Existing deferred limitations remain explicit and do not change the recorded completion status. No new functional test execution is claimed by this bookkeeping verification.

Version3 changelog: existing done status verified against actual Git completion; stale finalization interpretation resolved by this dated provenance record.
