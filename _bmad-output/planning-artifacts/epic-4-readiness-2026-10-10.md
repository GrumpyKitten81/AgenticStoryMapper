# Epic 4 implementation readiness

Reproducing statement: Check every Epic 4 story against the PRD, architecture, UX, current source/tests and Epic 3 escalation evidence; close specification gaps before unattended bmad-loop execution. Date: 2026-10-10. Version: 3. Changelog: All explicit policy decisions resolved; optional Agent self-approval and protection precedence accepted, source plans reconciled, specification verdict PASS.

## Verdict

**PASS — no identified specification blocker remains; implement in dependency order.** No loop was started and no sprint statuses were changed. All 13 stories are still `backlog` in the orchestrator-owned tracking file; this report assesses specification readiness, not implementation completion.

The maintainer confirmed local-human approval of own UI proposals, with Agent approval disabled by default, and requested a human-controlled Project flag `allowAgentApproval` to permit Agent approvers. Story 4.6 includes contracts/migration/settings UI and conditional MCP capability work for this flag. Both answers are now explicit: enabled Agents may approve their own proposals, and protection always prevents Agent apply. PRD, architecture, UX, Story 4.6 and accepted ADR 0004 agree. This is a planning-readiness judgment, not a guarantee against implementation defects or a claim that runtime acceptance has passed.

## Confirmed decisions

1. Newly generated command ChangeSets may apply automatically with protection off. Stored proposals require approval under the Project policy (human-only by default); proposal generators remain proposal-only.
2. Story 4.13 runs five browser-controlled simulations instead of recruiting real users. Simulations establish functional workflow evidence, not external demand.
3. Keep slicing lean: built-in happy path, generic Release/assignment operations, and read-only release notes. BMad supplies other strategies.
4. Note provenance means a free-text origin note.
5. Local database changes are atomic; files are prepared outside the transaction, and retained file/remote effects are reported explicitly. GitHub push keeps confirmed Dry Run. Binding decision: `docs/adr/0003-changeset-file-and-remote-effect-boundary.md`.

6. Own UI proposals may be approved by the local human. Optional Agent approval through a human-controlled Project flag is disabled by default. Enabled Agents may self-approve; protection still blocks Agent apply. See accepted ADR 0004.

## Story assessment

“Conditional” means implementable after its named predecessors, not ready to run out of sequence. All executor consumers have a resolved approval contract.

| Story | Original gap and recorded correction | Specification state |
| --- | --- | --- |
| 4.1 Import | Impossible cross-Project identical ids versus document-scoped ids; missing deduplication scope and locator cases. Same document/locator is deterministic; different Projects have distinct identities; deduplication is per Project/type/hash with concurrent re-import coverage. Inline-only MCP retained. | Ready |
| 4.2 Provenance | “Note” type, last-link removal and historical creation origin unspecified. Typed chunk/GitHub/free-text provenance; original actor determines manual/inference; historical missing evidence is displayed honestly. | Conditional on 4.1 |
| 4.3 References | Repeated identical set versus uniqueness rejection; scope validation and initial sync baseline unspecified. Identical set is unchanged, conflicting binding refused, real scope checked, initial version captured and only the addressed system's baseline advances. | Ready |
| 4.4 Core registry | Removal of old executor semantics precedes replacement in 4.6; local aliases can mask existing owners. Duplicate-logic deletion moved to 4.6; supported selectors/payloads/owners and sequential alias rules required. | Conditional on 4.3 |
| 4.5 Remaining registry | Source import, existing relationship writes, View Settings and copy/import operations missing; universal parity recursively includes lifecycle/admin; approved outdated rows remain executable. Catalog uses current manifest and explicit exceptions; incompatible pending rows become schema-stale. Future Card dependencies remain owned by 5.1. | Conditional on 4.4 |
| 4.6 Executor | Auto-apply versus stored approval, self-approval, file/audit atomicity, repeated-root conflicts, deselection/replay and snapshot semantics. Most clarified in shared contract and ADR; own UI approval and optional Agent self-approval are allowed; protection always blocks Agent apply. | Conditional on 4.5 |
| 4.7 Tool routing | Baseline falsely says tools bypass use cases; handler source check does not prove routing; nested proposal/apply recursion and GitHub initiator attribution unspecified. Baseline corrected; real MCP/HTTP acceptance required with original initiator and safety checks after awaits. | Conditional on 4.6 |
| 4.8 Submission | Default apply and actual owner validation omitted. Shared command default, one protected proposal, preserved metadata and sequential local refs now explicit. | Conditional on 4.7 |
| 4.9 Preview | Literal equality conflicts with allocated ids/keys/time; Conflict status absent; non-Card operations not reviewable; UX silently skips conflicts and partly executes stale schemas. Semantic comparison, conflict invalidation, explicit selection and schema resubmission aligned with UX. | Conditional on 4.8 |
| 4.10 Slicing/notes | Three unimplemented strategy algorithms unspecified; first Release chosen silently; “completed” and output ordering unclear. User chose generic supplied cuts plus existing happy-path heuristic; explicit target Release, `done` Workflow group, stable grouped notes. | Conditional on 4.7 |
| 4.11 Delivery | Reference scope, duplicate targets, status ownership, protected call and per-Card audit semantics missing. Scoped resolution, max 100 unique targets, per-Card operations, atomic conflicts and addressed-system baseline specified. | Conditional on 4.7 |
| 4.12 BMad | Step/Release identities missing; removed human-edited Cards and unchanged re-run unspecified; changed source links and ownership unsafe. Stable ids, map/system-bounded archive matching, conflict-before-archive, immutable document re-import and no title guessing specified. | Conditional on 4.8–4.11 and requires 4.1–4.3 |
| 4.13 Validation | Self-dependency, real-user recruitment, undefined measurements and forward dependency on Epic 5 drift. User chose five real-browser simulations; explicit scenarios/evidence/measurement and fixture-source adjustment; no future drift feature or recruitment dependency. Historical key retained. | Conditional on 4.12; browser capability required at execution |

## Lessons carried forward from Epic 3

- Resolve measurable gates before development: apply includes pre-apply snapshot, database/history and audit work. Preserve the AD-18 nominal 2-second/2x CI budget; preview's 500 ms and status-call's 2 seconds remain separate measurements. Do not invent a relative-overhead gate or silently relax failures.
- Root versions and history use the accepted AD-7/ADR 0002 model. A repeated-root batch compares the transaction-start baseline, not its own intermediate writes. Do not infer implementation evidence from sprint rows or stale handoff history.
- Verify real transport behavior, persisted actor/session identity, scope refusal, permission flips after awaits, rollback/audit failures, replay and live update. Source inspection and green handler-only tests cannot prove universal ChangeSet routing.
- Leave `.wolf` hook output recognizable as session bookkeeping; do not treat it as an unrelated dirty-tree escalation. Do not modify the orchestrator's sprint/deferred ledgers during story development.
- Keep performance runs serial and separate from competing builds/tests. Keep failed measurements and distinguish simulated browser acceptance from real-user validation.

## Source evidence and limits

Planning checked: `epics.md` (all 13 Epic 4 stories), current PRD, architecture AD-3–10/17/18/22/23, UX review/conflict states, Epic 3 retrospective and remediation spec, sprint/deferred ledgers.

Implementation verified in source: importers and their Markdown/TXT tests; source repository and source ownership regression; shared source/ChangeSet use cases; current untyped operation/status contracts; five-key repository executor plus tool proposals; actual proposal approval tests; existing first-12 happy-path implementation; current capability manifest; `localHumanActor`.

The requested graph MCP tools are unavailable in this session; scope was narrowed through the file index and focused source/test reads. No test suite or browser simulation was run: this change updates planning only. Existing DW-52/54 human file-authority/size concerns remain separate deferred scope and are not falsely reported fixed by inline-only MCP or the file-atomicity decision.

Verification: 13 unique story keys and acceptance blocks, completed approval/protection policy across all current artifacts, accepted ADR status, current source/context references, and unchanged application/sprint/deferred paths passed textual checks. `git diff --check` passed. Future deliverables are not required to exist before their story runs.

## Before dispatch

1. Policy decisions and textual consistency are complete; specification states above are conditional only on implementation predecessors.
2. Fresh Epic 4 developer context is compiled in `_bmad-output/implementation-artifacts/epic-4-context.md`.
3. Follow the recorded dependency order and run the repository's Node 24/Claude preflight immediately before any authorized loop run. Starting the loop is not part of this audit.
