---
title: '7.4 Push with a mandatory Dry Run'
type: feature
created: 2026-10-19
updated: 2026-10-19
version: 2
status: done
baseline_revision: 74c5921401223e1fbfd3ad96bcfc582208ae5565
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-4-push-with-a-mandatory-dry-run.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      One integrated native browser/provider journey remains unverified
    evidence: |-
      Component API mocks plus actual HTTP/MCP/provider transport tests establish separate seams; a native controlled browser journey would establish the combined UI surface.
    severity: medium (unverified)
  - summary: >-
      Abrupt OS termination during a remote call remains unverified
    evidence: |-
      Fault-injected outcomes and actual SQLite reopen/Restore verify durable recovery; a separately controlled child-process kill with persistent fake remote state would establish literal process-death acceptance.
    severity: medium (unverified)
  - summary: >-
      Native platform/reader and live GitHub/installed CLI acceptance remain unverified
    evidence: |-
      CUA has no browser surface; no live-account acceptance run authorized. Native/platform and separately authorized account observations would settle these boundaries.
    severity: medium (unverified)
  - summary: >-
      Marker reconciliation lists every repository Issue once per effect at plan and execution time
    evidence: |-
      findGitHubMarkerMatches pages all Issues (state=all) per effect; a push of hundreds of Cards against a large repository could exhaust the REST rate limit. Measuring request counts for a 500-Issue disposable repository, or sharing one complete listing per run, would settle it.
    location: >-
      packages/github/src/providers/github-remote-push.ts findGitHubMarkerMatches
    severity: medium (unverified)
  - summary: >-
      GitHub may return a normalized Milestone due_on time different from the sent T00:00:00.000Z
    evidence: |-
      remoteMatchesIntent compares due dates as exact instants; if GitHub rewrites the time of day, every dated Release Milestone write would end interrupted with a content-mismatch conflict. An observation of due_on round-trip on a disposable repository, which is not authorized here, would settle it.
    location: >-
      apps/server/src/services/remote-push-evidence.ts remoteMatchesIntent
    severity: high (unverified)
---

Reproducing statement: Execute bmad-build-auto for Story 7.4, bind every remote write to an immutable human-reviewed Dry Run, verify recovery and every outbound surface, and preserve orchestrator-owned sprint-status.yaml. Date: 2026-10-19. Version: 2.

<intent-contract>

## Intent

**Problem:** Human push confirms a boolean and regenerates its payload; sync and local conflict resolution can also write directly. Hidden Milestone writes and missing durable intents make consent and interrupted recovery unreliable.

**Approach:** Persist immutable exact Issue/Milestone plans and separate execution evidence. Human confirmation of the plan id is the sole outbound authorization; explicit recovery reconciles stable entity markers before any repeated effect.

## Boundaries & Constraints

**Always:** Follow accepted Epic7 D5/D6 and ADR0003. Capture plan id, initiating actor, Project/Map/connection/selection, persistent database epoch, local root versions/content and connection/mapping/safety fingerprints plus complete remote capability/type/label/target evidence. Keep exact ordered payloads, dependencies and markers immutable; record mutable item attempts/outcomes separately. Only human UI confirmation/resume by exact plan id executes. Refresh remote evidence before confirmation and recheck local inputs, safety, connection ownership, mapping, epoch and database identity after awaits and immediately before modifying calls. Drift requires re-review. Atomically consume confirmation under the write gate; concurrent/double confirmation cannot execute twice. Commit per-item exact intent before each modifying call, success evidence before proceeding; expose actual URL/id, retained remote success after local failure, uncertainty, failure and not-attempted states. Resume keeps payload/marker and first reconciles in-flight effects; incomplete/ambiguous/auth/transport lookup never proves absence. A new plan after Restore also reconciles stable entity markers, since Restore does not undo GitHub. Milestone create/update is an explicit effect with Release name, goal/description, due date including clearing, and open/released state; shared Milestones occur once with Issue dependencies, and an explicitly selected empty Release still emits its Milestone. Explicit cardIds:[] never means whole Map. Exclude Notes and show exclusions; scope must not expand to unrelated Cards. Preserve source-only provenance refusal and canonical adapter-owned identity. Separate outbound Activity/Step/Story native issue-type mapping from existing inbound match mapping; retain imported native type, verify available types and permissions, block missing/unsupported mappings. Show exact status/export/structure/opted-in Annotation label additions/removals, preserve unrelated remote labels, and block configured labels absent remotely with an actionable message. Do not infer types from title prefixes. Reuse the delimited footer/stable marker and current served loopback origin; preserve authored Markdown and omit Workflow Status. All outbound entry points, including sync/pull, quick actions and local conflict choice, use this protocol; generic Agent approval never authorizes it. Protected Agents fail before credential/provider work; unprotected Agents can prepare/read proposals only. Keep current incoming semantics outside the required outbound cutover. Use shared contracts, repository-only DB access, pure core logic, explicit capability parity and archive classification/redaction; operational Restore retains plans/evidence but invalidates old epoch consent. UI retains drafts, pending holds, focus, explicit selection and epoch/scope-safe late-response admission.

**Never:** Write, stage, unstage or revert sprint-status.yaml; alter orchestrator/deferred-ledger state; infer verification from done/awaiting-operator rows; commit/push; access real credentials, user Projects/databases or live GitHub. No background retry, remote rollback claim, hidden label/Milestone writes, legacy boolean-confirmation bypass, prototype migration/backfill, second provider, new SaaS/dependency, automatic conflict decision or future-story incoming ChangeSet rewrite. Preserve existing unrelated work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Scope and review | Explicit subset/empty subset, Notes, or Release with zero Stories | Persist/read exact effects, type/label diffs, exclusions/dependencies; no implicit scope; empty Release Milestone visible | Reject foreign Project/connection and provenance-only sync ownership |
| Confirmation | Human plan id versus altered selection, boolean-only call, Agent approval or simultaneous confirmations | Only immutable stored effects execute once, all outer HTTP/MCP/UI surfaces enforce boundary | Strict request/actor refusal before writes |
| Drift | Local content/version, remote content/type/labels/capability, mapping/connection/safety change or Restore during any await | No stale consent executes another effect; explicit fresh review required | Visible stale/refused result, retained earlier effects |
| Mapping and labels | Missing/unsupported native type; imported type; managed and unrelated labels | Verified native type sent identically for CLI/token; exact managed diff preserves unrelated labels | Actionable blocked readiness for missing type/label/permissions; no silent omission |
| Milestones | Shared/new/renamed Release, cleared dates/goal, released state, failed Milestone | One explicit exact Milestone effect; dependent Issues use its actual identity; no hidden writes | Stop and expose failed/not-attempted dependencies |
| Interrupted batch | Twelve Issues; interruption after sixth remote effect or success before local outcome/binding/audit commit; reopen/resume | Every call preceded by durable intent; original payloads/markers; exactly one remote Issue per marker; actual links/results retained | Uncertain/local-failure visible; stop further effects until explicit reconciliation |
| Reconciliation | Complete zero/one/multiple marker matches; partial/search/auth failure; new plan after Restore | Complete exact-scope lookup can reconcile existing effect without duplicate creation; Restore never claims remote rollback | Ambiguous/incomplete lookup refuses blind create |
| Persistence and UI | Populated reopen/Restore/archive; late response/scope change, lower-version epoch, pending/double click, retry | Operational evidence retained, portable sync data redacted/rejected; exact UI effects/results, held drafts and safe focus | Explicit errors and re-review; no stale result adoption |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts`: `connectorConnectionSchema`, `typeMappingEntrySchema` is inbound regex-to-level, `remoteWorkItemSyncStateSchema`, `syncPlanItemSchema`/`syncPlanSchema`. Extend via dedicated schema modules to stay within source-size gate. `api/http.ts` owns strict plan/confirm/read/resume requests; `schemas/sync-results.ts` owns explicit per-effect states. Preserve separate Agent selection proposal API.
- `packages/db/src/repositories/work-item-repository.ts`: `createWorkItemPushPlan` incorrectly tests cardIds.length and emits only Issues; `bindRemoteWorkItemLink` joins canonical refs. Connection JSON mapper/create/update must persist new outbound mapping. Add focused remote-plan repository, bind methods in `repositories/storymapper-repository.ts`; keep immutable plan versus mutable consumption/item evidence separate. Update `schema/tables.ts`, `connection.ts`, `schema/classification.ts`, `github-archive-redaction.ts` and validators together.
- `packages/db/src/database-handle.ts`: `DatabaseHandle.exclusive`/write gate; `unit-of-work.ts`: synchronous transaction boundary and `CommittedUnitOfWorkError` means already committed, so reload durable state instead of assuming rollback. `getSafetySettings().epoch` is persisted/shared; additionally capture handle.current across awaits. No transaction spans provider awaits.
- `packages/core/src/publishing/export-formatters.ts`: remove `githubIssueTypeForCard` prefix guess. `github-footer.ts`: reuse `gitHubIssueMarker`, `buildGitHubIssueBody`, `stripGitHubIssueFooter`. Add pure exact payload/managed-label/dependency helpers; retain existing footer output policy for Estimate/Priority (7.3 left that separate decision deferred).
- `packages/github/src/providers/work-item-provider.ts`: normalized discovery, explicit Milestone effects and complete reconciliation methods belong here. `github-provider.ts`: replace hidden `ensureMilestone`, full exact payload for both transports, complete repository-scoped paginated marker lookup/Milestones/labels. Existing GraphQL search first100 with nested labels first50 is not proof of complete absence. Token Milestone pagination defect is replaced by explicit complete reads in this story.
- `apps/server/src/services/work-item-sync.ts`: replace human push regeneration (`pushWorkItems`/`pushItem`/`finishPush`) with persisted prepare/read/confirm/resume orchestration; `prepareSyncItem`/`writeRemoteItem` currently bypass review during sync/pull. `application/sync/sync-conflict.use-cases.ts` local choice also writes directly. Cut all outbound effects over; remote-wins/incoming rewrites remain 7.5. Reuse `services/remote-write-outcomes.ts` truthful remote success semantics and original-database failure evidence.
- `apps/server/src/application/sync/github-command.ts`: `beginGitHubPreparation`, `revalidateGitHubPreparation`, `proposeRemotePush` preserve protected early refusal and proposals. Human ownership validation needs Map.projectId===connection.projectId too. `application/sync/sync.use-cases.ts`, `http/routes/sync-routes.ts`, descriptors/manifest and generated MCP inputs/classification must expose only human confirmation; existing tools retain proposal semantics.
- `apps/web/src/app/api.ts`, `features/github-sync/GitHubSyncPanel.tsx`: `requestPlan`/`pushReviewedPlan` currently send selection+boolean; `quickPush`/`quickSync` bypass. Shared exact review/results component must retain full plan and confirm id. `features/story-map/components/CardDetailModal.tsx` currently retains only first item; `BoardToolbar.tsx` freezes selected ids. Preserve pending selection added later and hidden counts; support Activity/Step/Story and empty Release.
- `apps/web/src/features/github-sync/connection-draft.ts`: `ConnectionDraft`, defaults/serialization/connectionToDraft; `GitHubConnectionFields.tsx`: shared editor used by connect and edit panels. Add outbound mapping independently of inbound editor. Use central English strings and shared Dialog/epoch/pending infrastructure.
- Relevant tests: server `services/{work-item-sync,sync-review}.test.ts`, `application/sync/github-command-regressions.test.ts`, `mcp/github-command-{sdk,transports}.test.ts`; provider `github-provider.test.ts`; web `github-{selection,visibility}.test.tsx`/`GitHubConnectDialog.test.tsx`; DB populated snapshot/Restore/archive/transactions and new persisted-plan suites. Two read-only investigation agents verified these paths; code-graph tools unavailable.
- Read-only: sprint-status, deferred/orchestrator ledgers, user data, actual credentials. Global policy forbids commit without explicit request. Commands use Node24 PATH `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `schemas/sync-results.ts` — define exact plan/effect/intent/outcome/read/confirm/resume and outbound mapping, strict transitions and separate Agent proposals.
- [x] `packages/db/src/repositories/work-item-repository.ts`, `schema/tables.ts`, `connection.ts`, `schema/classification.ts`, `github-archive-redaction.ts` — persist immutable content and guarded consumption/evidence, canonical Issue/Milestone bindings, classifications/redaction and populated reopen/Restore.
- [x] `packages/core/src/publishing/`, `packages/github/src/providers/` — exact payload/type/label/dependency computation, explicit Milestone calls, complete marker reconciliation and CLI/token parity.
- [x] `apps/server/src/services/work-item-sync.ts`, `application/sync/`, `http/routes/sync-routes.ts` — shared prepare/read/confirm/resume and safe recovery; remove every outgoing bypass, preserve incoming scope and protection.
- [x] `apps/web/src/features/github-sync/`, `features/story-map/components/CardDetailModal.tsx`, `app/api.ts` — mapping, shared full Dry Run and per-item links/results/resume, all launchers, stale review, scope/epoch/pending/focus behavior.
- [x] `apps/server/src/services/work-item-sync.test.ts`, `services/sync-review.test.ts`, `mcp/github-command-sdk.test.ts`, `packages/db/src/`, `packages/github/src/providers/github-provider.test.ts`, `apps/web/src/features/github-sync/` tests — execute every matrix row including twelve-Issue reopen/recovery and fault-injected audit/outcome/Milestone/race failures; assert provider payload equals persisted reviewed content and intent exists before call.

**Acceptance Criteria:**
- Given selected Cards or a Release, when a user starts any outbound action through the actual UI/HTTP entry point, then the persisted Dry Run exposes every exact Issue/Milestone effect and only separate human confirmation by its id can send it.
- Given protected or unprotected Agent MCP requests across both transports, when push/proposal/approval is attempted, then protection refuses early and permitted proposals/approval cannot mutate GitHub.
- Given interrupted remote effects and a reopened disposable Project, when a human explicitly resumes, then exact durable evidence and complete reconciliation prevent duplicate Issues and expose truthful per-effect status, including retained remote success after local failure.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 9, medium 10, low 0, false 1, maybe-false 3
- findings:
  - `[medium]` `[patch]` B1: Own Milestone updates invalidate dependent Issue snapshots — Milestone title/due fields in remoteBefore are compared unchanged after the dependency updates them. Adjusted only completed own Milestone dependency metadata before normalized target comparison; linked rename/date and dated-close regressions pass.
  - `[medium]` `[patch]` B2: REST marker and detailed provider reads have inconsistent shapes — REST evidence omits assignee/parent; CLI omits due date; entire-object fingerprint compares those inconsistent projections. Read detailed marker targets and compare a shared written-field projection with normalized dates and complete Milestone evidence; transport-shape regressions pass.
  - `[medium]` `[patch]` B3: Repeated failed preparation attempts an invalid outcome transition — Catch handles failed evidence as another failed outcome, while repository failed transitions are empty. Permit failed-to-failed evidence updates and retain interrupted state on repeat resume failures; repository/executor regressions pass.
  - `[medium]` `[patch]` B4: Imported fallback status labels are not retired — Imported managedLabels is empty and managed set includes current fallback status only, so prior generated status survives. Include known workflow fallback labels in managed ownership; imported fallback-label regression preserves unrelated labels.
  - `[high]` `[patch]` B5: Resolving one local conflict replaces unrelated baselines and state — Generic bind writes all hashes/state and resolves selected conflict without existing field-specific baseline/state logic. Reuse field-specific persistConflictResolution and retain unrelated baselines/open conflicts; chosen-field state regressions pass.
  - `[high]` `[patch]` B6: Saved plan ignores checkbox and Release selection — readPlan compares selectedCardIds prop only; operationDraft Card/Release selection is not checked. Validate full checkbox/Release selection, preserving All versus explicit Unscheduled, with synchronous action refusal and saved-plan regressions.
  - `[high]` `[patch]` B7: Writable Sync skips incoming merge and conflict discovery — Writable launcher branches call plan push directly and tests assert sync API never runs. Use existing mode sync for writable panel/quick/modal launchers: incoming merge/conflict discovery first, then only pending safe outgoing effects. Preserve own refreshed review and dirty drafts.
  - `[medium]` `[patch]` B8: Provider payload discrepancy can be reported synchronized — Outcome uses actual result but generic binding hashes requested title/body and unconditionally sets synced without payload equality. Retain actual success evidence but refuse binding/completion when any reviewed Issue/Milestone field differs; repeated resume never replays known remote call.
  - `[high]` `[patch]` B9: Sync memberships are absent from local fingerprints — Type, managed-label and canonical sync metadata feed plan construction but fingerprint includes only roots/annotations/conflicts. Fingerprint selected canonical refs and sync memberships; metadata-only and canonical-identity-only drift regressions pass while own progress advances.
  - `[medium]` `[patch]` B10: Saved plan can publish an obsolete served origin — Confirmation receives no current origin and validates no origin against the generated footer payload. Inject actual served-origin dependency into confirmation/resume and refuse generated footer-origin drift; actual HTTP origin restart regression passes.
  - `[false]` `[reject]` E1: Old prototype databases do not receive new sync columns — Binding Epic7 schema policy explicitly makes pre-release prototype DBs disposable; story8.1 owns release baseline migrations. Current-schema reopen/Restore passes; compatibility is intentionally excluded.
  - `[high]` `[patch]` E2: Different concurrent plans can create duplicate Issues — activePlans is keyed by plan id and repository intent checks only the same execution, permitting distinct plans to pass absent-marker reads before either binding. Atomically guard overlapping entity intents and capture overlapping execution-state SHA256 before lookup. Parent reproduced delayed absence after another create became uncertain; fixed admission rejects stale proof, retains original uncertainty and explicit resume yields one create.
  - `[medium]` `[patch]` E3: Own Milestone rename/date causes false Issue drift — Same verified defect as B1; own dependency updates must adjust compared milestone evidence only. Adjusted only completed own Milestone dependency metadata before normalized target comparison; linked rename/date and dated-close regressions pass.
  - `[medium]` `[patch]` E4: Recovered assigned or parented Issues fail unchanged confirmation — Same verified defect as B2; detailed read and REST marker result differ in unmodified fields. Read detailed marker targets and compare a shared written-field projection with normalized dates and complete Milestone evidence; transport-shape regressions pass.
  - `[high]` `[patch]` E5: Metadata-only changes escape reviewed local checks — Same verified defect as B9; upsert sync metadata need not bump root version. Fingerprint selected canonical refs and sync memberships; metadata-only and canonical-identity-only drift regressions pass while own progress advances.
  - `[high]` `[patch]` E6: Field resolution advances unrelated baselines — Same verified defect as B5; existing persistConflictResolution retains unrelated fields and recomputes state, unlike new generic bind. Reuse field-specific persistConflictResolution and retain unrelated baselines/open conflicts; chosen-field state regressions pass.
  - `[high]` `[patch]` E7: Writable Sync can overwrite remote-only content — Same verified defect as B7; outgoing full local payload is prepared before any incoming merge. Use existing mode sync for writable panel/quick/modal launchers: incoming merge/conflict discovery first, then only pending safe outgoing effects. Preserve own refreshed review and dirty drafts.
  - `[medium]` `[patch]` V1: Card Detail confirm/resume consumer lacks behavioral verification — Pre-verified gap: routed fixture has no connections, static rendering does not run mutations, navigation mocks modal. Resume-to-confirm mutation would remain undetected. Added actual routed modal preview/confirm/interruption/resume exact-id, pending dirty-draft, scope/epoch and Sync-refetch acceptance tests.
  - `[medium]` `[patch]` V2: Restore remote evidence rejection lacks corruption coverage — Pre-verified gap: current tests restore valid rows only, so removing correspondence check does not fail tests. Added malformed JSON, item mismatch, ownership and status corruption through actual Restore; refusal leaves live serialized database bytes unchanged.
  - `[high]` `[patch]` I1: Changed UI Sync does not preserve incoming semantics — Descriptive intent audit identifies same source-proven regression B7/E7; preserve incoming merging before reviewed outgoing work. Use existing mode sync for writable panel/quick/modal launchers: incoming merge/conflict discovery first, then only pending safe outgoing effects. Preserve own refreshed review and dirty drafts.
  - `[maybe-false]` `[defer]` I2: One integrated native browser/provider journey remains unverified — Component API mocks plus actual HTTP/MCP/provider transport tests establish separate seams; a native controlled browser journey would establish the combined UI surface.
  - `[maybe-false]` `[defer]` I3: Abrupt OS termination during a remote call remains unverified — Fault-injected outcomes and actual SQLite reopen/Restore verify durable recovery; a separately controlled child-process kill with persistent fake remote state would establish literal process-death acceptance.
  - `[maybe-false]` `[defer]` I4: Native platform/reader and live GitHub/installed CLI acceptance remain unverified — CUA has no browser surface; no live-account acceptance run authorized. Native/platform and separately authorized account observations would settle these boundaries.

### 2026-10-19 — Review pass (follow-up)
- verdicts: 40 findings — high 0, medium 4, low 18, false 15, maybe-false 3
- findings:
  - `[false]` `[reject]` carried E1: Blind Hunter — existing databases lack the new columns — Epic7 schema policy makes prototype databases disposable and the intent forbids migration/backfill.
  - `[false]` `[reject]` Blind Hunter — no ADR for the plan/confirm protocol — accepted ADR 0008 (D5/D6) and ADR 0003 already record these decisions; implementing them adds no new architecture decision.
  - `[false]` `[reject]` Blind Hunter — default empty issueTypeMapping blocks every connection until configured — the intent requires blocking missing mappings with an actionable message; the blocker names the connection settings.
  - `[false]` `[reject]` Blind Hunter — gh cannot send an empty labels array — installed gh 2.101.0 accepts `-f 'labels[]'` (parsing passes, only the unreachable host fails) and the transport test asserts this argv.
  - `[low]` `[reject]` Blind Hunter — Sync planning discards a createWorkItemPushPlan result — only a wasted validation call; the incoming-first ordering is required by the earlier B7 repair.
  - `[maybe-false]` `[defer]` Blind Hunter — marker lookup cost grows with repository size and plan count — deferred as medium (unverified); request counts on a large repository would settle it.
  - `[false]` `[reject]` Blind Hunter — module-level activePlans Set — resume may claim a `running` plan, so the in-process guard is required and runToken ownership stops any older run.
  - `[low]` `[reject]` Blind Hunter — z.unknown remoteBefore/remoteResult are cast — only this code writes them and Restore validates correspondence; no reachable failure shown.
  - `[low]` `[reject]` Blind Hunter — "unmapped" sentinel, no-op `this.context.database`, unused `stale` status — the sentinel always comes with a blocker the claim refuses; the getter is an availability assertion; `stale` is inert.
  - `[low]` `[reject]` Blind Hunter — fingerprintText duplicates hashing, repeated human checks — cosmetic duplication with no divergence shown.
  - `[low]` `[reject]` Blind Hunter — fail-open guards (falsy epoch, origin skip, non-null origin) — the server claim rechecks epoch, footers are always built, and routes always inject the origin; no reachable state.
  - `[low]` `[reject]` Blind Hunter — Dry Run shows payload but not the remote-before delta — action, type, labels and exact payload are shown as the intent requires; a diff view is nice-to-have.
  - `[low]` `[reject]` Blind Hunter — duplicated scope/epoch guards in panel and modal — GitHubSyncPanel is 428 lines, within the limit; no divergence shown.
  - `[false]` `[reject]` Blind Hunter — vitest-importing fixture and missing docs row — src/fixtures already contains vitest-importing fixtures (reviewed-mcp-call.ts) and getRemotePushPlan is a REST read, not an MCP tool; capability parity passes.
  - `[false]` `[reject]` Edge Case Hunter — undefined localOrigin reaches the footer — routes and MCP always inject the served origin; the default confirm callback fails closed.
  - `[false]` `[reject]` Edge Case Hunter — Sync ignores failed incoming items — the outgoing plan is rebuilt against freshly read remote content and merges only locally changed fields.
  - `[low]` `[reject]` Edge Case Hunter — Sync-skipped Cards are not listed as exclusions — nothing is sent for them; informational only.
  - `[low]` `[reject]` Edge Case Hunter — result of a confirm whose scope changed mid-flight is dropped — the executed plan stays readable by id; reaching it needs a scope change while a hold is pending.
  - `[low]` `[reject]` Edge Case Hunter — conflictId accepted with mode sync — the UI never sends it; no reachable harm.
  - `[low]` `[reject]` Edge Case Hunter — an empty plan is confirmable — completes with zero effects, no remote call.
  - `[false]` `[reject]` Edge Case Hunter — stored issue type outranks live remote type — the intent retains the imported native type and the Dry Run shows payload next to remoteBefore, so the overwrite is reviewed.
  - `[maybe-false]` `[defer]` Edge Case Hunter — GitHub may normalize Milestone due_on time — deferred as high (unverified); a disposable-repository round-trip would settle it.
  - `[false]` `[reject]` Edge Case Hunter — stale error text beside remote_succeeded — persistBinding sets `succeeded`, which clears the error in the same call.
  - `[low]` `[reject]` Edge Case Hunter — quick Push on a read-only connection runs incoming Sync — Push is disabled when the selected connection is read-only; only a differing link connection reaches it.
  - `[low]` `[reject]` Edge Case Hunter — Card modal loses earlier plans when a later connection fails — plans are persisted and consent unaffected.
  - `[low]` `[reject]` Edge Case Hunter — createOrUpdateRemoteItem is a dead legacy write — no production caller, tests assert it is never called; removal touches many mocks for a speculative risk.
  - `[low]` `[reject]` Edge Case Hunter — parent override now blocked — no UI surface, explicit actionable blocker, not required by the intent.
  - `[false]` `[reject]` carried E1: Edge Case Hunter — missing column migration — same as above.
  - `[false]` `[reject]` carried E1: Verification Gap — legacy databases untested — same as above.
  - `[medium]` `[patch]` Verification Gap — GET plan route has no server test — added HTTP read equal to repository state and unknown-id 404 in unit-of-work.test.ts.
  - `[medium]` `[patch]` Verification Gap — real transports for readPushInputs, marker lookup and complete REST labels unverified — added token pagination, CLI GET and REST-label-override tests in github-push-transports.test.ts.
  - `[medium]` `[patch]` Verification Gap — outbound Issue type connection draft untested — added connection-draft.test.ts for trimming, empty removal and edit round-trip.
  - `[medium]` `[patch]` Verification Gap — Keep local to Dry Run panel flow untested — added panel test in github-selection.test.tsx for Keep local review and Keep remote refresh-only.
  - `[low]` `[reject]` Verification Gap other — `stale` status never set — inert dead enum value.
  - `[low]` `[reject]` Verification Gap other — web api.pushWorkItems unused — dead client wrapper; tests mock it to assert no use.
  - `[false]` `[reject]` Intent Alignment — human is a route label, not an identity — matches the existing local actor model; agents reach GitHub only through MCP, which has no confirm tool.
  - `[false]` `[reject]` Intent Alignment — Agent proposals keep the ChangeSet shape — intent allows proposals; tests assert no provider write.
  - `[false]` `[reject]` Intent Alignment — Sync planning applies incoming changes before review — required by the earlier B7/E7 repair.
  - `[maybe-false]` `[defer]` carried I2/I4: Intent Alignment — real GitHub boundary not exercised — already deferred; no live account authorized.
  - `[low]` `[reject]` Intent Alignment — parent assignment blocked rather than supported — same as the parent finding above.

## Design Notes

Do not conflate immutable consent with a mutable ChangeSet or regenerated selection. Persist effect intent before provider awaits and distinguish known success with unbound local identity from unknown outcome. Durable consumption handles races; process locks alone do not survive reopening. Store success evidence independently enough that local identity/audit failure cannot erase the remote locator; after outcome persistence failure the earlier intent still enables recovery. New epoch always requires fresh review but uses the same stable entity marker. Keep native browser/live-account acceptance explicitly unverified if unavailable; controlled providers prove orchestration without real credentials.

Protocol sources checked 2026-10-19: [Issue types](https://docs.github.com/en/rest/repos/issue-types), [Issue writes](https://docs.github.com/en/rest/issues/issues), [Milestones](https://docs.github.com/en/rest/issues/milestones), [CLI](https://cli.github.com/manual/gh_issue_create). REST type is a native name and labels require appropriate permissions; use normalized capability discovery and real transport-payload assertions.

## Verification

- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm test` — all workspace/script tests pass; use package exec vitest for focused server files (server test forwards arguments to audit runner).
- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH node scripts/verify.mjs` — source/Git hygiene, capability parity, typecheck and build pass. Stage new source files before launcher fixtures that copy git ls-files; never stage sprint-status.
- Retain machine-readable evidence under `evidence/story-7-4/` of tests, exact matrix covering tests/results, source baseline and unchanged forbidden paths. No live-account acceptance or modifying live-provider call was authorized or observed. The initial fixture-isolation gap is retained in native-acceptance.json; absence of local credential probes/provider reads in that first failed run is not established. Native keyboard/focus/links/reader/platform observation remains explicitly unverified.

## Changelog

- 2026-10-19 v2: Completed implementation,23-row independent review triage,13 repairs, final verification and explicit acceptance deferrals; intent preserved.

- 2026-10-19 v1: Source-verified plan from two investigation reports; exact consent, outbound cutover and crash reconciliation.

## Auto Run Result

Status: done

Summary: Follow-up review pass of Story 7.4 (immutable Dry Run plans, human-only confirm/resume, explicit Milestone effects, marker reconciliation). The pass confirmed no new defect in product code and closed four verification gaps with tests.

Files changed in this pass:
- `apps/server/src/http/routes/unit-of-work.test.ts` — GET saved-plan route equals persisted state; unknown id is 404.
- `packages/github/src/providers/github-push-transports.test.ts` — token pagination, CLI GET and complete REST label override.
- `apps/web/src/features/github-sync/connection-draft.test.ts` — new; outbound Issue type draft round-trip.
- `apps/web/src/features/github-sync/github-selection.test.tsx` — Keep local opens the Dry Run, Keep remote only refreshes.

Review findings: patches applied 4 (all medium, test-only); deferred 2 new (Milestone due_on normalization, marker lookup cost); all other findings rejected with the reasons recorded in the triage log.

Follow-up review recommended: false (follow-up pass; no high finding patched; patched medium 4, high 0).

Verification: `corepack pnpm test` passed; `node scripts/verify.mjs` passed on rerun (first run hit one unrelated vitest "Worker exited unexpectedly" in the web a11y suite, which passed twice on rerun).

Residual risks: native browser journey, abrupt process death, live GitHub and CLI acceptance, Milestone due_on round-trip and large-repository lookup cost remain unverified (see `deferred`).

Not done: no commit or staging was made. The spec forbids committing and sprint-status.yaml and the deferred ledger carry orchestrator-owned changes, so the orchestrator commits.
