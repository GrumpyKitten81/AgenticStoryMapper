---
title: '7.1 Credentials in a user-level file'
type: feature
created: 2026-10-18
updated: 2026-10-19
version: 2
status: done
baseline_revision: e8bd5873acb2be7ecb138667f7165fe36659f46d
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-1-credentials-in-a-user-level-file.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Partial GraphQL search responses may suppress incomplete-response or permission failures.
    evidence: |-
      CLI and Octokit partial-search catches predate this story. They retain partial search data after provider errors. Resolve provider completeness in the later identity/import work; do not infer remote deletion from incomplete reads.
    location: >-
      packages/github/src/providers/github-provider.ts:73
    severity: medium
  - summary: >-
      A CLI milestone HTTP422 is still assumed to mean an existing milestone.
    evidence: |-
      The prior implementation suppressed every milestone-create failure; this story narrows suppression and tests unexpected failures stop before issue mutation. Duplicate identity is not yet confirmed for every422; later confirmed remote-plan/reconciliation work must distinguish validation causes.
    location: >-
      packages/github/src/providers/github-provider.ts:196
    severity: medium
  - summary: >-
      Native Windows credential ACL and atomic replacement acceptance remain unverified.
    evidence: |-
      macOS real filesystem tests and simulated APPDATA paths pass; they do not establish Windows ACL/ownership, unsafe-parent handling or replacement of an existing file on native Windows. Execute the bounded credential fixture on a Windows runner with disposable APPDATA before claiming native acceptance. Real CLI/account acceptance is also not claimed by intercepted transport tests.
    location: >-
      apps/server/src/services/credential-file.ts
    severity: medium (unverified)
---

Reproducing statement: Implement Story 7.1 with bmad-build-auto, independently verify credentials outside Project data, and never write, stage or revert orchestrator-owned sprint-status.yaml. Date: 2026-10-19. Version: 2.

<intent-contract>

## Intent

**Problem:** App credentials currently resolve environment before CLI, lack a user-level file, and can expose process errors or use an environment identity while reporting CLI. Sharing Project data must never disclose credentials.

**Approach:** Use one resolver with CLI → user file → environment precedence, local source-status probes, safe atomic user-file storage and secret-free provider/output boundaries. Supply the human-only writer for Story 7.2 without implementing its connection wizard.

## Boundaries & Constraints

**Always:** Store only GitHub token data in credentials.json under %APPDATA%/StoryMapper on Windows or ~/.config/storymapper elsewhere, outside Project persistence. Use atomic replacement, POSIX 0600 and safe regular-file/parent handling; reject unsafe symlink paths. Continue only after absent sources; malformed/unreadable selected sources, process failures and rejected credentials fail visibly without changing accounts. Status and provider identity agree. Public status means locally configured, never remotely verified. Ordinary disabled GitHub actions refuse before credential/provider calls. Human-only credential writes never use SQLite, Activity, ChangeSets, MCP or generic tool arguments. Sanitize errors before public/log boundaries. Tests use generated in-memory canaries and disposable locations, never real credentials.

**Never:** Write, stage or revert sprint-status.yaml; infer verification from its rows; alter deferred-work or orchestrator state; run live GitHub/auth/login; inspect real home credentials; alter standalone Python authentication; implement wizard/Connect/switch changes, OS keychain, multiple profiles, new providers or prototype compatibility. No commit/push. Preserve existing domain protection and restore gates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Priority | Independently configured CLI, file, environment | CLI wins; without CLI file wins; without CLI/file environment wins; actual used auth agrees | Selected provider rejection never retries another source |
| Absence | No CLI/file/environment | Actionable failure naming credential file location and CLI/environment alternatives | No raw subprocess output |
| Unusable source | Selected malformed/unreadable file or unexpected CLI probe failure | Explicit sanitized error; environment not used | Status provides actionable cause; resolution refuses |
| Local status | GitHub off, status requested | Sanitized source availability only; no network-backed auth status or provider request | No token/file contents returned |
| File lifecycle | Human token create/replace/reopen | Exact token persists at fixed user location, atomic replace, POSIX 0600 | Failed write/rename preserves previous target and cleans temporary file |
| Unsafe path | Symlink/nonregular target or unsafe parent | Refusal before following unsafe path or storing token | Actionable sanitized location/cause |
| Authority | Nonhuman writer invocation | Refused before any file mutation | No secret in refusal |
| Output isolation | Generated canary used through actual HTTP success/failure and stored user file | Real responses/logs/Activity/operational snapshot/portable archive contain no canary, authorization or request-body leak | Provider/process errors sanitized |

</intent-contract>

## Code Map

- `apps/server/src/services/credentials.ts`: envCredentialStatus, githubCliCredentialStatus, githubCredentialStatuses, resolveGitHubAuth/resolveProviderAuth; sole app selector. Currently env-first and network auth status with broad catch.
- `packages/contracts/src/schemas/domain.ts:527`: credentialSourceSchema and credentialStatusSchema. `packages/contracts/src/api/http.ts:428`: connector validation and credential statuses response. Define credential storage input/output here; never expose token via MCP.
- `apps/server/src/application/connector/connector.use-cases.ts:32`: validateConnectorConnection already requires human, gates switch/database before and after awaits. Preserve ordinary off refusal. Add a dedicated actor-checked file-write application boundary for 7.2; HTTP token-write/wizard integration belongs to 7.2.
- `apps/server/src/http/routes/infrastructure-routes.ts:31`: GET credentials/status is an existing infrastructure exemption; return contract-validated sanitized status and route errors safely.
- `packages/github/src/providers/github-provider.ts:11`: validation returns raw error.message; `runGh:335` inherits token/host/debug environment; `createOctokit:319` has .env instructions. `providers/work-item-provider.ts` owns ProviderAuth. Every app consumer already uses resolver-returned connection/auth.
- `apps/server/src/services/work-item-sync.ts`, `application/sync/github-{import,pull,conflict}-command.ts`, `application/sync/sync-conflict.use-cases.ts`: resolver consumers; preserve their safety checks, remove only concrete bypasses if found.
- `apps/server/src/services/project-archive.test.ts:68`, `packages/db/src/snapshot.ts`, `packages/db/src/schema/classification.ts`: existing real archive and operational snapshot seams; user-file secret must never enter SQLite. `services/runtime-log.ts` and `application/errors.ts` sanitize logs but forward DomainError messages publicly.
- Existing safety coverage: `http/routes/getting-started.test.ts`, `services/work-item-sync.test.ts`, `services/sync-review.test.ts`, `application/sync/github-command-regressions.test.ts`, `mcp/github-command-{sdk,transports}.test.ts`.
- Graph tools unavailable this session; source investigation confirms map. `.wolf/OPENWOLF.md`, global CLAUDE and matching Cursor rules apply. Node24 path: `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts` — add user-file source and sanitized status/action contracts at single schema source; no parallel schemas or tool token inputs.
- [x] `apps/server/src/services/credentials.ts` and focused credential-file helper — implement fixed paths, local CLI probe and ordered resolver; distinguish recognized absence from all other failures. Implement atomic restricted storage with safe paths and sanitized filesystem errors.
- [x] `apps/server/src/application/connector/connector.use-cases.ts` or focused credential use-case — supply actor-checked writer, with secret-bearing input isolated from persistence/audit. No public token-writing endpoint until 7.2.
- [x] `packages/github/src/providers/github-provider.ts` and shared CLI environment helper — pin intended GitHub CLI identity for every subprocess, eliminate token overrides/debug/prompt/update traffic, consume resolved auth only, remove .env instructions and sanitize credential/provider failures. Retain unrelated merge semantics.
- [x] `apps/server/src/http/routes/infrastructure-routes.ts` — safely expose schema-validated local status; ensure off-switch validation remains pre-call refused.
- [x] Focused tests beside credentials/use-case/provider plus actual HTTP/archive fixtures — cover every matrix row, including failure preservation, generated canary outputs and isolated home/AppData fixtures. Update affected existing tests if the intentional source order changes their assumptions.

**Acceptance Criteria:**
- Given all available credential identities, when app validation/provider use executes, then the reported selected source and actually supplied CLI/token identity agree despite inherited GH_TOKEN/GITHUB_TOKEN/GH_HOST.
- Given human storage, when files reopen after create/replacement, then fixed user location, exact content, atomic failure behavior and POSIX mode are observed without Project writes.
- Given disabled GitHub actions or nonhuman storage calls, when invoked at application/HTTP/MCP surfaces, then credential/provider/file mutation is refused at the corresponding outer boundary.
- Given generated credentials through successful and failed actual HTTP validation, when real response/log/Activity/snapshot/archive outputs are inspected, then all remain credential-free and failures retain actionable sanitized messages.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass

- verdicts: 20 findings — high 2, medium 9, low 2, false 5, maybe-false 2
- grouping: 8 patch entries (1 high, 6 medium, 1 low); 3 deferred entries; 6 rejected rows.
- findings:
  - `[high]` `[patch]` blind-1: Windows fixture can touch real APPDATA credentials — BeforeEach changes homedir but not APPDATA; credentialFilePath selects APPDATA on Windows. Isolate every test and use native-path assertions. Applied per-test disposable APPDATA and platform-correct assertions; simulated Windows create/reopen regression passes.
  - `[medium]` `[patch]` blind-2: Exposed POSIX token files are accepted — checkTarget checks type/link/owner only;0644 token file is consumed. Refuse group/other exposure on read. Applied fstat permission refusal before reading;0644 refusal/no fall-through and0600 replacement regression passes.
  - `[medium]` `[patch]` blind-3: Foreign-owned in-home ancestor can replace credential descendants — checkParents verifies owner only at final parent; differently owned0755 .config passes. Verify ownership for in-home ancestors. Applied ownership checks to inside-home ancestors; injected foreign-owned.config refusal and trusted outside-home regression passes.
  - `[medium]` `[patch]` blind-4: Validation status snapshot can disagree with actual source — validateConnectorConnection probes statuses before a separate auth resolution. Report selected source from the actual resolved context. Applied selected-source projection from actual resolved auth.source; deterministic source-change regression passes.
  - `[medium]` `[patch]` blind-5: Active CLI account may change after resolution — githubCliConfigured discards token and returns boolean; provider independently selects current CLI account. Pin transient resolved auth across calls. Applied transient cliToken capture and explicit selected GH_TOKEN after inherited environment cleanup for every provider CLI call; configuration-change regression passes.
  - `[low]` `[reject]` blind-6: Concurrent first-time writers may fail with EEXIST — No token-write HTTP/UI exists yet; direct concurrent internal calls fail loudly without corrupting credentials. This low-frequency case would add creation-race branches; reject under low finding rule.
  - `[medium]` `[defer]` blind-7: Partial GraphQL results suppress incomplete-response failures — Both CLI and Octokit partial-search suppression existed before this diff; only comment changed at CLI catch. Broader provider completeness remains pre-existing follow-up.
  - `[medium]` `[defer]` blind-8: HTTP422 milestone errors are treated as existing milestone — Prior implementation suppressed every milestone create failure. This change narrows that suppression to422 but does not prove duplicate identity; pre-existing reconciliation issue remains.
  - `[low]` `[patch]` blind-9: Nested sanitization loses specific credential failure — Nested public read throws sanitized DomainError; outer wrapper sanitizes it again with no status. Preserve trusted sanitized DomainError. Applied WeakSet recognition of trusted sanitized provider DomainErrors; nested401 preserves selected-credential error regression passes.
  - `[maybe-false]` `[defer]` blind-10: Native Windows credential ACL/replacement safety unverified — Tests run on macOS and simulate Windows path selection; native ACL, unsafe parent and atomic replacement need a Windows runner. If true impact medium; no cross-platform acceptance claimed.
  - `[high]` `[patch]` edge-1: Windows fixture can overwrite real credential file — Same verified beforeEach APPDATA omission as blind-1; same isolation repair. Same APPDATA repair as blind-1; isolated Windows storage/reopen test passes.
  - `[medium]` `[patch]` edge-2: Reported and supplied credential sources can diverge — Same independently awaited status/auth probes as blind-4; selected metadata must follow captured resolution. Same captured-source repair as blind-4; response has exactly the resolved selected source.
  - `[medium]` `[patch]` edge-3: Host-qualified owner bypasses pinned CLI hostname — owner is only min(1); repoSlug permits other.example/owner/repo. gh --repo accepts HOST/OWNER/REPO. Reject host-qualified input before provider calls. Applied shared contract plain-name validation plus provider admission checks; six host/path variants refused in both modes before external calls.
  - `[medium]` `[patch]` gap-1: Changed milestone failure branch lacks regression test — Pre-verified gap: all real provider test items omit milestone; fake provider server tests cannot cover ensureMilestone. Add milestone-bearing rejection/422 cases. Applied milestone-bearing unexpected failure and permitted422 cases; unexpected error stops before issue create/update and messages remain sanitized.
  - `[false]` `[reject]` intent-1: Human entry flow is not exercised — Original Story7.1/detail plan supplies storage foundation to7.2; original adjacent7.2 explicitly owns guided connection/token entry. The story boundary precedes this generated spec.
  - `[false]` `[reject]` intent-2: Human-only writer authority is application-only — No writing HTTP/MCP surface is introduced or required in7.1. Direct actor refusal tests exercise the actual outermost writer boundary;7.2 owns route/UI integration.
  - `[false]` `[reject]` intent-3: Consumption tests intercept GitHub/CLI — Original acceptance requires generated in-memory canary/output inspection; real token/live GitHub use is excluded by binding plan. Real provider with intercepted transport and actual HTTP/storage satisfies this boundary.
  - `[maybe-false]` `[defer]` intent-4: Windows paths are simulated rather than native acceptance — Same unverified native Windows boundary as blind-10; one shared deferred item records the limitation and required evidence.
  - `[false]` `[reject]` intent-5: Diff reports do not independently prove skill/test execution — Parent ran renderer exactly once, read printed snapshot and observed package/root/release processes exit0. No sprint row supplies verification. Evidence is observed tool execution, not authored claims alone.
  - `[false]` `[reject]` intent-6: OpenWolf records unrelated orchestration history — Launcher handoff appeared concurrently during investigation and is preserved under explicit OpenWolf/dirty allowlist. Product/orchestrator policy was not changed by this implementation; no sprint diff exists.

### 2026-10-19 — Review pass (follow-up)

- verdicts: 40 findings — high 0, medium 10, low 17, false 12, maybe-false 1
- grouping: 3 patch entries (2 medium, 1 low); 1 carried deferred; remainder rejected.
- findings:
  - `[false]` `[reject]` blind-1: Writer has no entry point — Story 7.2 owns the route/UI by the intent ("Supply the human-only writer for Story 7.2"); carried reasoning of intent-1/2.
  - `[false]` `[reject]` blind-2: No ADR — docs/adr/0008-epic-7-github-connection-and-sync-policy.md already records the Epic 7 credential policy.
  - `[false]` `[reject]` blind-3: Precedence change and message wording are silent — CLI → user file → environment is the stated intent; messages are intentional.
  - `[false]` `[reject]` blind-4: Broken CLI blocks lower sources — the Unusable-source matrix row requires an explicit error and no environment use.
  - `[medium]` `[patch]` blind-5: Symlinked/group-writable ancestors rejected — symlink part verified: checkParents lstat-rejects system links such as /home -> /var/home. Applied following of symlinks above the home directory (home and below still refused); regression test passes. Group-writable part is low and rejected: the error names the fix.
  - `[maybe-false]` `[defer]` blind-6: Windows ACL/roaming APPDATA — carried to the existing native-Windows deferred item; APPDATA is the intent-mandated location.
  - `[low]` `[reject]` blind-7: Residual TOCTOU windows — handle-level mode/nlink checks exist; remaining swap needs a same-user attacker; fix would add complexity.
  - `[false]` `[reject]` blind-8: Schema regex breaks stored rows/EMU owners — provider enum is github only; EMU users cannot own repositories; no backward compatibility is required. Duplicate assertion is low and not worth a change.
  - `[medium]` `[patch]` blind-9: getRemoteItem no longer returns undefined for deleted issues — verified: work-item-sync.ts:322 and github-pull-command.ts:20 use undefined as remote_deleted; the removed catch was the only producer. Applied narrow missing-issue mapping (CLI "Could not resolve to an Issue", GraphQL NOT_FOUND at repository.issue) with other failures still sanitized and thrown; provider tests for both modes pass.
  - `[low]` `[reject]` blind-10: CLI failure mapping and dropped url — generic message still names credentials/access; extra stderr parsing not worth it.
  - `[low]` `[patch]` blind-11: Provider self-imports @storymapper/github — verified cycle through index; replaced with relative imports. Test script exists (20 tests run).
  - `[low]` `[reject]` blind-12: Duplicated selected projection and blocklist environment — no concrete divergence shown; allowlist would change existing CLI behavior.
  - `[false]` `[reject]` blind-13: Status endpoint spawns CLI when off, exposes path, writes no audit — local status while off is required by the Local status row; Activity must not record credential writes; server is loopback-only.
  - `[low]` `[reject]` blind-14: Strict schema, token bounds, unverified response — speculative; no failing input shown.
  - `[medium]` `[patch]` edge-1: Not-found issue aborts pull — same root cause as blind-9; same repair.
  - `[medium]` `[patch]` edge-2: Removed catch contract — same root cause as blind-9; same repair.
  - `[low]` `[reject]` edge-3: CLI errors carry no status — same as blind-10.
  - `[low]` `[reject]` edge-4: Local DomainError masked as generic failure — runGh credential guard is an internal invariant; unreachable through the resolver.
  - `[low]` `[reject]` edge-5: CLI validation drops url/nameWithOwner — nothing consumes them; direct fix adds code for no caller.
  - `[false]` `[reject]` edge-6: EMU underscore owners — same disproof as blind-8.
  - `[medium]` `[patch]` edge-7: Symlinked ancestors permanently refuse storage — same root cause and repair as blind-5.
  - `[low]` `[reject]` edge-8: 0775 in-home directories refused — error text states the chmod remedy; fix adds a branch.
  - `[low]` `[reject]` edge-9: UTF-8 BOM in hand-edited file — the writer emits no BOM; failure is explicit.
  - `[low]` `[reject]` edge-10: homedir() may throw — practically unreachable; failure is loud.
  - `[low]` `[reject]` edge-11: Unbounded file read — file must be user-owned 0600; negligible.
  - `[low]` `[reject]` edge-12: Stale temp file after kill — requires a crash between write and rename; adds cleanup logic.
  - `[low]` `[reject]` edge-13: No directory fsync — durability edge only; previous token or loud absence results.
  - `[low]` `[reject]` edge-14: Unselected statuses stay stale in validate output — they report local configuration, not use.
  - `[false]` `[reject]` edge-15: Status probes run while GitHub off — required by the Local status row.
  - `[false]` `[reject]` edge-16: Web consumers of CredentialSource — web typecheck and build pass in verify.mjs.
  - `[medium]` `[patch]` edge-17: "Retain merge semantics" claim vs getRemoteItem — same root cause as blind-9.
  - `[low]` `[reject]` edge-18: APPDATA unset on Windows — Windows always defines it; loud actionable error.
  - `[medium]` `[patch]` edge-19: Status/resolve disagreement window — `carried` from blind-4/edge-2 of the first pass; selected metadata follows the captured resolution.
  - `[medium]` `[patch]` gap-1: getRemoteItem missing-issue behavior unverified — pre-verified gap; added provider tests for CLI and token paths including non-issue NOT_FOUND still rejecting.
  - `[medium]` `[patch]` gap-2: getRemoteItem regression itself — same root cause as blind-9.
  - `[low]` `[reject]` gap-3: user-file/env validate selection untested — same generic projection as the tested CLI case.
  - `[false]` `[reject]` intent-1: Writer tested only at application boundary — `carried` intent-2 of the first pass; no HTTP/MCP writer exists in 7.1.
  - `[false]` `[reject]` intent-2: Status not gated by switch — Local status row demands sanitized status while off.
  - `[false]` `[reject]` intent-3: Validate wording near verification — validate performs real provider verification; plain status says locally configured.
  - `[medium]` `[patch]` intent-4: Unlisted behavior changes (getRemoteItem, schema regex) — getRemoteItem repaired as blind-9; `carried` edge-3 of the first pass for the host-qualified owner regex.

## Design Notes

Review repair: capture the resolved source and CLI token transiently. Provider subprocesses remove inherited credential/host/debug variables, then inject only the captured CLI token into GH_TOKEN; this prevents account changes between calls. Public responses carry selected-source metadata only.

Local CLI probing may use `gh auth token --hostname github.com` privately in memory, with recognized missing-token result/ENOENT treated as absence and other failures explicit. Never print probe stdout. CLI command environments remove GH_TOKEN, GITHUB_TOKEN and enterprise variants, pin github.com and disable debugging, interactive prompts and update checks; share this policy rather than duplicate selection. Official references: [token](https://cli.github.com/manual/gh_auth_token), [environment](https://cli.github.com/manual/gh_help_environment), [source](https://github.com/cli/cli/blob/trunk/pkg/cmd/auth/token/token.go). Configuration availability is not remote authentication verification. authMode is derived by the resolver, never a competing selector.

Filesystem seams may be injected for deterministic failures/platform tests; do not add user-configurable directories. Native Windows ACL behavior remains separately unverified on this Mac. Existing human-only connection Verify/Connect and file/DB partial-result reporting belong to 7.2. Credential writer alone returns only sanitized success/location, never the token. Keep standalone Python tooling unchanged.

## Verification

**Commands:**
- Use Node24 PATH for every command. Stage new sources explicitly excluding sprint-status before script fixtures (which copy tracked inputs).
- `corepack pnpm --filter @storymapper/server test` — resolver, safety, HTTP and output-boundary cases pass with real disposable SQLite.
- `corepack pnpm --filter @storymapper/github test` — actual provider CLI/token environment and sanitized error tests pass.
- `corepack pnpm test` — all workspace/script suites pass; run serially with build gates.
- `node scripts/verify.mjs` — capability parity, hygiene, typecheck and production build pass.
- Audit matrix coverage against executed tests; record exact counts and native Windows boundary without claiming release accessibility acceptance.

## Changelog

- 2026-10-19 v2: Eight review repair groups applied; native Windows and two pre-existing provider limitations recorded.

- 2026-10-18 v1: Source-grounded runnable plan aligned with Epic7 preparation; writer remains application-only until guided connection integration.

## Auto Run Result

Status: done

Summary: Story 7.1 follow-up review pass. Resolver CLI → user file → environment, safe atomic user-file storage, human-only writer and secret-free provider/output boundaries remain as implemented; this pass repaired three issues.

Files changed in this pass:
- `packages/github/src/providers/github-provider.ts` — getRemoteItem returns undefined only for a missing issue (CLI and GraphQL); self-import replaced with relative imports.
- `packages/github/src/providers/github-provider.test.ts` — missing-issue versus other-failure regression in both auth modes.
- `apps/server/src/services/credential-file.ts` — follow system symlinks above the home directory; home and below still refused.
- `apps/server/src/services/credentials.test.ts` — symlinked-ancestor regression.

Review findings: 40 — patches applied 3 entries (2 medium, 1 low); deferred 1 carried (native Windows ACL, already in `deferred`); all other findings rejected with reasons in the Review Triage Log.

Follow-up review recommendation: false (no high patched; patched counts high 0, medium 2, low 1).

Verification: `corepack pnpm --filter @storymapper/server test` 58 files / 710 tests pass; `corepack pnpm --filter @storymapper/github test` 20 tests pass; `node scripts/verify.mjs` passes (hygiene, typecheck, build). Root `corepack pnpm test` was not re-run in this pass.

Residual risks: native Windows ACL/replacement behavior and real CLI/account acceptance remain unverified (deferred); sprint-status.yaml and deferred-work.md untouched.
