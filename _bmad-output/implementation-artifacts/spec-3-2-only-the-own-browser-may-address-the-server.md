---
title: Only the own browser may address the server
type: feature
created: 2026-10-06
status: done
baseline_revision: f1197caf975222f82e1919f8ae74e449e033fe90
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - C:/Local/github/StoryMapper/AGENTS.md
  - C:/Local/github/StoryMapper/.wolf/OPENWOLF.md
  - C:/Local/github/StoryMapper/.wolf/cerebrum.md
warnings: [oversized]
deferred: []
---

Purpose: Complete Story 3.2 using bmad-build-auto and verify the existing implementation independently; preserve orchestrator ownership of sprint-status.yaml. Date: 2026-10-06. Version: 2. Changelog: Implemented, independently verified and completed four review layers with two test-evidence repairs.

<intent-contract>

## Intent

**Problem:** Foreign websites must not drive the local server. Existing root security hooks admit malformed Host ports and media-type suffixes, and the upload exemption extends beyond the actual upload method.

**Approach:** Complete strict Host, Origin and mutation-media enforcement on every HTTP surface, preserving production, Vite development and trusted local-process access. Verify existing startup, remote opt-in and offline behavior rather than assuming prior completion.

## Boundaries & Constraints

**Always:** Every route requires a syntactically valid loopback Host authority with the served port. Present Origin must exactly match a served loopback origin (127.0.0.1, localhost or bracketed ::1 at the app port); development additionally permits the existing two Vite origins on 5173. Missing Origin passes. POST/PUT/PATCH/DELETE require exactly application/json media type, case-insensitive with optional parameters, except POST /api/projects/import and DELETE /mcp. These exceptions retain Host/Origin enforcement and leave upload parsing to its handler. Query strings do not change the exception identity. Reject security violations before parsing or mutation. Keep owned launchers loopback-only. Use Node24/pnpm9.15.4 and disposable SQLite data; follow Cursor rules and existing absolute imports.

**Never:** Write, stage or revert sprint-status.yaml, or infer verification from its rows. Commit or push without an explicit request. Add /mcp transport, safety switches, authentication, dependencies, providers, telemetry, remote assets or outbound calls. Fix unrelated Windows restore defects (previous story's accepted follow-up work). Add compatibility layers, silent failures or speculative configuration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Host | Valid loopback with served port; foreign, missing, wrong-port or malformed authority including suffix junk, signs, extra colons, brackets | Valid passes across API, health, app/assets and unknown routes; others rejected before malformed body parsing | 403 |
| Origin | Absent, served aliases, allowed Vite origins; foreign, null, wrong port/scheme/path | Absent/served pass; Vite only in development; all others rejected | 403 |
| Mutation media | POST/PUT/PATCH/DELETE, JSON with parameters/case; missing, text/form, application/json-other/.foo/+suffix | JSON reaches existing handler; other media cannot mutate, including bodyless DELETE | 415 |
| Exceptions | POST archive multipart and DELETE /mcp including query; other methods/paths | Upload reaches archive validation; MCP deletion is admitted through hook; foreign headers still rejected; other method/path requires JSON | Existing handler outcome; foreign 403, wrong method/media 415 |
| Binding | Direct server non-loopback HOST with opt-in absent/false, then true; launcher with true | Direct refusal before DB creation names variable; true starts with warning and retains loopback HTTP admission; launcher refuses | Explicit startup diagnostic |
| Offline | Server startup and app/API/assets with GitHub off, no agent | No outbound network request, update/telemetry or remote asset | Network stub fails on any outbound call |

</intent-contract>

## Code Map

- `apps/server/src/http/request-security.ts:7` — Host parser uses parseInt; replace partial parsing with complete authority validation. JSON regex at line4 accepts invalid suffix media. Upload exemption at line62 applies to all methods and duplicates handler media validation.
- `apps/server/src/server.ts:26` — root hook installed before CORS, multipart, restore gate, routes and served app. Preserve ordering and existing Vite CORS policy.
- `apps/server/src/server.test.ts:195` — actual production server fixture, rejected writes/persisted-data assertions, multipart exception and offline network stubs. Extend these outer-surface tests; use a new Project's removable Story Map for bodyless DELETE regression (no Project deletion endpoint exists). Existing root restore test is independently excluded due to documented Windows restore failures.
- `apps/server/src/main.test.ts:106` — actual prod/dev socket admission and direct remote startup/warning tests. Extend raw HTTP Host regressions here where appropriate.
- `apps/server/src/config/runtime.ts:11`, `apps/server/src/main.ts:43` — explicit remote opt-in, warning and owned-launcher guard already present; verify rather than duplicate.
- `scripts/runtime.mjs:51`, `scripts/commands.test.mjs:91` — launcher loopback checks and real launcher refusal, including opted-in remote HOST.
- `apps/server/src/http/routes/index.ts:930` — only actual multipart upload is POST archive import; source-document/attachment routes use JSON.
- `.env.example:3`, `docs/RUNBOOK.md:52` — new flag documented; old flag absent from operational code/env/docs. Historical planning baseline references are retained.
- `apps/web/vite.config.ts:19` — existing port5173 and app-port proxy. Do not expand Vite configuration.

## Tasks & Acceptance

**Execution:**
- [x] `apps/server/src/http/request-security.ts`, `apps/server/src/server.ts` — fully validate Host/JSON media, constrain exception to actual method/path, remove redundant upload content-type restriction; delegate Node24 missing-Host admission to the root hook for403.
- [x] `apps/server/src/server.test.ts`, `apps/server/src/main.test.ts` — cover each matrix row on actual HTTP surfaces; prove denied bodyless DELETE preserves Project and Story Map, then valid JSON DELETE removes the map. Preserve existing offline/startup tests.
- [x] `.env.example`, `docs/RUNBOOK.md`, `apps/server/src/config/runtime.ts`, `apps/server/src/main.ts`, `scripts/commands.test.mjs` — inspected existing flag/binding checks; 28 launcher tests passed, no additional edits needed.

**Acceptance Criteria:**
- Given any HTTP surface, when Host is invalid or present Origin is foreign, then it returns403 before mutation; requests without Origin remain usable.
- Given every mutation method, when media is not JSON and the method/path is not an explicit exception, then it returns415 and persisted data is unchanged.
- Given the actual direct startup and launcher commands, when remote binding is requested, then refusal/opt-in/warning and retained loopback HTTP admission follow the binding matrix.
- Given GitHub is disabled and no agent is connected, when the real server initializes and serves app/API/assets under network stubs, then no outbound request occurs.

## Spec Change Log

## Review Triage Log

### 2026-10-06 — Review pass

- verdicts: 10 findings — high 0, medium 0, low 2, false 8, maybe-false 0. Verification-gap and edge-case layers returned no findings. The three-worker limit required intent alignment to launch after verification completed; all four reports were collected before triage.
- findings, in report completion order:
  - `[false]` `[reject]` Blind: malformed JSON parameters can reach a handler — the contract requires the application/json media type with optional parameters, not a replacement for Fastify's parameter parser. These inputs retain the JSON base type and cannot become a browser simple request; foreign Origin still returns403. No non-JSON media suffix reaches mutations.
  - `[false]` `[reject]` Blind: malformed request target with foreign Host returns400 rather than403 — malformed percent encoding is rejected by the router before any routable application surface, as the existing malformed-URL test establishes. The any-route contract protects valid API/health/app/asset/unknown targets; it does not require accepting invalid request-target syntax to deliver an application status. No mutation occurs and no changed behavior is exposed.
  - `[low]` `[patch]` Blind: denied actual asset tests use POST rather than GET/HEAD — added direct foreign Host/Origin GET/HEAD assertions on the real built asset and client navigation URL. Affected tests pass.
  - `[low]` `[patch]` Blind: positive PATCH media test reaches unknown endpoint — added a case-insensitive parameterized JSON PATCH through the existing Story Map endpoint and asserted its persisted name before DELETE. No PUT endpoint exists; its404 gate-admission check remains. Affected tests pass.
  - `[false]` `[reject]` Blind: offline evidence does not execute browser JavaScript — the explicit story acceptance runs the server under a network stub with GitHub off and no agent; the retained test operates precisely that surface and local asset serving. This run claims no browser execution or browser network interception.
  - `[false]` `[reject]` Intent: literal title could mean browser/session identity — resolved story criteria explicitly admit absent Origin and trust local processes; header admission is the specified behavior, not a browser identity feature.
  - `[false]` `[reject]` Intent: Node clients do not execute a foreign page/rebinding sequence — acceptance explicitly supplies foreign Host/Origin headers. Real prod/dev sockets exercise those exact server-boundary requests; no actual-browser attack execution is claimed.
  - `[false]` `[reject]` Intent: offline server tests do not observe browser requests — same explicit server-process acceptance, independently executed no-outbound stubs; no broader browser claim.
  - `[false]` `[reject]` Intent: exceptions still check Host despite Origin-only wording — the separate any-route Host requirement applies universally; exceptions waive the JSON check while retaining Host/Origin, consistent with all stated requirements.
  - `[false]` `[reject]` Intent: unified diff cannot independently prove verification history or temporary sprint edits — the parent personally executed all checks and reviewed the diff, and every issued mutation excluded sprint-status. Diff-only historical proof is not claimed; independent command results and this session's explicit file actions supply the evidence.

### 2026-10-06 — Review pass (follow-up)

- verdicts: 18 findings — high 0, medium 0, low 7, false 11, maybe-false 0. Verification-gap layer returned no gap findings; its one other finding is row 14.
- findings, in report completion order (blind, edge, verification-gap, intent):
  - `[false]` `[reject]` Blind: import route lost its media check — the contract says the exception leaves upload parsing to its handler; `request.file()` rejects non-multipart with `FST_INVALID_MULTIPART_CONTENT_TYPE`, which the existing test asserts.
  - `[low]` `[reject]` Blind: test asserts Fastify internal error code — negligible coupling, test fails loudly on library change; fix would add assertions without a named harm.
  - `[low]` `[reject]` Blind: loopback list duplicated in the hook — the intent enumerates exactly 127.0.0.1, localhost and bracketed ::1; the narrowing is specified, and unifying would add an exported abstraction for a rarely hit drift.
  - `[low]` `[patch]` Blind: port comparison accepts leading zeros — replaced `Number(match[1]) === port` with string equality `=== String(port)`; added `localhost:04317`/`0004317` to the inject invalid list and `localhost:0<port>` to the socket list. Scoped tests pass.
  - `[low]` `[reject]` Blind: `requireHostHeader:false` lacks rationale/regression test — the real-socket test with `setHost=false` fails with Node's 400 if the option is removed; no named harm from a missing comment.
  - `[low]` `[reject]` Blind: import path literal duplicated — rarely met; exporting a shared constant adds surface for no demonstrated drift.
  - `[false]` `[reject]` Blind: tests repetitive/missing userinfo, trailing dot, duplicate Host cases — userinfo and trailing dot fail the anchored regex; no concrete failing scenario is shown.
  - `[false]` `[reject]` Blind: opt-in values and missing ADR — opt-in parsing is pre-existing and unchanged by this diff; the Host/Origin hook predates this story, so no new architecture-level decision is introduced.
  - `[false]` `[reject]` Edge: leading-zero Host port — carried to row 4 (same root cause, patched).
  - `[low]` `[patch]` Edge: empty-Host inject case runs as `localhost:80` — light-my-request replaces a falsy Host, so the case passed by wrong port; removed `""` from the inject list. The real-socket test still covers empty and missing Host.
  - `[false]` `[reject]` Edge: malformed target with foreign Host returns 400 — carried from the previous pass (router rejects invalid targets before any route).
  - `[false]` `[reject]` Edge: import route skips pre-parse 415 — same as row 1; upload parsing belongs to the handler by contract.
  - `[low]` `[reject]` Edge: Host loop covers POST only — the Host check is the first, method-independent statement of the hook, and foreign-Host GET/HEAD are asserted; a method-specific regression is not plausible.
  - `[false]` `[reject]` Verification-gap other: leading zeros — same root cause as row 4, patched.
  - `[false]` `[reject]` Intent: tests use inject rather than sockets for media rules — the same hook runs in both; real-socket Host/Origin/media tests exist in main.test.ts; surface difference is not a behavioral gap.
  - `[false]` `[reject]` Intent: binding/offline/launcher not changed in the diff — the intent says verify existing behavior; unchanged tests for them were executed and pass (previous pass, 28 launcher tests).
  - `[false]` `[reject]` Intent: Vite proxy targets fixed 127.0.0.1:4317 — pre-existing and the intent forbids expanding Vite configuration; Host/Origin remain admitted.
  - `[false]` `[reject]` Intent: Host port reading D (numeric vs canonical) — resolved by row 4 patch; canonical decimal is the single remaining reading.

## Verification

- `corepack pnpm --filter @storymapper/server test -- src/server.test.ts src/main.test.ts -t '^(?!.*installs the production root gate)'` — all scoped server/socket tests pass; the one unrelated Windows restore-root test is explicitly excluded, never counted as acceptance coverage.
- `node --test scripts/commands.test.mjs` — launcher checks pass; run serially after server tests because fixtures copy built assets and tracked sources.
- `node scripts/verify.mjs` — release hygiene, workspace typecheck and build pass.
- `git diff --check` — clean whitespace. Inspect unified diff and confirm no user data/credentials or sprint-status modification.
- `rg -n 'STORYMAPPER_STRICT_LOCAL' apps/server/src scripts .env.example docs README.md` — no operational old-flag reference (rg exit1 expected).

## Implementation Verification

Parent read the unified diff and independently executed all listed checks on Node24.20.0/pnpm9.15.4: 20 server/socket tests passed (the existing Windows restore-root test was explicitly excluded), 28 launcher tests passed, release hygiene/typecheck/build passed, and whitespace/old-flag checks passed. Every matrix row is covered by executed server/socket/launcher tests, including no-outbound stubs. Existing Rollup dependency annotation and bundle-size warnings remain. Native POSIX execution was not operated in this Windows run. No credentials/user data or sprint-status changes; no commit/push.

## Auto Run Result

Status: done

- Summary: strict loopback Host authority (canonical port), exact Origin, and JSON-only mutation media with the narrow upload/MCP exceptions are enforced in the root hook; `requireHostHeader:false` lets Host-less requests reach the hook for 403.
- Files changed: `apps/server/src/http/request-security.ts` (Host/media/exception logic), `apps/server/src/server.ts` (Host-less admission to hook), `apps/server/src/server.test.ts` and `apps/server/src/main.test.ts` (matrix coverage over inject and real sockets).
- Review (follow-up pass): patches applied 2 (low) — canonical port comparison, redundant empty-Host inject case removed; deferred 0; rejected findings are recorded with reasons in the triage log.
- Follow-up review recommended: false (no high patched; patched counts: high 0, medium 0, low 2).
- Verification: scoped server/socket tests 20 passed, 1 skipped (restore-root test excluded as before); server typecheck clean; `git diff --check` clean apart from a trailing blank line fixed in this spec.
- Residual risks: native POSIX run not performed; existing Windows restore-root test remains excluded; `sprint-status.yaml` left untouched and modified in the working tree by the orchestrator.
