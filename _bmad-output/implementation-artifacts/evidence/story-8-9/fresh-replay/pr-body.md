# Pull request

## Change and reason

The pinned README described release/tag automation as future Story 8.8 work although the release workflow and Runbook procedure already exist. Replace that sentence with a link to the configured versioned-release procedure and state that hosted execution remains unverified. Preserve the existing publication/private-contact/history/rights/native prerequisites. Update README metadata/changelog and required sanitized OpenWolf handoff, learning, memory and bug-log records.

Bounded plan: plan-initial.md. Walkthrough: docs/agentic-coding.md. The five supplied draft inputs are a separate fixture overlay, excluded from participant.patch. No Story Map data or application behavior changes.

## Validation

- Offline frozen install passed with installed Node 24.17.0, Corepack 0.35.0, root-pinned pnpm 9.15.4 on Darwin arm64; 424 packages reused, zero downloaded.
- After a first-attempt tsx IPC path-length failure, repeated the documented disposable recipe with initial TMPDIR=/tmp. Newly created task-owned TMPDIR was selected before installation and remains selected through the aggregate and child processes. TSX_DISABLE_CACHE is unset; normal tsx caching retained.
- Manual Git checks confirmed tracked relative links/directory descendants and actual heading fragments, including docs/RUNBOOK.md#versioned-releases; command claims checked against scripts.
- Independent separate non-author Agent review: one low evidence-tense finding repaired/rechecked; no open actionable findings. Context and exact reviewed diff identity recorded in independent-review.md. The same reviewer separately rechecked environment-replay bookkeeping with reused context disclosed.
- First aggregate: exit 1; root tests 207 pass, 16 tsx IPC EINVAL failures, 2 inherited skips. Raw log and before/after manifests retained in attempt-1; standalone tsx --version reproduced the socket error. Short-parent replay tsx --version passes. No tests, deadlines, assertions or caching settings changed.
- Full replacement corepack pnpm check: PASS, exit 0 (689 seconds). Root script tests: 223 pass, 2 inherited skips; workspace coverage: 3,159 tests pass and all eight line floors; serial audit-performance: 14 pass; accessibility: 261 pass; build/typecheck/release verification pass. Before/after and pre-export working paths/objects, HEAD and semantic staged entries match. Raw index hash matched before/after aggregate, changed at export while semantic staged entries remained identical (metadata-only observation; no content drift). Raw logs and manifests are retained outside candidate. Final whitespace, no-unstaged/no-untracked and supplied-overlay identity checks passed.

## Review context

Only README is the business correction; four tracked OpenWolf files are required bookkeeping. No hooks were available; no anatomy refresh claimed. Author and reviewer had no previous project conversation/work context. This is an isolated Agent reproduction, not an external-human trial.

No manual app/browser acceptance, native Windows/Linux quickstart, screen-reader, credential, interrupted-push, hosted CI/PR rendering/protection or release run was performed. Automated aggregate fixtures may start disposable local servers and stub browser commands; they do not establish native UI acceptance. No online dependency audit or private content/publication audit was performed; the offline aggregate does not establish advisory or publication clearance. Maintainer declarations, privacy/history/rights decisions, exact-result audit and hosted/native prerequisites remain unresolved.

Conventional Commit title prepared in pr-title.txt. Commit, push, tag, release and remote PR creation are prepared/simulated only; none executed. No remotes remain in the rehearsal clone. No author/reviewer edits were made to source checkout or user Projects. The supplied outer spec changed concurrently between recipe attempts; exact first/retry overlays are retained separately and no concurrent source work was reverted.

## Prepared/simulated delivery

1. Review participant.patch together with the separately retained supplied-inputs.patch and provenance manifests.
2. A later authorized contributor would inspect/stage the reviewed candidate and use the prepared Conventional Commit title.
3. A later authorized maintainer would publish a branch and open a PR using this prepared title/body.
4. Those future actions require their own authorization; this rehearsal stops at local PR preparation.
