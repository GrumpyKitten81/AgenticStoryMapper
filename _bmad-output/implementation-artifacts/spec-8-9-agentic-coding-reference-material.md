---
title: '8.9 Agentic-coding reference material'
type: chore
created: '2026-10-20'
status: done
baseline_revision: d93a298d8b27ffbffd19a60102a8a2e24fd674e6
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-8-9-agentic-coding-reference-material.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-preparation.md'
warnings: [oversized]
deferred: []
---

# Story 8.9: Agentic-coding reference material

Date: 2026-10-21. Version: 5.

Reproducing statement: Create an English contributor walkthrough for actual instruction, preparation, spec, implementation, independent review, checks and local PR preparation; verify it through an isolated Agent rehearsal and rescan the final publication candidate. Preserve orchestrator-owned sprint-status.yaml without writing or reverting it.

<intent-contract>

## Intent

**Problem:** Checked-in instructions and BMad artifacts do not yet provide a reproducible contributor walkthrough. Existing guidance contains stale release and isolation claims and treats done bookkeeping as delivery evidence.

**Approach:** Add one focused English walkthrough and links, repair directly conflicting guidance, then have a fresh isolated Agent follow the walkthrough for a real bounded documentation correction in disposable state. Retain actual local results and PR-ready artifacts; rescan new material without clearing unresolved publication prerequisites.

## Boundaries & Constraints

**Always:** Follow Epic8 preparation/detail-plan sequencing. Explain instruction hierarchy, matching topic rules, OpenWolf, optional local instructions, planning artifacts, preparation/detail-plan/runnable-spec differences, independent review, meaningful final verification, sequential story execution and one reviewed story delivery commit (including8.2). Intermediate upgrades need checks rather than separate commits. Separate app/manual requirements from optional Agent/loop tooling, authentication and trust. Use actual CLI/help/source commands, explicit preflight and human-presence requirements for login. Stage only intended files. Record full canonical baseline revisions, command/runtime/results and retained sanitized evidence with raw/decoded/compressed hashes where transformed. Distinguish isolated Agent reproduction from outside human validation, and local PR preparation from hosted behavior. Track publication report freshness after all final material/index writes.

**Never:** Write, stage, revert or otherwise alter sprint-status.yaml or deferred-work.md; infer defects or acceptance from their rows; create main-repository commits/tags/pushes/releases/remote PRs; run loop dispatch/init/resume/reconcile apply to verify prose; launch login; use real user Projects or credentials; copy private policy, personal absolute paths, identity or historical private content into examples/evidence; invent external contributor/hosted/platform/provenance acceptance; add product features, SaaS requirements or a new orchestration system. The global explicit-commit rule remains in force; prepare the commit locally without creating one unless separately authorized.


**Operator-approved recovery exception (2026-10-21):** The user explicitly authorizes preserving the existing attempt, relaxing the failing Bridge elapsed assertion to20000ms below the unchanged30000ms child timeout, successful local verification/preflight and continuation of this actual loop with its normal review/commit. This supersedes the earlier no-dispatch and unchanged-timing restrictions only for this recovery. Sprint/deferred tracking stays exclusively orchestrator-owned.

</intent-contract>

## Code Map

- Main clean baseline `d93a298d8b27ffbffd19a60102a8a2e24fd674e6`; graph tools unavailable. Cached epic8 context current. Previous done spec8.8 was read: shared versions/release guards and follow-up test repairs delivered; latest release32/version16/quick-verifier evidence does not claim a full aggregate after follow-up. Hosted/native/private-declaration/history/rights limitations carry forward, not as new defects.
- `CONTRIBUTING.md`: Local environment; Implementation and validation; Pull requests, merge and release. Actual Node24/Corepack0.35.0/pnpm9.15.4 setup, optional automation and local checks. Link the walkthrough rather than duplicate it.
- `README.md`: Community and publication contains stale “Release/tag automation is separate Story8.8 work.” This is the genuine small rehearsal change; do not repair it in the main tree before participant work. Adopt the reviewed participant patch afterward and add walkthrough discovery link.
- `docs/bmad-loop.md`: German operational reference, machine-local policy/model examples, setup/auth/preflight and CLI commands. Fix contradictory “Isolation bleibt worktree” against repeated isolation=none; qualify policy as local examples. Link new English walkthrough, do not translate unrelated history. No operational execution needed.
- `docs/bmad-epic-preparation.md`: Integrated epic acceptance says done rows establish delivery. Replace with independent delivery evidence, never bookkeeping proof; preserve detailed integrated acceptance requirements.
- `AGENTS.md`, `.cursor/rules/*.mdc`, `.wolf/OPENWOLF.md`, `.wolf/cerebrum.md`: read-only instruction inputs. Markdown changes need date/version/reproducing statement/changelog. Global instructions are optional local files, never clone guarantees.
- `.agents/skills/bmad-build-auto/SKILL.md` and paired Claude skill, `_bmad/scripts/render_skill.py`, `_bmad/custom/bmad-build-auto.toml`, `_bmad/custom/references/bmad-build-auto-epic-story-plans.md`: render once, follow printed snapshot; detail-plan decisions constrain investigation/Code Map. No invocation of another real loop required for manual rehearsal.
- `scripts/check.mjs::runQualityGate`: actual offline aggregate (installed dependencies required); boundaries/size/hygiene/licenses/capabilities/build/root script tests/coverage/serial audit/verify with a11y. `scripts/setup.mjs` installs frozen dependencies/builds/creates disposable local folder. No app launch required for docs correction.
- `scripts/bmad-loop-preflight.mjs`: Node24/Claude status/unattended settings, no login. `bmad-loop run --help` verified --story/--epic/--max-stories/--dry-run; resume help has run_id/--project/--accept-baseline and no --no-interactive. Installed tools/auth/local policy are not inherited by a clone.
- `scripts/check-publication.mjs::publicationMain`, `scripts/check-publication-audit.mjs::runPublication`: explicit private --policy required. Existing `/tmp/story-8-7-policy.json` exists; use without printing/copying values. --scan writes sanitized `publication-audit.json`; normal check recomputes it. Unresolved real findings produce exit1; this is expected publication refusal, not a quality-gate waiver. Recompute after every final write/index change; later commit/history disposition invalidates report.
- Evidence destination `_bmad-output/implementation-artifacts/evidence/story-8-9/`; protected working/index hash snapshot is in `/tmp/story-8-9-protected.json` (never restore from it).

## Tasks & Acceptance

**Execution:**

- [x] `docs/agentic-coding.md` — write focused English walkthrough from actual files/commands; include safe bounded manual sequence through local PR-ready title/body/diff, optional skill/loop paths and side effects, and publication/hosted/native limits. Manual sequence must stand on its own without installed Agent tooling.
- [x] `CONTRIBUTING.md`, `README.md`, `docs/bmad-loop.md`, `docs/bmad-epic-preparation.md` — link walkthrough, repair only identified contradictory claims and required metadata; keep one authoritative explanation per topic.
- [x] `evidence/story-8-9/` — freeze disposable local Git baseline including draft walkthrough; spawn a fresh participant with no conversation context, giving only walkthrough path, disposable location and bounded intent to correct README's stale release sentence. Participant must follow the walkthrough, plan/implement/check, obtain independent review and prepare PR title/body/diff. No commit required/authorized; record commit and remote PR steps as prepared/simulated. Do not expose machine/private state through copied config or logs. Record missing instructions and repair them; rerun affected steps after repair. Adopt actual reviewed README patch into main, preserving separately added discovery link.
- [x] `evidence/story-8-9/` and this spec — retain executed steps, full baseline revision, participant type, actual command outcomes and sanitized provenance; validate all named paths/links/commands without invoking side-effectful workflows. Full aggregate must run in the disposable rehearsal, not be substituted by main-tree results. The parent independently reruns main final gates.
- [x] `publication-audit.json` — include completed docs and safe evidence in fresh all-ref/current/index/new-file scan and independently recomputed check using existing private policy; retain unresolved prerequisites. Parent final rescan follows all metadata/index writes.

**Acceptance Criteria:**

- Given the English walkthrough, when a contributor follows its instructions, then repository/local instruction differences, planning/spec stages, independent review/checks and PR preparation are explained with real current paths and commands.
- Given the bounded README defect, when a fresh isolated Agent follows only the walkthrough in disposable state, then it produces a real reviewed correction, passing documented local checks and PR-ready title/body/diff; actual commands, repairs and simulated remote/commit steps are recorded without claiming an external human trial.
- Given every named path/link/command, when validated against tracked repository/tool help, then targets exist and optional-tool requirements and operational side effects match actual behavior.
- Given final docs/evidence and all existing publication blockers, when exact-candidate scan/check runs, then new material is included, report freshness is checked and unresolved declarations/history/rights/native/hosted prerequisites remain explicit.
- Given orchestrator-owned tracking, when implementation/verification/finalization completes, then neither working nor index bytes were changed by this workflow and row values were never used as proof.

## Spec Change Log

- 2026-10-21: User authorized preserving the current work, recovery of the parked spec, relaxation of the failing Bridge timing constraint, verification and loop continuation. This supersedes the historical no-dispatch/no-commit and unchanged-deadline restrictions only for this recovery. Increase the Bridge failure elapsed-time bound from 10000ms to 20000ms, below the existing 30000ms child timeout; retain nonzero exit, error-text and cleanup assertions. Preserve orchestrator-owned sprint/deferred ledger working and index bytes.

## Review Triage Log

### 2026-10-21 — Review pass

- verdicts: 19 findings — high 0, medium 11, low 1, false 7, maybe-false 0
- Four fresh CLI lenses: blind10, edge0, verification0, intent9. All outputs collected before triage; no output omitted.
- findings:
  - `[medium]` `[patch]` B1: Retained overlay includes solution — Confirmed six-file overlay included README. Preserved historical miscapture; corrected five-file overlay hashes exactly to pre-participant423f8596… capture and reconstructs every supplied input plus original README.
  - `[medium]` `[patch]` B2: No executable rehearsal bootstrap — Guide v3 provides pinned independent clone, removed remote, five explicit current inputs, branch and stale-sentence assertion; fresh participant replay is running.
  - `[medium]` `[patch]` B3: Successful TMPDIR prerequisite missing from guide — Guide v3 creates task-owned TMPDIR before installation/gates with caching enabled; no private pointer or shared-cache deletion required.
  - `[medium]` `[patch]` B4: Fingerprints described after gate — Guide v3 captures working object lists and staged-entry manifests before the aggregate and compares afterward and before export.
  - `[medium]` `[patch]` B5: Review repairs can leave exported staged patch stale — Guide v3 explicitly restages and inspects intended paths, rejects unstaged differences and rechecks after any repair.
  - `[medium]` `[patch]` B6: README-only scope conflicts with OpenWolf bookkeeping — Guide v3 separates bounded README business correction from required sanitized bookkeeping; intended paths and handoff-before-gate sequencing are explicit.
  - `[medium]` `[patch]` B7: Reverse/reapply does not prove initial plan-led discovery — Original limitation remains; guide v3 requires plan before investigation/edit and a genuinely fresh participant is replaying from bootstrap.
  - `[false]` `[reject]` B8: Review lacks independence from proposed solution — Original review was explicitly a separate non-author session, satisfying the stated independent-review requirement; prior context is disclosed. Four current fresh-context CLI lenses independently examined the implementation. No incorrect README outcome identified.
  - `[medium]` `[patch]` B9: Only staged digests retained — Retained literal original staged-entry manifest after gate; it exactly matches original recorded gate digest and intended working/staged blobs. Guide v3 requires manifests at command start and comparison/export, with later collection timing disclosed.
  - `[low]` `[reject]` B10: Ad-hoc link checker invocation not retained — Actual76 links were independently checked. Original missing command provenance remains explicit; adding a maintained checker for this rare audit convenience exceeds a direct correction. Guide v3 documents existing Git/manual target and heading checks without claiming filename checks establish anchors.
  - `[medium]` `[patch]` I1: Assisted environment success differs from unaided documented reproduction — Same cause as B3: environment provisioning is now in guide; a fresh participant must use it without hidden pointers.
  - `[medium]` `[patch]` I2: Planning initially followed implementation — Same cause as B7: retain original deviation and perform new plan-first fresh-context reproduction.
  - `[false]` `[reject]` I3: Review has prior solution context — Same claim as B8: no promise of uninvolved solution selection; original non-author context disclosed, and four fresh current lenses supplement it.
  - `[false]` `[reject]` I4: Only README change reproduced, not substantial specs/loop dispatch — Detail plan explicitly selects a small bounded real change and prohibits silently launching unattended workflow for prose verification. Manual README correction is that permitted surface; app gates are regression evidence, not comprehension claims.
  - `[medium]` `[patch]` I5: Standalone OpenWolf compliance omitted — Same cause as B6: corrected recipe includes required sanitized bookkeeping and fresh replay exercises it; original omission is preserved.
  - `[false]` `[reject]` I6: Remote PR and delivery remain simulated — Detail plan explicitly requires local PR-ready title/body/diff unless remote creation separately requested. No remote request exists; no hosted or commit result is claimed.
  - `[false]` `[reject]` I7: Final publication result absent from review diff — Final exact-candidate scan is deliberately after all review/finalization/index writes; no completed-audit claim was made in review snapshot. Parent final scan/recomputed check remains mandatory, not waived by quality success.
  - `[false]` `[reject]` I8: Endpoint hashes cannot prove no transient tracking writes — True limit of endpoint evidence, but no violating write is identified. Actual parent/subagent commands exclude protected paths; working/index endpoint hashes and diff corroborate rather than independently prove that execution history.
  - `[false]` `[reject]` I9: Diff does not demonstrate render-once execution — Parent actually ran the exact renderer once, consumed printed snapshot and executed its steps. Source diff alone was never claimed as independent runtime proof; tool transcript supplies execution evidence.

Eight medium patch groups; eleven rows share those routes. No new deferrals. The low ad-hoc-checker convenience is rejected; original missing provenance remains explicit. Fresh participant and final parent verification follow repairs, with no external-human/hosted claim.

### 2026-10-21 — Review pass (follow-up)

- verdicts: 29 findings — high 0, medium 0, low 17, false 11, maybe-false 1
- Follow-up pass on a `done` spec. Four fresh lenses: blind 14, edge 9, verification-gap 0, intent-alignment 6 descriptive divergences. The diff excluded `sprint-status.yaml` and hook-maintained `.wolf/`. No earlier row carried verbatim; B2/B7/I-series themes recur as separate rows below.
- findings:
  - `[low]` `[reject]` Blind1 v4 recipe never executed byte-identically — disclosed in spec, RESULTS.md and the v4 changelog; only fix is another ~11-minute participant run, not a direct correction.
  - `[low]` `[reject]` Blind2 "fresh" wording and reused reviewer vs pr-body.md line 20 — line 14 of the same file and the spec disclose the reused-context recheck; editing a hash-chained evidence file breaks retention.json.
  - `[low]` `[reject]` Blind3 recipe pinned to one historical revision — guide states the pin exists because the README already holds the correction; a generic procedure is added scope.
  - `[low]` `[reject]` Blind4 POSIX-only recipe — guide line 33 names it a POSIX-shell recipe and disclaims Windows/Linux native acceptance.
  - `[low]` `[patch]` Blind5 shell blocks fragile (`set -eu` in a login shell, variables shared across blocks) — guide now requires one dedicated interactive `sh` session; v5 and changelog added in docs/agentic-coding.md.
  - `[false]` `[reject]` Blind6 OpenWolf bookkeeping contradicts the do-not-edit rule — guide only says to review tracked OpenWolf changes, including hook-generated ones, and to keep required sanitized handoff updates; it never instructs hand-editing memory.md or anatomy.md.
  - `[maybe-false]` `[reject]` Blind7 audit gained older-commit history findings unexplained — generated scan output, conservative unresolved rows, no harm shown; would be low if true. Needs scan-rule diff to settle.
  - `[false]` `[reject]` Blind8 spec committed unfinished — `in-review` is this step's own transition, the remaining rescan is declared in the spec, and the fix edits this build's spec.
  - `[low]` `[reject]` Blind9 missing spaces and truncated hash in spec/evidence — fix edits this build's spec or hash-chained historical evidence.
  - `[low]` `[reject]` Blind10 "false" verdicts inflated in prior log — fix edits this build's spec.
  - `[false]` `[reject]` Blind11 review input narrower than triage implies — the workflow deliberately gives the spec to the edge lens only; lens independence is as designed.
  - `[low]` `[reject]` Blind12 redundant evidence files; solution patch retained — the rehearsal clone is pinned to the pre-story revision, so participants never see the retained solution patch; deduplication would break retention.json hash references.
  - `[low]` `[reject]` Blind13 mixed language, link placement and dates — German bmad-loop.md is pending translation per AGENTS.md; placement and date convention are cosmetic.
  - `[false]` `[reject]` Blind14 "including 8.2" unexplained and epic-specific — the intent contract explicitly requires stating sequential execution including 8.2.
  - `[low]` `[reject]` Edge1 untracked files created by the gate are not captured — step 6 lists untracked files before the gate and exports only explicit staged paths; adding a check is extra complexity.
  - `[false]` `[reject]` Edge2 `hash-object --stdin-paths` on odd paths — no such tracked paths exist and the failure is loud under `set -e`.
  - `[low]` `[reject]` Edge3 fixed seven-path export list — step 6 already requires inspecting staged paths and rejecting unstaged differences.
  - `[low]` `[patch]` Edge4 multi-block shell depends on session state — same root cause as Blind5; fixed by the same guide sentence.
  - `[low]` `[reject]` Edge5 no interrupt handling for the 11-minute gate — each run uses a fresh mktemp root so stale logs are not reused; trap is nice-to-have.
  - `[low]` `[reject]` Edge6 shallow clone lacks revision guard — `git switch --detach` fails loudly and the prose says to stop.
  - `[false]` `[reject]` Edge7 hard-coded `/tmp` — POSIX-only recipe is disclosed; `mktemp` fails loudly when `/tmp` is unusable.
  - `[low]` `[reject]` Edge8 final retained run is a same-author replay, not fresh rediscovery — same claim as Blind2; RESULTS.md and the spec already say so.
  - `[false]` `[reject]` Edge9 audit report records pre-story HEAD and goes stale on commit — the spec's Code Map and Verification state later commit/history disposition invalidates the report and a rescan follows the final writes; rescan performed after this pass's writes.
  - `[false]` `[reject]` Intent1 reproducibility evidenced only by the author's retry — same as Blind1/Edge8, disclosed.
  - `[low]` `[reject]` Intent2 recipe is a pinned fixture, not general — same as Blind3/Blind4.
  - `[false]` `[reject]` Intent3 publication freshness circular at diff level — descriptive; the freshness check is an executed command after final writes, not derivable from a diff.
  - `[false]` `[reject]` Intent4 constraint compliance asserted not demonstrated — descriptive; hash snapshots, absent sprint-status/deferred-work entries in the diff and unchanged `deferred: []` corroborate; same as earlier I8.
  - `[low]` `[reject]` Intent5 guidance repair partial in scope — descriptive; only the three conflicts the intent names exist in the touched files.
  - `[false]` `[reject]` Intent6 human-validation distinction documentary — the intent requires the distinction, not an outside-human trial.

### 2026-10-21 — Deterministic repair review

- verdicts: 17 findings — high 0, medium 2, low 6, false 9, maybe-false 0
- Four fresh read-only CLI lenses: blind 10, edge 0, verification-gap 0, intent-alignment 7 descriptive table divergences. Intent readings/context paragraphs are explanatory framing, not additional findings. All four completed before triage; full outputs/provenance retained under evidence/story-8-9/repair-review-*. Two independent medium patch entries, zero new deferrals.
- findings:
  - `[false]` `[reject]` Blind1 refresh publication audit — carried prior I7/Intent3: the workflow requires the scan after final review/metadata/index writes. A stale intermediate report is expected; final scan/recomputed check remains mandatory.
  - `[false]` `[reject]` Blind2 Corepack provisioning follows bootstrap — the guide's first paragraph directs contributors to Contributing for environment provisioning; its Local environment section supplies Node24 and Corepack installation before repository commands. Reading the guide in order already provides that prerequisite.
  - `[medium]` `[patch]` Blind3 repeated gate overwrites previous attempt evidence — confirmed fixed check.log/check.exit and start/end/export paths. Added explicit archiving into a distinct external attempt directory before every retry, without a new runner.
  - `[low]` `[reject]` Blind4 post-gate untracked files absent from tracked manifests — carried prior Edge1: staged explicit exports bound the participant patch and initial untracked inspection is documented; extra generated-file handling adds complexity for a low-risk bounded fixture.
  - `[low]` `[reject]` Blind5 fixed seven-path participant export — carried prior Edge3: intended staged paths and unstaged differences must already be inspected; no missing required hook-generated path was demonstrated.
  - `[medium]` `[patch]` Blind6 numbered login sequence contradicts noninteractive-first requirement — confirmed authentication/trust preceded preflight in the list. Reordered read-only preflight and recorded results before presence-confirmed interactive setup, followed by another preflight.
  - `[low]` `[reject]` Blind7 final guide differs from historical participant recipe — carried prior Blind1/Edge8: version/author/environment boundaries are disclosed; another full participant discovery trial is more than a direct correction. No byte-identical final-guide participant claim is made.
  - `[false]` `[reject]` Blind8 reconcile follow-up metadata — fixes this build's spec, which the review rules reject; finalization recomputes the field from this pass rather than copying historical recommendations.
  - `[false]` `[reject]` Blind9 handoff and bug log omit current repair — interim review preceded parent-owned terminal bookkeeping. Required repair entries and final handoff are completed during finalization; no completed-repair handoff claim was made by the implementer.
  - `[low]` `[reject]` Blind10 original diagnostic output retained only in implementer transcript — deterministic-repair.json explicitly disclaims complete raw-stream retention; supplied orchestrator feedback preserves the original failure and parent success has independently retained logs. Historical raw output cannot be recreated retrospectively; new diagnostic infrastructure is more than a direct correction. This evidence limitation remains explicit.
  - `[low]` `[reject]` Intent1 final instructions were not followed by a new participant — carried prior Blind1/Intent1: successful same-author environment replay and guide-version boundary are disclosed; no final-version fresh trial is claimed.
  - `[low]` `[reject]` Intent2 fixture is pinned/POSIX rather than general onboarding — carried prior Blind3/Blind4/Intent2: the pin, Darwin environment, store provisioning and native-platform limits are explicit; the intent permits a bounded real correction.
  - `[false]` `[reject]` Intent3 broader preparation/upgrade/loop lifecycle is described but not executed — the frozen contract requires a bounded documentation rehearsal and prohibits operational dispatch for prose verification; those surfaces must be explained, not executed here.
  - `[false]` `[reject]` Intent4 prior participant reviews do not cover later infrastructure changes — those reviews claim only their participant scope; this pass adds four independent lenses over the current diff including the fixture and command alias.
  - `[false]` `[reject]` Intent5 application gates do not establish contributor comprehension — no comprehension or external-human claim is made; the bounded participant record supplies rehearsal evidence and the gates supply regression verification. The user explicitly requests repair of failed deterministic verification.
  - `[false]` `[reject]` Intent6 final publication execution order absent from review diff — carried prior I7/Intent3: final scan/check is an executed terminal action after all writes, not something a review patch can establish prospectively.
  - `[false]` `[reject]` Intent7 endpoint comparisons and binary patch records do not prove all history — carried prior I8/Intent4: endpoint and transformation limitations are disclosed; raw payloads are separately retained and parent independently checks their hashes. No absence-of-transient-write proof is claimed.

### 2026-10-21 — Operator recovery review

- Scope: only the one-line Bridge timing delta; earlier full-story reviews remain historical and a fresh orchestrator review is still required. Four independent lenses completed; the fourth launch waited for a concurrency slot. Blind1, edge0, verification-gap0, intent4 descriptive boundaries; five triage rows, zero patches/deferrals.
- `[maybe-false]` `[reject]` Blind1 clock adjustments — no clock-step failure reproduced; Date.now predates this change. A clock-step reproduction would settle the claim; if true the impact is low. No extra instrumentation added.
- `[false]` `[reject]` Intent1 broader recovery surfaces absent from code diff — operational backup/recovery and retained verification provide that evidence separately.
- `[false]` `[reject]` Intent2 threshold-only change — exactly the authorized timing relaxation with functional assertions retained.
- `[false]` `[reject]` Intent3 child timeout absent from diff — inspected versionFixture retains30000ms timeout above20000ms assertion.
- `[false]` `[reject]` Intent4 operational outcomes absent from source diff — no source-only proof claimed; gates are retained and preflight/resume remain the next operational step.

### 2026-10-21 — Review pass (second follow-up)

- verdicts: 31 findings — high 0, medium 0, low 15, false 15, maybe-false 1
- Follow-up pass on a `done` spec. Four fresh lenses, all collected before triage: blind 17 bullets, edge 5, verification-gap 0 (1 other finding), intent-alignment 8 descriptive divergences. Diff scope: baseline `d93a298d8b27ffbffd19a60102a8a2e24fd674e6` to working tree, excluding orchestrator-owned `sprint-status.yaml` and hook-maintained `.wolf/`. Zero patches, zero deferrals.
- findings:
  - `[false]` `[reject]` Blind1 frontmatter `followup_review_recommended: false` vs body "recommended: true" — the body section is titled "Previous Auto Run Result (historical)"; the frontmatter field is recomputed by this pass, and the fix edits this build's spec.
  - `[low]` `[reject]` Blind2 changelog lacks v4 — edits this build's spec; no reader acts on the gap.
  - `[low]` `[reject]` carried Blind3 missing spaces/glued numbers — carried prior Blind9: edits this build's spec or hash-chained evidence.
  - `[low]` `[reject]` Blind4 Bridge bound relaxed without root cause, hard-coded — the 20000ms bound under the unchanged 30000ms child timeout is exactly the operator-authorized recovery; a derived constant is extra complexity.
  - `[maybe-false]` `[reject]` carried Blind5 `Date.now()` vs monotonic clock — carried operator-recovery Blind1: no clock-step failure shown; a reproduction would settle it, low if true.
  - `[low]` `[reject]` Blind6 `dirname(dirname(path))` couples `launch` to `fixture` layout — `fixture()` in the same file creates `root/runtime.lsm/storymapper.sqlite`, the single caller pair is adjacent, and the deterministic suite passed three times.
  - `[low]` `[reject]` Blind7 root `test:audit-performance` duplicates the serial audit — the alias exists for the operator's deterministic command `corepack pnpm test && corepack pnpm test:audit-performance`; duplicate runtime is not a defect and removing it breaks that command.
  - `[false]` `[reject]` Blind8 audit gained/lost history findings unexplained — verified: the three dropped locations (`f7dcd001`, `398074f7`, `80e0ad4c`) are blob/tree hashes that `git rev-list --objects --all` no longer reaches from any ref (refCount 38 to 37); the report is regenerated scan output. This also settles the earlier Blind7 maybe-false.
  - `[false]` `[reject]` carried Blind9 audit report stale at `d93a298d` — carried prior I7/Intent3: the scan is rerun after final writes; staleness after a commit is declared in this spec.
  - `[low]` `[reject]` carried Blind10 guide recipe is a pinned fixture, not generic — carried prior Blind3.
  - `[low]` `[reject]` carried Blind11 POSIX-only recipe vs cross-platform claims — carried prior Blind4: the guide names it a POSIX recipe and disclaims native acceptance.
  - `[low]` `[reject]` Blind12 rehearsal history in a public guide — the intent requires distinguishing isolated-Agent reproduction from human validation; no reader harm named.
  - `[false]` `[reject]` carried Blind13 OpenWolf wording contradicts do-not-edit rule — carried prior Blind6: the guide never instructs hand-editing hook-maintained files.
  - `[false]` `[reject]` Blind14 epic-preparation acceptance rule weakened — the replacement text states that the retrospective assesses integrated acceptance against independent delivery evidence; the stale "done rows establish delivery" claim was the defect the intent names.
  - `[low]` `[reject]` Blind15 `docs/bmad-loop.md` duplicated sentence, preflight-before-login, line 138 — duplication is cosmetic; step 1 explicitly says to log missing authentication; line 138 sits in a local-policy example and line 180 now directs readers to check the actual local policy.
  - `[low]` `[reject]` Blind16 evidence tree large for a one-sentence fix — the intent requires retained hash-chained evidence; pruning breaks `retention.json`.
  - `[low]` `[reject]` Blind17 README link placement and blank-line spacing — cosmetic.
  - `[false]` `[reject]` Edge1 child socket path may exceed the Unix limit under nested TMPDIR — the owned root is `mkdtemp` under `tmpdir()` plus a fixed suffix, and the suite passed in the default environment (361.916s) and three further runs; the nested path is shorter than the failing inherited case.
  - `[false]` `[reject]` Edge2 frontmatter vs line 226 — same as Blind1.
  - `[false]` `[reject]` Edge3 audit rows dropped — same as Blind8.
  - `[low]` `[reject]` Edge4 `docs/bmad-loop.md:138` unqualified — same as Blind15.
  - `[low]` `[reject]` carried Edge5 shallow/single-branch clone lacks pinned revision — carried prior Edge6: `git switch --detach` fails loudly and the prose says to stop.
  - `[low]` `[reject]` VerGap1 root alias has no caller — the caller is the operator's deterministic command; same as Blind7.
  - `[false]` `[reject]` Intent1 tests exercise a timing assertion, not the prose — descriptive; carried prior Intent5: the intent requires a documentation rehearsal and manual link/command validation, not automated prose tests.
  - `[false]` `[reject]` Intent2 `runtime-lifecycle.test.ts` change outside named surfaces — the spec's "Deterministic verification repair" section records the user-supplied failing-verification feedback that requested exactly this repair.
  - `[false]` `[reject]` Intent3 root `package.json` alias not in the contract — same authority as Intent2; an alias, not a product feature.
  - `[low]` `[reject]` Intent4 spec version 5 vs guide version 6, mixed dates — separate documents with their own version lines; cosmetic.
  - `[false]` `[reject]` Intent5 README release claim rests on runbook, not tests — documentation claim from Story 8.8; hosted execution is stated as unverified.
  - `[false]` `[reject]` carried Intent6 only isolated-Agent evidence, no outside human — carried prior Intent6: the intent requires the distinction, not a human trial.
  - `[false]` `[reject]` Intent7 recipe repaired until it ran — failures and original results are retained distinctly; no first-try claim exists.
  - `[false]` `[reject]` carried Intent8 publication freshness not visible in diff — carried prior I7/Intent3: freshness is an executed command after final writes.

## Auto Run Result

Status: done. Second follow-up review pass converged: zero patches, zero deferrals, no code change in this pass.

- Implemented (cumulative, unchanged by this pass): English walkthrough `docs/agentic-coding.md` with links from `README.md`, `CONTRIBUTING.md`, `docs/bmad-loop.md`, `docs/bmad-epic-preparation.md`; contradictory release/isolation/done-row claims repaired; sanitized rehearsal evidence under `evidence/story-8-9/`; runtime-lifecycle fixture TMPDIR isolation, root `test:audit-performance` alias and the operator-authorized 20000ms Bridge bound; refreshed `publication-audit.json`.
- Files changed this pass: this spec only (triage log, this section, frontmatter), plus the publication report rescan and hook-maintained `.wolf/` bookkeeping.
- Review findings: 31 rows, zero patches, zero deferred, 31 rejected with the recorded reasons above (15 low, 15 false, 1 maybe-false).
- Follow-up review recommended: false. This pass patched no `high`; the work has converged.
- Verification: no code or documentation patch was applied, so the retained passing results stand (aggregate 688.920s, standalone verifier 55.426s, deterministic command 361.916s, all under Node24.17.0/pnpm9.15.4). This pass re-checked by reading source: the dropped audit locations are unreachable from any ref, the `caaaadca…` audit location is the blob of `runtime-lifecycle.test.ts` whose home-path-like strings are pre-existing fake redaction fixtures, and the Bridge bound stays below the 30000ms child timeout.
- Residual risks: native Windows/Linux, hosted, outside-human, private declarations, history/privacy/rights and provenance obligations remain unverified; the publication report records the pre-commit candidate and needs a rescan after any later history change. `sprint-status.yaml` stays orchestrator-owned and uncommitted.

## Design Notes

A doc-only manual rehearsal avoids tool account prerequisites and unauthorized unattended dispatch. It reproduces an actual stale sentence rather than invented product behavior. Use a disposable independent clone/branch and local dependency installation or explicitly recorded native-compatible offline provisioning; do not imply cloned ignored installations or trust/auth are present. Independent participant review may be another fresh Agent. An unexecuted external human/hosted trial remains a limitation, not fabricated evidence. Reuse existing audit and quality tools; no new generic runner/framework needed.

## Verification

Use installed Node24.17.0 on PATH with pinned pnpm9.15.4. Serialize build/check commands to avoid shared-output races.

- Validate local Markdown links/anchors and named paths against tracked inputs; validate operational CLI flags read-only using actual help/source. Check draft/final walkthrough manually against the AC and retained participant steps.
- `git diff --check` — success for main and disposable patch.
- `corepack pnpm check` — disposable final candidate and independently parent main final candidate must pass; retain counts/exits and command-start source/index fingerprints. Run no unnecessary app/browser/login workflow for documentation changes.
- `node scripts/verify.mjs` — parent standalone verifier passes.
- `node scripts/check-publication.mjs --scan --policy /tmp/story-8-7-policy.json`, then same without --scan — expect sanitized blocked verdict from retained real prerequisites, with matching recomputed current report, not stale/error refusal. Retain safe report digest/scope/revision and exits. Rescan after final spec/handoff/index writes.
- Compare protected working/index hashes independently with `/tmp/story-8-9-protected.json`; report external drift without undoing it.

## Changelog

- 2026-10-21 v5: Preserve the failed attempt, recover the parked spec, apply the user-authorized20s Bridge assertion and independently pass deterministic/aggregate/standalone gates; prepare reset-free review continuation.

- 2026-10-21 v3: Repair deterministic runtime fixture cache isolation and root audit invocation; preserve failed attempts, order noninteractive preflight before login, and independently reverify without changing the frozen contract.

- 2026-10-21 v2: Complete repaired guide, fresh plan-first rehearsal, independent review, final local gates and exact publication rescan; retain original failures, provenance repairs and publication limits.

- 2026-10-20 v1: Investigated contributor walkthrough, genuine isolated rehearsal, current tool prerequisites and final audit boundaries.

## Verification evidence before final post-review run

The first independent parent main aggregate exited0 in691.523s and standalone verifier in55.254s under Node24.17.0/pnpm9.15.4. All3328 source inputs, semantic/raw index and HEAD matched command-start/end records. Parent independently verified76 scoped links and original retention hash chains. Evidence: evidence/story-8-9/parent-verification.json and its logs/snapshots.

Four fresh review lenses yielded19 rows:11 medium patch rows in8 groups, one rejected low convenience and7 individually refuted findings. The baseline correction exactly matches the original pre-participant diff digest; original miscapture remains historical. Guide v4 includes short-path provisioning, pre/post/export manifests, restaging and required bookkeeping.

A fresh context-free CLI participant followed v3 without prior checkout/tmp pointers, planned before claim investigation, obtained a fresh independent review and included required OpenWolf changes. It independently diagnosed a second environment issue: inherited long macOS temporary parent caused16 tsx IPC listen EINVAL version-fixture failures. Its short-parent replay passed the entire aggregate in689s (223 root passes/two inherited skips,3159coverage/all eight floors,14audit,261a11y). Original/retry results remain separate; this same-author environment retry is not fresh rediscovery. Guide v4 incorporates the equivalent literal short-parent recipe; byte-identical v4 participant execution is not claimed. Parent verified100 author artifact hashes, working/semantic start/end/export identities, protected bytes and exported-patch reverse-check. Evidence: evidence/story-8-9/fresh-replay/retention.json.

Final parent post-review checks and exact publication rescan follow these writes. No external-human, hosted or additional native acceptance is inferred.


## Deterministic verification repair — 2026-10-21

The user resumed this in-progress spec after deterministic verification failed. Authoritative feedback: `.bmad-loop/runs/20261019-231402-3e0a/feedback/8-9-agentic-coding-reference-material-2.md`. The failed command was `corepack pnpm test && corepack pnpm test:audit-performance` under Node24.17.0. The server test `cleans owned startup state after failed port publication while preserving the foreign port file` in `apps/server/src/runtime-lifecycle.test.ts:378` timed out at5000ms. Diagnose and repair the actual failure without changing the frozen intent or weakening assertions/deadlines. Preserve existing documentation/evidence and all orchestrator bookkeeping. Graph tools are unavailable in this session. Baseline remains the current canonical HEAD above. Parent captured independent protected working/index and contract hashes in `/tmp/story-8-9-repair-protected.json`. Retain original verification failures distinctly from new results.

## Repair verification before terminal finalization

The independent Node24.17.0/pnpm9.15.4 deterministic command `corepack pnpm test && corepack pnpm test:audit-performance` passed in361.916s with the default temporary environment. Independent aggregate passed in689.779s and standalone verifier in55.466s:223 root passes/two inherited skips,3159 workspace coverage tests/all eight floors,14 audit and261 accessibility tests. All3440 captured inputs, semantic/raw index and HEAD matched before/after. Original supplied timeout feedback remains unchanged; implementing diagnostic summaries do not claim complete retained raw failure streams. Evidence: evidence/story-8-9/repair-parent-verification.json and separately hashed compressed logs/snapshots.

The subsequent two documentation-only review corrections require final post-patch aggregate/verifier results, recorded separately rather than overwriting this successful run. The application/test implementation stays identical. Parent final rescan follows terminal metadata and intended index writes.

## Previous Auto Run Result (historical)

Status: done. Deterministic repair and post-review local verification passed; publication remains blocked by the existing maintainer prerequisites.

- Implemented: runtime child fixtures use their existing owned temporary root for TMPDIR/TMP/TEMP, with normal caching, unchanged5000ms deadline and original cleanup assertions. The root audit command forwards to the existing serial server suite. No application behavior changed.
- Files: apps/server/src/runtime-lifecycle.test.ts (fixture isolation), package.json (audit forwarding), docs/agentic-coding.md (preserve each retry's evidence), docs/bmad-loop.md (noninteractive-first setup), evidence/story-8-9/repair-* (separate diagnosis/review/verification records), this spec and required OpenWolf bookkeeping.
- Review:17 findings; two independent medium patches, zero high/low patches, zero new deferrals and15 individually rejected rows with reasons above. Four fresh read-only lenses completed before triage. No second full post-patch review is claimed.
- Follow-up review recommended:true from two medium patch entries on this resumed first-pass review. Specific unverified risk: a fresh contributor has not executed the revised v6 retry-archiving/preflight instructions end to end. Historical fresh-v3/same-author-retry evidence retains its exact version and author boundaries; no final-v6 participant or outside-human trial is claimed.
- Verification: independent exact deterministic command passed in361.916s in the default temporary environment. After the two documentation patches, independent aggregate passed in688.920s and standalone verifier in55.426s:223 root passes/two inherited skips,3159 coverage tests/all eight floors,14 audit and261 accessibility tests. All3451 command-start inputs, semantic/raw index and HEAD matched command-end records. Logs have independently checked original/sanitized/compressed hash fields. Original implementing diagnostic streams were not fully retained; the summary and supplied failure feedback are not represented as a complete raw failure log.
- Scoped inspection:47 local links/heading fragments in the five contributor documents resolve. Source implementation/tests were read; every launch caller uses the existing owned fixture root. Frozen intent and protected working/index hashes match this repair's start snapshot. Earlier orchestrator drift is not undone or judged as a defect.
- Finalization: reviewed intended paths are prepared in the index. The frozen contract and global explicit-commit policy override generic workflow commit/clean-tree instructions: no main-repository commit, tag, push, release, remote PR, login, user-Project action or tracking mutation. Existing orchestrator changes are preserved.
- Publication: final scan and independent recomputation run after these terminal metadata/index writes. publication-audit.json is authoritative; expected exit1 means retained unresolved prerequisites, not a waived quality failure. The terminal tool result records the actual report digest and matching candidate. Later changes or commits require another rescan. Native Windows/Linux, hosted, reader, credential, interrupted-push, private declarations, history/privacy/rights and provenance obligations remain unverified.

## Authorized recovery — 2026-10-21

Recover this existing implementation; do not repeat the historical documentation rehearsal. Restore the exact parked spec before editing, retain all prior failures and review evidence. The latest orchestrator verification failed scripts/app-version.test.mjs at the ten-second Bridge elapsed-time assertion (test duration approximately10.48s), after typecheck/lint passed. The user explicitly relaxes this timing constraint: use20000ms, retain the30000ms subprocess timeout and all exit/message assertions. Run the focused test, current deterministic commands, aggregate and standalone verifier. Recompute the publication report after final candidate writes; retained publication blockers remain blockers. The user separately authorizes continuation of the actual loop after successful verification/preflight; this is not a prose-verification dispatch. Do not touch sprint-status.yaml or deferred-work.md.
