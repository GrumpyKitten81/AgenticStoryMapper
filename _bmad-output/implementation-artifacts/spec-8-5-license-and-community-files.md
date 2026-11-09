---
title: 'Story 8.5: License and community files'
type: chore
created: 2026-10-20
version: 2
status: done
baseline_revision: f404c1b62ff8f1ed558ae7be1c273a26cb28597f
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Issue forms now use English section labels while .cursor/rules/card-authoring.mdc and docs/templates/*.md still prescribe German headings, splitting the ticket-template source of truth.
    evidence: |-
      card-authoring.mdc:10-12 names the German sections (Fähigkeit und Nutzen, Erfolgskriterien, Scope und Abgrenzung, Anmerkungen) and says it mirrors docs/templates; the rewritten forms use English labels and dropped some sections. The fix edits an agent-context rule file, so it is outside this story.
    location: >-
      .cursor/rules/card-authoring.mdc:10
    severity: medium
  - summary: >-
      No check in corepack pnpm check or CI validates issue-form structure or the CONTRIBUTING.md command and CI-name claims; only the unwired Ruby story-evidence script does.
    evidence: |-
      scripts/check.mjs and .github/workflows/ci.yml reference neither .github/ISSUE_TEMPLATE nor CONTRIBUTING.md. A later duplicated field id or renamed Quality job would pass every gate. Closing it adds a script test to the gate aggregate, which this story's intent excludes; candidate for Story 8.7/8.8.
    location: >-
      scripts/check.mjs
    severity: medium
---

# Story 8.5

Reproducing statement: Execute the prepared license/community story with generic English contributor surfaces; preserve orchestrator-owned sprint-status.yaml without writing or reverting it.

<intent-contract>

## Intent

**Problem:** Outside contributors lack root license, contribution, conduct and security guidance; existing issue forms are German and unnecessarily elaborate.

**Approach:** Add MIT and English community files, simplify/generalize existing issue forms and add a pull request template using actual repository commands and CI names.

## Boundaries & Constraints

**Always:** Apply the accepted 2026-10-19 private independent MIT/StoryMapper publication decision, waiver of employer approval and name searches, and explicit permission for `[COPYRIGHT_HOLDER]`, `[PRIVATE_SECURITY_CONTACT]`, `[CONDUCT_CONTACT]`. Missing contacts are visibly inactive; required private details remain publication blockers. Keep upstream license obligations visible. Use installed Node24 and Corepack pnpm9.15.4. Keep templates accessible, English and free of private/team routing. Respect existing card-authoring order where applicable.

**Never:** Invent identity, addresses, support guarantees or enabled private-reporting features; route vulnerability details to public issues; perform name searches, send messages, create remote issues or change repository settings. Do not write, stage or revert sprint-status.yaml; its status is not verification. Do not modify product code, dependencies, lockfile, gates, deferred ledger or unrelated documentation. No commit, push, tag, history rewrite, publication or next-story dispatch. Story8.6 owns broad documentation;8.7/8.8 own publication auditing/gates. Preserve prior native/hosted acceptance gaps.

</intent-contract>

## Code Map

- Entry HEAD `f404c1b62ff8f1ed558ae7be1c273a26cb28597f`, clean main is the established in-place orchestrator branch. Graph tools unavailable. Protected working/index hashes captured separately in `/tmp/story-8-5-protected-before.json`.
- Root `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and `.github/PULL_REQUEST_TEMPLATE.md` are absent.
- `.github/ISSUE_TEMPLATE/{01-feature,02-bug,03-epic,04-story,05-task,06-spike,07-theme}.yml` contain German forms, redundant instructional defaults and overly specific business examples. `config.yml` disables blank issues. Retain and simplify the seven existing categories; no verified unused category justifies deleting one. Remove redundant default values and organization assumptions. Public forms must discourage secrets and direct security concerns to SECURITY.md without collecting them.
- `package.json:7,10,23,24`, `scripts/setup.mjs`, `scripts/runtime.mjs:runtime`, `scripts/check.mjs:runQualityGate` establish Node>=24<25, pnpm9.15.4, frozen setup, offline `corepack pnpm check`, focused tests and licenses. Document setup/start and `corepack pnpm test`, typecheck/build/check; do not execute setup/start against local user Projects for this documentation task.
- `.github/workflows/ci.yml:quality` and `docs/RUNBOOK.md:200` establish `Quality (ubuntu-latest)`, `Quality (macos-latest)`, `Quality (windows-latest)` required checks, informational audit, and pending hosted/protection activation.
- `scripts/check-licenses.mjs:checkLicenses`, `scripts/license-policy.mjs` already inspect all resolved installed dependency licenses; reuse unchanged and preserve upstream notices/conditions.
- Link contributor guidance to root AGENTS.md, the architecture spine and actual spec/review workflow; explain that authorized repository maintainers merge/release without naming or inventing identities. Do not require AI subscriptions for manual contributions. Follow `.cursor/rules/markdown.mdc` metadata and card-authoring guidance.
- Binding preparation: [Epic8](epic-8-preparation.md), [8.5 plan](story-plan-8-5-license-and-community-files.md). Prior [8.4](spec-8-4-continuous-integration-on-three-operating-systems.md) is continuity evidence only: hosted OS runs/protection remain unverified.
- Canonical MIT text: https://choosealicense.com/licenses/mit/ ; GitHub form syntax: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms (checked2026-10-20). Validate actual YAML/schema structure and local Markdown links without claiming hosted rendering.

## Tasks & Acceptance

**Execution:**

- [x] `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md` — add canonical MIT grant with2026 and permitted holder marker, practical private-report guidance, respectful conduct/scope/enforcement and inactive contact declarations. Keep LICENSE canonical; put publication caveats in Markdown.
- [x] `CONTRIBUTING.md` — document actual setup, local checks, spec→implementation→verification→review expectations, scope discussions, architecture/data boundaries, CI names, merge/release authority and publication prerequisites.
- [x] `.github/ISSUE_TEMPLATE/*.yml`, `config.yml`, `.github/PULL_REQUEST_TEMPLATE.md` — simplify English forms/config and add concise change/reason, validation and review context. No private board, assignee, company or unsupported repository URL defaults.
- [x] Story evidence — inspect all new/modified content; parse YAML and validate form names, IDs, types, required editable fields/config; resolve local links. Run existing license/hygiene checks and whitespace validation. Record commands/results and unresolved markers as accepted implementation output, without fabricating publication clearance.

**Acceptance Criteria:**

- Given the root files, when inspected, then all four exist in English, LICENSE contains canonical MIT and only the agreed absent private-detail markers remain.
- Given SECURITY.md and CODE_OF_CONDUCT.md, when read, then reporting scope/process and maintainer responsibility are clear, missing channels are inactive and publication blocked, and vulnerability details are never requested publicly.
- Given contributor instructions, when compared with source, then commands, boundaries and exact three OS check names agree; manual contribution is possible and merge/release authority is stated without invented identity or activated protections.
- Given every issue form/config and PR template, when parsed/inspected, then names/IDs/fields are valid, accessible and generic English without organization routing or redundant prefilled answers.
- Given installed dependencies, when the existing license gate runs, then it succeeds under its MIT-compatible policy with upstream obligations retained.
- Given story start/result notes, when reviewed, then accepted publication decisions and unresolved private details are recorded and sprint working/index bytes are preserved independently of bookkeeping status.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass

- verdicts: 17 findings — high 0, medium 9, low 4, false 4, maybe-false 0. Verification-gap reviewer returned zero findings. Four lenses ran with fresh contexts; the fourth launch waited for an available concurrency slot before any triage.
- findings, in reporting order:
  - `[false]` `[reject]` I1: Inactive security/conduct channels versus working reporting — the binding accepted plan expressly permits these markers and requires inactive declarations; both policies prohibit publication until verified contacts exist.
  - `[medium]` `[patch]` I2: Hosted interaction is untested by local links — actual issue/PR relative links fail outside blob rendering; replaced them with explicit root SECURITY.md navigation and checked the visible instructions. Group P1.
  - `[false]` `[reject]` I3: Referenced commands versus executed quickstart — this static-content story requires source-accurate commands and license validation, not rerunning startup against user Projects; the evidence explicitly lists unexecuted commands and the guide makes no new execution claim.
  - `[medium]` `[patch]` I4: Snapshot equality can reject legitimate orchestrator writes — helper now reports each current/entry hash and equality without failing on bookkeeping updates; final equality supports final-state comparison only, not a claim to detect every intervening write. Group P2.
  - `[false]` `[reject]` I5: Prior authorization is only an assertion in the diff — parent loaded binding epic preparation and the exact 8.5 detail plan, which record the accepted MIT/name/placeholder decision. No new authorization is inferred from the short invocation.
  - `[medium]` `[patch]` I6: Session-local baseline prevents replay — helper reads entry hashes from retained implementation-verification.json; original report remains and a separate post-review report records repaired output. Group P3.
  - `[medium]` `[patch]` E1: Hosted security links resolve away from the policy — reviewer confirmed the unchanged relative href with GitHub's read-only Markdown API; explicit repository-root policy guidance removes the bad links without inventing a repository address. Group P1.
  - `[medium]` `[patch]` E2: Missing temporary baseline aborts a fresh replay — replaced /tmp input with committed evidence. Group P3.
  - `[medium]` `[patch]` B1: Seven form security links assume file rendering — replaced each with explicit root policy guidance. Group P1.
  - `[medium]` `[patch]` B2: PR-body security link assumes .github rendering — replaced it with root policy guidance visible after comments are stripped. Group P1.
  - `[medium]` `[patch]` B3: Replay cannot find /tmp entry snapshot — uses retained evidence instead. Group P3.
  - `[medium]` `[patch]` B4: New unstaged files can escape tracked hygiene — contributor guide now says to stage intended new files and inspect the staged diff for prohibited inputs before final checks. Group P4.
  - `[low]` `[patch]` B5: Corepack provisioning omitted — guide includes actual CI command for Corepack0.35.0 in the installed Node24 environment and retains the hosted provisioning uncertainty. Group P5.
  - `[low]` `[patch]` B6: Visible PR maintenance metadata pollutes descriptions — moved date/version/reproducing/changelog into an HTML comment; visible contribution prompts remain. Group P6.
  - `[low]` `[patch]` B7: Internal employer/name waiver decision duplicated in public instructions — removed only that paragraph; decisions stay in story notes/evidence and publication blockers remain. Group P7.
  - `[false]` `[reject]` B8: Overlapping grouping categories lack meaning — form descriptions/first fields distinguish capability/value (Feature), delivered outcome (Epic), and shared focus/grouping (Theme). No invalid selection, missing field or concrete bad result was demonstrated; additional selection instructions would be optional guidance.
  - `[low]` `[patch]` B9: Manual contributors cannot discover global commit format — guide now gives Conventional Commit syntax and a short docs example. Group P8.

- Patches: 8 distinct entries (medium 4, low 4), covering 13 rows; deferred 0; rejected 4 with individual evidence above. No intent/spec loopback required: corrections add no public surface and preserve accepted scope. Follow-up review recommended for the revised contributor instructions and evidence helper after four medium patch entries; hosted composer/Corepack execution remains unverified.

### 2026-10-20 — Review pass (follow-up)

- verdicts: 33 findings — high 0, medium 3, low 23, false 7, maybe-false 0. Four fresh lenses ran; nothing from the first pass was re-raised as an open row except where noted `carried`.
- findings, in reporting order:
  - `[false]` `[reject]` B1: Reporters hit a dead end — `carried` I1; both policies declare the inactive channels and block publication, as the accepted plan requires.
  - `[false]` `[reject]` B2: Nothing blocks publishing with placeholders — intent assigns publication gates to Stories 8.7/8.8 and expressly permits the three markers.
  - `[false]` `[reject]` B3: Renamed form ids/labels break tooling — grep of tools/, skills, scripts, packages, apps finds no consumer of issue-form labels or ids.
  - `[low]` `[reject]` B4: Fields removed in slimming — the intent asks for simpler forms; no named consumer of the dropped fields.
  - `[low]` `[reject]` B5: Required flags changed — Bug "if relevant" qualifies the browser only; no failing input shown.
  - `[false]` `[reject]` B6: Forms set no labels — the original forms had no `labels:` key; nothing regressed.
  - `[low]` `[reject]` B7: Validator brittle/unwired — static-evidence script; spec says no new product tests; the hard-coded date affects only a replay after a future version bump.
  - `[false]` `[reject]` B8: Protected-sprint check cannot fail — `carried` I4; report-only is the deliberate result of that patch because orchestrator bookkeeping legitimately rewrites the file.
  - `[low]` `[patch]` B9: Evidence leaks a local home path — implementation-verification.json now uses `<home>` like sibling story-8-4 evidence; the near-identical static reports are intentional first-run versus final records.
  - `[low]` `[reject]` B10: Internal-status wording in public docs — visible blockers are required by the intent; employer-decision text was already removed (`carried` B7).
  - `[low]` `[reject]` B11: Corepack global install may need elevated rights — environment-specific; the line mirrors the CI command.
  - `[low]` `[reject]` B12: PR template thin — the intent asks for a concise template; metadata already hidden (`carried` B6).
  - `[false]` `[reject]` B13: Conduct has no solo-maintainer path — CODE_OF_CONDUCT.md:23 already says to communicate the limitation privately without promising independent review.
  - `[false]` `[reject]` E1: validate.rb never raises on sprint mismatch — same as B8.
  - `[low]` `[reject]` E2: Runbook link goes to German text — Story 8.6 owns documentation translation; the link is accurate.
  - `[low]` `[reject]` E3: Guide cites the Story 8.5 spec as example — tracked file, link resolves; the intent asks to link the actual spec workflow.
  - `[low]` `[reject]` E4: Required fields lack an unknown fallback — filler text is cosmetic; no failing case shown.
  - `[low]` `[reject]` E5: Spike result field removed — findings go to comments; deliberate simplification.
  - `[low]` `[reject]` E6: Bug severity/workaround fields removed — same as B4.
  - `[medium]` `[defer]` E7: Forms diverge from German card-authoring rule and docs templates — fix edits an agent-context rule file; recorded in frontmatter `deferred`. Grouped with G4.
  - `[low]` `[reject]` E8: Guide omits the CI native rebuild step — that step is a runner-specific CI detail; local setup builds with the same Node.
  - `[low]` `[reject]` E9: Global Corepack install may fail with EACCES — same as B11.
  - `[medium]` `[defer]` G1: Form/command claims not covered by `check` or CI — pre-verified gap; closing it modifies gates, which the intent excludes; recorded in frontmatter `deferred`.
  - `[false]` `[reject]` G2: Sprint comparison only reports — same as B8.
  - `[low]` `[reject]` G3: static-validation.json contradicts the final state — retained on purpose as the first-run record (`carried` I6); post-review-static-validation.json holds the repaired result.
  - `[medium]` `[defer]` G4: card-authoring.mdc and docs/templates diverge from the forms — same root cause as E7.
  - `[low]` `[reject]` A1: Hosted rendering unexercised — spec states hosted behavior is unverified; no claim made (`carried` I3).
  - `[low]` `[reject]` A2: Required-field tension with simplification — same as B5.
  - `[low]` `[reject]` A3: Maintenance metadata in root files — repo markdown convention (`.cursor/rules/markdown.mdc`).
  - `[low]` `[reject]` A4: Publication-prerequisite text is public-facing — same as B10.
  - `[low]` `[reject]` A5: Evidence directory committed — spec Verification requires a saved replayable report under story evidence.
  - `[low]` `[reject]` A6: Check names inferred from matrix template — names follow `Quality (${{ matrix.os }})`; spec states hosted runs are unverified.
  - `[low]` `[reject]` A7: `check` aggregate description not tested — verification-gap reviewer read scripts/check.mjs and the list matches.

- Patches: 1 (low 1); deferred 2 entries (medium, covering 4 rows); rejected 26. Verification re-run after the patch: check-hygiene and check-licenses pass, whitespace clean.

## Verification

Use installed Node24.17.0 by prepending its bin directory to PATH:

- `corepack pnpm check-licenses` — resolved dependency policy passes.
- `corepack pnpm check-hygiene` — tracked publication inputs pass (stage only owned new files first).
- Parse all issue YAML/config with an available YAML parser; inspect GitHub form schema constraints, all Markdown local links and English/security/contact/command contracts. Save a replayable validation report under story evidence; no new product tests/dependencies needed for static content.
- `git diff --check HEAD` — whitespace clean. Compare protected working/index SHA256 values with entry capture; report external changes without restoring them.

## Changelog

- 2026-10-20 v2: Complete four-layer triage, eight corrections and independent final checks; retain publication prerequisites and orchestrator ownership.
- 2026-10-20 v1: Resolve prepared story into concrete contributor surfaces, checks and protected boundaries.

## Auto Run Result

Status: done

Summary: Follow-up review of the MIT license, contributor, security and conduct files, seven simplified English issue forms and the pull request template. One cosmetic patch; the change has converged.

Files changed (review pass): `_bmad-output/implementation-artifacts/evidence/story-8-5/implementation-verification.json` replaces the local home path with `<home>`.

Review findings: patches applied 1 (low); deferred 2 entries (medium, forms versus German card-authoring rule; no gate coverage for forms and guide claims); 26 rejected with reasons in the Review Triage Log.

Follow-up review recommended: false. This pass patched no high finding.

Verification: `corepack pnpm check-hygiene` and `check-licenses` pass on Node 24.17.0; `git diff --check HEAD` clean apart from a trailing blank line in this spec, which was removed. The evidence JSON still parses. sprint-status.yaml was neither read for edits nor written.

Residual risks: hosted GitHub rendering of forms and templates is unverified; the three private-detail markers remain publication blockers; no commit was made, per the intent contract.
