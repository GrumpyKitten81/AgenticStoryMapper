---
title: '7.5 Import and sync'
type: feature
created: 2026-10-19
version: 1
status: done
baseline_revision: ecf3ef5ba72f6c99300e2c9c580f5e3c4cdd2822
review_loop_iteration: 1
followup_pass: true
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-5-import-and-sync.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Pre-existing assignee synchronization does not clear absent remote assignees or merge assignee divergence.
    evidence: |-
      B10: The baseline direct writer also used a truthy remote assignee check. Frozen intent preserves assignee semantics and excludes broad assignee synchronization; no expansion is made in Story 7.5.
    location: >-
      apps/server/src/application/sync/github-pull-command.ts
    severity: medium
  - summary: >-
      Native browser and live-account operator acceptance remain unverified.
    evidence: |-
      I4: Fake-provider HTTP/SDK/actual stdio and React integration fixtures cover automated surfaces. CUA inventory provides no browser surface; no user credentials or live provider writes were used. An observed native operator journey would settle the remaining acceptance question.
    location: >-
      evidence/story-7-5/native-acceptance.json
    severity: medium (unverified)
---

Reproducing statement: Implement Story 7.5 with shared incoming GitHub ChangeSets, Unscheduled import, safe three-way merge and separately confirmed outbound plans; preserve orchestrator-owned sprint-status.yaml without writing, staging or reverting it. Date: 2026-10-19. Version: 1.

<intent-contract>

## Intent

**Problem:** Human import/pull bypass the incoming executor, initial imports assign Releases, and read-only refresh can overwrite local divergence. Sync labels and baselines do not represent the accepted managed-label and initial Unscheduled policies.

**Approach:** Use one attributed incoming preparation/ChangeSet flow for every actor and existing executable review/apply UI. Preserve canonical identity, separate acknowledged local and observed remote values, merge managed fields safely and send outbound effects only through Story 7.4's separately confirmed immutable plans.

## Boundaries & Constraints

**Always:** Contracts own schemas; DB repositories own persistence; core is pure. Incoming domain changes are proposed by github with initiating identity, approval/protection, exact scope/version/epoch checks and executor atomic audit/restore policy. New imported Cards retain hierarchy/type/provenance/status but begin Unscheduled, with no Release creation. Only existing unambiguous opted-in Annotation assignments and mapped status labels synchronize. Preserve unrelated labels, reusable definitions, authored Markdown, assignee semantics and parentOverrideLocal. Explicit empty selection remains empty. Return one truthful result per source item, including already linked, unchanged, conflict, proposed, succeeded, failed and not attempted as applicable. Human and Agent local effects share semantics. Read-only forbids remote writes and preserves divergent local fields.

**Never:** Write/stage/unstage/revert sprint-status.yaml, deferred-work.md or orchestrator artifacts; infer verification from tracking rows; touch user Projects/credentials; call live providers in tests; start login; commit/push without explicit authorization; add compatibility readers or migrations for prototype DBs; auto-create unknown Annotation definitions; use mutable titles as Milestone identity; silently approve incoming previews or remote plans; add polling, ProjectV2 writes, broad assignee/hierarchy synchronization or a second provider. Story 7.6 owns final conflict UX/health; provide sound shared fields, conflicts and baselines now.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Hierarchical import | Issues, child-first order, Milestones, native types | Executable github ChangeSet creates canonical linked hierarchy Unscheduled; records source/type, initiating identity, restore/audit on apply | Protected/deferred proposal creates no Cards or restore point |
| Duplicate import | Existing canonical binding, repeated source row, same number in another repository | Explicit already-linked result; no duplicate, reassignment or unarchive; correct repository parent | Foreign ownership refuses atomically |
| First Release sync | Imported null Release, unchanged remote Milestone | Reviewed incoming assignment uses canonical Milestone ref and observed baseline; never an outgoing removal | Missing/invalid provider identity fails explicitly |
| Independent edits | Local title, remote Markdown/status/managed labels | Incoming safe fields apply through executor; local-only fields stay unsynced and outbound waits exact human-confirmed plan | Overlap persists field conflict without losing either side |
| Read-only divergence | Local edits plus remote overlapping/non-overlapping edits | Local values survive, safe remote fields may apply, conflicts remain truthful; zero modifying provider calls | Local-wins cannot remotely apply while read-only |
| Managed labels | Existing opted-in definitions, mapped status labels, unknown labels; additions/removals | Assignment add/remove and baseline shown in preview; unrelated remote labels and definitions survive; repeat no-op remains healthy | Ambiguous definitions are unmanaged; no guessed mapping |
| Stale or failed preparation | Provider failure/partial result, safety/connection/ownership flip, Restore, late response | No stale domain apply; retained identity and truthful failed/not-attempted outcomes; mounted review invalidated | Typed actionable error, no fabricated success/deletion |
| Review separation | UI panel, quick/Card sync, HTTP and both MCP transports | Incoming preview/apply is distinct from outgoing Dry Run/confirm; exact selected Cards retained | Cancel/approval alone makes no remote write |

</intent-contract>

## Code Map

- `apps/server/src/application/sync/github-command.ts`: begin/revalidate preparation captures map/content/connection/database; githubCommand retains initiating actor and uses executor. Reuse for all actors.
- `github-import-command.ts#importOperations`: sorted hierarchy, canonical refs and remote links already exist; remove Release assignment and unknown Annotation creation, add duplicate/source outcomes and initial baseline.
- `github-pull-command.ts#prepareIncomingItems/incomingOperations`: reuse provider-read guards and operation building; remove read-only overwrite/suppressed conflicts, add assignment labels, canonical Releases, truthful results and shared baseline.
- `apps/server/src/services/work-item-sync.ts`: remove human direct import/sync/map-pull branches and their finish helpers. Map pull already has one combined githubCommand. planWorkItems(mode:sync) must cease implicit incoming apply; outbound preparation reads only and blocks/requires incoming review where needed.
- `apps/server/src/services/sync-merge.ts`: shared title/body normalization; extend fields with managed Annotation labels and canonical Milestone identity. Remove duplicate applyRemoteFields writer after callers migrate.
- `services/remote-push-plan.ts`, `remote-push-execution.ts`: reuse managedLabelDiff and Annotation mapping; consume same merge/baseline representation, preserving 7.4 intent/reconciliation/confirmation.
- `packages/contracts/src/schemas/domain.ts`, `schemas/work-item-sync-baseline.ts`, `schemas/sync-results.ts`, `api/http.ts`, `mcp/tools.ts`: incoming response extends existing ChangeSetCommandResponse with per-item outcomes, replacing direct human response assumptions. Add acknowledged-local/observed-remote evidence with explicit null Release/removal and label conflict field; retain existing useful public summary fields through shared builders, not independent comparison logic.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/{row-mappers,work-item-repository,operation-persistence-repository}.ts`: persist baseline JSON/bootstrap/operation snapshots consistently; current-schema populated reopen/Restore. Remove obsolete import mutation/preview policies; increment operation schema when shape changes.
- `packages/core/src/changesets/{github-sync-resolution,operation-conflicts,operation-dependencies}.ts`: ownership, dependencies, field conflicts; reuse open canonical field conflicts without replacing evidence. Existing cardAnnotation set/unset and Release/ref operations supply atomic apply.
- `packages/core/src/publishing/sync-fields.ts`, health helpers: shared normalization and mapped-only status ownership, no unknown status wildcard; preserve portable archive redaction and operational snapshots.
- `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`, `features/story-map/components/CardDetailModal.tsx`, `app/api.ts`: use shared response types and existing useChangeSetReview/ChangeSetReview executable preview/apply; retain exact selection, scope/epoch/pending/adoption/focus guards and central strings. Separate retained incoming result from outgoing 7.4 review.
- Tests: server services `{work-item-sync,sync-review}.test.ts`, application `github-command-regressions.test.ts`, MCP `{sdk,transports}`; DB populated baseline/Restore/archive; web github selection/visibility/Card modal. Port obsolete read-only overwrite/Release-at-import/unknown-label expectations explicitly. Three read-only investigators verified source; graph tools unavailable.
- `packages/github/src/providers/github-provider.ts` and its provider tests: detailed reads for both token and CLI must return the same iteration and Milestone due-date fields as import/search. Use the existing GraphQL Issue projection and complete-label reader for both authenticated transports; absence of a field from an incomplete projection must not be interpreted as remote clearing. Preserve unavailable/refusal classification and never probe real credentials.
- Read-only: sprint/deferred/orchestrator files, user data and actual credentials. Node24 PATH: `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/schemas/`, `api/http.ts`, `mcp/tools.ts`, `packages/db/src/`, `packages/core/src/changesets/` — establish shared incoming result, baseline persistence and label conflict operations; preserve atomic execution and source redaction.
- [x] `apps/server/src/services/{sync-merge,remote-push-plan,remote-push-execution}.ts`, core publishing — one merge representation for acknowledged local/observed remote, managed labels and canonical Release identity; keep remote writes behind 7.4.
- [x] `apps/server/src/application/sync/{github-import-command,github-pull-command,github-command}.ts`, `services/work-item-sync.ts` — unified actor flow, Unscheduled import, canonical Release/ref dependencies, result accounting; remove duplicate direct mutation paths and implicit Sync apply.
- [x] `apps/web/src/features/github-sync/`, `features/story-map/components/CardDetailModal.tsx`, `app/api.ts`, central strings — executable incoming preview/results and separate outbound review at every launcher, with stale response protection.
- [x] Focused server/core/DB/web/MCP test files — execute every matrix row, including human/Agent protection, atomic failures, disabled/Restore awaits, duplicate/cross-repository identities, no-op raw body, first Release sync, managed-label add/remove, persisted reopen/Restore.

**Acceptance Criteria:**

- Given human HTTP or Agent MCP import/pull, when the incoming change is prepared and applied under the configured protection policy, then the same executor records github attribution plus initiating actor, exact domain changes, restore policy and atomic audit.
- Given any connected panel, quick action or Card modal sync, when incoming review is accepted, then only its local operations apply and outbound effects still require a separate exact 7.4 plan confirmation.
- Given any stale/failed preparation or application, when the outcome is reported, then no item is called succeeded merely because it was read or skipped and no user divergence is lost.

## Spec Change Log

### 2026-10-19 — Review loop 1

Triggered by B3–B7/E2/E3. Amend the design and verification below without changing the intent contract. Avoid shared-Release corruption, duplicate iteration Releases, missed Release metadata deltas and false status conflicts. KEEP: the unified attributed executor and guards, Unscheduled import, mapped-only label assignments, canonical Milestone refs, exact selected scope, independent outgoing confirmation, current-schema Restore/archive persistence, actual HTTP/SDK/stdio coverage, review focus/dirty-draft safety, shared schema module, and all previously passing tests except obsolete expectations that require shared Release mutation. The previous implementation is preserved at `evidence/story-7-5/pre-review-implementation.patch.gz` (working copy `/tmp/story7-5-pre-review-code.patch`) as KEEP material; restore it only as a scaffold and re-derive the amended behavior at its actual callers. All source changes are reverted to the recorded baseline before this re-derivation. Never restore or otherwise touch protected orchestrator files. Lower patch entries B2/B8/B9/V1/V2 must also be satisfied by the re-derived implementation.


### 2026-10-19 — Review loop 2

Triggered by EC3. Amend the design below without changing the intent contract. Avoid acknowledged Release references that outlive their Release and make Sync/Pull of an affected Card fail permanently. KEEP: everything listed in Review loop 1, the pass-2 repairs (field-scoped resolution observations, complete iteration projections, complete item accounting, live-update holds, health refresh, shared Release metadata divergence, busy guards, import result maps, batch metadata coalescing), and all passing tests. The previous implementation is preserved at `evidence/story-7-5/pre-review-3-implementation.patch.gz` (working copy `/private/tmp/claude-501/-Users-[REDACTED_IDENTITY]-Projects-StoryMapper/ad52e32c-f66f-4402-b3a7-0b51f263d57b/scratchpad/pre-review-3-implementation.patch.gz`) as KEEP material; restore it only as a scaffold, then re-derive the amended behavior. All source changes are reverted to the recorded baseline before this re-derivation. Never restore or otherwise touch protected orchestrator files. Lower patch entries BH7/EC8/VG1/VG2/VG3/VG5 must also be satisfied by the re-derived implementation: remove the unreferenced strings importPreview, levelPrefix, assigneeSuffix, importFailed and pullFailed, remove the duplicate direct-create Import button together with its now-unused strings and keep Preview import (adjusting its two tests), delete remote-write-outcomes.ts, and add the VG1, VG2, VG3 and VG5 regressions.

## Review Triage Log

### 2026-10-19 — Review pass 1

- verdicts: 21 findings — high 4, medium 9, low 0, false 7, maybe-false 1
- findings:
  - `[false]` `[reject]` B1: Upgrade previous prototype databases with baseline_json — AD-9 and the frozen intent expressly exclude prototype migrations. Current-schema populated reopen/Restore are verified; opening an excluded old schema is not the supported behavior.
  - `[high]` `[patch]` B2: Outgoing review switches Sync to push — Both UI callbacks send push, bypassing the sync-only incoming/open-conflict checks in remote-push-plan. Repaired both callbacks to keep mode sync after incoming review; manual Push remains push. Panel/Card regressions pass.
  - `[high]` `[bad_spec]` B3: Moving one Issue between iterations mutates its shared Release — incomingIterationRelease updates acknowledgedLocal.releaseId for any new tuple. The amended design must resolve each remote iteration tuple independently, preserve the old shared Release, and reuse the target.
  - `[medium]` `[bad_spec]` B4: Later batches duplicate an existing iteration Release — The lookup is seeded only from GitHub Release refs, while iteration Releases have no such refs. Derive connection-scoped tuple bindings from persisted acknowledged iteration/link evidence across runs.
  - `[high]` `[bad_spec]` B5: Local iteration Release metadata edits can be overwritten — Only releaseId is compared locally; incomingIterationRelease updates the shared Release name/dates. Amend acknowledged metadata comparison and preserve/conflict divergent local Release values.
  - `[medium]` `[bad_spec]` B6: Incoming Milestone rename/date changes never update the Release — Milestone deltas compare only canonical locator; incomingRelease never updates an existing Release. Keep canonical assignment identity separate from synchronized name/date evidence and merge metadata safely.
  - `[medium]` `[bad_spec]` B7: Outgoing Sync misses local linked Release name/date edits — Unchanged releaseId makes milestone.local false and excludes the Release from syncMilestoneCards. Persist/compare acknowledged Release metadata and route its changes through the existing confirmed 7.4 Milestone effects.
  - `[medium]` `[patch]` B8: Web preparation errors discard failed/not-attempted item results — throwRequestFailure discards non-conflict JSON details and the panel renders only error.message. Repaired with a shared-schema error decoder and scoped Panel/Card result rendering; API/React failure and retry tests pass.
  - `[medium]` `[patch]` B9: Card outgoing preparation errors are invisible — previewLinkedOutgoing has neither onError nor rendered error. Repaired with scoped rendered error state and the existing retry control; a failed-then-successful outgoing preparation retains the dirty draft.
  - `[medium]` `[defer]` B10: Assignee clearing and divergent edits are not synchronized — The baseline applyRemoteFields implementation also updated only truthy remote assignees. Frozen intent preserves assignee semantics and excludes broad assignee synchronization; this is pre-existing.
  - `[false]` `[reject]` E1: Old prototype schema lacks baseline_json — Same excluded prototype-migration case as B1; AD-9 explicitly makes those schemas disposable. No compatibility fallback is added.
  - `[medium]` `[bad_spec]` E2: Remote status compares against normalized local baseline — status.remote reads acknowledgedLocal rather than observedRemote. An imported open Issue lacking the mapped status label is repeatedly seen as changed and later local edits falsely conflict. Compare remote values to observedRemote and retain explicit pending initial Release assignment independently.
  - `[high]` `[bad_spec]` E3: Iteration moves rename/reschedule a shared Release — Same verified mutation as B3. Amend tuple-based inbound assignment and regression coverage for two cards sharing A while one moves to B.
  - `[medium]` `[patch]` V1: Divergent managed-label conflict regression is missing — Pre-verified gap: tests cover remote-only label changes and title conflicts. Added local/remote label divergence, retained assignments, durable conflict evidence, truthful repeated results and reviewed remote resolution; focused server tests pass.
  - `[medium]` `[patch]` V2: Outgoing iteration/none Milestone exclusion is unverified — Pre-verified gap: incoming iteration tests do not exercise remote-push-plan. Added both release sources in remote-push-merge.test.ts and asserted no Milestone effects plus preservation of the existing remote Issue Milestone number through confirmation; focused server tests pass.
  - `[false]` `[reject]` V3: Existing prototype DB cannot read new baseline column — The reproduced database predates the supported current schema. AD-9 and frozen intent prohibit its migration; current-schema reopen/Restore is the required verification.
  - `[false]` `[reject]` I1: Source diff alone cannot prove skill execution — No implementation defect is claimed. Session tool history records the single successful render invocation, rendered workflow reads and all four review layers; the diff is not the procedural transcript.
  - `[false]` `[reject]` I2: Final file hash alone cannot prove no temporary orchestrator write — No write is demonstrated or inferred from tracking state. Controlled commands exclude protected paths and session action history contains no write/stage/unstage/revert to them; baseline hashes are independently rechecked.
  - `[false]` `[reject]` I3: Automated evidence exercises fake-provider and React surfaces — This is a positive descriptive observation, not a bad outcome. Parent-run full workspace, release and actual stdio fixture logs substantiate those exact surfaces without claiming live-provider acceptance.
  - `[maybe-false]` `[defer]` I4: Native/live operator acceptance remains unverified — Automated UI and actual transport fixtures pass, but no native browser surface is available and no live account/provider was used. An observed native UI/operator journey would settle the remaining acceptance question; severity medium (unverified).
  - `[false]` `[reject]` I5: API optional apply may execute under existing policy — Existing AD-0004 executor policy permits immediate human/unprotected-Agent incoming execution while protection retains proposals. All paths now use that executor; UI requests apply:false. Universal additional API approval is not the preserved policy.


### 2026-10-19 — Review pass 2

- verdicts: 19 findings — high 4, medium 8, low 0, false 5, maybe-false 2
- findings:
  - `[false]` `[reject]` B1: Prototype database transition — carried: pass1 B1/E1/V3; AD-9 and frozen intent exclude prototype schema migrations. The current-schema reopen/Restore behavior is verified.
  - `[high]` `[patch]` B2: Single-field resolution consumes unrelated remote changes — github-conflict-command masks unrelated fields local-only, but remoteBaseline replaced all observedRemote values. Retain excluded field observations; verify a subsequent pull still proposes the unseen body. Applied: Preserved excluded field acknowledgments and observations; both local/remote choice tests subsequently propose the unseen body.
  - `[high]` `[patch]` B3: Truncated projectItems can become Release clearing — Concrete detail query reads first:5 without pageInfo; fromGraphQlIssue treats an iteration beyond that page as absent. Request completeness evidence and refuse truncation in token/CLI reads. Applied: Both provider projections request pageInfo and refuse consumed truncated iteration evidence; both transports and unaffected release sources are tested.
  - `[medium]` `[patch]` B4: Auth and operation-building failures omit item outcomes — Credential/revalidation happen outside the per-item catch; incomingOperations runs before githubIncomingCommand. Decorate all preparation phases and preserve previous/current/later map rows. Applied: Covered admitted credential/revalidation/build/finalization errors with complete selected/map-wide rows; initial access refusal reveals no source identities.
  - `[medium]` `[patch]` B5: Ineligible selected Cards produce a successful persisted run — Requested ineligible IDs are appended as failures only in the results callback after SyncRun construction. Determine those failures before constructing the run. Applied: Calculated eligibility failures before SyncRun construction and verified mixed/all-ineligible selections.
  - `[medium]` `[patch]` B6: Finished incoming review indefinitely holds live updates — IncomingGitHubReview always marks a suspended draft and the panel also holds on retained incomingReview. Release the hold after close or scope invalidation while keeping result/outgoing controls. Applied: Released current incoming live holds after closed/applied/rejected states and removed the parent retained-object hold.
  - `[medium]` `[patch]` B7: Incoming Apply leaves health reports stale — Previous panel/card success invalidators are bypassed; generic review invalidates no health keys, same-client SSE is ignored, and focus refetch is off. Refresh all three existing health query prefixes on Apply. Applied: Refreshed all three health prefixes after Apply or recovered applied readback; active consumers show updated data.
  - `[high]` `[patch]` B8: Different shared Release metadata writes can silently last-win — Public CreateGitHubLink(releaseId) and copied canonical refs can have no Release remote link. Then two pulls emit differing Release updates without duplicate baseline sets; initialVersions permits both. Extend existing divergence detection using its existing owning-map conflict contract and cover the source-only-ref sequence. Applied: Extended divergence checks to Release updates using existing owning-map fingerprints; a public source-only canonical ref rejects differing metadata atomically.
  - `[medium]` `[patch]` B9: Sibling incoming decisions overlap Card-owned actions — Mutation keys count writes but do not exclude them; each review checks only its own pending ref. Check shared counts synchronously, reflect busy controls, retain draft/navigation safety, and remove only Incoming review boolean aggregation. Applied: Added synchronous shared-count guards and reactive controls; sibling same-event decisions, linked pull and Save cannot overlap; dependency callback/drafts/navigation remain intact.
  - `[medium]` `[patch]` B10: Import results repeatedly read and scan every canonical ref — The item callback calls listExternalRefsForStoryMap and searches proposed refs for every source row. Build proposed/linked lookup maps once without changing outcomes or IDs. Applied: Built proposed/linked identity maps once per callback without per-row repository reads.
  - `[false]` `[reject]` E1: Prototype baseline_json migration — carried: pass1 B1/E1/V3; migrations for discarded prototype schemas are explicitly excluded by AD-9 and the frozen intent.
  - `[medium]` `[patch]` E2: Combined pull duplicates exact-before Release binding writes — pendingReleases is batch-wide but updatedReleases is per connection. Identical metadata updates produce duplicate before snapshots and atomically refuse. Share metadata evidence across the batch, coalesce identical effects and explicitly refuse disagreement. Applied: Shared batch metadata evidence coalesces identical Release/binding operations and refuses disagreement before apply.
  - `[high]` `[patch]` E3: Iteration beyond first five projectItems is treated as absent — Same verified truncated detail projection as B3. Completeness must be explicit; refusing incomplete evidence prevents a destructive clear proposal. Applied: Same provider completeness repair as B3.
  - `[false]` `[reject]` I1: Diff cannot establish skill execution history — carried: pass1 I1; this is an evidence boundary, not a demonstrated violation. Session history records the single render, workflow reads, synchronous implementation and four valid review layers.
  - `[false]` `[reject]` I2: Diff and hashes do not expose every protected-file action — carried: pass1 I2; no prohibited write/revert is claimed or demonstrated. Controlled action history excludes protected paths and their working/index bytes remain unchanged.
  - `[false]` `[reject]` I3: Product workflows are exercised through automated fixtures — carried: pass1 I3; this describes supported evidence, not a defect. React, HTTP/SDK and spawned stdio tests exercise those exact surfaces without claiming native acceptance.
  - `[maybe-false]` `[defer]` I4: Real account and authenticated CLI acceptance remain unverified — carried: pass1 I4; medium (unverified). Actual provider/account/installed CLI observation would settle it. Existing deferred native/live acceptance item is preserved, not duplicated.
  - `[maybe-false]` `[defer]` I5: Native keyboard/focus/reader/platform acceptance remains unverified — carried: pass1 I4; medium (unverified). An observed native operator journey would settle it. Existing deferred native/live acceptance item is preserved, not duplicated.
  - `[medium]` `[patch]` V1: Local managed Annotation health comparison lacks regression coverage — Pre-verified gap: all core health fixtures disable Annotation mapping and incoming merge tests never read health. Add/remove managed assignments with otherwise unchanged synced links must yield stale link state, stateCounts and staleLinks. Applied: Added enabled managed-Annotation add/remove health cases asserting stale state, counts and staleLinks.

All findings were classified separately before grouping. Eleven repaired groups: three high, eight medium; B3/E3 share one projection defect. No further intent gap or bad-spec loopback. Carried acceptance rows preserve the original deferred list without duplicate entries. One contaminated gap attempt was interrupted and restarted context-free; all four valid layers reported before triage. The four-thread limit required queued launches in the same root turn. The same implementation agent was re-engaged and split non-overlapping repairs with the parent. Every repaired group passed focused checks and final parent workspace/release gates.


### 2026-10-19 — Review pass 3

- verdicts: 33 findings — high 1, medium 3, low 17, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` BH1: No ensureColumn for baseline_json — carried: pass1 B1/E1/V3, pass2 B1/E1; AD-9 and frozen intent exclude prototype migrations. Current-schema populated reopen/Restore is verified.
  - `[false]` `[reject]` BH2: Pre-existing links lack a baseline so first sync shows spurious milestone conflicts — baseline-less links use the legacy hash fallbacks and conflictFields requires differing local/remote values, so equal values never conflict; the upgrade-from-prototype case is the excluded one.
  - `[low]` `[reject]` BH3: Health ignores Release drift for baseline-less links — only manually linked, never-synced links lack a baseline and are reported unsynced; a fix adds a comparison branch for a state unlikely to matter.
  - `[false]` `[reject]` BH4: Broad catches via asDomainError — asDomainError is the established project idiom (errors.ts, executor, MCP) and each catch rethrows with per-item failed/not_attempted accounting the intent requires; nothing is swallowed. The double-fault claim for results("proposed") is not shown reachable.
  - `[low]` `[reject]` BH5: Duplicated lookup/stringify logic — developer-only repetition with no named divergence; the fix is a refactor, not a direct correction.
  - `[low]` `[reject]` BH6: Repeated listOpenSyncConflicts / per-link getCardDetails queries — local SQLite on small maps; no demonstrated bottleneck and the fix adds caching structure.
  - `[low]` `[patch]` BH7: Dead strings and duplicate Import buttons — importPreview, levelPrefix, assigneeSuffix, importFailed, pullFailed are unreferenced and "Preview import"/"Import" both call incomingAction("import"); delete the dead strings and the misleading direct-create Import button. applyWorkItemSyncResponseSchema is still used by pushWorkItems typing and the re-exports are not defects. Folded into the re-derivation below (cascade).
  - `[false]` `[reject]` BH8: Silent drop of stale-scope responses — discarding a late response after scope/epoch change is the required stale-preparation behavior; the result is not applied or reported as success.
  - `[low]` `[reject]` BH9: persistConflictResolution type admits "remote" and throws — fails loudly with a validation DomainError and the callers branch first; type narrowing adds no behavior.
  - `[low]` `[reject]` BH10: Identity messages lack the Issue and mark all items failed — message quality only; item accounting remains truthful.
  - `[low]` `[reject]` BH11: One Issue in more than five Projects fails the whole iteration read — pass2 B3 deliberately refuses truncated evidence rather than clear a Release; per-item isolation would add new paths for a rare shape.
  - `[false]` `[reject]` BH12: Status-label behavior change — mapped-only status ownership with no unknown wildcard and preserved unrelated labels is the frozen intent.
  - `[low]` `[reject]` BH13: No docs/ADR — documentation is not among the story tasks and no harm is named beyond missing prose.
  - `[low]` `[reject]` BH14: Deleted parent-scoping test and raw ids in results — the equivalent repository-scoped parent test exists at github-command-regressions.test.ts "does not parent Agent imports under a same-numbered Issue"; showing remoteId/cardId in the result row is cosmetic.
  - `[false]` `[reject]` EC1: baseline_json lacks migration — carried: same excluded prototype-migration case.
  - `[low]` `[reject]` EC2: JSON.parse of non-JSON gh stdout in the error classifier — unlikely (HTML error body); still fails loudly rather than silently, and a fix adds a guard.
  - `[high]` `[bad_spec]` EC3: Deleting a Release that a synced Card acknowledged wedges every later Sync/Pull of those Cards — verified: seedIterationReleases throws for iteration sources, and for milestone and iteration sources the preserved acknowledgedLocal.releaseId reaches the link baseline operation, which fails with "Unknown or forward release reference". A scratch regression sync-after-deleteRelease reproduced the failure for both release sources. Amended: acknowledged Release references to a deleted Release need an explicit design (see Spec Change Log).
  - `[false]` `[reject]` EC4: syncState wrong when resolving one field with another open — github-conflict-command overrides syncState with otherOpen before applying, so the link stays conflict.
  - `[low]` `[reject]` EC5: Multi-connection Card sync drops earlier ChangeSets on a later failure — the error is rendered, earlier proposals are never applied and remain reviewable; the fix adds partial-state branching.
  - `[low]` `[reject]` EC6: sync-health stops comparing Release name for baseline-less links — same state as BH3.
  - `[false]` `[reject]` EC7: status:* labels no longer managed or cleaned — frozen intent limits synchronization to mapped status labels and preserves unrelated labels.
  - `[low]` `[patch]` EC8: remote-write-outcomes.ts has no remaining importer — its only importer (the removed human sync path) is gone; delete the file. Folded into the re-derivation.
  - `[low]` `[reject]` EC9: workItemSync.itemFailed activity log removed — no requirement asks for it and failed items are reported in per-item results and the failed run.
  - `[medium]` `[defer]` EC10: Assignee overwritten from remote on every pull — carried: pass1 B10; pre-existing assignee semantics, already in the deferred list.
  - `[medium]` `[patch]` VG1: releaseId-scoped incoming Sync is unverified — pre-verified gap; confirmed no test passed releaseId. Test added in github-incoming-pipeline.test.ts and passing; to be restored in the re-derivation.
  - `[medium]` `[patch]` VG2: Local resolution of a labels conflict is unverified — pre-verified gap; add the conflict-then-local-push case to remote-push-merge.test.ts during re-derivation.
  - `[low]` `[patch]` VG3: Provider/import identity mismatch guards are untested — pre-verified gap; add the two fail-fast cases during re-derivation.
  - `[false]` `[reject]` VG4: baseline_json upgrade path untested — carried: excluded prototype migration; Deferral condition (pre-release recreate-only) is AD-9.
  - `[low]` `[patch]` VG5: Cross-Story-Map Release baseline guard is untested — pre-verified gap; add one core resolver refusal case during re-derivation.
  - `[low]` `[reject]` VGo1: JSON.parse in undefinedWhenIssueMissing — same claim as EC2.
  - `[false]` `[reject]` VGo2: parseGitHubLocator non-null assertions — safe today because the identity loop runs first; no failing input is shown.
  - `[false]` `[reject]` IA1: Production change sits below the HTTP/MCP boundary — descriptive; HTTP and MCP handlers are thin delegates of the changed use-cases and are exercised by the updated getting-started/unit-of-work route tests and SDK/stdio transport tests.
  - `[false]` `[reject]` IA2: Second MCP transport not obviously covered — descriptive; both SDK in-memory and actual stdio transports are covered by github-command-sdk.test.ts and github-command-transports.test.ts.

One high bad_spec group (EC3) forces a re-derivation; all patch rows above are folded into it and no patch is applied separately. The saved attempt contains the passing VG1 test and a failing deleted-Release regression that must pass after re-derivation.

### 2026-10-19 — Review pass 4

- verdicts: 35 findings — high 0, medium 4, low 21, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` BH1: Existing databases lack baseline_json — carried: pass1 B1/E1/V3, pass2 B1/E1, pass3 BH1; AD-9 excludes prototype migrations.
  - `[low]` `[reject]` BH2: No ADR or doc update — carried: pass3 BH13.
  - `[low]` `[reject]` BH3: Import preview does not say Release assignment is deferred — the hint text is cosmetic and the Unscheduled import is the frozen intent.
  - `[low]` `[reject]` BH4: Finalize failure drops the ChangeSet id — a persisted proposal stays in the ChangeSet list; the fix adds id plumbing for a rare late failure.
  - `[low]` `[reject]` BH5: Failure-item construction is duplicated — carried: pass3 BH5; developer-only repetition, refactor-sized fix.
  - `[low]` `[reject]` BH6: pullStoryMapWorkItems validation runs twice — the repeated reads are redundant but harmless; the fix is a refactor.
  - `[low]` `[reject]` BH7: incomingOperations takes positional extraResults — style only; no caller is shown to misuse it.
  - `[low]` `[reject]` BH8: sync-merge milestone expression is hard to read — readability only; behavior is covered by the matrix tests.
  - `[false]` `[reject]` BH9: Non-null assertions on orphaned links — links are filtered to those with cardId and cards cannot be orphaned by foreign keys, so the assertions cannot fail.
  - `[low]` `[reject]` BH10: Three pending-write mechanisms in the panel — incomingAction checks the synchronous ref and the shared mutation count before starting, so no second action can start; the duplication is stylistic.
  - `[low]` `[reject]` BH11: Result rows show raw ids and index keys — carried: pass3 BH14; cosmetic.
  - `[low]` `[reject]` BH12: A repeated source URL in one import reports already_linked — the provider returns unique Issues; the labeling of an impossible duplicate is not a defect worth a new branch.
  - `[low]` `[reject]` BH13: throwGitHubFailure hand-parses the error envelope — item payloads are validated with the contracts schema; only the envelope check is manual.
  - `[low]` `[reject]` BH14: Provider JSON.parse, plain Error and truncation — the JSON.parse claim is carried from pass3 EC2; the plain Error is wrapped into a typed DomainError by sanitizedRequest, and truncation only matters for iteration sources, which are guarded.
  - `[false]` `[reject]` BH15: Status-label behavior changed silently — carried: pass3 BH12/EC7; mapped-only ownership is the frozen intent.
  - `[low]` `[reject]` BH16: Leftover syncFailed string and duplicate pending forms — harmless and still referenced.
  - `[medium]` `[patch]` EC1: Stale-link operation keeps a dead acknowledged Release id — verified: the unavailable-Issue branch spread the raw link, so a deleted Release plus an unavailable Issue produced an unknown release reference refusal. Applied: build the baseline from withLiveRelease and add the regression.
  - `[low]` `[reject]` EC2: Unguarded JSON.parse of non-JSON gh stdout — carried: pass3 EC2.
  - `[low]` `[reject]` EC3: gh exiting 0 with non-JSON stdout — sanitizedRequest turns the SyntaxError into a typed validation failure; no everyday trigger shown.
  - `[false]` `[reject]` EC4: Connection-wide failure is attributed to the first Card — pass2 B4 requires decorating every preparation phase with complete rows, and the pipeline test asserts it.
  - `[low]` `[reject]` EC5: Release-filter exclusion says not eligible for this connection — message wording only.
  - `[low]` `[reject]` EC6: Multi-connection Card sync leaves earlier proposals unreviewed — carried: pass3 EC5.
  - `[low]` `[reject]` EC7: Removed itemFailed/remoteUnpersisted activity logs — carried: pass3 EC9.
  - `[low]` `[patch]` EC8: RemotePersistenceError remains in SAFE_ERROR_TYPES — the class was deleted; removed the entry.
  - `[low]` `[patch]` EC9: stripIssuePrefix lost its callers — both exported copies were unreferenced; deleted.
  - `[medium]` `[defer]` EC10: Assignee overwritten on pull — carried: pass1 B10; already in the deferred list.
  - `[medium]` `[patch]` VG1: Panel Preview import and Pull all `apply: false` are unasserted — pre-verified gap; added both web cases asserting the request flag and rendered review.
  - `[false]` `[reject]` VG2: Toolbar Pull GitHub does not use the review-first flow — the untouched toolbar sends an explicit confirm and applies through the same attributed executor under the existing human policy (pass1 I5), with audit and restore point; no review is accepted there, so AC2 is not engaged. Its missing error display predates this change.
  - `[medium]` `[patch]` VG3: githubIncomingCommand finalize failure is untested — pre-verified gap; added the safety-flip test asserting failed rows with phase finalize and no persisted ChangeSet.
  - `[low]` `[reject]` VG4: touchesSyncField branches lack unit tests — end-to-end repeat-pull and labels-conflict tests exercise the label and baseline paths; remaining risk is low.
  - `[false]` `[reject]` VG5: baseline_json has no migration test — carried: excluded prototype migration.
  - `[false]` `[reject]` IA1: Behavior sits below the executor/HTTP routes — carried: pass3 IA1.
  - `[false]` `[reject]` IA2: Iteration and shared-Milestone metadata go beyond the text — descriptive; the iteration releaseSource is an existing connection setting and shared metadata evidence is required by the loop-1 design.
  - `[false]` `[reject]` IA3: No read-only check for local-wins visible in the diff — sync-conflict-resolution.ts refuses a local resolution on a read-only connection and the guard is unchanged.
  - `[false]` `[reject]` IA4: Late response after server Restore not individually asserted — descriptive; revalidateGitHubPreparation database/safety checks and the Restore await tests exist.

All findings were classified separately before grouping. Four patched groups: three medium (EC1, VG1, VG3) and a low cleanup (EC8/EC9), applied through the same implementation agent and verified by focused and full suites. No intent gap or bad-spec loopback.

## Auto Run Result

Status: done

- Summary: Story 7.5 is implemented. Human, Agent, HTTP and both MCP import/pull/sync share one attributed incoming ChangeSet flow with per-item results; imports begin Unscheduled; separate acknowledged-local and observed-remote baselines drive safe three-way merging of title, Markdown, status, managed Annotation labels and canonical Milestone or iteration Releases; outbound effects remain behind Story 7.4's confirmed plans. Follow-up review pass 3 (this run) found one high bad_spec group (a deleted Release stayed in acknowledged baselines and wedged later Sync/Pull); the design was amended (Review loop 2), the code re-derived from the saved scaffold, and pass 4 patched the remaining sites.
- Files changed: apps/server (application/sync commands, services merge/push/conflict resolution, fixtures, tests), apps/web (GitHub sync panel, incoming review/results, Card modal, API error decoder, strings, tests), packages/contracts (incoming response, baseline and sync schemas, tools), packages/core (conflict, dependency and sync-field helpers, health), packages/db (baseline persistence, import repository removal, fixtures, tests), packages/github (complete iteration/Milestone detail projections); remote-write-outcomes.ts and two unused stripIssuePrefix copies removed.
- Review findings: pass 3 — 33 findings, one bad_spec re-derivation, six folded patches, 17 low rejects, 12 false, one carried defer. Pass 4 — 35 findings: patched EC1 (medium, stale-link baseline kept a dead Release id), VG1 (medium, panel apply:false unasserted), VG3 (medium, finalize failure untested), EC8 and EC9 (low cleanups); deferred EC10 (carried assignee semantics); all other findings rejected with the reasons in the triage log.
- Follow-up review recommendation: false. This follow-up pass patched no high finding (patched: 0 high, 3 medium, 2 low), so the work has converged.
- Verification: `corepack pnpm test` — contracts 169, importers 7, github 57, core 411, web 783, db 488, server 833 plus 14 audit-performance tests passed; `node scripts/verify.mjs` — hygiene, typecheck and build completed. Both re-run by the orchestrating session after the last patch.
- Residual risks: native browser and live-account operator acceptance remain unverified (deferred); assignee clearing and divergence are not synchronized (deferred, pre-existing); the toolbar Pull GitHub applies immediately under the executor policy and still shows no error text on failure (pre-existing launcher); nothing was committed or pushed because the intent contract forbids committing without explicit authorization, so the reviewed diff remains staged and the orchestrator-owned sprint-status.yaml and deferred-work.md remain modified by the orchestrator.

## Design Notes

Represent acknowledged local and last-observed remote baseline separately, with explicit local releaseId:null and canonical remote Milestone locator. Initial Unscheduled import retains a pending incoming Release assignment even if the remote Milestone is unchanged. Canonical refs identify Releases across renames; new Release → ref → link → Card assignment operations preserve dependencies. No title-based compatibility fallback. Reuse existing executable ChangeSet review rather than creating a second local approval mechanism; creation of a proposal alone is not applied success.


### Review loop 1: separate evidence and Release metadata

Compare local managed fields against acknowledgedLocal and remote fields against observedRemote, rather than comparing remote status to normalized local labels. Retain an explicit pending first Release assignment for an imported Unscheduled Card: observing its remote assignment at import must not acknowledge local assignment. Repeated unchanged pulls are unchanged; local status edits following import without mapped labels remain local-only and can be prepared outbound without a false conflict. Preserve open conflict evidence on repeated observation.

Persist the acknowledged local Release name/date metadata and observed remote Milestone name/date metadata alongside stable assignment identity; use the existing shared baseline schema/operation persistence. For Milestones, the canonical locator identifies the assignment across renames. An unchanged locator with a changed remote name/due date safely updates that same Release; local metadata changes stay local and become existing 7.4 Milestone effects during outgoing Sync. Concurrent divergent metadata edits create the existing milestone conflict and preserve local Release values. Local Release metadata is never inferred from the current remote payload when building acknowledged evidence. Keep metadata comparison distinct from canonical identity and explicit clearing. Do not add prototype compatibility readers/migrations.

Iteration identity is the connection-scoped normalized tuple already supplied by the provider (title/startDate/duration); no stable remote iteration ID is currently supplied. Treat a changed tuple as a different inbound assignment, resolve it from persisted acknowledged iteration/link evidence across runs, and never rename/reschedule the previous shared Release. Reuse a matching target Release across batches; no generated GitHub Milestone or outbound iteration write. Detect local edits to an iteration-derived Release from acknowledged metadata, preserve them, and report conflicts when the remote assignment also changes. Initial import still creates no Release.

After incoming review, both Panel and Card outgoing preparation retain mode sync so incoming drift/open-conflict guards run; the standalone Push launcher remains push. Preserve and render validated structured failed/not_attempted preparation results in both incoming launchers, and render Card outgoing preparation errors with a retry control and retained dirty draft.

Re-derivation verification also covers assigning to a locally edited shared Milestone target, an explicit remote conflict choice, staggered shared Milestone refreshes that skip a remote metadata version, and preserving inbound iteration baselines/local divergence when an unrelated Issue push returns a REST result without iteration. Release-link acknowledgment supplies shared metadata evidence so per-Card refresh order cannot manufacture local divergence. That acknowledgment follows the canonical Milestone locator across connections for the same source; a second connection must not hide another linked Card's local shared-Release edits. Any baseline operation retains its actual connection ownership/before guards.

Parent verification traced the concrete provider after the first re-derived workspace pass (2,801 tests). Its detail query omitted iteration and the CLI projection discarded Milestone due dates. Complete that existing read projection for both authentication transports and verify actual GitHubProvider output in isolated provider tests, including absent Issue/refusal handling, before final gates.

Required regression additions: missing mapped status labels with repeated pull and later local-only status edit; two Cards sharing iteration A while one moves to B; reuse A in a later batch; local iteration Release metadata divergence; canonical Milestone rename/due-date update and local-only metadata outgoing effects; divergent managed-label conflict/retained assignments/repeated outcomes/resolution; outgoing iteration and none sources produce zero Milestone effects and preserve an existing remote Issue Milestone; Panel/Card sync mode, failed/not_attempted rows and outgoing retry errors. No gate or meaningful prior assertion may be weakened to fit the code.

### Review loop 2: acknowledged Release references after Release deletion

A Release the user deletes locally can still be named by a link's acknowledgedLocal.releaseId (milestone and iteration sources alike). Treat such a reference as the acknowledged assignment having been removed locally: the deleted Release is a local divergence (Unscheduled) exactly like a manual unassign, so it is shown as a local milestone change, becomes an outgoing Milestone removal only through a separately confirmed Story 7.4 plan, and never an implicit incoming or remote effect. Incoming preparation must never emit a link baseline or other operation that references a Release that no longer exists, and iteration tuple seeding must skip bindings whose Release is gone so a later batch recreates the tuple's Release. Detect that divergence from the retained acknowledged Milestone locator/iteration tuple and metadata evidence compared with the Card's now-null assignment, not from the dead Release id, and do not persist the dead Release id in new baselines (store an explicit null Release and keep the locator/tuple evidence). Required regression: sync after deleting the acknowledged Release, for both a milestone and an iteration source, resolves with a truthful result, creates no operation that references the deleted Release, leaves the Card Unscheduled and proposes no remote write.

## Verification

- Focused suites with isolated fake provider/credential boundaries; no real credential probing or network.
- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm test` — full workspace tests pass, serial with release build.
- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH node scripts/verify.mjs` — hygiene, parity, typecheck and build pass. Stage new source before launcher fixtures using git ls-files, excluding every protected path.
- Record exact revision, matrix/test results and protected path hashes under `evidence/story-7-5/`. Native accessibility/provider/account acceptance needs actual observation; retain unverified limits honestly.

## Changelog

- 2026-10-19 v1: Plan from three source investigations, accepted D2/D3/D6 and previous-story continuity.

