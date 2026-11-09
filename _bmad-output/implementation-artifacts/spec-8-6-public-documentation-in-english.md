---
title: '8.6 Public documentation in English'
type: chore
created: '2026-10-20'
status: done
baseline_revision: 3e761f7deb60fc0c12639995ff801fdfcfc5a990
review_loop_iteration: 0
followup_pass: true
followup_review_recommended: false
context:
  - AGENTS.md
  - .cursor/rules/markdown.mdc
  - .wolf/OPENWOLF.md
  - _bmad-output/implementation-artifacts/story-plan-8-6-public-documentation-in-english.md
  - _bmad-output/implementation-artifacts/epic-8-preparation.md
warnings: [oversized]
deferred:
  - summary: >-
      Native Windows and Linux fresh-checkout quickstarts remain unverified.
    evidence: |-
      This host is native macOS. Docker daemon is unavailable and macOS PowerShell is not native Windows. Need actual fresh-checkout setup/start/health/browser/stop results on each missing OS; CI/source tests are insufficient.
    location: >-
      README.md:Quickstart
    severity: medium
  - summary: >-
      Native macOS visible/rendered browser acceptance remains unverified.
    evidence: |-
      Genuine OS opener and HTTP HTML/JS/CSS probes succeeded, but CUA reported cgWindowNotFound and no accessible application tab. Need a native visual browser observation; no screenshot/UI pass is claimed.
    location: >-
      evidence/story-8-6/native-browser.json
    severity: medium
  - summary: >-
      Review confirms full three-platform and native visible-browser acceptance is still outstanding.
    evidence: |-
      I3: macOS setup/start/health/assets/stop and opener dispatch passed; Windows/Linux execution and macOS rendered-window observation were unavailable. Obtain exact native results on each required surface. This review does not close the two previously recorded verification prerequisites.
    location: >-
      README.md:Quickstart and evidence/story-8-6/native-browser.json
    severity: medium
  - summary: >-
      No automated gate keeps README/RUNBOOK links, anchors and English text from regressing.
    evidence: |-
      Gap reviewer: check_links.py is a retained one-off; scripts/check-hygiene.mjs non-English scan excludes README.md and docs/. The story forbids gate changes, so adoption (Node test or check-hygiene extension) belongs to a later story.
    location: >-
      scripts/check-hygiene.mjs:8
    severity: medium
  - summary: >-
      .env.example sets PORT=4317, which disables automatic port selection when copied.
    evidence: |-
      Pre-existing product configuration file, untouched by this story; RUNBOOK and README now document the caveat. Changing the example is a configuration change the intent excludes.
    location: >-
      .env.example:2
    severity: low
---

# Story 8.6: Public documentation in English

Date: 2026-10-20. Version: 2.

Reproducing statement: Execute bmad-build-auto for 8-6-public-documentation-in-english, using subagents when needed; never write or revert orchestrator-owned sprint-status.yaml, and verify independently of its rows.

<intent-contract>

## Intent

**Problem:** README and RUNBOOK are German and contain obsolete operational claims, preventing new users from following accurate installation and local-operation guidance.

**Approach:** Rewrite both in concise English derived from current source/tests, repair links to removed files, and execute fresh-checkout quickstart validation on available supported platforms with precise retained evidence and explicit missing-platform acceptance.

## Boundaries & Constraints

**Always:** Use the actual installed Node24/Corepack/pnpm9.15.4 flow. Explain cooperative-Agent protection/access controls as guardrails, not a security boundary against local processes; link the architecture spine. Describe only implemented behavior, including Markdown/TXT import, four safety flags, reviewed ChangeSets, human remote confirmation, credential precedence, shared-runtime MCP, supported migration/refusal, Restore and portable archives. Use disposable generated state and sanitized environment for execution. Preserve exact full revision, OS/runtime, commands, observed setup/start/health/stop and native browser evidence. Distinguish inspected source, fixture tests, native observations and unavailable OSes. Keep required Markdown metadata English. Retain community/publication prerequisites and prior unverified hosted/native/reader obligations. Read global user rules and matching topic rules before edits.

**Never:** Write, stage, unstage or revert sprint-status.yaml; its done/awaiting-operator row neither needs fixing nor proves verification. Do not change deferred-work ledgers, product code, dependencies, gates, runtime behavior, agent instruction files, or broad historical translations. Do not read/copy user Projects, local .env or credentials into fixtures/evidence. No live provider operations, login prompts, tokens, private home paths or employer identifiers in public examples/evidence. No commit/push/tag/publication/history rewrite/settings or next-story dispatch. Do not claim full three-OS acceptance when environments are unavailable; record it as deferred verification. Story8.8 owns future release/tag commands; do not invent them.

</intent-contract>

## Code Map

- Entry HEAD `3e761f7deb60fc0c12639995ff801fdfcfc5a990`, clean main is the orchestrator's established in-place branch. Git metadata refresh succeeded. Code-review-graph tools unavailable; two investigators read source/tests. Entry hashes captured in `/tmp/story-8-6-baseline.json`; retain them in evidence for replay, not as a mandatory unchanged-state gate for external orchestrator updates.
- `README.md`, `docs/RUNBOOK.md` — rewrite current public surfaces; remove stale missing-UI claims, legacy privacy modes, env-first credentials and archives-as-future. Preserve useful accessibility scope/diagnostic limits and exact current CI names/configuration steps.
- `scripts/setup.mjs:8`, `runtime.mjs:11,51,83`, `start.mjs:6`, `launcher.mjs:95`, `processes.mjs:112`, `diagnostics.mjs:9` — setup frozen install/web build/default folder (DB created on start); start waits owned listening/health then OS opener; only --debug supported, no headless flag. Ctrl+C orderly owned shutdown. Process env then root .env then nearest upward server .env then defaults. Same Node24 for install/native runtime.
- `apps/server/src/config/runtime-port.ts:21,50`, `main.ts:64`, `scripts/runtime-port.test.mjs:14,55` — preferred4317 falls back when unset/busy; explicit occupied PORT fails. Actual URL/discovery, loopback only launcher. Dev Vite proxy targets fixed4317 (`apps/web/vite.config.ts:24`).
- `scripts/doctor.mjs:9`, `doctor.test.mjs:61`, `runtime.mjs:83`, `verify.mjs:28` — seven doctor checks (includes runtime discovery), read-only/no Project DB; bounded health discovery. Occupied configured port can fail doctor despite healthy running app. Quick verifier still runs accessibility/size/capabilities/hygiene.
- `apps/server/src/services/{credentials.ts:79,credential-file.ts:10}`, `credentials.test.ts:57,71,139` — CLI then user file then env; selected unusable source fails visibly. Windows %APPDATA%/StoryMapper/credentials.json, elsewhere ~/.config/storymapper/credentials.json; unencrypted outside Project, POSIX0600. No tokens in normal connection records. Human candidate token accepted only by consented Verify/Connect flow.
- `apps/server/src/application/connector/github-connect.use-cases.ts:33`, `services/connection-proof.ts:48` — Verify consent before credential/provider access, no connection/switch saved; separate unchanged-proof Connect saves candidate/config and enables GitHub. Changed inputs require Verify again; external file and SQLite effects are not one transaction.
- `packages/contracts/src/schemas/domain.ts:693`, `packages/db/src/repositories/projects-repository.ts:367`, `changesets-repository.ts:68,103` — Agent access on/GitHub off/protection off/approval off defaults. Approval precedes Apply; Agent approval needs human flag and Agent Apply needs protection off. Agent providers can receive retrieved context.
- `apps/server/src/application/sync/remote-push.use-cases.ts:14`, `services/remote-push-execution.ts:50,174` — human confirmation/resume, dry-run fingerprints/capabilities rechecked; new plan on drift, retained per-item outcomes. Restore cannot undo GitHub effects.
- `scripts/mcp-bridge.mjs:7`, `apps/server/src/mcp/http.ts:32`, `docs/mcp-tools.md` — running app /mcp Streamable HTTP; absolute runtime-dir/.port bridge, no DB; generated panel configs; identity initialize clientInfo.name. Remove stale discovery only after confirming no live owner.
- `packages/db/src/{migration-runner.ts:10,connection.ts:19,63,restore-project.ts:85,restore-points.ts:13,restore-point-files.ts:6}` and relevant tests — empty baseline, authenticated older release prefixes migrate with protected pre-migration snapshots; prototype/newer/divergent/invalid refuse. Preserve originals; matching release or supported snapshot into separate directory; prototype original app exports Markdown/TXT for fresh Project. Never edit journal/schema/recovery markers. Restore stages candidate, pre-restore point, new epoch, audit preserved; attachments are not rolled back. Interrupted recovery runs before startup. Snapshots live in sibling snapshots/.
- `apps/server/src/services/project-archive.ts:28`, `project-archive.test.ts:74,497` — human-only .lsm.zip export/import implemented; manifest/checksum/business DB/documents/attachments/exports, sync/remote state redacted. Still private data. Validate/migrate staged copy, new imported-uuid.lsm/fresh epoch and active switch; originals/current Project retained on failure.
- `CONTRIBUTING.md:34` — qualify default URL consistently; avoid unrelated policy edits.
- `docs/usability-report.md:52,129,135,179,185` — nine broken links to removed setup/start/verify.ps1; point labels/targets to current .mjs equivalents with a dated note distinguishing historical findings from current operations. Keep historical narrative intact. Tracked scan found695 Markdown files; ten `(URL)` template fields are authoring placeholders, not removed documents. Scan file links and relevant anchors across tracked Markdown, excluding code-fence examples and explicit placeholders; record findings/reasons rather than silently ignoring real failures.
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/workflows/ci.yml`, architecture spine — read-only reference except small contributor URL correction. Keep exact required Quality (ubuntu-latest/macos-latest/windows-latest) names, informational audit and pending hosted/protection activation. No release certification.

## Tasks & Acceptance

**Execution:**

- [x] `README.md` — concise English capabilities/limits, per-OS prerequisites and common fresh-clone setup/start/actual URL/stop, privacy/guardrails and current operating/community links.
- [x] `docs/RUNBOOK.md` — English source-accurate configuration/diagnosis, credentials/consent, MCP, reviewed remote workflow, storage/archive/Restore, supported upgrades/prototype refusal and recovery. Preserve CI required-check names/configuration instructions and pending evidence honestly.
- [x] `CONTRIBUTING.md`, `docs/usability-report.md` — correct default URL caveat and removed-script links, with minimal metadata/changelog updates; repair any additional actual removed-document links found by tracked scan.
- [x] `_bmad-output/implementation-artifacts/evidence/story-8-6/` — retain replayable sanitized validation and fresh-checkout evidence (including failed attempts). Run actual setup/start/health/UI/stop on native macOS using clean cloned tracked input and real OS browser opener, without copied node_modules/.env/user state. Record revision and documentation overlay if uncommitted. Record unavailable Windows/Linux explicitly; macOS pwsh and unavailable Docker daemon do not establish those OSes. Clean only owned processes; retain disposable state safely outside repo.

**Acceptance Criteria:**

- Given README/runbook, when a new user reads them, then both are English, current per-OS setup/start is actionable, the actual URL is used and source-verified operations/recovery match implementation.
- Given the README Agent section, when inspected, then it states the cooperative guardrail limit and links the current architecture spine.
- Given a fresh checkout on Windows/macOS/Linux, when documented quickstart runs, then setup/start/health/stop and native browser outcomes are recorded per OS; absent environments remain explicitly unverified and do not establish full story acceptance.
- Given tracked documents linking removed files, when the link/anchor scan runs, then actual document targets resolve, and intentional examples/unrelated pre-existing anchors are reported separately with reasons.
- Given final evidence, when reviewed, then it contains no credentials/user data/private home paths, records actual commands/revision/outcomes, preserves publication prerequisites and reports protected hashes without mutating orchestrator files.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass

- Four fresh-context lenses ran at the session model capability, sequentially because additional concurrent launches returned agent thread limit reached. All layers were launched before triage. Edge-case and verification-gap returned zero findings. Intent descriptions are recorded individually below; blind floor arithmetic is not a finding.
- verdicts: 19 findings — high 0, medium 10, low 4, false 5, maybe-false 0. Ten blind rows, six intent-divergence rows, three parent findings (two evidence provenance, one new-helper instruction compliance).
- findings, in reporting order:
  - `[medium]` `[patch]` B1: Imported Project reopening absent — archive switch changes the current handle, while startup reads configured/default DB; add returned-path and startup selection guidance. P1.
  - `[medium]` `[patch]` B2: Restore scope could imply selected Project only — executeRestore replaces the active DB file; state every contained Project is affected. P2.
  - `[medium]` `[patch]` B3: Snapshot permanence implied — restore-point-files retains10/class then prunes toward1GiB with protected points; explain pruning and non-permanent backup status. P3.
  - `[medium]` `[patch]` B4: Untracked target accepted — direct canonical-root probes show ignored.md resolved and ignored.md#private intentional; require tracked targets without reading ignored data. P4.
  - `[low]` `[patch]` B5: Blanket root/template exemption — direct probes show /missing.md and {mistyped.md intentional; narrow intentional examples to recognized URL authoring placeholders and report unexpected forms. P5.
  - `[medium]` `[patch]` B6: Unbounded replay subprocess — subprocess.run has no timeout; stalled install can hold unattended replay without result. Add finite bound and retained timeout outcome. P6.
  - `[low]` `[patch]` B7: Cleanup starts after spawn/thread/report operations — start returns only after thread.start/save, before caller finally; an exception can orphan owned launcher. Establish cleanup immediately after spawn. P7.
  - `[medium]` `[patch]` B8: Stop timeout loses evidence — process.wait timeout escapes before stop/hash save. Retain failed result and clean only owned process resources. P7.
  - `[medium]` `[patch]` B9: Failed stop postconditions still succeed — final print exits0 after false health/discovery checks or nonzero launcher. Fail replay on failed stop assertions. P8.
  - `[medium]` `[patch]` B10: Replay overwrites evidence — fixed report/log names reuse occupied evidence directory. Refuse occupied destination before writes. P9.
  - `[false]` `[reject]` I1: Broader all-public-history translation differs — binding prepared story explicitly limits translation to README/runbook and excludes broad historical translation; historical note/link repair preserves intended scope.
  - `[false]` `[reject]` I2: No new reader followed the prose — the story requires executing documented commands per OS, not recruiting a new human reader; no new-reader usability test is claimed.
  - `[medium]` `[defer]` I3: Full native platform/browser surface unverified — actual macOS setup/start/health/assets/stop and opener dispatch do not establish Windows/Linux or visible UI. Environment prerequisites predate this change; record native execution/observation needed without claiming full acceptance.
  - `[false]` `[reject]` I4: Every documented operation was not rerun — this is a source-verified documentation change with no product change; source-map explicitly labels test-source inspection, and native/gate results do not claim credential/provider/recovery suite execution.
  - `[false]` `[reject]` I5: No full rendered/external link validation — story requires repaired removed-document references, and the checker states local scope; no specific external/rendering failure was filed. Concrete local helper defects are B4/B5.
  - `[false]` `[reject]` I6: Artifact diff cannot establish invocation/ownership — parent executed the renderer once and followed its emitted workflow; independent checks avoid sprint-row inference. This describes an evidence limit without a defect or claimed diff-only workflow proof.
  - `[low]` `[patch]` P10: Native overlay versions differ — native-browser final RUNBOOK hash differs from later source-map/current bytes; preserve historical copied hashes and label later documentation-only versions separately. P10.
  - `[medium]` `[patch]` P11: Sanitized log provenance missing — native-start strips request/runtime fields yet reports hashes without labeling sanitization/original-hash availability; declare transform and exact retained provenance without inventing original bytes/digests. P11.

  - `[low]` `[patch]` P12: New replay helper shares mutable module state — main declares invocation state global and probes mutate it; pass invocation context explicitly to isolate calls and comply with global user dependency-injection rules. P12.

- All13 patched rows resolved through12 entries:9 medium and3 low. P1–P3 clarify operational consequences; P4/P5 tighten tracked targets and expose one additional historical ignored-feedback link, converted to an explicit local-only path without reading it. P6–P9 bound and preserve replay failures/cleanup, fail stop postconditions and refuse occupied destinations. P10/P11 preserve original observations and label later candidate/sanitization limits. P12 removes shared mutable invocation state. Nine focused disposable probes passed independently in the parent after all helper repairs. No intent/spec loopback was needed: these corrections add no public surface.
- One review deferral entry (I3) supplements two previously recorded platform/visual prerequisites; five individually refuted intent descriptions are rejected above. Follow-up review recommended because9 medium entries were patched, with unverified native cleanup/browser and reader-facing recovery risks retained.

### 2026-10-20 — Review pass (follow-up)

- Four fresh-context lenses ran in one parallel launch (blind floor N=10 from the 200.6 kB diff; blind, edge-case, verification-gap and intent-alignment all reported). Rows already in this log were carried where the claim repeated. Orchestrator-owned sprint-status.yaml and deferred-work.md edits appear in the diff but were not written by this run.
- verdicts: 38 findings — high 0, medium 2, low 30, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: sprint row `done` contradicts spec status — orchestrator-owned row; intent says it neither needs fixing nor proves verification, and this run did not write it.
  - `[low]` `[reject]` Blind: story numbers/BMAD evidence paths in public docs — Story 8.8 ownership and retained evidence links are required by the intent; wording is cosmetic.
  - `[low]` `[patch]` Blind: `doctor` referenced in README but never introduced — README now names `node scripts/doctor.mjs` as read-only diagnostics.
  - `[low]` `[reject]` Blind: no consolidated known-limits section — limits are stated where they apply; restructuring is cosmetic.
  - `[false]` `[reject]` Blind: `corepack@0.35.0` pin unsupported — same pin is used in `.github/workflows/ci.yml:27,51` and `CONTRIBUTING.md:20`.
  - `[low]` `[defer]` Blind: `.env.example` `PORT=4317` trap documented, not removed — pre-existing config file; recorded in `deferred`.
  - `[low]` `[reject]` Blind: imported-Project/recovery guidance not actionable — `localPath` is shown by `ProjectArchivePanel.tsx:73`, `.port` location is defined in RUNBOOK line 53; snapshot-file selection detail was already tightened in P1–P3.
  - `[low]` `[reject]` Blind: no durable-backup instruction — archives redact sync state and are not a full backup; the snapshot-not-permanent warning is the accurate claim.
  - `[low]` `[patch]` Blind: `check_links.py` gaps — only the reason-less `missing_files` row is a direct defect; fixed (see Edge `inspect_link`). Setext/front-matter and parenthesis cases only add or skip anchors on already scanned files with 0 findings.
  - `[low]` `[reject]` Blind: evidence volume and normalized log — retained deliberately for replay; exclusion rules would be a gate change.
  - `[false]` `[reject]` Blind: German remains in usability-report — broad historical translation is excluded by the intent.
  - `[low]` `[reject]` Blind: closed 8-3 spec edited for link repair — intent requires repairing links to removed files; frozen-record wording cosmetic.
  - `[low]` `[reject]` Blind: spec count/typo inconsistencies — fix would edit this build's spec.
  - `[low]` `[reject]` Blind: README/RUNBOOK changelogs reduced to a Git-history pointer — intended rewrite.
  - `[low]` `[reject]` Edge: native-quickstart observe stdin EOF — run records no visual acceptance in any case.
  - `[low]` `[reject]` Edge: partial `.port` JSON in probe_ready — wrapped by main handlers; transient and unlikely.
  - `[low]` `[reject]` Edge: non-ok health busy loop/connection reset — bounded by the 45 s deadline.
  - `[low]` `[reject]` Edge: stopped_health ConnectionResetError — refused connection is the stopped case; reset after stop is unlikely.
  - `[low]` `[reject]` Edge: argv usage message — cosmetic.
  - `[low]` `[reject]` Edge: hardcoded /tmp and sw_vers — helper is the labelled macOS run; Windows/Linux runs remain deferred.
  - `[low]` `[reject]` Edge: descendants after successful run — launcher owned-group stop is already retained and cleaned.
  - `[low]` `[reject]` Edge: nested badge/parenthesis links — no such links in the scanned tree (0 findings).
  - `[low]` `[reject]` Edge: case-variant anchors — strict match is intended; no case variants in the tree.
  - `[low]` `[patch]` Edge: locale-default encoding in check_links — `read_text(encoding='utf-8')` set at both reads.
  - `[low]` `[patch]` Edge: `missing_files` row lacks reason — reason added.
  - `[low]` `[reject]` Edge: unclosed fence/comment handling — no instances in the tree.
  - `[low]` `[patch]` Edge: RUNBOOK stale `.port` check not concrete — now names no `/health` answer at the recorded host and port.
  - `[low]` `[reject]` `carried` Edge: native overlay RUNBOOK differs from final bytes — carried P10; hashes labelled historical.
  - `[false]` `[reject]` Edge: deferred-work ledger edited — orchestrator-owned entries generated from spec `deferred`; not written by this run.
  - `[low]` `[reject]` Edge: 396 vs 397 resolved counts — fix would edit this build's spec; replay now reports 396.
  - `[low]` `[reject]` Edge: README/RUNBOOK changelog deletion — duplicate of Blind row.
  - `[low]` `[reject]` Edge: manual `.env` ignore checks removed — `verify.mjs`/hygiene cover them.
  - `[medium]` `[defer]` Gap: no automated gate for doc links/English text — gate changes are excluded; recorded in `deferred`.
  - `[low]` `[reject]` Gap other: 8-3 changelog formatting — cosmetic.
  - `[false]` `[reject]` Intent: sprint-status, deferred-work and 8-3 edits outside footprint — first two are orchestrator-owned, 8-3 is a link repair.
  - `[low]` `[reject]` `carried` Intent: native overlay used a pre-rewrite RUNBOOK — carried P10/P11.
  - `[false]` `[reject]` Intent: spec `in-review` versus sprint `done` — orchestrator bookkeeping, not proof.
  - `[medium]` `[defer]` `carried` Intent: macOS evidence is HTTP-level, no visible UI; Windows/Linux unavailable — carried I3 and the two existing deferred entries.

## Verification

Use installed Node24 (on this host prepend its bin to PATH; record versions without private home paths).

- Fresh-checkout macOS procedure above; record Windows/Linux unavailable. No user-interactive authentication or provider calls.
- Replay tracked Markdown file-link/anchor validation; inspect English and operational claims against source/tests. Save reusable checker/report in story evidence if useful; no product test scaffolding.
- `corepack pnpm check-hygiene` — stage only owned new inputs first; pass tracked scan.
- `node scripts/verify.mjs --skip-typecheck --skip-build` — pass required quick gates; no product behavior change warrants full rebuild/typecheck/test aggregate beyond fresh setup build.
- `git diff --check HEAD` — whitespace clean; compare sprint worktree/index hashes with entry and report external differences without restoring.

## Verification Results

Final repaired candidate: nine parent helper probes pass, strict tracked-link scan passes (696 Markdown files;396 resolved targets/anchors,31 external links not fetched,10 exact URL authoring placeholders;0 missing/invalid targets or anchors), hygiene passes and quick verifier passes in21.814s including138capabilities/261accessibility tests. All four Python sources parse with functions within50lines. A whitespace-only failure on retained pnpm log trailing blank lines was repaired; original failure/normalization hashes remain in evidence and final `git diff --check HEAD` passes. Retained native sanitized log hashes match. `parent-final-verification.json` records source fingerprint and unchanged protected worktree/index hashes.


Parent independently read the unified change and public documents. On installed Node24.17.0, `corepack pnpm check-hygiene` and `node scripts/verify.mjs --skip-typecheck --skip-build` passed (21.828s verifier); the latter includes 138 capabilities and 261 accessibility tests. The tracked Markdown checker passed with696 files,397 resolved targets/anchors,31 external links not fetched and10 explicit authoring placeholders. Retained reports distinguish source/test inspection from executed native macOS setup/start/health/assets/stop and from unavailable native visual/Windows/Linux evidence. This is not full three-OS story acceptance. No product test/typecheck/full aggregate was newly required by documentation changes.

## Changelog

- 2026-10-20 v2: Complete four-layer review,12 patch entries, final helper/link/quick verification and explicit native evidence deferrals; retain provenance limits and orchestrator finalization.

- 2026-10-20 v1: Resolve prepared English documentation story from two source investigations, tracked links and native-host inventory.

## Auto Run Result

Status: done

- Summary: follow-up review pass of the English README/RUNBOOK change and its evidence; four low patches applied, two deferrals added.
- Files changed: `README.md` (doctor pointer), `docs/RUNBOOK.md` (concrete stale-`.port` check), `_bmad-output/implementation-artifacts/evidence/story-8-6/check_links.py` (reason on missing_files rows, explicit UTF-8).
- Review: 38 findings — 4 low patched, 2 deferred (gate gap, `.env.example`), carried I3 native/visible-browser deferral, 32 rejected with reasons in the triage log.
- Follow-up review recommended: false. No high patched on this follow-up pass.
- Verification: link scan 696 files, 396 resolved, 0 missing/invalid; `corepack pnpm check-hygiene` passed; `node scripts/verify.mjs --skip-typecheck --skip-build` passed (261 accessibility tests); `git diff --check HEAD` clean.
- Residual risks: Windows/Linux native quickstarts and macOS visible-browser observation remain unverified (DW-136 to DW-138); sprint-status.yaml and deferred-work.md remain orchestrator-owned and uncommitted by this run.
