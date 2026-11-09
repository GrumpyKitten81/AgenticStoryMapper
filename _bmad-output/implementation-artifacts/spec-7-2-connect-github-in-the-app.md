---
title: '7.2 Connect GitHub in the app'
type: feature
created: 2026-10-19
updated: 2026-10-19
version: 2
status: done
baseline_revision: 68dcf5017298f34db7553118bf60d6898085d430
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-2-connect-github-in-the-app.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Real GitHub account and installed CLI authentication acceptance remains unverified.
    evidence: |-
      Controlled provider/CLI transports and final native Safari disposable fixture pass. They do not establish real account/repository access. Execute a separately authorized real GitHub smoke; any interactive login requires explicit human presence confirmation. Native Windows credential ACL/replacement acceptance remains the carried Story7.1 limitation.
    location: >-
      packages/github/src/providers/github-provider.ts
    severity: medium (unverified)
  - summary: >-
      Full native platform and screen-reader release acceptance remains unverified.
    evidence: |-
      Final macOS Safari fixture proves running-app CLI Verify/Connect/reconnect, header state and bounded keyboard focus. Full VoiceOver and Windows/NVDA/Firefox matrix, especially multiple-window lost-response/Restore recovery, was not executed. Run that matrix before native release certification.
    location: >-
      apps/web/src/features/github-sync/GitHubConnectDialog.tsx
    severity: medium (unverified)
---

Reproducing statement: Execute bmad-build-auto for Story 7.2 using the accepted Epic 7 plan; implement and independently verify guided human connection while never writing, staging or reverting orchestrator-owned sprint-status.yaml. Date: 2026-10-19. Version: 1.

<intent-contract>

## Intent

**Problem:** The app has connection CRUD and switch-gated validation, but no guided candidate-token/CLI connection flow. Users cannot safely verify while GitHub is off or distinguish verification from explicit enablement.

**Approach:** Supply a reusable human connection dialog with method, target/settings, consented Verify and separate Connect. Verify uses candidate credentials transiently and changes nothing; Connect consumes verified unchanged intent, stores a pasted token through 7.1, saves configuration and explicitly enables GitHub with audit.

## Boundaries & Constraints

**Always:** Preserve defaults: readOnly true, local-story-map export label, Milestone source, Iteration field, annotation toggle and current type/status mappings. Start owner/repository empty with guidance. Only explicit human candidate Verify may contact GitHub while off. Verify the selected repository read access and separately report write capability without write probes or promising Issue/Milestone/type writes. Show after off-state verification: “Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub.” Candidate tokens bypass resolver precedence for Verify; review identifies actual operational source including CLI precedence. CLI instructions tell the human to run gh auth login in their own terminal, followed by local Recheck; launch no login. Credentials stay outside Project persistence, logs, responses, Activity and archives. Match exact candidate/Project/optional connection, actor, settings and Restore/database identity before and after awaits. Final connection and switch changes share one attributed SQLite UoW. Preserve drafts/errors, keyboard/focus behavior, same-tick admission and truthful partial-file effects.

**Never:** Write, stage, unstage or revert sprint-status.yaml; use done/awaiting-operator rows as verification; alter deferred-work or orchestrator state; access real credentials or call live GitHub/auth/login during this run; commit/push. No generic off-switch bypass, MCP token/consent capability, background provider calls, write probes, OAuth, profiles, new providers, legacy compatibility, remote sync/import/push changes or release accessibility certification.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Candidate token | GitHub off, explicit human Verify, pasted token | Direct in-memory candidate read; no file/config/switch/audit mutation; receipt and source/capabilities; required off notice | Never select CLI instead of candidate for this check |
| CLI | Human chooses CLI, runs login externally, local Recheck then Verify | Recheck is configuration only; Verify requires actual CLI identity; no token storage/login launch | Missing CLI names terminal login/Recheck action; never switch methods silently |
| Final Connect | Unchanged verified candidate and explicit confirmation | Single-use receipt; file write if token; one atomic connection + switch/audit UoW; read-only default; return authoritative cache results | Consume receipt before awaits to refuse replay/concurrent confirm |
| Remote failures | Invalid credentials, denied/masked404 repository, rate limit, network/offline | Sanitized distinct cause and next action, unchanged local state, draft retained | No raw provider/subprocess text; masked404 never means deleted |
| File/DB failure | File write fails, or succeeds before DB failure | File failure leaves prior switch/config unchanged; later DB failure reports stored credential and unchanged DB | Do not claim cross-file atomicity; committed publication errors must report actual committed result |
| Stale scope | Project/connection/settings/input/method change, Cancel/reopen or Restore during await | Reject stale proof server-side and ignore late UI results; never enable a different Project; draft retained where scope remains | Explicit Verify again; same-tick duplicate requests refused |
| Human boundary | Agent/application/MCP invocation without human authority or consent | Refuse before credential/provider/file access; no tool for Verify/Connect | Ordinary validation and sync remain off-switch gated |
| Secret isolation | Generated in-memory canary through HTTP success/failure and file storage | Only disposable credential file contains canary; response/log/Activity/snapshot/archive/proof output do not | Use intercepted provider/CLI transport and isolated home+APPDATA |

</intent-contract>

## Code Map

- `packages/contracts/src/api/http.ts` connection CRUD/validate schemas and `schemas/domain.ts` credential/status/connection schemas are sole wire source; export through existing barrels. Add candidate Verify/Connect schemas and sanitized capability/source results here.
- `apps/server/src/application/connector/connector.use-cases.ts:32` ordinary validate remains switch-gated; `credential.use-cases.ts` supplies human-only storeGitHubCredential. Add focused candidate use-case/receipt helpers instead of enlarging unrelated sync services.
- `apps/server/src/http/routes/connector-routes.ts` registers thin descriptors through registerApplicationRoute. Application registry/capability inventory and MCP administration classifier need human-only entries; generated artifacts must pass existing generation/parity.
- `packages/github/src/providers/work-item-provider.ts` owns ProviderAuth/ValidateConnectionResult; `github-provider.ts:32` currently reads only repo metadata and collapses failure kinds. Reuse pinned CLI environment and sanitized errors; normalize read/write evidence and errors for both auth modes. No modifying permission probes.
- `packages/db/src/repositories/projects-repository.ts` get/updateSafetySettings supplies epoch and attributed settings.safetyUpdated; connector repository methods create/update connections. Use these repository APIs in one UnitOfWork, never raw DB queries. `packages/db/src/database-handle.ts` current database identity changes on Restore; `unit-of-work.ts` CommittedUnitOfWorkError.result means DB already committed.
- `apps/web/src/features/github-sync/GitHubConnectionsPanel.tsx` owns current defaults, payload conversion and type/status editors. Extract reusable draft/field modules and exported GitHubConnectDialog; retain configuration fields and update/delete behavior while removing direct unreviewed enable/save-new path.
- `apps/web/src/components/Dialog.tsx` provides focus trap, nested/inert behavior and opener return. `features/story-map/components/LifecycleDialog.tsx` demonstrates synchronous ref admission. `app/live/live-interaction-store.ts` gives epoch/restoreRevision/restorePending and synchronous getState guards.
- `apps/web/src/app/api.ts` connection/status/safety queries and API calls; adopt authoritative Connect results into [connector-connections,projectId], [safety-settings,projectId], [credential-status], then refresh Activity/onboarding. Own live events are ignored and dialogs hold remote refresh; invalidation alone is insufficient.
- `apps/web/src/ui-strings/index.ts` and central-copy test own English UI strings; focused module allowed. Relevant tests: Dialog.test.tsx, GitHub selection/visibility tests, workspace-navigation.test.tsx; new actual dialog-consumer suite and server HTTP/application fixtures should cover matrix.
- Read-only zones: sprint/deferred-ledger/orchestrator files, user data, real home credentials, unrelated sync/identity schemas. Graph tools unavailable; planning uses verified source plus two distilled investigation agents. Node24: [REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/api/http.ts`, `schemas/domain.ts`, exports — add strict human candidate Verify and Connect contracts, normalized capability/source/failure results without secret output.
- [x] `packages/github/src/providers/work-item-provider.ts`, `github-provider.ts`, focused provider tests — verify repository read and report write limitations for CLI/token; normalize 401/403/404/429/network errors and preserve existing provider behavior elsewhere.
- [x] `apps/server/src/application/connector/` focused use cases/receipt helper, existing registry/administration classification, `http/routes/connector-routes.ts` — add human-only consented Verify and explicit Connect with stale/replay guards; reuse 7.1 writer and one repository UoW for connection/safety/audit; handle truthful partial results.
- [x] `apps/web/src/features/github-sync/` reusable dialog/draft/fields and panel — implement method, target, Verify, review, Connect; retain all defaults/settings/drafts; terminal CLI guidance/Recheck; show sources/capabilities/off notice; shared accessible Dialog and synchronous locks.
- [x] `apps/web/src/app/api.ts`, central `ui-strings` — type API calls and adopt own mutation results; invalidate verification on scope/method/input/Restore; reject late responses and refresh header/onboarding.
- [x] Focused contract/provider/server HTTP+MCP/web consumer tests — exercise every matrix row, including controlled awaits, real disposable SQLite/file failures, actual canary output inspection and keyboard/focus; run workspace and release gates without relaxing failures.

**Acceptance Criteria:**
- Given the actual app connection entry point with GitHub off, when a human follows token or CLI instructions and explicitly verifies, then selected credentials/repository are read without persistence or enablement and the required notice/source/capability review appears.
- Given verified unchanged inputs, when the human explicitly Connects, then read-only defaults/settings persist, GitHub enables with exactly one attributed safety-change event, header/query state updates, and duplicate confirmation cannot create another connection.
- Given auth/network/permission/rate/file/DB errors, when the actual HTTP/UI flow handles them, then actionable sanitized causes and any retained file effect are visible and drafts remain without false success.
- Given pending Verify or Connect, when Project/connection/method/input/epoch changes or the dialog closes, then late results cannot authorize/adopt stale intent or enable another Project.
- Given keyboard-only use, when entering, progressing, cancelling and encountering errors, then labels, focus trap, pending/error announcements and opener return work through shared English module strings.
- Given agent or ordinary off-state operations, when called through actual application/HTTP/MCP surfaces, then only the explicit human Verify boundary permits off-state reads and no secret-bearing tool exists.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass

- verdicts: 22 findings — high 0, medium 14, low 1, false 5, maybe-false 2
- grouped patches: 12 entries (11 medium, 1 low); 2 unverified acceptance deferrals; 5 rejected findings.
- findings:
  - `[medium]` `[patch]` gap-1: Successful existing-connection update branch unverified — Pre-verified gap: create-only successes and stale-update rejection never executed the update branch. New actual HTTP success asserts retained ID, changed persisted fields, unchanged count and authoritative result.
  - `[medium]` `[patch]` blind-1: Late Connect effects discarded — Initial onSuccess returned before any authoritative refresh when current(intent) failed. Fresh origin-scoped recovery now refreshes connection/safety/credential queries and retains scoped file-effect notices without replacing drafts; late-result and Restore consumer tests pass.
  - `[medium]` `[patch]` blind-2: Lost Connect response permits duplicate creation — Initial transport failure only advised Verify again after a possible commit. Explicit saved-state review now blocks retry, refreshes authoritative data and reuses an unambiguous existing ID; lost-response and failed-recovery tests pass.
  - `[medium]` `[patch]` blind-3: Shared credential file has only Project admission — Two Projects could interleave rename and status awaits before either transaction. Shared token-finalization admission now refuses the second call and releases on every exit; controlled cross-Project and failure retry cases pass.
  - `[medium]` `[patch]` blind-4: CLI fingerprint checked before later status await — The later credential-status probe could observe an altered CLI identity. Final operational resolution and private source/hash comparison now occur after that await and immediately before UoW; controlled account/removal tests pass.
  - `[medium]` `[patch]` blind-5: Token proof omits reviewed operational CLI identity — Verify displayed a source but retained only candidate token hash. Proof now privately binds reviewed operational source/hash and refuses CLI installation/removal/account drift after file storage with truthful retained-file effects.
  - `[medium]` `[patch]` blind-6: Reconnect ignores selected connection — The panel omitted connection prop. It now passes the selected configuration and distinguishes uninitialized selection from explicit New; HTTP stable-ID and consumer selection tests pass.
  - `[medium]` `[patch]` blind-7: Malformed nonblank inputs become generic request errors — Nonblank admission allowed malformed owner/repo/token to HTTP. Shared candidate schema now rejects them locally with actionable central text before mutation; invalid-input and cache privacy tests pass.
  - `[medium]` `[patch]` blind-8: Failed safety read silently blocks Verify — canVerify required safety.data but surfaced no query error. Existing Verify action becomes local Recheck settings with a cause/next action and retains draft; consumer recovery test passes.
  - `[medium]` `[patch]` blind-9: Credential messages cross scope — invalidate did not clear error/cliStatus on Project/connection changes. Ordinary messages now reset on actual scope changes while scoped retained-effect notices and same-scope Cancel drafts survive.
  - `[low]` `[patch]` blind-10: Failure fixtures do not match wire enums — Unsupported credentials/repository failure-kind strings were present and are corrected; fabricated responses now parse shared schemas. The separate claim that the success fixture lacked capabilities.read is disproved by its existing read:true field.
  - `[medium]` `[patch]` edge-1: Late Connect commits or stored-file effects are hidden — Same verified early-return defect as blind-1. Fresh authoritative recovery and scope-retained notices repair both successful commits and partial credential effects; no stale response is directly adopted after Restore.
  - `[medium]` `[patch]` edge-2: CLI changes during final status probe — Same verified post-fingerprint await as blind-4. Final operational capture/comparison refuses changed account/source and selected metadata follows that capture.
  - `[false]` `[reject]` intent-auth: Embedded login reading — Accepted D4 in the named story preparation and original Epic7 acceptance explicitly select human-terminal gh auth login or pasted tokens; embedded/OAuth login is not an unresolved reading of that story.
  - `[false]` `[reject]` intent-workflow: Diff cannot prove workflow execution — The diff alone cannot show execution history, but parent tool results establish exactly one renderer call, snapshot reads, mandatory implementation/four review agents and independent gates. Sprint hash remains unchanged and no tracking row was used as proof.
  - `[false]` `[reject]` intent-route: Running app entry point not exercised — Final parent Safari fixture opened the actual built Connections route and dialog, performed Verify/Connect and observed actual header state. Native acceptance evidence supersedes the initial jsdom-only limitation.
  - `[false]` `[reject]` intent-journey: Continuous browser to persistence journey missing — Final native Safari fixture crossed real UI, HTTP, application, repository and disposable SQLite with controlled CLI/provider boundary, proved off/no rows before Connect and one read-only row/On after, then retained ID on reconnect/reload. Live account acceptance is separately deferred.
  - `[medium]` `[patch]` intent-header: Header only inferred from query-cache assertions — Actual SafetySwitchStrip is now mounted alongside the panel and its Off-to-On labels asserted. Parent native Safari additionally observed the real header after Connect and reload.
  - `[maybe-false]` `[defer]` intent-live-auth: Real account and installed CLI acceptance remains unverified — Transport interception and disposable CLI/provider fixture establish boundaries but not an actual account/repository authentication. If broken the impact is medium; a separately authorized presence-confirmed real GitHub/CLI smoke would settle it.
  - `[maybe-false]` `[defer]` intent-native-a11y: Complete native platform and reader matrix unperformed — Parent Mac Safari observed heading focus, reverse-tab containment and keyboard opener return, but did not execute full VoiceOver/Windows/NVDA/Firefox release matrix. If native reader behavior is broken impact is medium; execute that bounded matrix to settle it.
  - `[false]` `[reject]` intent-cancel: Server does not receive a browser cancellation event — An already submitted explicit Connect is authorized for its captured original Project. Client closing does not promise rollback/revocation. Proof binds submitted scope/epoch; late effects are now reconciled through fresh scoped reads and cannot enable another Project.
  - `[medium]` `[patch]` parent-1: Ambiguous recovered connections selected arbitrarily — New recovery initially used .find although same-name/target configurations are permitted. It now reuses only exactly one match; multiple matches keep creation blocked until explicit saved selection. Two-match consumer regression passes.

### 2026-10-19 — Review pass (follow-up)

- verdicts: 42 findings — high 0, medium 2, low 24, false 16, maybe-false 0
- findings:
  - `[low]` `[reject]` blind-1: Inner Connect catch maps every non-committed error to database — the stale `conflict` inside the UoW is unreachable (same tick as the preceding scope assertion); SQLite failures are the intended database kind per the File/DB matrix row; rejected low, no focused error type exists to narrow to.
  - `[low]` `[reject]` blind-2: Failure kinds coarse (credentials/storage) — every message still names a cause and next action; rejected low, finer kinds add branches without a named harm.
  - `[low]` `[reject]` blind-3: Module-level credential finalization flag — it models the single process-wide user credential file and releases on every exit; rejected low, per-path injection is more than a direct correction.
  - `[low]` `[reject]` blind-4: Proofs never expire — local scope drift is enforced and remote revocation surfaces on first operation; rejected low, TTL is a new feature.
  - `[false]` `[reject]` blind-5: Verified token differs from operational CLI credential — intent explicitly requires reviewing the actual operational source including CLI precedence; the dialog shows it.
  - `[false]` `[reject]` blind-6: Update button bypasses Verify — Code Map retains update/delete; Update never enables GitHub.
  - `[low]` `[reject]` blind-7: Definite 4xx Connect refusals shown as uncertain — conservative refresh, correct for the multi-window case; rejected low, branching on status is more than a direct correction.
  - `[false]` `[reject]` blind-8: Token stays after Cancel — intent requires drafts retained where scope remains; in-memory component state only, cleared on success and scope change.
  - `[low]` `[patch]` blind-9: Ordinary Validate lost its actionable text — provider failure results now put `message nextAction` in `message`; provider test asserts it.
  - `[low]` `[reject]` blind-10: Raw enum values in review text — cosmetic.
  - `[low]` `[patch]` blind-11: Orphaned strings after removed Enable/Save-new — four unreferenced panel strings deleted; remaining style remarks name no harm.
  - `[false]` `[reject]` blind-12: No re-enable path in the panel — the header safety switch remains and the intent removes unreviewed enable.
  - `[low]` `[reject]` blind-13: Evidence JSON cites uncommitted /tmp fixtures — traceability only; real-account and reader gaps are already deferred.
  - `[low]` `[reject]` blind-14: Missing ADR — decision is feature-local and recorded in Design Notes and the accepted Epic 7 plan.
  - `[false]` `[reject]` edge-1: CLI account never checked for a token candidate — explicit intent: candidate tokens bypass resolver precedence and the operational source is reported.
  - `[false]` `[reject]` edge-2: Broken gh fails a valid token Verify — the resolver also consults gh first, so Connect and normal operations would fail identically.
  - `[low]` `[reject]` edge-3: Missing capability evidence reported as credentials — provider always returns capabilities on success; unreachable.
  - `[low]` `[reject]` edge-4: Stale conflict labelled database — same as blind-1.
  - `[low]` `[reject]` edge-5: Programming errors swallowed — same as blind-1.
  - `[false]` `[reject]` edge-6: Write-enabled connection saved without write evidence — intent requires reporting, not gating; limitation text states writes are unverified.
  - `[low]` `[reject]` edge-7: No proof expiry — same as blind-4.
  - `[low]` `[reject]` edge-8: Publication warning leaves dialog open so a re-Verify/Connect could duplicate — user must repeat both steps despite a "saved" warning; rejected low, adoption conflicts with the scope-reset clearing the warning.
  - `[low]` `[reject]` edge-9: 4xx Connect treated as uncertain — same as blind-7.
  - `[low]` `[patch]` edge-10: Credential-status query stale after a retained-file failure — failure branch now invalidates it.
  - `[low]` `[reject]` edge-11: Recovered connection id lingers for New selection — requires an earlier lost response; rejected low, fix is nontrivial.
  - `[false]` `[reject]` edge-12: Unrelated connection adopted on lost response — only one identical name/owner/repository match is reused and the notice states it.
  - `[false]` `[reject]` edge-13: Token retained after close — same as blind-8.
  - `[medium]` `[patch]` edge-14: Dialog draft ignores `connection.updatedAt` — a panel Update left the old draft, so Connect could overwrite the update; scope now includes updatedAt and a regression test fails without it.
  - `[low]` `[reject]` edge-15: TypeError classed as network — needs a null gh body; unreachable in practice.
  - `[low]` `[patch]` edge-16: Same ordinary Validate message regression as blind-9.
  - `[low]` `[patch]` edge-17: Same orphaned strings as blind-11.
  - `[false]` `[reject]` edge-18: Unverified Update path — same as blind-6.
  - `[false]` `[reject]` edge-19: Validate disabled without reason — the panel already shows the disabled-connector notice.
  - `[medium]` `[patch]` gap-1: Already-enabled Verify/Connect branch untested — added server test (message, githubEnabled, no second safetyUpdated event) and web test (verified vs off notice).
  - `[low]` `[patch]` gap-2: Panel adoption of the connected id unasserted — new test checks selection value and connected message.
  - `[low]` `[reject]` gap-3: Evidence cites /tmp artifacts — same as blind-13.
  - `[false]` `[reject]` gap-4: Validate response lacks `capabilities` in schema — the schema is not applied to the route response and extra keys are harmless; the provider tests pin the gh api arguments.
  - `[low]` `[patch]` intent-1: MCP absence asserted only as non-200 on guessed names — now asserts the real MCP tool list has no GitHub verify/connect tool.
  - `[false]` `[reject]` intent-2: Consent is a literal and HTTP binds the local human — the local-human trust model and `requireHumanActor` use-case refusal match the intent; no MCP tool exists.
  - `[false]` `[reject]` intent-3: Verify infers operational source — Connect re-resolves through the resolver and compares source and hash before the UoW.
  - `[false]` `[reject]` intent-4: Tests are jsdom/inject rather than native — carried: intent-route and intent-journey rejections plus the two native/real-account deferrals.
  - `[false]` `[reject]` intent-5: Replace versus add — Code Map explicitly retains update/delete and removes only direct enable/save-new.

## Design Notes

Use opaque random verification ids and a small latest-proof-per-Project map scoped to DatabaseHandle. Proofs retain hashes, config/scope/actor/settings/database snapshots and sanitized capability evidence, never candidate tokens; mark consumed before any Connect await. Verify new input replaces old proof; failed consumed Connect requires Verify again while retaining draft. CLI Connect resolves locally again and compares captured credential fingerprint. Token Connect repeats exact candidate fingerprint, writes via storeGitHubCredential, then rechecks scope before transaction. Report CLI precedence over saved candidate explicitly. Do not leave transactions open over awaits.

Candidate contract contains connection configuration, optional existing connectionId, discriminated credential method/token and explicit consent; final confirmation binds the same candidate to verificationId and confirm:true. Receipt binds database identity/epoch; UI guards current epoch/restoreRevision synchronously even while Dialog holds cache refresh. Post-commit publication errors are distinguishable from rollback through CommittedUnitOfWorkError and must not falsely report that committed settings stayed off.

## Verification

- Use Node24 PATH for all commands and isolated generated fixtures only. Stage new task source when required by script fixtures, explicitly excluding sprint-status.
- Focused provider/server/web suites cover matrix and existing connection/safety regressions; workspace typecheck catches all consumers.
- `corepack pnpm test` — all workspace/script tests pass.
- `node scripts/verify.mjs` — hygiene, capability parity, typecheck and build pass.
- Independently audit intent/matrix against observed final tests and immutable reviewed source; document native platform/reader limits without claiming release acceptance.

## Auto Run Result

Status: done

- Summary: Story 7.2 guided GitHub connection (candidate Verify, separate Connect, single-use server proof, one-UoW connection plus switch, reusable accessible dialog). This follow-up pass patched one data-overwrite defect and several smaller gaps.
- Files changed this pass: `GitHubConnectDialog.tsx` (draft reload on connection update), `use-github-connect.ts` (credential-status refresh after retained-file failure), `github-provider.ts` and test (actionable ordinary Validate message), `ui-strings/index.ts` (unused strings removed), `github-connect.test.ts` and `GitHubConnectDialog.test.tsx` (already-enabled branch, panel adoption, draft reload, MCP tool absence).
- Review findings: 42 triaged; patched 2 medium and 5 low entries (high 0); deferred 0 new (the two earlier unverified acceptance deferrals stand); 35 rejected with the reasons logged above.
- Follow-up review recommendation: false (follow-up pass patched no high).
- Verification: focused provider, server connect and web github-sync suites pass; `corepack pnpm test` exit 0; `node scripts/verify.mjs` exit 0 (hygiene, parity, typecheck, build).
- Residual risks: real GitHub account/CLI and full native screen-reader matrix remain unverified; `sprint-status.yaml` and `deferred-work.md` remain orchestrator-owned and untouched.

## Changelog

- 2026-10-19 v2: Twelve review repair groups applied; native Safari running-app fixture passed; real account and full native reader/platform acceptance recorded as unverified.
- 2026-10-19 v1: Source-grounded runnable plan aligned with accepted D1/D4, 7.1 credential foundation and reusable 7.7 dialog boundary.

