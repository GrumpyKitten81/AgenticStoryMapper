---
date: '2026-10-16'
version: 7
status: done
story: '4.13'
revision: 6171c8298ae15eb21540ddcbc508e071df9ed5f9
---

# Validation gate

Reproducing statement: Record genuine Story 4.13 execution evidence for five actual-browser BMad publish/review/adjust simulations, raw retained/applied domain operations and first-publication-to-reviewed-board timing; preserve orchestrator tracking, failures and unexecuted states.

## Current disposition — verified external delivery

On2026-10-16 the user explicitly authorized Epic4/5 orchestrator intervention if completion was hidden by stale status. Detailed investigation found historical five-scenario browser completion in98a92fc and a later blocked redispatch, not a product failure. Story4.13 is complete under the existing timing exception. This is adoption of verified delivery, not a newly passed browser run.

Current Node24 HTTP/SDK roundtrip tests pass14/14. The independently rerun [offline field audit](../implementation-artifacts/evidence/story-4-13-independent-audit-20261016.json) verifies the archive and all231bundle/70observation/19screenshot hashes, initial intended fields/import/link effects for six recorded initial sets and all19changed refresh effects. Scenario4 retention remains145/153. Scenario5 captured conflict/Restore domain content matches except empty productContext identity/timestamp; full raw-snapshot identity is false. Exact reproducible audit command and limitations are in the Story4.13 spec/result. The later fresh attempt's five browser scenarios remain unexecuted; raw timing failures below remain failures. The original browser evidence and separate current tests have different roles.

[Operator reconciliation](../implementation-artifacts/evidence/epic-4-5-orchestrator-reconciliation-20261016.json) records adopted completion commits and state preservation. All historical records below are retained as evidence, not current dispatch instructions. No product source, threshold, user data or deferred-work ledger changed.

## Historical redispatch — blocked (2026-10-13)

The 2026-10-13 dispatch requires every gate to pass fresh. Actual browser preflight returned an empty app/browser inventory and `The Mac is locked and automatic unlock could not unlock it`; creating an IAB tab returned `Browser is not available: iab`. All five current-attempt scenarios are unexecuted, retention/timing unmeasured, and dependent continuation is held. No disposable runtime or Project was created. Historical acceptance below does not verify this attempt.

Fresh supplementary verification passed: Node 24 HTTP/SDK prerequisites 14/14 in 113.73 seconds (`/tmp/story-4-13-fresh-prerequisites.log`), quick hygiene/119-capability checks (`/tmp/story-4-13-fresh-hygiene.log`), archive SHA-256, 231 member hashes, 70 observation hashes and 19 screenshot hashes. No application/fixture/recipe source differs from the canonical application baseline. Hash integrity establishes historical artifact integrity, not fresh UI acceptance or completeness of field verification. Original helpers' identity-only checks remain an evidence limitation; the preserved supplemental field audit was not applied or treated as verified. No full current acceptance, commit, push or loop continuation.

## Historical result

All five actual-browser scenarios passed functional checks and the raw 90-percent retention threshold. The maintainer explicitly accepted timing exceedance on 2026-10-13, deferred optimization and authorized completion, a local commit and BMAD-loop continuation after independent review. The gate recommends continuing under that accepted timing exception. The 300-second target remains unchanged: Scenario 4 took 365.351 seconds and Scenario 5 took 326.319 seconds, so neither is a raw SM-9 pass.

Actual browser controls exercised initial review/approval/apply, protection and Agent approval policy, dependent deselection, unchanged/edited refresh, human-edit conflict refusal and confirmed intentional restore. The original interrupted protection run remains separately recorded at 67,816.015 seconds, including authorization wait. These simulations establish workflow evidence, not external demand; they authorize no automatic product-scope changes.

## Authorization provenance

On 2026-10-13 the user explicitly authorized the protection tests and conditional completion commit/loop continuation: “Ja, führe auch die isolierten schutztests aus. Wenn alles klappt comitte dann und fahre fort mit der ausführung des bmad loops. Räume vorher auf, story 3.9 scheint noch nicht korrekt dokumentiert obwohl abgeschlossen, d.h. der dtatus der dtory muss geprüft und angepasst werden”. After the raw timing failure, the user explicitly accepted it: “Die zeitüberschreitung ist ok, schliesse die story ab und fahre fort, hauptsache es funktioniert. Optimierungsthemen kommen später”. These are direct user instructions in the 2026-10-13 session, preserving the original spelling. The waiver concerns Story 4.13 timing only; it does not relax functional checks, retention, other stories' thresholds, product scope or the prohibition on push.

## Runtime, setup and execution boundary

Node `v24.17.0` and Corepack pnpm `9.15.4` were confirmed. The unchanged existing Story 4.12 HTTP/SDK prerequisite suite passed 14/14 tests in 113.73 seconds (`/tmp/storymapper-4-13-prerequisite-tests.log`); quick Git/source/capability verification passed (`/tmp/storymapper-4-13-source-hygiene.log`). These supplement actual browser evidence. An initial sandbox EPERM listener denial was followed by the unchanged permitted successful prerequisite rerun.

The owned loopback server uses `/tmp/storymapper-4-13-browser/acceptance.lsm/storymapper.sqlite`, isolated from user Projects and `.env`. Health confirms that database/runtime identity. Five initial disposable Projects/Maps were created by public human HTTP setup endpoints on 2026-10-12 at 21:14:21.402Z–21:14:21.443Z; a separately authorized protection rerun Project was created on 2026-10-13 at 16:06:44.526Z. These are setup timestamps, excluded from publication timing. Total setup duration was not instrumented and is not claimed.

The app has no generic publication form or Project creation form. Recorded Story 4.12 inputs are composed through its existing test-only composer and submitted through manifested Agent `SubmitChangeSet` over `/api/mcp/call`; actual human review, selection, approval and apply use browser controls. No human approval/apply API substituted for these UI actions. Source recordings, hashes, exact operations and responses are retained in the local evidence directory. Source/data/schema and application code remain unchanged.

Automatic approval review rejected the first `apply:true` publication before execution. The safe initial proposal used `apply:false` and actual human browser approval/apply; no unprotected Agent autoapply acceptance is claimed. Automatic review later rejected the default-off Agent approval refusal test before execution. The user explicitly authorized the isolated policy tests on 2026-10-13; they then executed as required. The original protection timer includes that wait, without subtraction or reset. On resume, subagent browser inventory was empty, but root actual IAB controls worked; root performed the remaining browser actions. This was not classified as a global browser failure.

## Tested source and exact commands

Application/original-run baseline is `e6747d56ff1e55316c76470bdaa15ef4a33659eb`. Documentation checkpoint/completion-diff baseline is `01cfed1593dc6a3b32762d3d1259af211185a5e2`. Only four documentation/context files changed between them; application and fixture/test sources are identical. The retained bundle contains exact fixture sources, the existing prerequisite test and recipe used by this execution. No application edits occurred during acceptance.

The exact successful prerequisite command, from `apps/server`, was:

```sh
PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm exec vitest run src/mcp/tools/bmad-round-trip.test.ts
```

The exact quick verification command, from the repository root, was:

```sh
PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH node scripts/verify.mjs --skip-typecheck --skip-build
```

The exact isolated server restart command, from `/tmp/storymapper-4-13-browser`, was:

```sh
env PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH HOST=127.0.0.1 PORT=4317 STORYMAPPER_DB_PATH=/tmp/storymapper-4-13-browser/acceptance.lsm/storymapper.sqlite LOG_LEVEL=error [REDACTED_HOME]/Projects/StoryMapper/apps/server/node_modules/.bin/tsx --tsconfig [REDACTED_HOME]/Projects/StoryMapper/apps/server/tsconfig.json [REDACTED_HOME]/Projects/StoryMapper/apps/server/src/main.ts
```

The exact Scenario 5 initial fixture-publication command, from the repository root, was:

```sh
PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH apps/server/node_modules/.bin/tsx --tsconfig apps/server/tsconfig.json /tmp/storymapper-4-13-browser/control.mts publish 5 initial false
```

The same helper invocation used scenario indices `1`, `2`, `3`, `4`, `5` and `6` (fresh Scenario 2), recording `initial` or `refresh`, with `false` for executed proposals. Initial setup used `control.mts setup`; ownership capture used `control.mts capture <index>`; durable capture used `node /tmp/storymapper-4-13-browser/capture-proof.mjs <index> <browser-reviewed-UTC-timestamp>`. These are Agent publication/public read helpers. Actual screenshots, human approval/apply, safety settings, Card editing and Restore came from CUA browser actions, not CLI substitutions. Exact helpers and recorded request/response JSON retain the remaining individual calls.

## Scenarios and raw measurements

All timestamps are UTC. Denominators count applied domain operations with changed effects, excluding lifecycle/audit metadata, unchanged no-ops and deselected/unapplied operations. A retained effect must still exist at reviewed completion; deliberate supersession is identified below. Comparison uses raw fractions and seconds, without rounding to pass.

| Scenario / attempt | First publication | Browser-reviewed completion | Raw elapsed seconds | Retention boundary (UTC) | Kept / applied | Acceptance |
|---|---|---|---:|---|---:|---|
| 1 Initial publication | 2026-10-12T21:14:41.338Z | 2026-10-12T21:15:34.752Z | 53.414 | 2026-10-12T21:15:34.752Z | 134 / 134 | Functional, retention and timing passed |
| 2 Protection, original interrupted run | 2026-10-12T21:16:02.404Z | 2026-10-13T16:06:18.419Z | 67816.015 | 2026-10-13T16:06:18.419Z | 134 / 134 | Functional and retention passed; timing failed, interruption retained |
| 2 Protection, fresh authorized rerun | 2026-10-13T16:07:45.424Z | 2026-10-13T16:09:26.026Z | 100.602 | 2026-10-13T16:09:26.026Z | 134 / 134 | Functional, retention and timing passed |
| 3 Dependent deselection | 2026-10-13T16:09:47.934Z | 2026-10-13T16:11:21.266Z | 93.332 | 2026-10-13T16:11:21.266Z | 115 / 115 | Functional, retention and timing passed |
| 4 Unchanged / edited refresh | 2026-10-13T16:11:46.122Z | 2026-10-13T16:17:51.473Z | 365.351 | 2026-10-13T16:17:51.473Z | 145 / 153 | Functional and retention passed; raw timing failed, exception accepted |
| 5 Human-edit conflict / intentional restore | 2026-10-13T17:09:16.572Z | 2026-10-13T17:14:42.891Z | 326.319 | 2026-10-13T17:12:44.988Z (pre-Restore) | 134 / 135 before intentional restore | Functional and retention passed; raw timing failed, exception accepted |

Retention boundaries are actual browser-reviewed states, subsequently verified by persisted captures. Scenario 5 deliberately uses its pre-Restore boundary for primary retention and its final post-Restore reviewed board for full elapsed time. At the separate post-Restore boundary, 2026-10-13T17:14:42.891Z, initial ChangeSet retention is 134/134; human-edit retention is 0/1 because Restore intentionally undid it. Across all applied domain operations, post-Restore retention is 134/135, with a different retained-effect composition from the pre-Restore 134/135. Full raw elapsed time remains 326.319 seconds.

The five fresh sessions retain 662/671 applied domain effects before Scenario 5's intentional restore (raw fraction 0.9865871833084948). Scenario 5 includes the human Card save as one applied domain operation; the alternative ChangeSet-only aggregate is 661/670. The original interrupted protection run is additional evidence, separately preserved. The unchanged refresh subrun applies no new domain effects, so its subrun retention is undefined. Scenario 5's intentional restoration and undone effects are reported separately below; no unintended rollback occurred.

## Actual observations and persisted evidence

The evidence directory is `/tmp/storymapper-4-13-browser/`. `sessions.json` records storage-scoped Project/map identities and setup/publication timestamps; `screenshot-manifest.json` records SHA-256 for all 19 actual screenshots; `evidence-manifest.json` records hashes for 70 retained JSON and screenshot evidence files, excluding SQLite/execution helpers. The original temporary evidence is retained locally; a durable sanitized bundle is preserved in the repository as described below. Every initial publication uses the recorded 6-Epic/34-Story fixture: 36 Source Document imports, 3 Release upserts, 46 Card upserts and 49 Source Link operations, totaling 134 domain operations. Card/Release/external-reference/source-document/chunk/link identities and Activity are retained in the proof JSON files.

1. Scenario 1: Project `094c17df-410f-453b-8809-3a7d89388574`, Map `099ddc52-5977-426d-bcd2-fa70694ab96e`, ChangeSet `9ffc7cdc-fe1c-4713-9976-23513adb32c6`. Actual Tree preview showed all 134 selected operations. Human `local-user` approval persisted at 21:15:22.844Z and apply at 21:15:30.347Z. Reviewed board showed 46 Cards and 3 Releases. `s1-retention-proof.json` verifies every operation's created domain identities, including immutable sources/chunks, against persisted state and includes 148 paginated Activity rows. Screenshots: `s1-preview.jpg`, `s1-board.jpg`; full exact inputs: `s1-initial-1791839681778.json`; snapshot/ChangeSet evidence: `s1-capture-1791839747110.json`.
2. Scenario 2 original: Project `57f26561-9289-4c9b-ba20-9ae063a13fe0`, Map `ec8fc9e5-0c61-46a9-884e-3b2cb02952ee`, ChangeSet `92351a3b-85aa-4b62-86ab-b5dfade74d9a`. Actual UI enabled protection with approval Off. After explicit authorization, default-off `ApproveChangeSet` returned HTTP 403, code `disabled`; UI enabled Agent approval while protection remained On at 16:04:36.621Z. Agent selfapproval returned HTTP 200 at 16:05:08.159Z with the same proposing/approving `local-mcp-host` actor/session. Protected Agent apply returned HTTP 403, code `protected`, without applying domain operations. Root refreshed the actual browser review, human approval persisted at 16:06:01.160Z and apply at 16:06:12.923Z. Reviewed board showed 46 Cards/3 Releases and Applied available in Activity. Evidence: `s2-default-off-refusal.json`, `s2-agent-approval-success.json`, `s2-protected-agent-apply-refusal.json`, `s2-durable-proof.json` (153 Activity rows), `s2-protected-default.jpg`, `s2-agent-approval-enabled.jpg`, `s2-resumed-board.jpg`. The original wait is retained in raw elapsed time.
3. Scenario 2 fresh rerun: Project `f26ec776-bfcc-49d4-8e2a-cdcf14aca4d2`, Map `8c992aea-d326-41de-970a-003f4f766d6e`, ChangeSet `7c81b634-df35-439c-b212-6aaeb815300b`, helper/evidence index `6`. Protection On/approval Off was set and observed through UI before publication. The actual default-off refusal, UI enable, Agent selfapproval success at 16:08:37.714Z and protected Agent apply refusal repeated. Human UI approval persisted at 16:09:10.522Z and apply at 16:09:19.996Z; reviewed board showed 46 Cards/3 Releases. `s6-durable-proof.json` verifies 134 retained domain operations and 153 Activity rows; `s6-{default-off-refusal,agent-approval-success,protected-agent-apply-refusal}.json` stores exact responses. Screenshots: `s2-rerun-protected-default.jpg`, `s2-rerun-agent-approval-enabled.jpg`, `s2-rerun-board.jpg`.
4. Scenario 3: Project `de0267fc-eca6-4fff-a51c-4753fe61700f`, Map `7783bd54-8f18-4c22-b298-5c99c474ec66`, ChangeSet `6be0a482-477d-41c7-bcd9-2b9193ba9603`. Root browser first approved all 134 operations, then deselected operation 40 (`publish-epic-1`). Actual DOM showed 115 checked and 19 unchecked operations; dependent operations were unchecked and Apply disabled until reapproval. Transitive exclusion removed Epic 1's Activity, Step, six Stories and eleven Source Links. Human reduced-selection approval persisted at 16:11:06.159Z and apply at 16:11:13.049Z. Reviewed board showed 38 Cards/3 Releases. `s3-full-preview.json`, `s3-reduced-preview.json` and `s3-durable-proof.json` substantiate 115 changed operations retained and 129 Activity rows. The 19 deselected operations were never applied and never enter the denominator. Screenshots: `s3-dependent-deselection.jpg`, `s3-reduced-board.jpg`.
5. Scenario 4: Project `c67b6a43-7365-44b8-8f2b-7d6271555615`, Map `c2625f52-1a9b-4f6e-b563-1324ae13da7f`. Human browser initially approved/applied ChangeSet `a8440a41-7aa7-4207-b27b-ac5c65e0add7`; apply persisted at 16:12:36.927Z. Identical publication `344a7709-a901-4334-bb74-5fffc4fa6d46` proposed 134 unchanged operations and zero changed effects; actual unchanged preview was reviewed at 16:16:29.157Z. It was not applied. A mistaken browser navigation to `/maps/` displayed Not Found and was corrected to the existing `/story-maps/` route; that elapsed time is preserved. The recorded `refresh` variant then proposed `c8df812f-c56a-4605-b6f4-d39f9379324a` at 16:16:48.845Z. Its 140 operations comprise 19 changed effects and 121 unchanged no-ops. Human UI approval persisted at 16:17:32.672Z and apply at 16:17:45.794Z. The final reviewed board showed 46 visible Cards/3 Releases; durable state contains 47 physical Cards with `story-6.5` archived, two edited Stories at version 2, new `story-6.6` at version 1 and 40 immutable Source Documents, retaining all 36 original documents. Evidence: `s4-capture-*.json`, `s4-{unchanged,edited}-preview.json`, `s4-durable-proof.json` (370 Activity rows), `s4-retention-proof.json`. Screenshots: `s4-initial-board.jpg`, `s4-unchanged-preview.jpg`, `s4-refreshed-board.jpg`.

6. Scenario 5: Project `f8a9c1c8-c59e-4fa8-af20-70aa52c5111e`, Map `704730c6-dacf-4247-a9f7-319da853d558`. Human browser approved initial ChangeSet `95d833f1-fcd8-46dd-8b2a-985f92e0ebf3` at 17:09:58.910Z and applied it at 17:10:09.876Z, producing 46 Cards/3 Releases. The actual UI created a manual restore point at 17:10:36.066Z before refresh and human editing. This point covers the entire isolated local database; `s5-restore-points.json` records its exact filename. Recorded refresh `d192b854-8e4c-4bea-ab30-1abff73cea78` was submitted at 17:10:56.926Z and human-approved at 17:11:49.982Z. Human UI saved Card `1bcb362a-f8cd-4166-9e17-43b3cea1da45` at 17:12:17.720Z, changing the title from `Create a research collection` to `Delayed human title`, version 1 to 2. The same save normalized the absent assignee to an empty string; this remains one Card operation, with full before/after evidence. Reopening the stored approved refresh showed a conflict on `publish-story-1.1`, index 63, base version 1/current version 2. Approve/Apply were disabled. A fresh recipe Submit returned HTTP 409 conflict at 17:13:27.490Z. No conflicting refresh operations applied, and pre/post-conflict domain snapshots match. Evidence: `s5-conflict-preview.json`, `s5-pre-conflict-state.json`, `s5-post-conflict-state.json`, `s5-pre-restore-durable-proof.json`, `s5-pre-restore-retention-proof.json` and `s5-retention-and-restore-proof.json`. Screenshots: `s5-initial-board.jpg`, `s5-restore-point.jpg`, `s5-human-edit.jpg`, `s5-conflict-preview.jpg`, `s5-restore-result.jpg`, `s5-restored-board.jpg`.

Scenario 5's pre-Restore browser review was at 17:12:44.988Z (208.416 seconds from publication). Retention at this boundary is 134/135 = 0.9925925925925926 across all applied domain operations: 133 initial ChangeSet effects remain and the one human edit remains; one initial Card effect was deliberately superseded. ChangeSet-only retention is 133/134 = 0.9925373134328358. The unapplied conflicting refresh contributes zero operations.

The human explicitly confirmed Restore at 17:14:30.349Z. A protective pre-Restore point was created at 17:14:30.461Z; restoration persisted at 17:14:30.514Z. The actual completion dialog observed at 17:14:38.543Z reported 82 Activity events and one ChangeSet marked historically undone. Those metadata counts are not 82 undone domain operations. The one human Card edit was intentionally undone; all 134 initial ChangeSet effects are retained after Restore. The restored domain snapshot exactly matches the manual-point initial state, with the original Card title/version 1 restored and 46 Cards/3 Releases visible. `s5-restore-activity.json`, `s5-post-restore-points.json` and `s5-post-restore-durable-proof.json` retain exact restore identity, protective point, undone markers and restored entities. The stored refresh remains historical with `undoneByRestore: true`; the applied initial ChangeSet is not undone. Restore confirmation-to-dialog took 8.194 seconds and confirmation-to-reviewed-board took 12.542 seconds. Full scenario timing includes the restore and all intervening coordination: 326.319 seconds. The 208.416-second pre-Restore checkpoint is not substituted for the full raw SM-9 result.

Scenario 4's denominator is 134 initial changed operations plus 19 edited-refresh changed operations, totaling 153. All 19 refresh effects remain, including the five deliberate unlink effects verified by absence of their old links. Eight initial effects were deliberately superseded: the Card effects of `story-1.1`, `story-3.1` and archived `story-6.5`, plus four replaced Source Links for `story-1.1` and one for `story-3.1`. Thus 145/153 = 0.9477124183006536 passes the raw retention threshold. The separate generic identity helper reports 274 executed operations; that includes 121 edited-refresh no-ops and must not be used as the applied-effect denominator. It also lists absent unlinked IDs, which are intended retained removal effects rather than lost operations. The dedicated effect ledger provides the metric.

## Durable sanitized evidence bundle

The repository retains [story-4-13-synthetic-evidence.tar.gz](../implementation-artifacts/evidence/story-4-13-synthetic-evidence.tar.gz) and its [SHA-256 sidecar](../implementation-artifacts/evidence/story-4-13-synthetic-evidence.tar.gz.sha256). Archive SHA-256: `b2a2de190a1c8ab06363ff4431541cfbd8f22d44176aff3aff69f0e7de206445` (2,516,192 bytes).

The 232 archive members comprise 71 observation files (the 70 manifested JSON/screenshots plus their evidence manifest), six exact test-only execution/capture/retention helpers, 152 exact source files (150 fixture files, prerequisite test and recipe), two prerequisite/quick-verification logs and a bundle-wide SHA-256 manifest. The observations include all 19 actual screenshots and their original hashes. Input content is the existing synthetic fixture, disposable-project state and isolated test activity. An explicit allowlist excludes SQLite/database files, `.env`, user Projects/data and credentials. Text files passed a credential-pattern scan; no content was rewritten, preserving exact helper and evidence bytes. Screenshots were captured from the disposable test app only. Absolute local paths are retained as execution provenance, not credentials.

Verify and extract into a new disposable directory from the repository root; these commands inspect the retained artifact and do not start the app or replay mutations:

```sh
(cd _bmad-output/implementation-artifacts/evidence && shasum -a 256 -c story-4-13-synthetic-evidence.tar.gz.sha256)
mkdir /tmp/storymapper-4-13-evidence-review
tar -xzf _bmad-output/implementation-artifacts/evidence/story-4-13-synthetic-evidence.tar.gz -C /tmp/storymapper-4-13-evidence-review
python3 - <<'PYVERIFY'
from pathlib import Path
import hashlib, json
root = Path('/tmp/storymapper-4-13-evidence-review')
for name, expected in json.loads((root / 'bundle-manifest.json').read_text()).items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
for name, expected in json.loads((root / 'observations/evidence-manifest.json').read_text()).items():
    assert hashlib.sha256((root / 'observations' / name).read_bytes()).hexdigest() == expected, name
print('All retained bundle and original observation hashes verified')
PYVERIFY
```

The helpers retain the original machine paths and are audit evidence; replay requires explicitly choosing a fresh isolated runtime and paths. No database is shipped. The bundle verifies the historical captures rather than claiming a new browser run.

## Historical browser blockage

The original 2026-10-12 preflight, recorded by 19:36:57 UTC, returned `browsers: []`, Safari binding error `-10005: cgWindowNotFound`, and `Browser is not available: iab` on tab creation. Node/pnpm were confirmed, but no server or disposable Project existed then; all scenarios were unexecuted. Those observations remain history and do not describe the subsequently restored root browser controls.

## Recommendation and remaining work

Continue under the maintainer's explicit timing exception after independent completion review. Functional acceptance and retention passed in all five fresh simulations; raw SM-9 fails remain visible for Scenario 4, Scenario 5 and the original interrupted protection attempt. Optimization is deferred as requested. End-to-end times include coordination, an incorrect route navigation in Scenario 4, and authorization wait in the interrupted run; this evidence does not isolate an application performance regression. It makes no external-demand or product-scope claim. Local completion commit and supported BMAD-loop continuation are authorized by the user, subject to review; no push is authorized.

No application/API/schema, user data or sprint/deferred ledger changed. Owned root browser tab 4 was closed and owned server execution 7418 stopped; port 4317 is free. All API capture is complete. The isolated test DB remains retained locally and excluded from the completion commit; the sanitized synthetic evidence archive is durable and included in the completion review. Root independently checked raw timing arithmetic, initial retention evidence, screenshots and unchanged source/ledger scope; final version 5 document consistency and independent completion review passed. Three review lenses returned seven blind-review findings, zero edge findings and zero verification gaps; five evidence/documentation findings were patched and two spec-only requests rejected under the workflow restriction. Story 4.13 is complete under the explicit timing exception.

## Changelog

- Version7 (2026-10-16): Current disposition adopts independently verified historical delivery under explicit operator authorization; current14-test roundtrip and complete initial/refresh field audit pass. No fresh browser pass or timing relaxation claimed.

- Version 6 (2026-10-13): Records fresh supplementary gates and genuine unavailable-browser block; historical evidence remains historical. Corrects table fraction orientation to kept/applied.

- Version 5 (2026-10-13): Preserved a sanitized durable evidence archive with exact helpers/sources/logs and hash verification; added command/baseline/authorization provenance and explicit pre-/post-Restore retention boundaries.

- Version 4 (2026-10-13): Maintainer accepted raw timing exceptions and deferred optimization; Scenario 5 human-edit conflict and intentional restore passed actual browser checks. Five fresh sessions retain 662/671 domain effects before intentional restore. Full Scenario 5 timing is 326.319 seconds, recorded as a failure of the unchanged target with an accepted exception. Completion is in review.

- Version 3 (2026-10-13): Explicitly authorized protection tests passed in the interrupted run and separate fresh rerun; dependent deselection and edited refresh functionally passed. Raw Scenario 4 timing failed at 365.351 seconds; At that version, Scenario 5 was unexecuted and progression was held. Retention excludes no-ops and counts superseded effects separately.
- Version 2 (2026-10-12): Restored browser controls; initial publication passed with 134/134 retention and 53.414 seconds. Protection paused for explicit authorization after automatic review rejection; historical preflight retained.
- Version 1 (2026-10-12): Recorded unavailable-browser preflight, five unexecuted scenarios and withheld acceptance.
