---
title: '4.12 The BMad round trip'
type: feature
created: '2026-10-12'
status: done
baseline_revision: 78b53e1a4333f8052c67dfcdb1174b1e767ac0ce
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
version: 2
---

Reproducing statement: Implement Story4.12 from Epic4 preparation/detail plan using manifested generic tools, a documented Agent recipe and deterministic6-epic/34-story acceptance; preserve orchestrator-owned sprint/deferred ledgers and do not commit or push.

<intent-contract>

## Intent

**Problem:** BMad planning files need a demonstrated publication/refresh round trip that retains stable identities, source evidence and human edits.

**Approach:** Document Agent mapping/reconciliation instructions and record synthetic acceptance files exercised through existing generic tools against disposable Projects. Repair only generic operation behavior required by the round trip.

## Boundaries & Constraints

**Always:** Contracts remain the schema source; core remains pure; repositories own persistence; generic submission/executor owns proposals, atomic apply, audit and live events. Read epics/story/sprint inputs externally. Map Epic→Activity plus same-named Step, Story→Story with acceptance description, MVP/sprint→Release. Use map-scoped system `bmad` refs `epic-<n>`, `step-<n>`, `story-<epic>.<n>` and stable recipe-defined Release IDs. Each Card links to its file chunk. Initial apply=true publishes one cut, including inline source imports before dependent links; protection yields one proposal without source/domain writes. Changed files create immutable documents, replace only recipe-owned current evidence and retain history. Explicit last-synced baselines protect removed Cards. Validate even unchanged owned publications against human edits. Preserve other-map/system data. Fixture is synthetic acceptance evidence, reusable for4.13.

**Never:** Product BMad parser, title matching, Card deletion on refresh, new provider/SaaS/network dependency, new strategy/executor, fabricated user research or browser claims. Never write, stage or revert sprint-status.yaml or deferred-work.md; their rows do not prove verification. No commit/push or loop action.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Initial cut | Recorded6 epics/34 stories, MVP/sprint slices, empty map, apply=true |6 Activities,6 same-named Steps,34 Stories, Releases/assignments, scoped refs and actual file-chunk links; real Agent audit | Shared generic command |
| Protection | Same cut including sources in empty protected Project | One proposal previews full cut; no source/chunk/Card/Release rows or snapshot until human API approval/apply; semantic state equivalent | Existing policy |
| Identical | Same files republished | No duplicate domain rows or entity version/baseline bumps; lifecycle/tool audit truthful | No-op remains human-conflict aware |
| Refresh |2 Stories edited,1 removed,1 added | Edited Cards updated, new Card created, removal proposed archive and retained after apply, no duplicates/deletion; old sources retained/new links current | Atomic command/review |
| Evidence-only | Changed source with unchanged published scalar payload | New immutable document/current links; addressed ref tracks resulting Card version; subsequent identical run succeeds | No unrelated-system advancement |
| Identity | Renumbered same title, same-title distinct IDs, unrelated map/system refs | Archive-plus-create for missing/new IDs; exact scoped matching; unrelated entities/evidence/baselines unchanged | No title guesses |
| Human edits | Several edited existing and removed Cards since bmad baseline, including unchanged publication | All relevant indexed baseline conflicts; no overwrite/archive or partial domain changes | Shared ConflictReport |
| Slice/delivery | Explicit apply=false Release/assignment cut, configured method states | Proposed slice then reviewed apply; UpdateDeliveryStatus reflected in generic reads/Activity and read-only notes | Existing policy/status validation |
| Production guard | Production packages/apps source outside tests/fixtures/docs | No BMad-specific parser; generic refs/metadata allowed | Guard fails on parser introduction |

</intent-contract>

## Code Map

- `docs/bmad-round-trip.md` (new) — concise exact Agent recipe, verified tool schemas/mapping/refresh/source locators and operator approval actions. Manifest `apps/server/src/application/capability-manifest.json` and generated `docs/mcp-tools.md` are read-only tool inventory.
- `apps/server/src/fixtures/bmad-round-trip/` (new) — recorded synthetic epics/story/sprint inputs plus2-edit/remove/add and renumber variants; test-only composer/harness, never imported by product. Source locators derive from actual importer/read/preview output; shared fixture serves4.13. Node fs loading static inputs avoids code strings.
- `apps/server/src/mcp/tools/bmad-round-trip.test.ts` (new; split focused cases/helpers if required) — reuse patterns in `submit-changeset.test.ts`, `delivery-status.test.ts`; literal fetch `/api/mcp/call` and SDK StreamableHTTP `/mcp`, disposable SQLite, human approve/apply API, durable audit and normalized semantic comparisons.
- `packages/contracts/src/schemas/{change-operations,operation-fields,remaining-operations}.ts` — existing strict import/upsert/link/unlink/archive shapes; no new BMad contract. Import needs sha256/inlineContent; dependent link chunk `{kind:import,operationId,locator}`; local entity IDs differ from operation IDs.
- `apps/server/src/application/changeset/{submit-changeset.use-cases,prepare-operation-supply,changeset-command,changeset-executor}.ts` — shared preflight/source/command/executor. Submit currently resolves before storage and throws first baseline conflict; use existing aggregate collector/report before simulation to report all relevant conflicts without partial domain effects.
- `packages/core/src/changesets/{operation-registry,upsert-resolution,resolution-context,source-resolution,operation-conflicts}.ts` — sequential simulation and explicit transaction-start baselines. New roots stayv1; existing owned changes stay initial+1. Source-only replacement after unchanged upsert leaves addressed syncedVersion stale; ensure selected successful publication refs track resulting root version through the composed cut, preserving unrelated refs and no-op versions. Preview descriptions/state/persistence must agree; do not mutate a final state without corresponding resolved changes. Respect deselection/failed transaction behavior.
- `packages/db/src/repositories/{operation-persistence-repository,external-refs-repository}.ts` — reuse resolved persistence; identical binding is no-op and cannot reset baseline. No direct DB writes outside repositories. Archive requires recipe `baseVersion=ref.syncedVersion`; retain archived refs and omit already-archived removal candidates on repeat.
- `packages/db/src/repositories/row-mappers.ts` — omit SQLite nulls for optional nonnullable Card scalar fields and WorkflowStatus color at the canonical read boundary; actual transport snapshots must validate the existing contract.
- Core `operation-resolution.test.ts` and DB `operation-executor-persistence.test.ts` — focused generic source-only publication, addressed-only resulting baselines, no-op/selection/persistence regressions as needed. Server guard may live in new `bmad-source-guard.test.ts` alongside acceptance.
- Graph tools unavailable; two independent source/test investigations plus parent source verification. Read-only continuity: Story4.11 configured delivery/status-only command and release notes exist; actual browser validation belongs4.13.

## Tasks & Acceptance

**Execution:**

- [x] `docs/bmad-round-trip.md` — write exact manifested read/submission/review/status recipe; stable IDs separate from display titles, inline preparation/local locators, owned-ref reconciliation, explicit archive synced baselines and source replacement rules.
- [x] `apps/server/src/fixtures/bmad-round-trip/` — record deterministic6/34 epics/story/sprint inputs with meaningful Given/When/Then acceptance descriptions, slice mapping and changed/renumber variants; expose test-only reusable operation composer and disposable transport harness.
- [x] Core paths above + focused regression tests — repair generic composed-publication source-only baseline tracking without masking initial human conflicts, advancing other systems or changing unchanged versions; secure selection and resolved persistence.
- [x] `submit-changeset.use-cases.ts` + real transport tests — aggregate existing/removed baseline conflicts through existing shared shapes before proposal/snapshot/domain mutation.
- [x] `bmad-round-trip.test.ts` — execute all matrix rows on actual outer tool surfaces; prove complete protected preview then human API apply, normalized equivalence, hierarchy/refs/evidence/descriptions, repeat/no-op, two-edit/remove/add, source history, exact identity/isolation, all conflicts and status/notes/Activity.
- [x] `bmad-source-guard.test.ts` — guard production parser constructs while allowing legitimate generic ref metadata; prove guard rejects parser examples without requiring arbitrary banning of `bmad` strings.
- [x] Spec evidence — recorded fixture paths for4.13, full matrix coverage and actual verification/review; ledgers untouched.

**Acceptance Criteria:**

- Given the recipe and recorded files, when an Agent reads epics/stories/sprint and composes publication, then only manifested generic tools realize the required mapping, source evidence, stable IDs and configured delivery statuses.
- Given both real Agent transports and temporary storage, when the matrix runs, then every scenario passes through the required public surface and retains truthful audit without user-data or ledger mutation.
- Given production source and the recorded30-plus-Story scenario, when configured suites run, then the end-to-end scenario and parser guard pass with no production BMad parser.

## Spec Change Log

- 2026-10-12: Actual public snapshot acceptance exposed optional nonnullable Card scalars and WorkflowStatus color materialized as SQLite null. Added the minimal generic row-mapper correction and direct public-schema validation; frozen mapping, policy and matrix remain unchanged.

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 19 findings — high 0, medium 14, low 0, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind1 — Grouped complete top-level Story blocks and all descendant chunks; recorded multiline acceptance description and exact full-content assertions.
  - `[medium]` `[patch]` Blind2 — Emits explicit releaseId:null for removed membership; actual HTTP/SDK removal tests assert persisted clearing/version.
  - `[medium]` `[patch]` Blind3 — Refuses duplicate or overlapping supplied slice membership and repeated Release IDs before any submission.
  - `[medium]` `[patch]` Blind4 — Added development-status.txt and explicit status-mapping.json; test-only interpretation derives targets using actual public GetCustomization names.
  - `[medium]` `[patch]` Blind5 — Exact applied file/document/chunk/Card/link associations now fail loudly when absent; focused failure cases preserve unrelated manual evidence.
  - `[medium]` `[patch]` Blind6 — Assertions reject every old recipe-owned link ID and compare the complete replacement chunk set.
  - `[medium]` `[patch]` Blind7 — Both transports approve a real proposal, mutate through human PATCH, then assert 409 apply with unchanged domain/source state and no new restore snapshot.
  - `[medium]` `[patch]` Blind8 — Republishes planning after mapped delivery and asserts retained Card identities/statuses and addressed synced baselines.
  - `[false]` `[reject]` Blind9 — Claim says release-note title is deliberately shared, but selected Story1.1 has a unique title; duplicated1.2/1.3 are not selected. Existing release-note core tests separately pin grouping/done membership.
  - `[medium]` `[patch]` Blind10 — Guard recognizes unnamed Epic/Story capture/heading-prefix parsing and scans executable TypeScript/JavaScript variants.
  - `[medium]` `[patch]` Edge1 — Scoped selected archive advances only its addressed ref; core/DB/transport regressions cover return, deselection, other systems and human drift. Independent tracing exposed same-cut new binding; comparison now checks both initial baselines exist and new regression pins explicit stale refusal.
  - `[false]` `[reject]` Intent1 — Authoritative Story4.12 specifies generic recipe and deterministic fixture acceptance; live Agent/provider generation is not required. No production BMad parser/provider is permitted.
  - `[medium]` `[patch]` Intent2 — Same recorded BMad development_status/configured public mapping repair as Blind4.
  - `[false]` `[reject]` Intent3 — Human-only disposable Project/settings preparation legitimately uses fixture repositories; publication and ownership reads use public tools, external record is Agent-side state. No real Agent-reasoning claim.
  - `[false]` `[reject]` Intent4 — Actual browser/Tracking acceptance belongs to Story4.13; current story tests the required Agent tools and human review API. No browser result claimed.
  - `[false]` `[reject]` Intent5 — Unified diff cannot prove workflow history, but tool history shows one renderer invocation and no ledger writes; parent configured1649/release logs establish verification independently. Pending implementation notes are historical, followed by final evidence.
  - `[medium]` `[patch]` Verification1 — Same exact old-owned-ID absence and complete new chunk-set regression as Blind6.
  - `[medium]` `[patch]` Verification2 — Assertions compare exact refreshed title and complete multiline description against current recorded source.
  - `[medium]` `[patch]` Verification3 — Assertions compare exact scoped Story external-ID sets for each Release, including missing assignments.


### 2026-10-12 — Scoped repair review
- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Repair1 — Actual import identity is Project/type/hash; hash-only ownership matching selected an earlier TXT import instead of the applied Markdown document. Matching now includes all three fields; actual TXT-before-Markdown transport and foreign-Project association regressions pass.
  - `[medium]` `[patch]` Repair2 — Raw root-heading matching treated a fenced Story example as a real identity and truncated the true description. Fence-aware root boundaries preserve complete fenced content without phantom publications; transport regression passes.
  - `[medium]` `[patch]` Repair3 — CRLF root headings retained carriage returns and failed normalized locator matching. Interpretation normalizes line endings while original import bytes/hash remain exact; transport regression passes.

### 2026-10-12 — Follow-up review pass
- verdicts: 40 findings — high 0, medium 1, low 14, false 25, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind1 submit top-level message now generic — detail is retained per entry in `conflicts[]` (with `message`); covered by the added regression below, no extra branching worth adding.
  - `[false]` `[reject]` Blind2 no dedupe / `index!` — collect and source conflicts both always set `index`; operations are distinct so no duplicate pair arises.
  - `[false]` `[reject]` Blind3 null-to-undefined in toCard/toWorkflowStatus — consumers checked accept both; already recorded in Spec Change Log with public-schema validation.
  - `[low]` `[reject]` Blind4 per-operation synchronizePublishedReferences cost/absorption — limited to refs published in this cut, whose root baseline is checked at upsert start; no demonstrated harm.
  - `[false]` `[reject]` Blind5 `find(...)!` in trackExternalArchive — `targetId` resolves the card through the same selector first, so the ref exists.
  - `[low]` `[reject]` Blind6 unknown slice members ignored by composeSlices — test-only composer over fixed recordings; 12/12/10 slice counts and Release assertions pin the data.
  - `[low]` `[reject]` Blind7 positional slice file — test-only helper, single caller.
  - `[low]` `[reject]` Blind8 dead/duplicate fixture code — cosmetic, test-only.
  - `[low]` `[reject]` Blind9 duplicated recordings — four portable recordings are required by the frozen intent.
  - `[low]` `[reject]` Blind10 fixtures compiled into build / guard exemptions — same pattern as other src tests; not reachable from production.
  - `[low]` `[reject]` Blind11 thin status mapping — fixture covers done and review, the two configured targets exercised.
  - `[false]` `[reject]` Blind12 recipe call shape differs from tested call — `context` and `rationale` are optional in the input schema.
  - `[low]` `[patch]` Blind13 spacing typos in docs and test title — fixed `cover 6`, `Story 4.13`, `Version 1/2`, `publishes 6/34`.
  - `[low]` `[reject]` Blind14 magic counts/weak no-op assertion — counts are the frozen acceptance numbers; no-op also asserted on versions elsewhere.
  - `[low]` `[reject]` Edge1 zero publications or heading drift in composer — fixed recordings validated by recording-validation tests and count assertions.
  - `[low]` `[reject]` Edge2 unclosed fence in recording — same, recorded data only.
  - `[low]` `[reject]` Edge3 unknown slice member/whitespace — same as Blind6.
  - `[low]` `[reject]` Edge4 removed Release not retired — intent limits removal handling to Cards; Releases are never deleted on refresh.
  - `[false]` `[reject]` Edge5 dotted Epic / undotted Story headings — recorded headings are well formed; test-only composer.
  - `[false]` `[reject]` Edge6 owned link whose document is missing — owned links derive from applied import documents read by public tools; missing document is not reachable in recordings.
  - `[false]` `[reject]` Edge7 manual link adoption — ownership uses exact link IDs returned by the applied cut, not card/chunk coincidence; manual links are asserted to survive.
  - `[false]` `[reject]` Edge8 harness ignores error responses — callers assert error shapes explicitly where errors are expected.
  - `[false]` `[reject]` Edge9 harness setup leak — setup failure is an environment failure; temp-dir only.
  - `[low]` `[reject]` Edge10 guard misses `.test/.replace/.indexOf` — heuristic by design, 13 cases pass; broadening adds brittle complexity.
  - `[low]` `[reject]` Edge11 guard exempts any fixtures directory — exemption mirrors test/fixture scope required by the intent.
  - `[low]` `[reject]` Edge12 guard misses require/template imports — repo is ESM TypeScript; literal import forms are the only ones used.
  - `[false]` `[reject]` Edge13 entityId vs selector disagreement on archive — selector resolution and entityId are validated by existing contract rules before this path.
  - `[false]` `[reject]` Edge14 local-alias ref.entityId — `cardId` is the resolved id and refs of same-cut creations store the resolved id, so find matches.
  - `[low]` `[reject]` Edge15 generic top-level conflict message — same as Blind1.
  - `[false]` `[reject]` Edge16 undefined index sorting — every ConflictEntry produced here sets `index`.
  - `[low]` `[reject]` Edge17 silent mass archival on malformed input claim — same as Edge1.
  - `[low]` `[reject]` Edge18 source conflict reason lost at top level claim — same as Blind1.
  - `[low]` `[reject]` Edge19 guard coverage claim — same as Edge10.
  - `[medium]` `[patch]` Verification1 source-hash conflict entry not asserted on submit — mutation dropping `prepared.conflicts` left 29 tests green; added a hash-mismatch assertion for `reason: source`, operation id, index and message on HTTP and SDK; passes.
  - `[false]` `[reject]` Verification2 release/persona branch of ref sync untested — coverage observation; release refs are compared between runs and the branch is the same one-line root lookup.
  - `[false]` `[reject]` Verification3 mapper change unpinned at DB level — pinned by public-schema snapshot validation in acceptance tests and two adapted tests.
  - `[false]` `[reject]` Intent1 recipe documented but not executed by the doc — recipe is exercised through its test-only composer; frozen approach is document plus recorded acceptance.
  - `[false]` `[reject]` Intent2 BMad-aware composer under exempt fixtures path — frozen intent forbids product parsers only; composer is test-only and unimported by production, guard asserts this.
  - `[false]` `[reject]` Intent3 synthetic sprint recording and fixture-defined mapping — intent explicitly requires synthetic acceptance evidence.
  - `[false]` `[reject]` Intent4 row-mapper breadth — recorded in Spec Change Log as required for public snapshot validation.

## Design Notes

Use existing upserts even for unchanged scalar payloads so the stored bmad sync baseline still checks human edits. Import only required documents and preserve unrelated manual/source evidence. Read current tool snapshots/refs and source document/chunk data; avoid private DB-derived reconciliation in recipe tests. Missing IDs are archive candidates only in the current map/bmad system; explicit apply=false obtains the required removal proposal before reviewed application. Status assignment follows configured method names; no automatic product parsing of sprint status.

The acceptance requirement explicitly authorizes synthetic fixture creation, not real-user evidence. Generic baseline repair is necessary for changed evidence with unchanged scalar payload. Chosen implementation must preserve semantic preview/apply equality and sequential per-operation persistence, including selected subsets.

## Verification

Use Node24 PATH `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` before inherited PATH. Stage explicit new task files before Git-based portable fixtures; never stage ledgers. Run gates serially.

- `corepack pnpm --filter @storymapper/server test` — focused round-trip/guard and existing server suites pass.
- `corepack pnpm --filter @storymapper/core test` and `corepack pnpm --filter @storymapper/db test` — generic resolution/persistence regressions pass.
- `corepack pnpm test` — all configured package/script/performance tests pass; record actual counts/logs.
- `node scripts/verify.mjs` — Git/source hygiene, capability parity, typecheck/build pass.
- `git diff --check` and `git diff --cached --check` — clean whitespace; ledger changes remain external and never staged by this run.

## Implementation Evidence

Reusable fixtures: `apps/server/src/fixtures/bmad-round-trip/{initial,refresh,renumber,evidence}/` each contain6 epics,34 Story files and an explicit12/12/10 slice recording. Refresh edits1.1/3.1, removes6.5 and adds6.6; renumber1.1→1.7 retains title;1.2/1.3 share title. Story1.1 includes multiline nested acceptance criteria. `development-status.txt` and `status-mapping.json` record external BMad YAML interpretation without writing an orchestrator-owned filename.

Actual HTTP/MCP SDK acceptance creates46 Cards,49 refs,49 current file-chunk links and36 immutable documents. Protected submission previews one complete cut with no domain/source rows until separate human approval/apply; semantic results match unprotected apply. Refresh retains old documents/chunks, replaces exact owned evidence, archives missing identities and allows reviewed stable-ID return. Ownership comes from public reads, matched by Project/type/hash/locator and exact applied link IDs; unrelated manual links remain. Fenced examples/CRLF interpretation preserves original import bytes/hash.

Final matrix audit: initial/protection/identical→publication pair; refresh/archive/return→refresh pair; evidence-only→evidence pair; identity/scoped isolation→identity plus evidence pair; human drift→aggregate conflict pair plus delayed reviewed-apply pair; slice/delivery→configured public mapping/slice pair with post-delivery planning refresh; production guard→13 parser cases. Additional input/ownership/boundary7 all execute. No row or case skipped.

Parent verification on final source: `corepack pnpm test` passes1,665 tests: Scripts82, Contracts135, Importers7, Core247, DB352, Web230, Server598, Performance14. New round-trip14, recording-validation7 and source-guard13 pass in this same run. Log: `/tmp/storymapper-4-12-final-tests-3.log`. Separate full core247/DB352 and earlier server595+performance14 passed in `/tmp/storymapper-4-12-final-{core,db,server}.log`; final full run includes all subsequent fixture changes. `node scripts/verify.mjs` passes Git/source hygiene,119-capability parity,typecheck/build; log: `/tmp/storymapper-4-12-final-verify-2.log`. Source SHA256 `71a5ac83b3192899a9bbae0c6ca4862539f35a32931cce8ff3e4be1df9e19cc4` matches before/after final gates. Apply553.896/510.820/504.598ms≤2s; delivery456.380/376.108/371.196ms≤2s; preview244.800/207.816/206.737ms≤500ms.

Earlier failures remain visible: `final-tests.log` had transient fixed-port EADDRINUSE with81/82 portable cases passing; unchanged retry `final-tests-2.log` passed1,665. `final-verify.log` exposed TS2322 in a test-only source-link union spread; fail-fast chunk narrowing then focused7/typecheck passed and the entire final configured/release run passed. No skips, relaxed assertions or production changes to hide failures. Buglog records these observations.

## Changelog

- Version2 (2026-10-12): Completed four-lens triage and independently confirmed repairs, exact recording boundaries, final1,665 tests/release verification and orchestrator handoff; frozen intent preserved.
- Version1 (2026-10-12): Binding detail-plan investigation with generic source-baseline and aggregate-conflict gaps, frozen matrix and synthetic acceptance inputs.

## Auto Run Result

Status: done

- Summary: follow-up review pass on the completed 4.12 round trip; four lenses reported 40 findings. One medium (unasserted source-conflict entries in the aggregated SubmitChangeSet conflict response) and one cosmetic spacing fix were patched; everything else was refuted or rejected as low.
- Files changed in this pass: `apps/server/src/mcp/tools/submit-changeset.test.ts` (assert hash-mismatch source conflict entry), `apps/server/src/mcp/tools/bmad-round-trip.test.ts` (title spacing), `docs/bmad-round-trip.md` (spacing typos).
- Review breakdown: patches 2 (medium 1, low 1), deferred 0, rejected 38 with reasons in the Review Triage Log.
- Follow-up review recommended: false (follow-up pass, no high patched).
- Verification: `vitest` on `submit-changeset.test.ts` and `bmad-round-trip.test.ts` passes 43/43; server `typecheck` clean; `git diff --check` and `git diff --cached --check` clean. Full suite results from the earlier pass (1,665 tests, `verify.mjs`) still stand; no production source changed in this pass.
- Residual risks: guard is regex-based by design; test-only composer does not fail on unknown slice members in recorded data.
- Version control: nothing committed or pushed, per the spec's Never clause (no commit/push); `sprint-status.yaml` remains orchestrator-owned and untouched by this run. The working copy is therefore not clean by design.
