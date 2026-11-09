---
title: '7.7 Import a single ticket while creating a Card'
type: feature
created: 2026-10-19
version: 2
status: done
baseline_revision: 83a5277b1eb2556c5a148b59b687dc25e0246644
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-7-import-a-single-ticket-while-creating-a-card.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Assembled native connection-to-ticket-creation, rendered Issue navigation and reader/platform/live-provider acceptance remain unverified (I4–I6).
    evidence: |-
      Parent CUA inventory returned browsers:[]; shared connection and composer tests plus actual HTTP/MCP/reopened SQLite tests pass separately. A disposable-provider native journey including Connect, replacement review, protected Apply and Issue navigation would settle this medium unverified risk. No live GitHub credential/account smoke was run.
    severity: medium (unverified)
---

Reproducing statement: Execute bmad-build-auto for Story7.7 using subagents, implement and independently verify atomic ticket creation in the existing composer. Never write/revert sprint-status.yaml or infer verification from orchestrator rows. Date:2026-10-19. Version:2.

<intent-contract>

## Intent

**Problem:** The Card composer cannot look up an accessible GitHub Issue and create a linked Card in the user's selected location.

**Approach:** Add explicit cancellable lookup, deliberate population/review and atomic incoming GitHub ChangeSet creation, reusing canonical identity, Source Links, connection dialog and existing review/apply infrastructure.

## Boundaries & Constraints

**Always:** Preserve selected level/parent/Release/position, title/template defaults and drafts through errors, Cancel and connection detours. Incoming changes are attributed to github with initiating authority, audited atomic apply and restore point. Under protection retain a proposal until separate permitted human review/apply; never announce creation prematurely. Revalidate database epoch, Project/Map, connection, placement and reviewed Issue evidence before mutation and after every provider await. Keep packages/contracts the sole shared schema source, repositories the sole DB access, core pure. Respect existing scope/epoch/pending/focus rules, central English strings and clickable Issue-number identity. Use fake providers/disposable SQLite for tests.

**Never:** Write/stage/unstage/revert sprint-status.yaml, deferred-work.md or orchestrator paths; treat done/awaiting-operator rows as defects/evidence; touch real credentials/user Projects; call live GitHub or launch login. No commit/push, prototype compatibility, new provider, remote mutation, arbitrary URL fetch, duplicate binding reassignment, active Note import, create-then-link request chain or unrelated cleanup. Agent delegation is authorized for implementation/review. Retain meaningful prior tests and report native/platform/live-account limitations truthfully.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Ticket forms | HTTPS github.com/owner/repo/issues/N, owner/repo#N, N/#N with selected/default connection | One canonical positive safe Issue identity in selected repository; validation before provider call | Reject PR/foreign host/scheme/auth/query/fragment/zero/malformed/unsafe integer/mismatched repository without traffic |
| Exact creation | Valid accessible Issue, Activity/Step/Story selected placement, optional authored final text/template | One actual apply creates Card, canonical github ref, typed Source Link/provenance and sync baseline atomically at exact parent/Release/position; preserve native Issue type, strip only machine footer | Domain/audit failure leaves no partial Card/ref/evidence/baseline; retain draft |
| Lookup failures | Missing/inaccessible/auth/network/rate-limit or inconsistent provider identity | Actionable truthful error; lookup creates no domain rows and never claims masked404 proves deletion | No draft loss or success claim |
| Connection detour | Missing connection or GitHub off | Shared connection dialog, explicit off-switch explanation and separate Connect; return retains composer draft/template/placement | No ordinary provider call while off; Cancel retains draft/focus |
| Deliberate population | Authored title/description, successful lookup | Replacement requires explicit existing-pattern confirmation; Cancel preserves text; manual creation still works and Notes stay manual | No unsolicited overwrite or stale lookup adoption |
| Duplicate ownership | Same scoped Issue via same/different connection; cross-map/source-only references | Identify/focus existing same-scope Card without duplicate/reassignment; cross-map provenance is not active ownership | Recheck at confirmation and atomic apply, including concurrent attempts |
| Protection and surfaces | Human HTTP and both Agent transports; protected Project or apply:false | Read lookup and write import have shared strict contracts/capabilities; attributed proposal remains reviewable and separately human-applicable; actual applied response only after apply | Disabled/foreign/Agent-disallowed scope fails before side effects; partial selection cannot leave unlinked imported Card |
| Stale intentions | Selector/placement/connection edit, parent removed, Release changed, Map navigation, Restore/lower versions, remote drift, late lookup/create | Invalidate review, refuse stale request/adoption, require renewed lookup; no late close/focus/population in another scope | Preserve current draft and report re-review; duplicate same-event actions admit once |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/github-identity.ts#parseGitHubLocator`: canonical Issue URL parser. Add strict selector normalization beside it; no arbitrary URL handling. New cohesive ticket schemas can live in `api/github-ticket.ts`, exported through existing barrels. `api/http.ts#importWorkItemsRequestSchema`, `api/application-responses.ts`, `mcp/{tools,tool-inputs}.ts`: current incoming response and MCP inventory; use new `LookupGitHubTicket` and `ImportGitHubTicket` contracts without duplicating HTTP/MCP schemas.
- `apps/server/src/application/sync/github-command.ts#beginGitHubPreparation/revalidateGitHubPreparation/githubIncomingCommand`: captures DB handle, map version/full input fingerprint, connection and safety; github attributed command with initiating actor. Use `getSafetySettings(projectId).epoch` (existing canonical epoch used by remote-push-plan) across requests; handle identity only guards awaits within a request.
- `apps/server/src/application/sync/github-import-command.ts#importOperations`: bulk hierarchy-specific builder; extract/reuse per-Issue Card/ref/baseline/managed-Annotation operation construction with explicit placement rather than import-then-move. `services/sync-merge.ts#importSyncBaseline` separates acknowledgedLocal/observedRemote; acknowledge actual saved final text and selected Release without pretending the remote matches. Preserve separate pending first assignment evidence and native issueType.
- `packages/github/src/providers/work-item-provider.ts#getRemoteItem`, server `services/credentials.ts#resolveProviderAuth`: existing provider access and sanitized error seam. Reject selector/repository/placement before credentials/provider; verify returned locator agrees exactly.
- `packages/core/src/changesets/{github-evidence,operation-dependencies,github-sync-resolution}.ts`, `packages/db/src/repositories/{external-refs,source-evidence,work-item}-repository.ts`: canonical refs automatically project typed GitHub Source Links/provenance; no independent duplicate link row needed. Enforce uniqueness and one atomic operation dependency group; inspect actual dependency closure before deciding changes. No persistence shape change needed unless source proves otherwise.
- `apps/server/src/application/sync/sync.use-cases.ts`, `http/routes/sync-routes.ts`, `mcp/tools/{register-tools,project-scopes}.ts`, generated capability files: new read lookup and incoming write command classifications, scoped authorization and parity. Regenerate using root generate-capabilities.
- `apps/web/src/features/story-map/components/CardComposer.tsx`: manual title, templateDefaults(description/status/estimate), parent, Release and append position. Keep composer mounted through nested dialogs; isolate ticket flow in adjacent hook/component if needed. `DiscoveryMatrix.tsx:257` is its caller and owns onSelectCard for duplicate navigation. `useStoryMapBoardState.ts#createCard` is manual-only and lacks epoch guard; do not route ticket writes through it.
- `apps/web/src/features/github-sync/{GitHubConnectDialog,IncomingGitHubReview,GitHubSyncPanel}.tsx`, `features/changesets/useChangeSetReview.ts`: shared nested connection and actual proposal review/apply, scope isCurrent callback, shared synchronous pending locks and invalidation. `features/customization/TemplatePicker.tsx`: deliberate Replace draft confirmation. `app/{api,api-client}.ts` (locate actual sendJson definition), live interaction store and connector/safety hooks: add signal-aware lookup and current scope guards.
- Tests: `apps/web/src/features/story-map/components/card-creation.test.tsx`, board Restore tests and connection-dialog tests; server `application/sync/github-command-regressions.test.ts`, `mcp/github-command-{sdk,transports}.test.ts`, core operation dependencies and DB canonical identity/provenance tests. Real repository snapshot/reopen/Restore and audit refusal are required, not only mocked composer callbacks.
- Continuity from Story7.6: operation schema8, precise conflict locks, immutable canonical conflict evidence, acknowledged-vs-observed baselines and human-only exact remote consent remain intact. Graph tools unavailable; investigations read source/tests and source wins.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/{schemas/github-identity,api/github-ticket,mcp/tools,mcp/tool-inputs}.ts` and barrels — strict selector, exact placement, normalized lookup/duplicate/review evidence and incoming command contracts; shared HTTP/MCP schemas.
- [x] `apps/server/src/application/sync/{github-ticket-command,github-import-command,sync.use-cases}.ts` — read-only lookup and reviewed atomic single-ticket command using shared per-item builder, canonical duplicate checks, exact placement/final text and revalidation.
- [x] `packages/core/src/changesets/operation-dependencies.ts` and existing repository/executor seams — verify atomic selection closure, uniqueness, typed provenance and rollback; change only proven missing enforcement.
- [x] `apps/server/src/{http/routes/sync-routes,mcp/tools}.ts`, capability generation — expose/classify both operations, authorize actual owning Project on both transports and regenerate parity.
- [x] `apps/web/src/features/story-map/components/{CardComposer,DiscoveryMatrix}.tsx`, adjacent ticket hook/component, API/central strings — explicit connection/lookup/review/populate/create flow, duplicate navigation, incoming proposal review, retained drafts and accessible cancellation/error/pending/focus handling.
- [x] Focused contracts/core/DB/server/web/transport tests — cover every matrix row, reopened persisted identity/source/baseline and audit rollback, pending Restore/removal/drift plus actual mounted request. Run workspace/release gates serially; retain exact evidence under `evidence/story-7-7/`.

**Acceptance Criteria:**

- Given a successfully applied ticket creation, when its Map is reread and storage reopened, then the Card remains in exact reviewed placement with clickable Issue identity, typed Source Link, baseline, provenance/history and attributed Activity.
- Given any proposal, failed or stale action, when the composer remains open, then current authored state survives and UI truthfully distinguishes lookup, proposed and actually created outcomes.
- Given ordinary manual creation or Notes, when submitting the existing composer, then existing placement/template behavior remains available without ticket ownership.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass 1
- verdicts: 22 findings — high 0, medium 12, low 3, false 4, maybe-false 3
- findings:
  - `[medium]` `[patch]` E1: Selected Release is overwritten on unchanged Pull — pendingReleaseAssignment remains true; changedFieldsForRemote treats it as a remote change and incoming operations assign the remote Release. Clear for ticket placement; preserve bulk behavior.
  - `[medium]` `[patch]` E2: Ancestor visibility drift bypasses delayed Apply — ticketPlacementBefore compares immediate parent only; parentReference checks level/map but not visible ancestry. Reuse visibleCards and test actual refusal.
  - `[medium]` `[patch]` E3: Retained footer description is falsely locally changed — Builder hashes raw authored body; syncPayload/health hash stripped body. Normalize hashes while retaining bytes.
  - `[false]` `[reject]` I1: Source diff cannot prove workflow and protected-file execution — Renderer ran exactly once; parent independently ran workspace/release gates; tool history plus 18 original working/index hashes establish protected-file preservation. No tracking row supplied evidence.
  - `[false]` `[reject]` I2: Separate deliberate population diverges from lookup fills fields — Prepared7.7 explicitly requires deliberate population and confirmation before replacing authored text. Existing draft must survive lookup.
  - `[false]` `[reject]` I3: Separate manual and linked creation choices — Manual creation and Notes remain required. Ticket action explicitly names linked creation; unchanged manual action is not a false creation claim.
  - `[maybe-false]` `[defer]` I4: Successful connection detour into assembled import is unverified — Shared connection success and ticket import have separate executed tests; observe assembled native Connect→lookup→import to settle medium unverified risk.
  - `[maybe-false]` `[defer]` I5: Composer→persist→rendered Issue link assembled journey is unverified — Actual reopened SQLite/HTTP transports and mounted UI are complementary, not one native journey. Observe created Card and activate its Issue link.
  - `[maybe-false]` `[defer]` I6: Native focus/keyboard/reader/live provider journey unverified — cua inventory returned browsers:[]; native/screen-reader/platform/live account acceptance remains unexecuted, never claimed passing.
  - `[medium]` `[patch]` B1: Pending initial assignment overwrites chosen Release — Same root as E1; clear pending flag only for ticket composer and verify unchanged Pull for chosen Release/Unscheduled.
  - `[medium]` `[patch]` B2: Footer hashing differs from downstream comparison — Same root as E3; preserve authored bytes with canonical stripped-body hashes.
  - `[low]` `[patch]` B3: Raw retained prefixed title causes false remote delta — normalizeRemoteWorkItemTitle preserves raw remote when equal to local; import baseline currently lacks that context. Record matching observed hash to avoid unnecessary incoming update.
  - `[low]` `[reject]` B4: Lost import response unlocks retry — No success/no-effect claim is made on network error. Retry is canonically deduplicated and stale concurrent proposals cannot duplicate a Card. Full uncertain-response reconciliation adds state/branches for an uncommon non-destructive case.
  - `[medium]` `[patch]` B5: Lookup success is not announced — Preview has no live region/focus and successful lookup does not set existing status message. Announce success/duplicate through role=status.
  - `[low]` `[patch]` B6: Preview description collapses authored line breaks — One paragraph collapses line breaks. Preserve whitespace with direct presentation correction.
  - `[false]` `[reject]` B7: Imported Issue Type must be displayed — Prepared requirement is independent retained type, which baseline persistence and reopen tests establish. No requested type selector/review display requirement or incorrect retained value was shown.
  - `[medium]` `[patch]` B8: Bulk import repeats Annotation repository reads per Issue — Previous builder loaded definitions once; extracted helper calls managedAnnotationMappings per item. Pass command-scoped definitions to shared builder.
  - `[medium]` `[patch]` B9: Atomic grouping adds quadratic batch scans — Each ref scans operations for Card/baseline/assignments and helper runs during both dependency and simulation. Index once while preserving groups.
  - `[medium]` `[patch]` B10: Missing nested placement transport authorization regression — New placement recursion lacks actual foreign parent/Release cases; direct command ownership tests would survive removing recursion. Add actual MCP HTTP/SDK denial before auth/provider.
  - `[medium]` `[patch]` B11: Missing multi-Issue group selection regression — Global helper affects bulk imports, but new tests exercise one group. Add independent-group/generated-parent closure case.
  - `[medium]` `[patch]` G1: Release metadata acknowledgement is unasserted — Preverified gap: remove acknowledgeSelectedRelease and current reopen assertions still pass because helper sets releaseId independently. Assert metadata and initial health.
  - `[medium]` `[patch]` G2: Duplicate navigation is unasserted — Preverified gap: remove onSelectCard while retaining close and current test passes. Assert route id and visible Card Detail.

### 2026-10-19 — Review pass 2 (follow-up)
- verdicts: 28 findings — high 0, medium 3, low 10, false 13, maybe-false 2
- findings:
  - `[low]` `[reject]` Blind1: ImportGitHubTicket `{data}` envelope differs from command tools — response union has `already_linked` without ChangeSet; shape is contract-parsed and tested; harm is cosmetic and a fix adds branching.
  - `[false]` `[reject]` Blind2: MCP error mapping skipped for ImportGitHubTicket — `audit-tool-call.ts` wraps every tool with `asDomainError` (lines 93/137/143/160); command tools use the same path.
  - `[false]` `[reject]` Blind3: parentOverrideLocal hard-coded false — no Pull code consumes it to re-parent; bulk import sets the same value.
  - `[low]` `[reject]` Blind4: capability entry lists create:annotation — mirrors importWorkItems declaration; no behavior depends on it.
  - `[false]` `[reject]` Blind5: managed-annotation lookup duplicated — single-Issue path performs one read; bulk read-once test passes.
  - `[false]` `[reject]` Blind6: scopeHash/placement evidence too sensitive — spec requires any map/connection/placement change to force renewed lookup.
  - `[false]` `[reject]` Blind7: schema version 9 without migration — optional field only; AI-DO-NOT forbids backward-compatibility code.
  - `[false]` `[reject]` Blind8: epoch check shared by all GitHub commands — intent requires epoch revalidation after every await; failing on an epoch change is fail-fast.
  - `[false]` `[reject]` Blind9: client concurrency guards over-built — design opinion; no named failing case.
  - `[low]` `[reject]` Blind10: scope JSON.stringify of snapshot per render — invalidation on any snapshot change is intended; cost is negligible at map sizes.
  - `[low]` `[patch]` Blind11: bare PR number gives "different Issue identity" — fixed with explicit validation message `#N is a pull request, not an Issue.`; test added.
  - `[false]` `[reject]` Blind12: non-null assertions/mutation — returned URL identity is validated before use; mutation is local to the builder.
  - `[low]` `[reject]` Blind13: very long lines — style only, matches surrounding code density.
  - `[false]` `[reject]` Blind14: missing docs/ADR — AI-DO-NOT forbids markdown documentation; no new architecture-level decision beyond prepared Epic 7 design.
  - `[low]` `[reject]` Blind15: churn and validation gaps — no demonstrated failure; fixes would add guards.
  - `[false]` `[reject]` Edge1: register-tools skips asDomainError — same refutation as Blind2.
  - `[low]` `[patch]` Edge2: late applied import skips query invalidation after scope change — onSuccess now refreshes queries for an applied outcome even when stale, without closing or focusing.
  - `[low]` `[reject]` Edge3: cleared position input sends NaN — the lookup shows the schema error, no data loss; manual composer behaves identically.
  - `[low]` `[patch]` Edge4: connection without repository reports malformed selector — explicit validation message added before provider access; test added.
  - `[false]` `[reject]` Edge5: Activity/Step with releaseId — manual creation allows it and the repository enforces release rules; parity.
  - `[low]` `[reject]` Edge6: Note bulk-import not grouped — pre-existing (Notes get no baseline); not caused by this story.
  - `[false]` `[reject]` Edge7: epoch check scope — same refutation as Blind8.
  - `[medium]` `[patch]` Gap1: omitted-status default untested — added closed-Issue import test asserting `done` and healthy sync.
  - `[medium]` `[patch]` Gap2: Release milestone binding untested — added test asserting the baseline milestone for a milestone-linked Release (foreign-repository filter case not seedable because the github ref system is reserved).
  - `[medium]` `[patch]` Gap3: nonzero position unverified — added persisted position test with an existing sibling.
  - `[false]` `[reject]` Gap-other: register-tools bypasses error mapping — same refutation as Blind2.
  - `[maybe-false]` `[defer]` carried Intent1: assembled mocked-composer-to-real-server journey and Connect return path — covered by existing deferred I4/I5.
  - `[maybe-false]` `[defer]` carried Intent2: Map navigation/lower-version named cases and native journey — covered by existing deferred I6.

## Design Notes

Lookup returns normalized Issue content/identity and review evidence binding canonical database epoch, complete relevant map/connection snapshot, placement and all consumed remote fields. Import re-fetches the exact Issue and compares current evidence before building a command; do not trust caller-supplied remote content as provider evidence. Hashes are drift checks, not remote-write authorization; no new durable lookup table is needed. User-confirmed final title/description/template defaults remain local, with actual acknowledged-local versus observed-remote baseline values. Invalid parent/Release/level relations fail before provider access. A changed parent/Release/connection or Restore requires fresh lookup even if ids/versions recur.

Force this ticket command to propose under agentProtection, including human-triggered imports, per the prepared Story7.7 constraint; do not alter unrelated bulk behavior. A human may separately apply through the existing permitted review. Keep its imported Card/ref/baseline/evidence/Annotations as one review dependency group so deselecting part cannot create an unlinked Card.

## Verification

- Use Node24 for every Node/pnpm command: `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`.
- Run focused changed tests using `corepack pnpm --filter <package> exec vitest run <files>`; server test script appends an independent audit phase. Then `corepack pnpm test` and serial `node scripts/verify.mjs` (all typechecks/build/parity/hygiene).
- Stage only task paths before launcher fixtures that copy git ls-files; never stage protected files. No commit/push. Parent reads full baseline diff including staged/untracked sources, independently reruns all gates and audits every matrix row against actual passing tests.
- Protect working/index bytes of sprint/deferred/orchestrator paths against `/tmp/story7-7-protected-paths.json`; retain final comparison as JSON evidence. Baseline revision is full canonical Git HEAD.
- Attempt disposable native keyboard/connection/lookup/replace/proposal/creation/link journey if browser available. Record unavailable or unexecuted native/screen-reader/platform/live-provider acceptance explicitly; tests cannot certify those surfaces.

## Changelog

- 2026-10-19 v2: Four-lens22-row review,12repair groups,3,076parent tests and final release gates; preserve protected orchestrator files and explicit native acceptance limit.

- 2026-10-19 v1: Source-grounded runnable spec from two read-only investigations and accepted Epic7 preparation.

## Auto Run Result

Status: done

- Summary: atomic GitHub ticket lookup and creation in the Card composer (contracts, server commands, HTTP/MCP surfaces, core dependency grouping, web composer) delivered in pass 1 and re-reviewed in pass 2.
- Files changed this pass: `apps/server/src/application/sync/github-ticket-command.ts` (repository-less connection and pull-request messages), `apps/web/src/features/story-map/components/useTicketCardComposer.ts` (refresh queries on late applied outcome), `apps/server/src/application/sync/github-ticket-command.test.ts` (status default, position, milestone binding, PR number, repository-less connection tests).
- Review findings: 6 patches applied (medium 3, low 3), 2 carried maybe-false deferrals (existing I4–I6), 20 rejected with reasons in the Review Triage Log.
- Follow-up review recommended: false (no high patched in the follow-up pass).
- Verification: focused server ticket tests 58 passed, web ticket-creation 20 passed, server and web typecheck clean, `corepack pnpm test` exit 0 (server 944, db 489), `node scripts/verify.mjs` completed.
- Residual risks: native/assembled Connect-to-create journey, screen-reader and live GitHub account remain unverified (deferred I4–I6); foreign-repository milestone filter lacks a seeded test.
