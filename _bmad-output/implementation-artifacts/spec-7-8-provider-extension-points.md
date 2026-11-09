---
title: '7.8 Provider extension points'
type: feature
created: 2026-10-19
version: 2
updated: 2026-10-19
status: done
baseline_revision: aae10f89c96b4c1aa26d862b31119a636c22d486
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-8-provider-extension-points.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      The connector validation safety switch gates only provider "github", so a registered alternate provider validates and reads remotely while the project's github switch is off.
    evidence: |-
      connector.use-cases.ts assertEnabled checks body.provider === "github" and the project safety settings expose only a github flag; the line predates this story and the extension suite sets github: true, so no test covers the off state. Only github ships, so it is unreachable in production today.
    location: >-
      apps/server/src/application/connector/connector.use-cases.ts:38
    severity: medium
  - summary: >-
      No alternate-provider test locks or resolves a Milestone/release field conflict (sync-field-locks disputedTarget and sync-resolution-agreement assignment lookup).
    evidence: |-
      Both sites now compare against the connection provider; only github core tests and alternate title conflicts exist, so reverting either comparison to "github" would not fail any test. Needs an enum-injected fixture with a milestone-field conflict.
    location: >-
      packages/core/src/changesets/sync-field-locks.ts:47
    severity: medium
  - summary: >-
      Deleting a Card or Release whose alternate-provider ref is cited by another Card's attached evidence is not exercised (cards-repository referencingCards, releases-repository evidenceOwners).
    evidence: |-
      Both queries now use the registered provider set; the extension suite's only alternate deletion has no citing Card, so restoring the github-only filter would pass all tests. Can extend the attached-evidence test with a delete.
    location: >-
      packages/db/src/repositories/cards-repository.ts:231
    severity: medium
---

Reproducing statement: Execute bmad-build-auto for 7-8-provider-extension-points with subagents; independently verify actual extension flows and never write or revert orchestrator-owned sprint-status.yaml. Date: 2026-10-19. Version: 1.

<intent-contract>

## Intent

**Problem:** Provider and credential switches can return undefined, and shared orchestration still rejects non-GitHub providers or interprets GitHub identities directly. A second adapter cannot use the promised three integration sites.

**Approach:** Establish explicit typed provider/credential registration and the minimal normalized identity/effect boundary required by actual shared flows. Prove extension with an isolated test adapter on its own host through real incoming ChangeSets, conflict handling and human-confirmed remote plans.

## Boundaries & Constraints

**Always:** Keep WorkItemProvider and PublishProvider at their actual existing package paths. Contracts is the schema source, repositories own DB access, core is pure. Central credentials registration includes status and auth; unknown runtime ids fail before resolver/factory/provider effects. Preserve canonical scoped ownership, source evidence, protection, approval, audits, exact human remote consent, pre-call intents, reconciliation, error truthfulness, Restore and export semantics established by 7.1–7.7. Normalize identity before shared flows rather than weakening GitHub validation. Establish the seam baseline first; freeze GitHub implementation/tests and shared orchestration for the isolated extension exercise and record hashes. Production enum remains github only; the test enum fixture, registry and credential registration are the only integration sites plus the new adapter module/tests.

**Never:** Write/stage/unstage/revert sprint-status.yaml, deferred-work.md or orchestrator files, or infer verification from their rows. No real credentials/user Projects, live provider calls, login, commit/push, production second connector, plugin loader, publisher implementation, speculative methods, prototype migrations/compatibility or unrelated cleanup. Do not use GitHub-shaped URLs for a fake alternate provider to evade shared identity assumptions. Preserve meaningful prior tests. Report unexecuted native/platform/live acceptance honestly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Runtime lookup | Unknown, inherited-key or malformed provider id | Typed explicit refusal from factory and credential lookup before any resolver/factory/provider effect | No undefined or accidental Object prototype dispatch |
| Registration completeness | Production enum and isolated extended enum fixture | Exactly registered factory and credential status/auth handlers for each id; only github ships | Missing/foreign registration fails explicitly |
| Alternate adapter reads | Test-only provider with its own host, canonical ids, credentials fixture | Actual connection validate and list/get flow uses registered adapter/status/auth and normalized values without GitHub credential probes | Foreign scope/identity, unavailable and provider errors remain explicit |
| Incoming and conflict | Test adapter imports then remote/local divergence, explicit remote resolution | Real SQLite/Card/ref/baseline/provenance and attributed ChangeSet apply; durable precise conflict and truthful health, explicit resolution | Protected proposals do not apply; audit/scope/Restore refusal leaves no partial mutation |
| Confirmed effects | Test adapter Issue/Milestone plan, cancellation, confirmation, interrupted result and explicit reconciliation | No writes before exact human plan confirmation; intent before each write; persisted outcomes and stable-marker reconciliation avoid duplicate create | Read-only/protection/Agent/unknown ids refuse before effects; ambiguity stops visibly |
| Extension freeze | Completed normalized baseline plus isolated test adapter | Only enum fixture, provider registry and credential registration plus adapter/tests change; frozen GitHub implementation/tests and shared orchestration hashes match | Report exact changes; do not substitute transport-only stubs for exercised shared flows |
| Regression | Existing GitHub current-schema data, incoming/remote/conflict flows and portable/operational lifecycle | Existing strict GitHub identity, ownership, protection, copy/provenance, export redaction and Restore behavior remains valid | Meaningful existing suites retain coverage and pass |

</intent-contract>

## Code Map

- `packages/github/src/providers/{index,work-item-provider}.ts`: current eight-method seam and fallthrough factory. Keep factory export path; use explicit immutable typed registry with runtime own-key checks. `github-provider.ts` translates GitHub wire data; any needed pure adapter identity/body normalization belongs at this boundary, never new shared provider-id branches.
- `apps/server/src/services/credentials.ts`: central CLI→file→environment auth; register auth and status together. `application/connector/connector.use-cases.ts#validateConnectorConnection` currently probes githubCredentialStatuses before provider resolution; dispatch status through registration and validate unknown ids before any probe.
- `packages/contracts/src/schemas/{domain,external-refs,change-operations,remaining-operations}.ts`: single provider enum and canonical ref/binding/operation contracts. Existing remote link identity is projected from GitHub external_refs, so a genuine alternate host requires minimal normalized identity/ref handling. Keep strict parseGitHubLocator for GitHub public boundaries; shared contracts must support validated adapter-owned normalized identity and preserve explicit scope/kind/remote id. Increment operation schema version if its shape changes; do not add old-proposal conversion.
- `apps/server/src/application/sync/{github-command,github-import-command,github-pull-command,github-conflict-command}.ts`: actual incoming path, github actor with initiating identity and shared executor; importOperations/singleIssueOperations emit githubExternalRef and parse URLs; pull compares GitHub URL locators. Remove proven protocol assumptions through normalized values while retaining actor/consent semantics and atomic review grouping.
- `apps/server/src/services/{sync-conflict-resolution,sync-merge,remote-push-plan,remote-push-context,remote-push-execution,work-item-sync}.ts`: conflict preparation explicitly refuses non-github; sync-merge constructs github.com Milestone URLs. Plans consume normalized Issue/Milestone payloads and marker results; retain guards before/after awaits.
- `packages/core/src/changesets/{github-identity,github-sync-resolution,operation-dependencies}.ts`, operation registry/resolver and `packages/db/src/repositories/{work-item-repository,row-mappers,external-refs-repository}.ts`: bindings/ownership/conflict projection currently derive provider/id/kind from strict GitHub URL. Normalize only required paths; generic refs must not become an adapter-ownership bypass. Preserve meaningful GitHub source-only, Note, scoped uniqueness, deletion and operational Restore guarantees. Read relevant tests before editing behavior.
- `packages/core/src/reports/sync-health.ts` and existing sync-health inputs: no provider calls; use normalized identity/baseline consistently.
- Tests: `services/{credentials,work-item-sync,sync-review}.test.ts`, `application/sync/github-command-regressions.test.ts`, remote push recovery tests, DB canonical identity/provenance/Restore/export and core operation tests. Add cohesive test-only provider and isolated enum/registry/credential injection exercise under server fixtures/application tests; do not ship a fake enum value or test-mode product branch.
- `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md#AD-15`: already names correct paths. Update concrete normalized boundary/registration facts, retain PublishProvider interface-only at `packages/core/src/publishing/publish-provider.ts`.
- Graph tools unavailable. Two read-only source investigations identified these actual extension blockers; source/tests prevail over cached graph/context.

## Tasks & Acceptance

**Execution:**

- [x] `packages/github/src/providers/index.ts`, `apps/server/src/services/credentials.ts`, `application/connector/connector.use-cases.ts` — explicit complete registry/status/auth lookup and typed runtime refusal; preserve credential selection and exports.
- [x] Contracts, adapter boundary, application sync/services, core resolution and DB repository paths above — remove only proven extension blockers through normalized identities/effects, preserving ownership, provenance, operation grouping and lifecycle contracts. Record justified baseline refinements under Spec Change Log.
- [x] Server test-only provider module and isolated registration exercise — validate/list/get, incoming ChangeSet/protection/audit, actual conflict/health/resolution, Issue/Milestone exact confirmed effects and interrupted reconciliation against disposable SQLite; prove no live/GitHub credential effects.
- [x] AD-15 and evidence under `evidence/story-7-8/` — exact three integration sites, actual paths and freeze hashes, no publisher implementation. Preserve protected-path working/index hashes captured at `/tmp/story7-8-protected-paths.json`.
- [x] Focused regression tests, matrix coverage, workspace tests and serial release verification — cover every matrix row and retain raw failure/final evidence without weakening tests.

**Acceptance Criteria:**

- Given a new test adapter, when integrated after the normalized baseline, then its own host and values pass real shared import/conflict/confirmed-plan flows through only the three documented integration sites plus its module/tests, with GitHub implementation/tests and orchestration unchanged for that exercise.
- Given the shipped application and architecture decision, when inspected, then only GitHub is publicly selectable, both actual provider interface paths and registry/credential sites are accurate, and no PublishProvider implementation ships.

## Spec Change Log

- 2026-10-19: Source-grounded normalization baseline keeps the legacy `githubExternalRef` operation name and adds optional registered `provider`; operation schema is 10. GitHub locators retain strict normalization, while other adapters use strict canonical serialized owner/repository/kind/remote-id/number/HTTPS-URL identity in `external_refs.external_id`, without duplicating URL/ownership in sync state. Required Milestone baselines accept this same canonical identity. `work-item-provider.ts` now owns the one production enum and is re-exported by `domain.ts`.
- 2026-10-19: Actual alternate-host flows required canonical projection/source evidence, scoped binding/conflicts, parent lookup, copy/provenance, deletion/health, bootstrap scoped uniqueness, operational Restore reporting and portable redaction to use the normalized boundary/registered provider set. GitHub Milestone URL translation stays in `packages/github/src/providers/normalized-identity.ts`; no shared alternate-provider branch or production second provider was added.
- 2026-10-19: Existing `sync-review.test.ts` credential suspension/assertion moved from the GitHub-only resolver to the central provider resolver used by conflict execution; the original revocation and no-effect assertions remain intact. Initial canonical casing/remote-number fixture and baseline-schema failures were retained in raw evidence and repaired without removing tests.

## Review Triage Log

### 2026-10-19 — Review pass 1
- verdicts: 24 findings — high 0, medium 17, low 3, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` B1: Alternate scopes were unconditionally lowercased. Preserve exact normalized alternate scope while retaining GitHub normalization.
  - `[medium]` `[patch]` B2: GitHub supplied remoteNumber bypassed consistency validation; old repository binding rejected this exact state. Restore shared number agreement.
  - `[low]` `[reject]` B3: Enum-derived partial index would retain its initial predicate on pre-extension databases. Only GitHub ships and prepared pre-release databases are disposable; installed-provider expansion/migration is not an exercised current path. Adding schema-refresh compatibility is beyond a direct correction and prohibited by prototype migration constraints.
  - `[medium]` `[patch]` B4: Plan/execution consume target/marker/Milestone reads before normalized scope validation; remotePushEvidence omits URL identity. Reuse current identity guard before reads authorize a write and assert exact requested/bound identity.
  - `[medium]` `[patch]` B5: New alternate owner-wide scope can contain colliding repository numbers, while import parent maps use only numbers. Scope parent keys by repository and number.
  - `[medium]` `[patch]` B6: Reference no-op and retirement omit provider system, so equal serialized identity across registered systems can suppress/retain the wrong binding. Compare full provider identity.
  - `[medium]` `[patch]` B7: Attached source provider is only assigned when after.provider exists; omitted GitHub provider retains alternate tag. Explicitly set or clear provider during transition.
  - `[medium]` `[patch]` B8: Broadened getGitHubLink permits alternate refs into GitHub-only update and canonicalRef rewrites system github. Refuse alternate refs at the explicit GitHub update boundary.
  - `[medium]` `[patch]` B9: Alternate copy and attached-source paths changed without execution coverage. Add actual reviewed copy/apply and absent outbound ownership assertions.
  - `[medium]` `[patch]` B10: Portable table assertions do not inspect changed recursive Activity/ChangeSet/history redaction. Add nested payload evidence assertions.
  - `[medium]` `[patch]` E1: persistConflictResolution omits remote.identity when rebinding a confirmed alternate local choice. Forward identity and test actual confirmed local-wins closure.
  - `[medium]` `[patch]` E2: incomingRelease compares public binding.url with canonical JSON locator, preventing alternate Release baseline advancement. Match canonical externalRef identity.
  - `[medium]` `[patch]` E3: Same demonstrated number-consistency defect as B2; keep separate row and shared repair.
  - `[false]` `[reject]` I1: Process cannot be established by source diff alone, but tool history records exactly one renderer invocation, planning, implementation delegation, independent gates and reviews. Artifact limitations do not demonstrate a workflow defect.
  - `[false]` `[reject]` I2: Prepared plan explicitly requires an isolated enum fixture with registry/credential injection. Test wraps real providerRegistration inputs; factory, credential dispatch, application, core and repositories execute without additional shared edits. This is the specified integration surface.
  - `[low]` `[reject]` I3: Alternate tests use application/services rather than native UI/HTTP/MCP. The story ships no second connector or new UI/transport capability; relevant existing transport suites run in workspace gates. Native/platform/live acceptance is explicitly unexecuted. Adding fake public UI/transport surface would exceed the three-site exercise.
  - `[medium]` `[patch]` I4: Changed copy/provenance/attached-source lifecycle lacks alternate execution. Same root as B9; preserve row and add actual copy/apply evidence.
  - `[false]` `[reject]` I5: Implementation handoff correctly reports broad gates pending. Parent independently runs them before terminal completion; no completed verification was inferred from handoff or sprint rows.
  - `[false]` `[reject]` I6: Hashes prove compared states, not transient history; tool trace contains no protected writes/staging/reverts. No sprint state supplied verification. The reviewer identifies a limit of diff-only evidence rather than a demonstrated prohibited action.
  - `[medium]` `[patch]` G1: Preverified copy collector regression gap: restoring github-only filters survives old tests and extension suite never copies. Add real alternate reviewed copy.
  - `[medium]` `[patch]` G2: Preverified archive-validator regression gap: old github-only rejection query survives tests. Validate and reject a portable DB with an alternate canonical reference.
  - `[medium]` `[patch]` G3: Same existing-Milestone canonical locator/public URL mismatch as E2. Cover incoming metadata and subsequent healthy baseline.
  - `[medium]` `[patch]` P1: Parent full workspace failed complete-surface old-resolver spies. A fake-provider test reached local CLI credentials; both credential fields in its untracked failure log were immediately redacted. Correct central resolver spies and retain no-effect assertions before rerun.
  - `[low]` `[patch]` P2: Parent full workspace failed the prior scope-message assertion after earlier owner validation. Restore expected scope-and-connection wording without relaxing test.


### 2026-10-19 — Review pass 2 (follow-up)
- verdicts: 41 findings — high 0, medium 6, low 25, false 10, maybe-false 0
- findings:
  - `[low]` `[reject]` BH1/IA3 github branches in shared identity/contracts/core — these are the strict GitHub normalization the intent keeps ("rather than weakening GitHub validation"), logged in Spec Change Log; moving them behind the registry is a redesign for a case that is unreachable with one shipped provider.
  - `[low]` `[patch]` BH2 import result `url` regressed from canonical locator to raw `item.url` — fixed to `identity.url` in `github-import-command.ts`; same root as EC8 and VG other-1.
  - `[low]` `[reject]` BH3 provider list interpolated into SQL in several places — values come from the compile-time enum, not input; consolidating is cleanup beyond a direct correction.
  - `[low]` `[reject]` BH4 stale partial index / no ADR — carried B3 (disposable pre-release DBs, no migration compatibility); AD-15 records the decision.
  - `[false]` `[reject]` BH5 fragile canonical id — `canonicalWorkItemId` always rebuilds the object in fixed key order and `parseNormalizedWorkItemId` rejects any non-round-tripping string; URL spelling normalization is the adapter's identity duty; the extra `isWorkItemProvider` check is harmless.
  - `[low]` `[reject]` BH6/EC4 GitHub-link list/get/delete serve alternate refs while update refuses — delete only detaches (no ownership grant) and is unreachable with only github shipped.
  - `[medium]` `[defer]` BH7/EC2 safety switch checks only provider github — the `body.provider === "github"` line is unchanged from the baseline (pre-existing); recorded in `deferred`.
  - `[low]` `[reject]` BH8 GitHub wording in provider-neutral error messages — messages remain explicit refusals on paths only an injected provider reaches; many sites for wording only.
  - `[low]` `[reject]` BH9 repeated ref scans — small per-run collections, no demonstrated bottleneck.
  - `[low]` `[reject]` BH10 duck-typed push target check — behavior correct, covered by plan tests; style only.
  - `[low]` `[reject]` BH11/EC7 non-null `parseWorkItemLocator(...)!` in restore-history and sync-health — rows come from validated canonical refs; a corrupt row already fails loudly (TypeError), no silent path.
  - `[low]` `[reject]` BH12 provenance predicate in three copies — consistent today; duplication only.
  - `[low]` `[reject]` BH13/IA6 legacy GitHub names and optional provider — retained deliberately per Spec Change Log (operation name `githubExternalRef`); renames are unrelated cleanup.
  - `[false]` `[reject]` BH14 no handling of stored v9 operations — the pre-existing operation-schema-transition mechanism handles schema bumps and the spec forbids conversion.
  - `[false]` `[reject]` BH15 fixture in src imports vitest — `src/fixtures/*` already holds non-test vitest helpers and tsc builds them harmlessly.
  - `[low]` `[reject]` BH16 spec/changelog hygiene and AD-15 density — fix is editing this build's spec / prose only.
  - `[false]` `[reject]` EC1 ZodError escapes canonicalWorkItemId — `application/errors.ts` maps ZodError; the failure is loud, not silent.
  - `[false]` `[reject]` EC3 alternate source-link refine skips repo/number check — source links are derived by the repository from the ref via `parseWorkItemLocator`, so they cannot disagree.
  - `[false]` `[reject]` EC5 stray `provider` key in projected external ref — projection readers only use system/externalId/entity ids.
  - `[low]` `[reject]` EC6 identity mismatch in pull now surfaces as validation instead of conflict — still an explicit refusal; fix needs catch/rewrap.
  - `[low]` `[reject]` EC9/EC12 single-ticket import still github-only — explicit refusal on a GitHub selector feature outside the spec Code Map; unreachable with only github shipped.
  - `[low]` `[reject]` EC10/EC11 index predicate baked at open — carried B3.
  - `[medium]` `[patch]` VG1 Restore result for alternate canonical links unasserted — added "reports alternate canonical links created after a Restore Point" in provider-extension.test.ts.
  - `[medium]` `[defer]` VG2 alternate Milestone conflict lock/agreement unexercised — verified coverage gap; needs a new fixture; recorded in `deferred`.
  - `[medium]` `[defer]` VG3 deletion of Card/Release cited by alternate evidence unexercised — verified coverage gap; recorded in `deferred`.
  - `[medium]` `[patch]` VG4 provenance migration SQL for alternate refs never run on reopen — added reopen plus `provenance: "linked"` assertion to the incoming identity test.
  - `[low]` `[patch]` VG other-1 import result url — same root as BH2, fixed.
  - `[low]` `[reject]` VG other-2 pendingReleases selects all registered providers vs connection provider — keys are provider-distinct canonical ids, so harmless.
  - `[false]` `[reject]` IA1/IA2 fixture is not a real adapter module and uses a contracts mock — carried I2.
  - `[false]` `[reject]` IA4 freeze not demonstrated by the diff — hashes live in evidence/story-7-8 freeze files; carried I1/I6.
  - `[low]` `[reject]` IA5 no HTTP/MCP/UI coverage for alternate adapter — carried I3.
  - `[false]` `[reject]` IA7 AD-15 text vs mocked integration — AD-15 matches the diff and the specified injection surface.

## Design Notes

The normalization baseline is authorized only where actual alternate-provider execution proves a blocker. Current contracts already describe Issue/Milestone/type/marker semantics; do not invent a more general provider framework or new connector UX. Identity must remain single and canonical: do not duplicate URL/ownership in sync state merely to bypass GitHub parsing. Adapter-owned normalized identity must be representable and scope-checked in pure core/repositories without importing network adapters. Preserve GitHub-specific UI/locator validation at its proper boundary.

## Verification

- Use Node24: `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH` for Node/Corepack commands.
- Run focused provider/credential/alternate adapter and affected contracts/core/DB/server HTTP/MCP suites; each matrix test must run and pass.
- Run `corepack pnpm test`, then serial `node scripts/verify.mjs` (capability parity, source hygiene, all typechecks and build). Preserve exact command outputs under evidence/story-7-8.
- Stage only task/workflow/OpenWolf paths as needed for launcher git-ls-files fixtures; never stage protected paths; no commit/push. Parent independently reads complete baseline diff and reruns verification.
- Audit every matrix row against actually executed passing tests. Record extension baseline/final hashes and exact registration edits; compare protected working/index bytes without writing them. Native/reader/platform/live-provider acceptance is not established by tests.

## Changelog

- 2026-10-19 v1: Prepared runnable spec from source-grounded provider and orchestration investigations; preserve accepted Epic7 constraints and protected orchestrator files.

- 2026-10-19 v2: Completed normalized provider registration,24finding triage and14repair groups; independent3130test workspace pass plus final release gates. Preserve credential-isolation incident and native/review limitations.

## Auto Run Result

Status: done

- Summary: Follow-up review pass 2 of the explicit provider/credential registration and normalized identity boundary. Three patches applied; no high findings.
- Files changed in this pass: `apps/server/src/application/sync/github-import-command.ts` (import result url uses canonical identity url), `apps/server/src/application/sync/provider-extension.test.ts` (alternate Restore link report test; reopen provenance assertion).
- Patches applied: 3 (medium 2, low 1). Deferred: 3 (safety switch scope, alternate Milestone conflict coverage, alternate evidence deletion coverage). Rejected: all other rows in the Review Triage Log with their recorded reasons.
- Follow-up review recommendation: false; no high finding was patched on this follow-up pass.
- Verification: `provider-extension.test.ts` and `github-command-regressions.test.ts` 75/75 pass; `node scripts/verify.mjs` (source hygiene, typechecks, build) completed. Full workspace tests were not rerun after the three small patches. Native/platform/live acceptance remains unexecuted.
- Residual risks: deferred items above; single-ticket import and the safety switch remain GitHub-specific; enum-derived partial index does not refresh on pre-extension databases (B3).
