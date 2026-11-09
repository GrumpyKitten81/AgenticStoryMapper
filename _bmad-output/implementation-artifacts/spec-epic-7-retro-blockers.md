---
title: 'Repair Epic 7 retrospective acceptance blockers'
type: bugfix
created: 2026-10-19
updated: 2026-10-19
version: 2
status: done
route: dispatch
baseline_commit: b2f2e967cc45a0c948ad3c2bb7378efb35eaf3e3
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
---

Reproducing statement: Repair the four confirmed Epic7 retrospective blockers, verify the actual composed behavior, reassess acceptance and close Epic7 if possible. User authorization: 2026-10-19. Version:2.

<frozen-after-approval reason="human-owned intent — explicit request authorizes R1–R4 remediation">

## Intent

**Problem:** Completed Epic7 loses managed labels beyond the first50, chooses ambiguous iteration evidence, erases remote-parent metadata on ordinary Push, and overlooks Release goal/released edits in health and outgoing Sync. These violate existing prepared contracts.

**Approach:** Repair the four data/evidence boundaries with meaningful regressions, then independently review, run required gates, and reassess epic acceptance. Preserve the original rejected retrospective as history.

## Boundaries & Constraints

**Always:** Follow existing ChangeSet review/Apply and durable remote-effect lifecycle. Preserve exact canonical identity, user-authored content, unrelated labels, hierarchy overrides, conflict protection and read-only restrictions. Reject conflicting iteration tuples visibly; identical duplicate tuples may converge. Use complete label evidence on token and CLI paths. Map Milestone description/state to Release goal/released; clearing is explicit. Iteration goal/state and Milestone startDate remain local. Strict baseline shape changes use the existing operation-schema bump/stale-pending mechanism, without old-prototype migration. Reuse existing fixture data and fail-fast resolver/file/CLI/fetch isolation. Scope completion is A1–A4; A5–A7 remain deferred.

**Never:** Access user Projects/credentials, perform real GitHub calls or interactive login, add dependencies/configuration/provider features, commit/push, or change earlier-epic action statuses. Existing dirty files are the preceding authorized retro/memory work; preserve them. The parent owns tracking/retro writes after implementation. No unrelated refactor.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Labels | Given an Issue with a managed label beyond50, when bulk import reads it | Complete status/Annotation selection and matching persisted baseline | Incomplete/failed follow-up refuses proposal/application |
| Iteration | Given two distinct configured iteration tuples, when import/detail sync reads either order | No arbitrary Release selection; identical tuples accepted | Visible ambiguity, no local mutation; unrelated releaseSource unaffected |
| Parent | Given linked parent42, when a title/body/status Push receives a REST Issue response without parent | Persist42 through success/reopen/later Pull and interrupted-result adoption | Preserve fields outside effect scope, never infer parent removal from a partial response |
| Release edits | Given acknowledged linked Release, when only goal or released changes | Health unsynced; reviewed outgoing Sync includes exact Milestone effect, then health synced | Include explicit Release-only/empty selection; unchanged Sync emits no redundant effect |
| Remote Release | Given remote description/state changes or clearing, when Pull runs | Reviewed local goal/state update; machine marker excluded from authored goal | Both-side divergence remains conflicted, read-only does not overwrite it |
| Dependencies | Given Milestone then dependent Issue effects, when Milestone succeeds | Own changed metadata does not invalidate dependent effect; truthful baselines | External metadata drift still rejects stale reviewed evidence |

</frozen-after-approval>

## Code Map

- `packages/github/src/providers/{github-provider,github-remote-push,work-item-provider}.ts`: bulk/detail GraphQL, completeGitHubList, REST projection and normalized remote shape. Existing transport tests intercept both CLI/token. Extend labels and description/state together. Ordinary Issue effects do not change hierarchy; preserve/rehydrate metadata outside their write scope without weakening full-read removal semantics.
- `packages/contracts/src/schemas/{work-item-sync-baseline,change-set-schemas}.ts`: strict metadata and operation schema10. Add concrete goal/released for Milestone metadata, explicit nulls for iteration; bump schema.
- `packages/core/src/publishing/sync-fields.ts`, reports/sync-health and changesets/sync-resolution-agreement: shared metadata comparisons, locks and reviewed resolution. Reuse canonical projection.
- `packages/db/src/repositories/repository-values.ts`: ImportRemoteWorkItem/importReleaseSource; existing stripGitHubMilestoneMarker handles authored description. Release fields already persist; no new SQL columns.
- `apps/server/src/application/sync/{github-pull-command,github-ticket-command}.ts`: incoming Release create/update/clearing and reviewed ticket fingerprint; existing canonical shared-target/batch conflict handling.
- `apps/server/src/services/{sync-merge,remote-push-plan,remote-push-execution,remote-push-evidence}.ts`: acknowledged/observed baseline, Release-only Sync admission, exact evidence, durable binding. Successful Milestone baseline and reviewedBefore must carry description/state, including own completed dependencies.
- Existing `remote-push`/`sync-review`/`github-ticket-command`/`extension-provider` fixtures/tests: preserve fake provider identity, current-schema reopen/Restore and global fail-fast auth isolation.

## Tasks & Acceptance

**Execution:**
- [x] Repair R1/R2 in adapter with actual token/CLI transport regressions and bulk import persistence coverage.
- [x] Repair R3 across partial write outcome, binding and adoption; test durable parent evidence and truthful subsequent full reads.
- [x] Repair R4 strict contracts, normalized source, incoming/outgoing metadata, health, conflicts and Release-only selection; update affected schema fixtures.
- [x] Run focused matrix tests and typechecks; report exact counts and residual limitations to parent without broad gates racing builds.
- [x] Parent: independently review complete diff, run workspace tests then serial release gate, refresh retro/tracking and final acceptance.

**Acceptance Criteria:**
- Given each matrix precondition, when its real production path executes, then its expected behavior is covered by an executed passing regression.
- Given competing local/remote goal/state edits, when Sync or resolution prepares, then neither silently acknowledges or overwrites excluded changes.
- Given explicit Release-only Sync, when remote evidence diverged, then a visible review/conflict prevents an unreviewed overwrite; ordinary unchanged Sync remains empty.
- Given all four repairs and required gates pass, when the parent reassesses declared criteria, then acceptance is recorded honestly and A1–A4 alone may move to done; A5–A7 and platform/live limitations remain visible.

## Implementation Notes

Explicit user request authorizes all four existing blockers together and subsequent acceptance/closure; no additional scope or irreversible action is proposed. No intent gaps. Existing dirty files are known prior authorized artifacts, not unknown code edits. Graph MCP is unavailable; investigation used exact source/tests. No commit authorized.

## Spec Change Log

## Review Triage Log

Review pass1: all three independent layers launched before collection; scope is the complete changed production/test source diff, including untracked tests. Prior retro/memory/evidence and this spec's narrative are excluded from the code diff; only the edge reviewer receives the claims path. Every reported finding is retained below. Source decisions belong to the parent.

| ID | Verdict | Evidence / route |
| --- | --- | --- |
| EH1 | medium | Verified `prepareMilestones` skips unchanged bound metadata, while dependent Issue initially carries null and relies on milestoneItemId. Assignment to an existing Release can be cleared. Patch: retain verified canonical target number without an unnecessary Milestone write; regress assignment change. |
| VG1 | medium | Pre-verified gap: first inbound Release create now consumes goal/state; existing first-Sync test asserts assignment only. Patch that consumer test with described closed Milestone and proposed/applied metadata assertions. |
| VG2 | medium | Pre-verified gap: ticket fingerprint adds two fields but body-only drift tests cannot protect them. Patch independent description/state-only drift refusals with no proposal/link writes. |
| BH1 | false | Existing pre-change baseline compatibility is deliberately excluded by prepared AD9 and this authorized repair. Schema11 stales pending commands; no old-prototype migration is promised. Reject requested compatibility/backfill. |
| BH2 | medium | Source confirms incoming preparation reads Card links only, predating this repair; empty Release remote drift has no standalone incoming consumer. New refusal prevents overwrite and explicit reviewed Push remains available. Defer existing standalone-incoming limitation; make refusal actionable through existing explicit Push rather than suggesting an unavailable operation. |
| BH3 | medium | Verified bulk search adds at least one serial REST call/CLI process per Issue even for complete small label lists. Patch with explicit GraphQL label page completeness and hydrate only truncated lists; reject missing completeness instead of assuming it. |
| BH4 | medium | Verified optional normalized metadata is converted to empty goal/open state by importReleaseSource. Patch fail-fast incomplete evidence handling, preserving explicit empty description/open state; update source-shaped fixtures, no compatibility fallback. |
| BH5 | medium | Fresh-read adoption is distinct from immediate title-choice success. Patch a reopened interrupted title-only choice regression to pin excluded acknowledged/observed metadata. No observed existing failure asserted. |
| BH6 | medium | Parent is now part of exact reviewed evidence; immediate persistence tests do not protect this admission guard. Patch parent-only post-review drift/no-write regression. |
| BH7 | low | Closed-create already has executed two-effect coverage. Parent writes are explicitly refused; new creates do not carry reviewed imported hierarchy, so the reported ordinary-import loss cannot arise through this trigger. Reject additional speculative combined-field/recovery matrix without a demonstrated bad consumer. |
| BH8 | medium | Conditional per-Issue label completion needs cursor/identity association coverage. Patch multiple Issues/search pages alongside BH3; no currently observed cursor bug asserted. |
| BH9 | low | Actual adapter and import separately exercise complete labels, but a composed boundary test provides direct R1 acceptance evidence. Patch one real-provider-output-to-import status/Annotation persistence case, reusing fixtures and intercepted transport. |
| BH10 | low | Source awaits the full list before constructing operations, so no partial mutation bug is demonstrated. Patch a composed late-ambiguity refusal assertion alongside BH9 to document the R2 atomic boundary. |

All requested patches are bounded corrections/tests within the already authorized R1–R4 contract and add no public surface. No frozen intent change or human decision is required. No speculative finding is promoted into an observed product defect.

All patch routes above were applied. EH1 uses the verified Milestone number without a redundant metadata write. BH2 is retained as DW-119; only the Milestone refusal names explicit Push, and the generic Card refusal retains its original wording. Independent final blind/edge/verification validation reports no new concrete finding; the verification reviewer additionally passed119tests on Node22, which is diagnostic only and does not replace the parent's Node24 gates. Final reports and source diff are retained under evidence/epic-7-remediation. Final parent Node24 workspace3165tests and serial release138capabilities/260accessibility/all typechecks/build/hygiene passed. Source diff fingerprint4d540af98169f5be4bf2b2db8c363be235dfbccaa58083260e1532e3225af923 is unchanged after the gates. Actual-TCP smoke passes. Retro v2 is accepted-with-open-items; A1–A4 and Epic7 are done via validated helpers. A5–A7 and DW119 remain open. No commit/push: global explicit-commit policy overrides the default Build completion step.

## Verification

- Node24.17.0 via `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`; Corepack pnpm9.15.4.
- Focused Vitest tests across GitHub/core/DB/server, then contracts/core/DB/GitHub/server typechecks.
- Parent serial `corepack pnpm test`, then `node scripts/verify.mjs`; preserve raw sanitized evidence.

## Changelog

- 2026-10-19 v1: Prepared bounded R1–R4 remediation from verified retrospective and source investigation; implementation and review pending.

- 2026-10-19 v2: Completed R1–R4,405initial focused/336post-review checks and final3165workspace tests; three independent review validations and release gate pass; accepted-with-open-items and closed Epic7, preserving deferred boundaries and initial retro.
