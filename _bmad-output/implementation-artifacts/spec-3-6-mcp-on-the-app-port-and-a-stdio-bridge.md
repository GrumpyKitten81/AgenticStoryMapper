---
title: MCP on the app port and a stdio bridge
type: feature
created: 2026-10-08
status: done
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: [oversized]
deferred:
  - summary: >-
      Persisted HTTP/bridge mutation attribution and explicit disabled-Project wire denial remain unverified because inherited empty SDK input schemas discard supplied arguments.
    evidence: |-
      SDK discovery preserves the existing 24 empty schemas. Targeted mutations cannot reach application handlers with required IDs; registry and /api/mcp/call tests do not establish /mcp mutation acceptance. Verify persisted actorId/mcpSessionId and disabled-target non-mutation after the pre-existing input-schema repair.
    location: >-
      packages/mcp/src/transports/server.ts; apps/server/src/mcp/http.test.ts
    severity: medium
  - summary: >-
      Recovery changes the bridge client name to stdio-bridge; its effect on future persisted mutation attribution is unverified.
    evidence: |-
      First initialization forwards clientInfo; replacement initialization uses a fixed name while retaining only the session ID as persistent bridge state. HTTP derives actorId from that name. Current SDK argument loss prevents targeted mutations and their audit writes. Exercise originating-host attribution before and after recovery when those calls become executable; read-only acceptance does not prove it.
    location: >-
      scripts/mcp-bridge.mjs:initialize; apps/server/src/mcp/http.ts:createSession
    severity: medium (unverified)
baseline_revision: 83b42406fc475479474194d2d10a0bf663c88935
---

Reproducing statement: Run bmad-build-auto for Story 3.6, investigate and implement stateful `/mcp` and a stdio bridge against the app's single writer; never write, stage or revert orchestrator-owned `sprint-status.yaml`, and verify independently of its status. Date: 2026-10-08. Version: 3.

<intent-contract>

## Intent

**Problem:** The separate stdio entry opens SQLite independently. The app has no Streamable HTTP session transport or runtime port file, and its generated host configurations launch that separate writer.

**Approach:** Serve stateful MCP on the existing app port through the shared application registry. Replace the separate entry with a stdio forwarding bridge, publish the actual listening port, and produce working configurations for Claude, Cursor and VS Code.

## Boundaries & Constraints

**Always:** Reuse the existing repository, UnitOfWork, actor attribution, contracts, registry and safety enforcement. Apply Host/Origin checks to every MCP request. Session initialization issues `Mcp-Session-Id`; non-initialization requests require a valid session; DELETE ends it. The bridge forwards JSON-RPC, retains only its session ID, reads `<project>/.port`, and re-initializes on 404. Publish the actual port after successful startup and remove the owned file at shutdown. Preserve the existing tool inventory; compare SDK discovery with manifest tool names. Use Node 24 and pnpm 9.15.4. Keep stdout protocol-only in the bridge.

**Never:** Open SQLite from the bridge, add another writer, alter user data or credentials, modify orchestrator sprint bookkeeping, infer verification from a completed status, add full capability parity or the Epic 4 executor, or silently resolve an unspecified Project access policy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Session | Running app; initialize, list and call | Session header, current tool inventory and successful existing read call | SDK protocol errors for invalid messages |
| Session lifecycle | Missing or unknown session; DELETE | Non-initialization requests rejected; deleted session unavailable | Missing session 400; unknown session 404 |
| Access | Project agent access disabled; foreign Host/Origin | Disabled Project data unavailable; foreign requests rejected | Disabled/403 without data mutation |
| Bridge | Running app with `.port`; expired session | Forward to app; establish replacement session on 404 | Explicit stderr failure if discovery or connection fails |
| Startup/shutdown | Default port occupied; orderly close | Actual selected port discoverable; owned `.port` removed | Report errors; never open a foreign service as this app |
| Mixed Project access | Same database contains enabled and disabled Projects | Runtime-scoped session; discovery filtered; per-call safety | See frozen policy below |

</intent-contract>

<frozen-after-approval reason="operator chose Option A during bmad-loop resolve 20261008-132154-6706">

## Mixed-Project MCP access (Option A)

MCP sessions are scoped to the **runtime** (the single writer database opened by the app/bridge for one `.lsm` folder). They are **not** bound to an Agentic Story Mapper `projectId` at Streamable HTTP `initialize`; host configuration and `<project>/.port` already identify that runtime.

**Discovery**

- `ListProjects` returns only Projects with `agentAccess: true`. Disabled Projects are omitted entirely (no names, ids or counts that identify them).
- `ListStoryMaps` and every other tool keeps resolving `projectId` through existing inputs or entity traversal; calls targeting a Project with `agentAccess: false` are rejected as `disabled` and logged when applicable.

**Transport admission**

- When **no** Project in the database has `agentAccess: true`, reject MCP session initialization on `/mcp` (and equivalent bridge setup) with `disabled` without exposing Project data.
- When at least one Project has `agentAccess: true`, allow session initialization; subsequent tool calls enforce switches per Project inside the applying transaction path (re-read `agentAccess`, `github`, `agentProtection` on each authorized call).

**Mid-session switch changes**

- If a human turns `agentAccess` off for a Project while a session is active, the next tool call that resolves that Project is refused; filtered discovery on the following `ListProjects` reflects the change. No requirement to tear down the HTTP session solely because one Project flipped.

**Epic alignment**

- Story 3.6 AC “`agentAccess` off → `/mcp` rejected” means tool and session admission behave as above, not that one disabled Project blocks agents for other Projects in the same database.

</frozen-after-approval>

## Code Map

- `apps/server/src/server.ts:buildServer` — constructs one repository/UnitOfWork and installs root security/restore hooks before registering routes; reuse these for sessions.
- `apps/server/src/main.ts` and `config/runtime.ts` — fixed-port startup; no `.port` publication or occupied-port selection. `http/request-security.ts` captures that configured port; admission must track the actual listener.
- `apps/server/src/mcp/tools/register-tools.ts:createMcpRegistry` — accepts host/session identity; `authorizeTool` enforces access only when a tool resolves a Project. `ListProjects` has no resolver; unscoped `ListStoryMaps` can return all Projects' maps.
- `packages/db/src/repositories/projects-repository.ts:listProjects/getSafetySettings` — multiple logical Projects share the database; access flags require an explicit Project ID. `Project.localPath` is metadata, not necessarily the actual database directory.
- `apps/server/src/http/routes/infrastructure-routes.ts:hostConfigs` — launches old stdio through Corepack and passes database environment; replace with absolute bridge executable/script/runtime-directory arguments.
- `apps/server/src/mcp/stdio-main.ts` and `stdio-main.test.ts` — independent writer entry and inventory fixture; replace entry and test against the running HTTP app.
- `packages/mcp/src/transports/stdio.ts` — existing SDK tool registration/error mapping; preserve inventory. Omitted input schemas currently discard supplied arguments, an inherited limitation to distinguish from transport verification.
- Installed `@modelcontextprotocol/fastify@2.0.1` README — prescribes `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`, which is not a direct dependency. Add the used Node adapter if implementation proceeds; Fastify itself stays shared.
- Planning evidence: [Story 3.6](../planning-artifacts/epics.md), [FR-32/34/36](../planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md), [AD-6/12/13](../planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md). Cached Epic 3 context is newer than all planning artifacts; prior Story 3.5 completion notes were checked against actual safety source.

## Tasks & Acceptance

- [x] `apps/server/src/mcp/http.ts`, `packages/mcp/src/transports/server.ts`, `apps/server/src/mcp/tools/register-tools.ts`, package manifests/lockfile — register session transports, filter `ListProjects` to accessible Projects, enforce Option A admission, and close sessions on DELETE/shutdown.
- [x] `apps/server/src/main.ts`, `server.ts`, `http/request-security.ts`, `config/runtime-port.ts`, `scripts/start.mjs`, runtime/doctor helpers — select/publish/discover the actual app port and remove owned runtime files; preserve listener-based security and launcher ownership.
- [x] `scripts/mcp-bridge.mjs`, old stdio entry/transport, server package scripts — forward protocol to HTTP without opening SQLite; recover expired sessions with only session-ID state.
- [x] `apps/server/src/http/routes/infrastructure-routes.ts`, contracts and web MCP panel/API — generate and expose complete absolute-path client configurations with working copy controls.
- [x] Transport/bridge/command/panel tests — exercise the matrix through SDK clients and actual generated commands with disposable database directories, including mixed Project access per Option A.

**Acceptance Criteria:**

- Given a running app, when an SDK client initializes, lists and calls tools on `/mcp`, then it receives a stateful session and the manifest's existing tool names through the shared writer.
- Given disabled access, mixed Projects, or foreign Host/Origin, when a client addresses `/mcp`, then Option A rejects admission or tool calls without exposing disabled Project data.
- Given a stdio host and an expired session, when it uses the generated configuration, then the bridge discovers the running port and re-initializes after 404 without writing SQLite.
- Given an occupied default port and orderly shutdown, when the owned app starts and closes, then configurations work with the actual port and its runtime file is removed.

## Verification

- `corepack pnpm --filter @storymapper/server test` — existing and new transport/bridge tests pass.
- `corepack pnpm --filter @storymapper/web typecheck` and focused panel tests — configuration types and copying pass.
- `node --test scripts/*.test.mjs` — launcher, runtime discovery and bridge command behavior pass; run serially with builds.
- `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `node scripts/verify.mjs`, `git diff --check` — workspace/release gates pass after implementation.

## Spec Change Log

- 2026-10-08 v1: Investigated actual source and installed SDK; planning halted on unspecified mixed-Project session admission. No implementation or verification is claimed.
- 2026-10-08 v2: Operator resolution Option A — runtime-scoped MCP session, filtered `ListProjects`, per-call safety, initialize rejected when no accessible Project.
- 2026-10-08 v3: Implemented shared HTTP transport, bridge, actual-port discovery and copy controls; four independent review lenses triaged26 findings. Repaired demonstrated stream/draining, DELETE, forwarding, cleanup and discovery defects without changing intent or Option A. Verification fixture failure injection now isolates its intended command phase; real workspace gates still run separately.

## Review Triage Log

### 2026-10-08 — Review pass

- verdicts: 26 findings — high 4, medium 12, low 2, false 5, maybe-false 3
- findings, in reviewer completion order:
  - `[medium]` `[defer]` Verification: persisted HTTP session attribution lacks a wire mutation test — inherited empty schemas discard required IDs; direct-registry tests cannot prove transport attribution. Recorded with the inherited schema limitation.
  - `[medium]` `[patch]` Verification: changed-listener recovery was untested — generated-command acceptance now retains its bridge across a completed restart on a different published port and observes replacement session and real Project results.
  - `[maybe-false]` `[defer]` Verification: recovery collapses persisted host identity to stdio-bridge — the source name changes, but targeted wire mutations remain unavailable; persisted harm requires the deferred mutation test.
  - `[medium]` `[patch]` Edge: unsupported-protocol DELETE kills a valid session — close only after successful termination; SDK calls after rejected DELETE pass.
  - `[high]` `[patch]` Edge: preClose strands unfinished JSON responses — drain active non-SSE requests before closing transports; an outstanding SDK read completes and owned .port cleanup passes.
  - `[high]` `[patch]` Edge: ten-second timeout aborts valid calls — keep the discovery deadline and remove it from forwarded calls; a real read delayed 10.1 seconds completes.
  - `[medium]` `[patch]` Edge: forwarding errors bypass cleanup — finally drains transient work and deletes sessions; malformed input exits without echoing input and its session becomes 404 while the app stays healthy.
  - `[medium]` `[patch]` Edge: verify accepts another healthy runtime — bounded stable-runtime identity validation now rejects a foreign service through the actual verify command.
  - `[low]` `[reject]` Edge: explicit direct remote HOST publishes a bridge-incompatible host — only exceptional direct remote binding encounters this; the owned launcher is loopback-only. Additional remote discovery branches are disproportionate to this uncommon mode, which remains unsupported for the bridge.
  - `[false]` `[reject]` Intent: filtered discovery might mean tool inventory — approved Option A explicitly filters Project results, while the intent preserves existing tool names. Complete SDK discovery and filtered data agree with both.
  - `[medium]` `[defer]` Intent: disabled-target assertion uses /api/mcp/call — inherited schemas discard projectId before SDK resolution. Actual filtered SDK reads, switch changes and all-disabled initialization pass; explicit target acceptance remains unverified.
  - `[false]` `[reject]` Intent: configurations are not operated inside each host application — real generated commands run as subprocesses, Claude/Cursor share that command, VS Code adds its stdio wrapper, and actual copy controls work. Personal host installation is not an acceptance requirement.
  - `[maybe-false]` `[defer]` Intent: recovery changes persisted attribution — source confirms the name change, but targeted mutation evidence requires the inherited schema repair; recorded as a conditional recovery risk.
  - `[false]` `[reject]` Intent: .port should move to the imported database — Option A identifies the app runtime. Startup runtime identity stays stable while health.databasePath follows the shared writer; real archive acceptance covers existing and fresh bridges.
  - `[false]` `[reject]` Intent: tests in the diff do not establish execution — independent parent checks execute the tests and gates; evidence is recorded separately from implementation claims.
  - `[false]` `[reject]` Intent: frozen mixed-Project policy is missing — this spec contains the operator-approved frozen block. Its omission from the auditor's verbatim intent-contract prompt is not a missing implementation policy.
  - `[high]` `[patch]` Blind: passive GET/SSE blocks restore/import — exclude only passive GET /mcp from DB accounting; actual SDK SSE import passes and executing POST calls still delay import until completion.
  - `[medium]` `[patch]` Blind: rejected DELETE leaves a dead session — grouped with Edge DELETE; successful-only close preserves later calls.
  - `[high]` `[patch]` Blind: calls inherit the discovery timeout — grouped with Edge timeout; the 10.1-second read passes.
  - `[medium]` `[patch]` Blind: sequential forwarding blocks notifications/concurrency — initialized messages now forward concurrently with ordered initialization/recovery; a cancellation notification and tools/list arrive during a pending read.
  - `[maybe-false]` `[defer]` Blind: recovery changes persisted host attribution — grouped with the conditional recovery risk; targeted wire mutation evidence is needed to settle its persisted effect.
  - `[medium]` `[patch]` Blind: abnormal input abandons sessions — grouped with Edge cleanup; error-path deletion and normal EOF pass, and supported orderly signals enter finally cleanup. Forced Windows termination cannot execute JavaScript cleanup.
  - `[medium]` `[patch]` Blind: relative DB paths disagree — all callers use checkout-relative getDatabasePath; startup, doctor and verify from an unrelated cwd discover the same disposable runtime.
  - `[low]` `[patch]` Blind: obsolete package scripts lack a required bridge argument — removed unused commands; generated configs invoke the bridge directly with an absolute runtime directory, without a default-path fallback.
  - `[medium]` `[patch]` Blind: HTTP400 protocol errors become fatal stderr — valid SDK error frames, including id:null, remain on stdout; invalid input is followed by a successful tools/list.
  - `[medium]` `[patch]` Blind: verify ignores runtime identity — grouped with Edge identity; actual command refusal passes.

- Grouped patches: high 3, medium 7, low 1. Two deferred entries retain inherited SDK verification limits and conditional recovery attribution. No intent/spec loopback was needed.

### 2026-10-08 — Review pass (follow-up)

- verdicts: 43 findings — high 0, medium 6, low 17, false 17, maybe-false 3
- findings, in layer order (blind, edge, gap, intent):
  - `[medium]` `[patch]` Blind/Edge/Gap: stale `.port` after hard kill blocks restart with an unactionable EEXIST — startup now names the file and the fix (delete it when no server runs); auto-takeover rejected as a silent workaround, the exclusive-create refusal stays.
  - `[low]` `[reject]` Blind: explicit remote HOST publishes a non-loopback `.port` — `carried` the earlier rejection; remote binding stays unsupported for the bridge.
  - `[low]` `[reject]` Blind: `.ts` import runs before the Node 24 check — launchers use the Node 24 runtime; an older Node fails loudly, unlikely in everyday use and the fix reorders imports.
  - `[false]` `[reject]` Blind: forwarded POST has no timeout — the earlier pass removed it on purpose (valid calls exceeded ten seconds); the host owns call timeouts.
  - `[low]` `[reject]` Blind: `/health` round trip per forwarded message — loopback cost, correctness over caching branches.
  - `[false]` `[reject]` Blind: failed request ends the bridge — the matrix requires an explicit stderr failure; the host sees the exit.
  - `[maybe-false]` `[defer]` Blind: recovery loses client identity — `carried` the deferred recovery attribution entry.
  - `[false]` `[reject]` Blind: server-to-client messages dropped — the server uses JSON responses and a static inventory, so it emits none.
  - `[low]` `[reject]` Blind: sessions have no TTL/cap — loopback-only; the bridge deletes sessions on exit, leaks need a force-killed bridge.
  - `[low]` `[reject]` Blind: `clientInfo.name` unvalidated in audit — loopback and Host/Origin-guarded local client; structured logs escape the value.
  - `[false]` `[reject]` Blind: access filter duplicated in two tools — Option A specifies exactly this filtering; the per-map settings read is negligible.
  - `[low]` `[reject]` Blind: development and production configs identical — cosmetic UI duplication, fix touches contract and panel.
  - `[low]` `[reject]` Blind: `.port` record not a contracts schema — the bridge cannot depend on the schema package; no divergence demonstrated.
  - `[low]` `[reject]` Blind: dependency pin inconsistency — no demonstrated breakage.
  - `[false]` `[reject]` Blind: no ADR — the decision is recorded as AD-6/12/13 in the architecture spine named in the spec.
  - `[false]` `[reject]` Blind: silent occupied-port fallback — the intent matrix requires selecting and publishing the actual port.
  - `[false]` `[reject]` Blind: unrelated bmad-loop docs in the diff — those are commit c38b76d, not story code.
  - `[low]` `[reject]` Blind: test hygiene (env mutation, 10.1 s sleep) — no failure shown.
  - `[medium]` `[patch]` Edge: stale `.port` blocks restart — grouped with the first row.
  - `[low]` `[reject]` Edge: corrupt `.port` makes close reject — needs external tampering.
  - `[low]` `[reject]` Edge: remote HOST `.port` — `carried` rejection above.
  - `[false]` `[reject]` Edge: signal before handlers leaves `.port` — no await between publish and handler registration, so no signal is processed in between.
  - `[maybe-false]` `[reject]` Edge: throw after hijack hangs socket — would be low (SDK transport answers errors itself); not worth a guard.
  - `[low]` `[reject]` Edge: session leak without TTL — same as Blind row.
  - `[low]` `[reject]` Edge: unbounded host name — same as Blind row.
  - `[false]` `[reject]` Edge: 503/403 kills bridge without JSON-RPC error — stderr exit is the specified behavior.
  - `[low]` `[reject]` Edge: close against a stopped app exits 1 — session died with the app; failure report is accurate, fix adds a branch.
  - `[low]` `[reject]` Edge: per-message discovery — same as Blind row.
  - `[maybe-false]` `[defer]` Edge: recovery client name — `carried` deferred recovery attribution entry.
  - `[low]` `[reject]` Edge: Node guard order — same as Blind row.
  - `[false]` `[reject]` Edge: literal `null` body corrupts stdout — the identity-verified server never returns it.
  - `[false]` `[reject]` Edge: copy rejection unhandled — unexpected errors rethrow by the focused-catch rule.
  - `[false]` `[reject]` Edge: SSE streams not drained in restore — restore does not use them; sessions close at preClose.
  - `[medium]` `[patch]` Edge/Gap: RUNBOOK and `.env.example` still describe deleted `dev:mcp`/`start:mcp` and `STORYMAPPER_MCP_HOST` — RUNBOOK section rewritten for `/mcp` and the bridge, env entries removed.
  - `[false]` `[reject]` Edge: attribution now client-reported — the intent reuses actor attribution with session identity from the transport.
  - `[medium]` `[defer]` Gap: no wire test of persisted attribution — `carried` the deferred schema-limited entry.
  - `[medium]` `[patch]` Gap: stale `.port` — grouped with the first row.
  - `[medium]` `[patch]` Gap: stale docs — grouped with the docs row.
  - `[false]` `[reject]` Intent: active-Project `.port` reading — `carried`; runtime directory is stable by Option A.
  - `[false]` `[reject]` Intent: frozen policy not in contract — `carried`; the frozen block exists in this spec.
  - `[false]` `[reject]` Intent: Claude/Cursor/VS Code not run inside hosts — `carried`; generated commands run as subprocesses.
  - `[low]` `[reject]` Intent: no separate Claude Code CLI configuration — the intent names Claude generally and the shared command works.
  - `[false]` `[reject]` Intent: `main.ts` wiring untested — `scripts/runtime-port.test.mjs` starts the real launcher path.

- Patches applied: `apps/server/src/main.ts` startup diagnostic, `docs/RUNBOOK.md` MCP section, `.env.example`. No intent/spec loopback.

## Escalation Resolution (2026-10-08)

Operator chose **Option A** (runtime-scoped session, filtered discovery, per-call safety). Recorded in `<frozen-after-approval>`; `bmad-loop resolve --no-interactive` re-arms the story.

## Auto Run Result

Status: done

- Summary: stateful `/mcp` on the app port, stdio forwarding bridge, actual-port `.port` publication, absolute-path host configurations with copy controls (see commit d4827f8). Follow-up pass added an actionable stale-`.port` startup diagnostic and replaced stale stdio instructions in the RUNBOOK and `.env.example`.
- Files changed this pass: `apps/server/src/main.ts` (EEXIST on `.port` names the file and fix), `docs/RUNBOOK.md` (MCP section for `/mcp` and bridge), `.env.example` (removed `STORYMAPPER_MCP_HOST`/`SESSION_ID`).
- Review: 43 findings; patched 2 grouped medium entries (stale `.port` diagnostic, stale docs); deferred 0 new (3 carried onto the two existing deferred entries); 38 rejected with reasons in the triage log.
- Follow-up review recommended: false (no `high` patched on this follow-up pass; patched mediums: 2).
- Verification: server `typecheck` passed; `node --test scripts/runtime-port.test.mjs` 5/5 and `scripts/commands.test.mjs` 29/29 passed; `node scripts/verify.mjs --skip-typecheck --skip-build` passed; `git diff --check` clean for changed code. Full server test suite, web checks and the build were not re-run this pass.
- Residual risks: unverified persisted attribution on `/mcp` mutations (inherited empty tool input schemas) and recovery host-name change; a stale `.port` still needs manual deletion by design.
