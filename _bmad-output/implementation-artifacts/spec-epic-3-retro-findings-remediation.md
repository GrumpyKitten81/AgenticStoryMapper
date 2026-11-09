---
title: 'Epic 3 retrospective findings remediation'
type: 'bugfix'
created: '2026-10-10'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'b3007ffb68323e7dae16230da0954d05104aa50d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-retro-2026-10-10.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-approved implementation intent">

## Intent

**Problem:** Epic 3's retrospective recorded two concrete integrity/runtime defects, verification gaps, maintainability issues, and a staged Epic 4 ChangeSet gap. Ten follow-up actions remain open.

**Approach:** Fix the immediate bridge, ownership, lock, and replay defects; close the stated test gaps; correct generated descriptions and UI strings; record prompt reads in the audit trail; and reconcile the relevant agent/process guidance. Keep Epic 4 operation-registry work aligned with Stories 4.4–4.6, and do not mutate orchestrator-owned sprint status.

## Boundaries & Constraints

**Always:** Preserve current user changes; use disposable fixtures for manual acceptance; keep audit rows and successful tool writes atomic; audit both `prompts/list` and `prompts/get`; enforce same-Project ownership for Source Links; keep generated capability artifacts in parity; retain loopback-only runtime policy.

**Never:** Read or modify user databases, credentials, `input/`, or `local-projects/*.lsm/`; modify `sprint-status.yaml` or existing deferred-work entries; change the approved Story 3.8 performance relaxation; introduce outbound services or dependencies; claim Epic 4 ChangeSet-first behavior without tests proving the real tool path.

## Code Map

- `scripts/mcp-bridge.mjs`, `apps/server/src/http/restore-request-gate.ts`, `apps/server/src/mcp/stdio-main.test.ts` — health discovery, request gate, forwarding lifecycle and real bridge fixtures.
- `packages/db/src/repositories/sources-repository.ts`, `apps/server/src/services/ai-proposal-change-set.ts` — database ownership boundaries for source links and proposal evidence.
- `apps/server/src/config/project-lock.ts`, `apps/server/src/http/live-events.ts` — process ownership/reclaim and SSE replay cursor behavior.
- `apps/server/src/mcp/tools/audit-tool-call.ts`, `apps/server/src/application/ai/prompts.ts`, `packages/db/src/unit-of-work.ts` — existing tool audit envelope, prompt handlers and transaction boundary.
- `apps/web/src/ui-strings/index.ts`, `scripts/check-hygiene.mjs`, `scripts/capability-artifacts.mjs` — strings, source hygiene and generated MCP descriptions.
- `apps/server/src/http/live-events.test.ts`, `apps/server/src/application/mcp-http-parity.test.ts`, `apps/server/src/runtime-lifecycle.test.ts`, `apps/server/src/config/project-lock.test.ts`, web live/conflict tests — existing integration coverage for V1–V5.
- `apps/server/src/application/descriptors.ts`, `packages/core` operation functions, `apps/server/src/mcp/tools/register-tools.ts`, `_bmad-output/planning-artifacts/epics.md` Stories 4.4–4.6 — registry/executor scope and existing direct tool calls. Preserve Story 4.4–4.6 acceptance boundaries.
- `.agents/skills/bmad-retrospective/SKILL.md`, `.claude/skills/bmad-retrospective/SKILL.md`, `.rtk/filters.toml`, story specs — retrospective output handling and baseline/run reconciliation guidance.

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/mcp-bridge.mjs` and `apps/server/src/mcp/stdio-main.test.ts` — return an id-correlated JSON-RPC error for failed forwards and remain usable after restore-gate rejection.
- [ ] `packages/db/src/repositories/sources-repository.ts` and `apps/server/src/services/ai-proposal-change-set.ts` — reject cross-Project chunks/documents and unknown document IDs.
- [ ] `apps/web/src/ui-strings/`, `scripts/check-hygiene.mjs`, capability description source and generated artifacts — split strings below 750 lines, enforce the limit, author useful descriptions, remove `pushPreviewEnabled`.
- [ ] Server/web focused tests — close V1–V5 through runtime and mounted application paths.
- [ ] `apps/server/src/config/project-lock.ts`, `apps/server/src/http/live-events.ts` and tests — compare process identity, recover only provably stale claims, and ensure replay makes cursor progress.
- [ ] MCP audit and prompt transport/application code — include audit persistence in the write transaction and audit prompt list/get reads.
- [ ] Epic 4 Stories 4.4–4.6 implementation surfaces and MCP parity tests — route agent mutations through the typed ChangeSet executor, preserving the declared approval/conflict behavior.
- [ ] Agent guidance and retrospective workflow copies — correct removed-package guidance, document the approved Story 3.8 gate, preserve raw machine output, and normalize story/run state reconciliation without changing orchestrator-owned status files.
- [ ] Disposable runtime fixture — perform and record manual launcher, `/mcp`, `/api/events`, and audit-page smoke checks.

**Acceptance Criteria:**
- Given a restore is in progress, when the stdio bridge forwards a request, then the caller receives a JSON-RPC error with the same id and later requests can still be processed.
- Given a Card or proposal belongs to one Project, when it references another Project's source chunk/document, then the write is rejected and no link or ChangeSet is persisted.
- Given a tool mutation commits, when its audit row cannot be persisted, then neither change is committed; prompt list and get calls each produce durable audit evidence.
- Given a dead/reused PID, partial claim, concurrent lock takeover, or replay page containing an audit row, when lifecycle handling runs, then ownership is never stolen from a live process and SSE replay terminates with a valid cursor.
- Given the project checks run, when source limits, generated capability parity, V1–V5 coverage, and ChangeSet tool behavior are evaluated, then all criteria pass without changing sprint status or user data.

## Verification

**Commands:**
- `corepack pnpm --filter @storymapper/server test` — focused server tests pass.
- `corepack pnpm --filter @storymapper/web typecheck` — UI split and live/conflict wiring typecheck.
- `node scripts/verify.mjs` — hygiene, capability parity, typecheck and build pass.
- `corepack pnpm test` — full workspace suite passes.

**Manual checks:**
- Use a disposable project only; observe owned launcher, `/mcp`, `/api/events`, and audit page across an Agent-visible change and an in-flight restore.

</frozen-after-approval>

## Implementation Notes

### Completed in this remediation pass

- Bridge forwarding now returns a correlated JSON-RPC error and remains available for later requests; `/health` stays behind the restore/shutdown gate so the bridge observes runtime unavailability instead of masking it.
- Source Links and AI proposal evidence enforce same-Project ownership; unknown source documents return an explicit not-found error.
- UI strings are split under the 750-line limit, the hygiene checker enforces the limit, and regression coverage exercises a 751-line fixture.
- MCP capability descriptions are authored in the metadata source and generated artifacts are checked for parity. New UI modules are staged before disposable checkout tests so the fixture uses its normal tracked-file selection.
- V1–V5 coverage was added or extended across server, web, project-lock, and runtime-port paths.
- Lock claims publish metadata atomically and compare PID plus process start time. SSE replay advances across non-transaction audit rows and keeps later commits queued for delivery.
- Prompt list/get reads are audited. Explicitly synchronous, SQLite-only MCP handlers persist successful mutation and audit row in one UnitOfWork; a trigger-based integration test proves rollback when the audit insert fails. Conflict status updates are retained and audited atomically.
- Removed `packages/ai` guidance, retrospective output/run reconciliation, machine-output guidance, and the exact Story 3.3/3.5 baseline commits were updated. The approved Story 3.8 performance decision was not changed.
- The disposable launcher/setup smoke, stdio restore-gate test, SSE integration suite, and audit-page UI tests pass.

### Deliberately outstanding Epic 4 scope

- Story 4.4–4.6 typed ChangeOperation coverage and the shared ChangeSet executor are still the explicitly staged Epic 4 gap. Agent-facing direct writes have not been claimed as ChangeSet-first. This remains an Epic 4 follow-up as required by the approved scope and the retrospective's classification.
- Atomic audit wrapping excludes filesystem-coupled source imports and attachments, remote GitHub import/push/sync/pull and conflict resolution, and asynchronous `PlanWorkItems`; their external side effects cannot be rolled back by the SQLite transaction. These paths need explicit ChangeSet/saga treatment before claiming the stronger all-writes atomicity criterion.
- No single interactive audit-page smoke session was run; the disposable bridge/server tests and mounted audit-page tests cover those surfaces separately.

### Verification

- `node scripts/check-hygiene.mjs`, `node scripts/check-capabilities.mjs`, and `node scripts/verify.mjs` passed with Node 24.17.0.
- `node --test scripts/*.test.mjs` passed: 79 tests.
- `corepack pnpm -r test` passed across the workspace, including 383 server tests and 178 web tests. The performance audit recorded under 8% median overhead in its measured HTTP/SDK cases.
- Tests requiring loopback listeners were run with loopback networking enabled and used temporary fixtures only.


### Review Findings — 2026-10-10 (revision 2)

Purpose: reproduce the requested pre-commit review of Epic 3 remediation against this specification, using blind, edge-case, verification-gap and acceptance review lenses, then repair concrete defects and commit the reviewed changes.

Changelog: reviewed the full working diff, repaired the findings below, and retained the documented incomplete Epic 4 and manual acceptance scope. Graph tools were unavailable; reviewers verified source and test evidence directly. Pre-existing sprint-status changes are excluded from the commit.

- [x] [Review][Patch][high][blind-hunter] Lock claim release can collide with a populated replacement claim. Controlled ENOENT/ENOTEMPTY handling preserves the replacement and returns the original lock cleanup callback; deterministic regression added.
- [x] [Review][Patch][high][blind-hunter] The older map-from-source proposal path accepts foreign Project evidence. The use case now rejects it before persisting a ChangeSet; real registry regression covers two agent-enabled Projects.
- [x] [Review][Patch][medium][blind-hunter] Rejected prompt reads escape auditing. The entire invocation now records terminal success/rejection/error outcomes without payload persistence; SDK rejection regression added.
- [x] [Review][Patch][medium][blind-hunter] Audit filters reject the persisted prompt names. The shared contract accepts exactly prompts/list and prompts/get alongside existing tool names; contract and HTTP route regression added.
- [x] [Review][Patch][medium][edge-case-hunter] Prompt rejection auditing is missing. Same defect and repair as the blind-hunter prompt finding.
- [x] [Review][Patch][high][edge-case-hunter] Estimated Node process start time can disagree with OS identity after a wall-clock adjustment. Lock records now use the same OS-observed process timestamp for owner creation and comparison.
- [x] [Review][Patch][medium][verification-gap] UpdateStoryMapCard lacks terminal audit insertion failure coverage. Added unchanged Card/version history/domain activity assertions.
- [x] [Review][Patch][high][verification-gap] Failed external process inspection lacks refusal coverage. Added missing executable, nonzero exit and malformed timestamp cases, preserving ownership files; missing stdout now produces the explicit refusal.
- [x] [Review][Patch][medium][acceptance-auditor] Rejected prompt calls violate durable audit acceptance. Same defect and repair as the other prompt findings.
- [x] [Review][Patch][high][parent] Generic conflicts must not commit nested writes. Restricted the special durable conflict path to ChangeSetConflictError and added a nested-write rejection regression.
- [x] [Review][Patch][low][parent] Removed temporary hardcoded untracked UI file paths from the checkout fixture. Stage the actual new files before checkout verification.

All four reviewer layers completed. The blind reviewer rechecked its four repairs and found no substantive regression. No reviewer finding was rejected. The three prompt rejection findings share one root cause; all retain their individual verdicts above.

Acceptance remains in progress because the previously recorded Epic 4 executor, external/asynchronous audit coordination, and combined interactive smoke remain outstanding. No sprint-status or deferred-work file was changed by this review.

Final pre-commit verification: `node scripts/verify.mjs` passed (hygiene, 111-capability parity, full workspace typecheck/build); 49 final focused server regressions passed; MCP HTTP/lifecycle/stdio suites passed, including actual competing process ownership; shared audit contract tests passed (2); launcher/hygiene/capability script tests passed (42). `git diff --cached --check` passed after removing one extra trailing blank line.
