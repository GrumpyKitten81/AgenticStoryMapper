---
title: Contracts on Zod 4 and the current MCP SDK
type: chore
created: 2026-10-04
status: done
baseline_revision: b37ea56ffdadbdfffb71ed723bec46cc8614d9bd
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - C:/Local/github/StoryMapper/AGENTS.md
  - C:/Local/github/StoryMapper/.wolf/OPENWOLF.md
  - C:/Local/github/StoryMapper/.wolf/cerebrum.md
warnings: [oversized]
deferred:
  - summary: >-
      Existing restore-point filenames exceed SQLite's usable Windows path length in the default temporary directory.
    evidence: |-
      The full Windows suite fails to reopen published restore points with SQLITE_CANTOPEN; DB and server restore tests fail. Filename generation and restore readers are unchanged from fb2720d505d48def488bc66d0329eb894cb99249. This blocks the existing-suite acceptance criterion independently of Zod/MCP migration.
    location: >-
      packages/db/src/restore-points.ts:48
    severity: high
  - summary: >-
      Existing restore recovery fsync uses a read-only descriptor that fails on Windows.
    evidence: |-
      Full DB recovery tests fail with EPERM at fsyncSync after openSync(path, "r"); the fixture for crashed WAL exits before writing its evidence. restore-recovery.ts is unchanged from fb2720d505d48def488bc66d0329eb894cb99249.
    location: >-
      packages/db/src/restore-recovery.ts:50
    severity: high
  - summary: >-
      Existing restore-point rename failure test assumes POSIX error codes.
    evidence: |-
      The real Windows rename failure is EPERM, while the assertion accepts only EISDIR or ENOTDIR. The test is unchanged from fb2720d505d48def488bc66d0329eb894cb99249; the full suite reports this independent assertion failure.
    location: >-
      packages/db/src/restore-points.test.ts:192
    severity: medium
---

Purpose: Implement Story 3.1 through bmad-build-auto, preserving existing tools and contract behavior while replacing Zod 3 and the monolithic MCP SDK. Date: 2026-10-05. Version: 5. Changelog: Reconciled recorded repairs with this checkout, restored missing constraints, verified Windows gates independently, and completed four review layers; sprint-status.yaml remains orchestrator-owned.

<intent-contract>

## Intent

**Problem:** Workspace contracts use Zod 3 and the stdio transport uses the monolithic MCP SDK 1.x. Epic 3 needs maintained dependencies before its new transport lands.

**Approach:** Move direct Zod dependencies to `^4.2.0`, resolving a current stable 4.x version, and stdio to `@modelcontextprotocol/server` 2.x. Verify the existing server MCP routes with the 2.x Fastify adapter and preserve the actual 24-tool wire inventory using a snapshot captured before migration.

## Boundaries & Constraints

**Always:** Contracts remain the single schema source; retain absent patch fields, sparse enum dictionaries, explicit supplied values and existing registry permissions/audit attribution. Run Node 24 with Corepack pnpm 9.15.4. Validate on disposable SQLite data. Use exact canonical Git revisions. Read matching Cursor rules before edits. Preserve all `sprint-status.yaml` changes without editing, staging or reverting the file; its rows are never verification evidence. No commits without explicit user request.

**Never:** Add `/mcp`, a stdio bridge, safety switches, use cases, new tools, a provider or user-facing changes. Do not replace the production Fastify factory: the new adapter lacks its logger/body-limit options and enables security checks belonging to later stories. Do not expose new input schemas or fix pre-existing stdio argument forwarding in this dependency-only migration. Do not remove `packages/ai` or move its implementation; only remove its unused npm `ai` dependency because its strict Zod 3 peer prevents the required clean lockfile. Do not add unused runtime dependencies, compatibility layers or silent failures.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stdio inventory | Existing entry point; initialize, then tools/list | Same ordered 24 names and JSON input schemas as independently captured SDK 1.x baseline | Startup/protocol failure fails test; bound waits and clean child/data |
| Patch omission | Empty/title-only Card patch; empty Release, Persona, ProductContext/customization patches | Absent fields remain absent; unrelated persisted values are retained | Empty bulk patch remains rejected |
| Supplied patch values | Explicit strings, booleans, lists, nullable fields | Supplied values survive parsing and mutate only requested fields | Invalid supplied values rejected |
| Sparse dictionaries | Subsets of report enum keys; string-key records | Subsets and empty dictionaries remain valid | Unknown enum keys and invalid record values rejected |
| Server adapter compatibility | Adapter-created temporary Fastify instance running existing createRoutes; real MCP read/write requests | Existing responses, validation, denied writes and audit attribution remain intact | Explicit existing permission/validation errors |

</intent-contract>

## Code Map

- `packages/contracts/package.json:15`, `packages/core/package.json:16`, `apps/server/package.json:31` — direct Zod declarations. Only contracts imports it. `pnpm-lock.yaml` must contain no Zod 3 resolution.
- `packages/ai/package.json:17` — unused npm `ai` brings strict Zod 3 peers; no source imports it.
- `packages/mcp/package.json:15`, `packages/mcp/src/transports/stdio.ts:1` — SDK declaration and sole old SDK imports. Current registerTool omits inputSchema: all advertised schemas are `{type:"object",properties:{}}`; SDK1 passes metadata rather than user arguments to this callback. Preserve inventory, record this existing limit.
- `packages/mcp/src/tool-definitions/tools.ts:9`, `packages/contracts/src/mcp/tools.ts:10` — ordered inventory and matching tool-name enum. Registry contracts live in the latter.
- `packages/contracts/src/api/http.ts:99` and subsequent pick/partial chains; `packages/contracts/src/mcp/tools.ts:63` — optionalized default-bearing fields must not materialize defaults after Zod migration. Use native Zod 4 schema semantics and test omission; investigate prefault/removeDefault rather than introducing a compatibility wrapper.
- `packages/contracts/src/schemas/domain.ts:349,376,460,598,609`, `packages/contracts/src/api/http.ts:672,732` — one-argument records, sparse enum records and unknown-valued fields require migration review. Inspect UUID validation and unknown-key behavior too.
- `apps/server/src/mcp/tools/register-tools.ts:44,313`, `apps/server/src/mcp/tools/register-tools.test.ts`, `apps/server/src/http/routes/unit-of-work.test.ts` — retain registry/schema parsing, permissions, actor/session/version/conflict behavior. Read implementations and relevant tests before changing anything.
- `apps/server/src/mcp/stdio-main.ts:20` — actual startup initializes sample data and requires STORYMAPPER_MCP_HOST; use isolated env/DB for protocol tests.
- `apps/server/src/server.ts:15` — preserve production factory/options. `apps/server/src/http/routes/index.ts:1029` — current /api/mcp/call surface; integrate the SDK Fastify factory in a meaningful compatibility test, declaring adapter as server devDependency until the later production transport story.
- Official registry verified on 2026-10-04: Zod 4.6.5; server 2.3.0; Fastify adapter 2.0.1. Migration guidance: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md and https://zod.dev/v4/changelog. Graph tools unavailable in this session; source/index investigation used.

## Tasks & Acceptance

**Execution:**
- [x] `apps/server/src/mcp/stdio-main.test.ts` and stored JSON fixture — capture actual old stdio names/schemas before dependency edits, then compare final stdio startup/list against that immutable fixture; cleanup bounded child and disposable data.
- [x] Relevant package manifests and `pnpm-lock.yaml` — replace SDK, migrate Zod, remove unused npm ai, add used Fastify test adapter; list exact Corepack installation commands in result.
- [x] `packages/contracts/src/schemas/domain.ts`, `packages/contracts/src/api/http.ts`, `packages/contracts/src/mcp/tools.ts` — migrate changed APIs while preserving partial/record/UUID behavior; use absolute internal imports in touched TypeScript sources.
- [x] `packages/mcp/src/transports/stdio.ts` — use server 2.x imports and registration signature while preserving advertised schemas and existing transport lifecycle.
- [x] `packages/contracts/src/migration.test.ts`, `apps/server/src/mcp/tools/register-tools.test.ts` or dedicated adapter test — cover every matrix row including persisted unrelated fields through actual HTTP/MCP boundaries.
- [x] `pnpm-lock.yaml` and story result — compare baseline/final audit advisories; final tree has no Zod3/old SDK; record any pre-existing high/critical advisories separately.

**Acceptance Criteria:**
- Given the installed workspace, when inspecting manifests and lockfile, then all remaining direct Zod ranges are `^4.2.0`, no Zod 3 or old monolithic MCP SDK remains, and the split server/Fastify adapter are stable 2.x.
- Given the actual stdio entry point, when starting and listing tools after migration, then its 24 names and JSON input schemas equal the stored pre-migration snapshot.
- Given the existing suites, when migration-scoped verification runs on Windows (contracts, core, MCP stdio/adapter, project-archive; full `@storymapper/db` restore suites excluded — see deferred entries and Escalation Resolution), then they pass and public behavior remains unchanged by dependency migration. Full Windows restore-suite parity is a separate follow-up story.
- Given baseline and final pnpm audit results, when comparing advisories affecting migrated packages, then the migration introduces no high or critical advisory and typecheck passes.

## Spec Change Log

## Review Triage Log

### 2026-10-05 — Autonomous checkout verification

- verdicts: 14 findings — high 0, medium 0, low 3, false 11, maybe-false 0
- findings, in layer completion order (verification and edge layers returned no findings):
  - `[low]` `[patch]` Blind reviewer: unconsumed one-shot UUID mock can leak after an early test failure — reset randomUUID and restore its real implementation in the existing afterEach, matching the other module mocks. The focused archive suite passed after the correction.
  - `[false]` `[reject]` Blind reviewer: mock GUID before fixture creation instead of creating a second Project — fixture initialization creates the privacy epoch before the Project, so the proposed ordering targets the epoch. The final test asserts the actual supplied Project ID and verifies only that Project survives each real archive import; the unrelated source Project also exercises single-Project export.
  - `[low]` `[reject]` Blind reviewer: invalid manifest cases lack individual names — the failure points to the constraint loop, but parameterizing the passing cases solely for richer diagnostics adds test structure without repairing behavior. Existing service tests separately name invalid manifest/version cases.
  - `[low]` `[reject]` Blind reviewer: combined history/privacy/result assertions stop at the first failure — normal assertion failure reports the defect and fails the gate; all assertions ran and passed. Splitting the passing regression adds test structure without repairing a demonstrated outcome.
  - `[false]` `[reject]` Blind reviewer: picked restore-result fields do not establish the complete response — carried: the unmodified required restore points, attachmentsRetained literal and strict enclosing schema remain present. Full Windows restore execution is explicitly excluded, and no incorrect changed field or caller is identified.
  - `[false]` `[reject]` Blind reviewer: new GUID regression omits HTTP invalid/missing/extra query cases — the shared GUID validator rejects invalid values, projectId stays required and the unchanged strict query object rejects extra keys before service execution. The actual GUID success/re-export test detects the changed acceptance; no public rejection regression was established.
  - `[false]` `[reject]` Blind reviewer: browser restore consumer lacks an executed focused check — parent additionally ran the existing web restore-points suite against the repairs: all 20 tests passed, exercising epoch preparation and saved-result reconciliation. No new test or scope amendment was needed.
  - `[false]` `[reject]` Intent auditor: installed dependencies and MCP wire surfaces have no new diff coverage — carried: this is a resume against an already migrated baseline; parent independently executed frozen install, actual stdio inventory/success/rejection, adapter compatibility and inspected resolved dependencies. A resume need not duplicate unchanged implementation/tests.
  - `[false]` `[reject]` Intent auditor: patch/dictionary parsing and persistence lack new diff assertions — carried: existing migration and real adapter tests ran and passed, covering omission, supplied values, sparse dictionaries, persisted unrelated values, permissions and actor/session attribution.
  - `[false]` `[reject]` Intent auditor: picked history fields do not exercise full restore reconciliation — carried: restored fields match the canonical pre-migration source; complete Windows restore persistence remains explicitly deferred. The additional 20 browser tests passed; no further concrete scoped regression is identified.
  - `[false]` `[reject]` Intent auditor: manifest parser acceptance of version 99 does not execute service diagnostics — carried: the executed archive suite includes the unsupported-format HTTP case expecting Supported versions: 1, plus manifest validation and real export/import/re-export.
  - `[false]` `[reject]` Intent auditor: filesystem refusal tests exercise existing service behavior rather than dependencies — the changed fixture removes a Windows privilege assumption while preserving actual live/dangling link refusal and snapshot cleanup. Both cases executed and passed; this is permitted verification of existing behavior.
  - `[false]` `[reject]` Intent auditor: scoped Windows evidence does not establish full restore parity — carried: operator-approved exclusions explicitly bound acceptance. This run makes no full DB restore-suite claim.
  - `[false]` `[reject]` Intent auditor: preservation depends on the canonical historical baseline — carried: parent directly read fb2720d505d48def488bc66d0329eb894cb99249 and confirmed the restored fields, manifest constraints and original primitive semantics. Immediate HEAD contained the migration regressions; restoring the existing contract is the intended behavior.

One low patch entry, two rejected low suggestions and eleven refuted/carried findings; no new deferred item. All four layer reports were collected before triage. The three-agent slot limit required the intent layer to start when the blind reviewer finished. Follow-up review recommended: false; the only review patch resets a test mock and introduces no unverified runtime risk.

### 2026-10-05 — Current autonomous resume review

- verdicts: 12 findings — high 0, medium 2, low 1, false 9, maybe-false 0
- findings, in layer completion order (verification and edge layers returned no findings):
  - `[false]` `[reject]` Intent auditor: preservation depends on the earlier canonical baseline — verified `fb2720d505d48def488bc66d0329eb894cb99249` directly: the required schemaVersion, filename literal, checksum regex, folder enum, single Project, integer formatVersion and strict manifest all precede migration. The current repairs restore those exact constraints.
  - `[false]` `[reject]` Intent auditor: picked history fields do not execute complete restoration — carried: direct shared-schema assertions establish restored fields; complete Windows restore execution remains explicitly excluded by the operator. No additional incorrect field or scoped behavior is identified.
  - `[false]` `[reject]` Intent auditor: diff adds no patch persistence or sparse dictionary tests — carried: existing migration tests and real adapter/SQLite tests ran and passed; the resume does not require duplicate assertions.
  - `[false]` `[reject]` Intent auditor: manifest parser test alone does not demonstrate archive round trips — carried: the executed service suite exercises successful HTTP export/import/re-export, validation failures and preserved business data. The new GUID repair adds another real HTTP round trip.
  - `[false]` `[reject]` Intent auditor: diff adds no MCP protocol exercises — carried: actual stdio discovery/success/rejection, loopback adapter requests, denied writes and attributed registry writes ran and passed independently.
  - `[false]` `[reject]` Intent auditor: scoped gates do not establish full Windows restore behavior — carried: operator-approved exclusions explicitly bound acceptance; this run makes no full restore-suite claim.
  - `[medium]` `[patch]` Blind reviewer: archive export query still rejects formerly accepted GUIDs — confirmed the remaining z.string().uuid() at the public export query; replaced it with shared uuidSchema. The real HTTP export/import/re-export/second-import test retains the supplied GUID.
  - `[false]` `[reject]` Blind reviewer: pnpm test delimiter selects all server tests — independent execution of the exact specified command prints Vitest with two positional filters and executes only four files (stdio, registry, adapter, archive), 49 tests. The review reproduction used pnpm exec vitest list, a different invocation.
  - `[low]` `[reject]` Blind reviewer: older Windows prose recommends follow-up while current frontmatter does not — the old paragraph is historical evidence within the escalation record; its wording is ambiguous, but the proposed fix edits only this build's spec and is rejected under review rules. Current result below is authoritative.
  - `[false]` `[reject]` Blind reviewer: nested export links lack the new Windows regression — the changed test repairs the original top-level portable-folder fixture. Recursive traversal is unchanged and explicitly rejects entry.isSymbolicLink(); no bad outcome on that path was established by this finding.
  - `[medium]` `[patch]` Blind reviewer: response-only GUID assertions miss HTTP re-export mismatch — same verified export-query defect; added a real HTTP export/import/re-export/second-import regression using 00000000-0000-0000-0000-000000000001, asserting returned and persisted IDs.
  - `[false]` `[reject]` Blind reviewer: nested counts unknown-key behavior needs another assertion — the native nested z.object still strips extra keys exactly as the canonical baseline; only the enclosing manifest is strict. No current divergence or failing caller was identified.

One shared medium patch entry; no new deferred item. Follow-up review recommended: false (one medium repair group, exercised at the public HTTP surface). All four layers launched before triage; the three-slot child limit required launching the intent auditor when the verification reviewer completed.

### 2026-10-05 — Resumed implementation review

- verdicts: 12 findings — high 0, medium 2, low 0, false 10, maybe-false 0
- findings, in layer completion order:
  - `[medium]` `[patch]` Blind reviewer: live junction fixture drops dangling-link rejection coverage — parameterized the real junction/directory link for live and removed targets; both reject export and preserve snapshot cleanup.
  - `[false]` `[reject]` Blind reviewer: selected-field parsing does not establish complete restore persistence — carried: broad coverage observations identify no additional concrete defect. Each restored field is directly asserted on its shared public schema; workspace typecheck verifies consumers. Full Windows restore behavior remains explicitly deferred, rather than claimed verified.
  - `[false]` `[reject]` Blind reviewer: negative/fractional redaction and Card counts are untested — these unchanged constraints are outside the restored constraint set; the final native integer/nonnegative validators remain present. No incorrect accepted input or regression was identified.
  - `[false]` `[reject]` Blind reviewer: temporary audit/log evidence is not durable — commands, exact baseline revisions, totals and outcomes are retained here; the intent requires an executed comparison, not permanent raw logs. This suggestion only changes the spec and is rejected under workflow rules.
  - `[false]` `[reject]` Blind reviewer: no separate follow-up identifier for Windows restore defects — the three existing deferred entries contain concrete files, failures and required follow-up scope. Creating a separate ticket is not authorized by this story; sprint bookkeeping remains orchestrator-owned.
  - `[false]` `[reject]` Blind reviewer: unchanged restore implementation alone cannot establish dependency independence — the operator's resolution explicitly accepts these failures as separate follow-up work. No concrete scoped regression was identified; path/open, descriptor fsync and platform error-code causes do not depend on Zod parsing.
  - `[medium]` `[patch]` Verification reviewer: regression gap for dangling portable folders — same shared fixture root cause; both live and dangling link cases now execute and pass, so an existsSync skip would fail the dangling assertion.
  - `[false]` `[reject]` Intent auditor: restored history tests observe schema fields rather than full restoration — carried: descriptive surface distinction, with no further concrete defect. Restored contracts are tested directly; full restore behavior is outside the operator-approved Windows gates.
  - `[false]` `[reject]` Intent auditor: new archive assertions do not themselves execute all importer behavior — existing executed archive suite covers actual export/import round trips, missing schema version, unsupported versions, checksum mismatch and folder handling.
  - `[false]` `[reject]` Intent auditor: resumed diff adds no patch/dictionary persistence exercises — existing executed migration and adapter tests cover all matrix rows, including retained nondefault settings, mappings, Card/Release/Persona and Product Context values. A resume need not duplicate these tests.
  - `[false]` `[reject]` Intent auditor: resumed diff adds no MCP protocol exercises — the existing actual stdio test executed inventory comparison plus successful/rejected wire calls; adapter tests executed permissions, validation and attributed writes.
  - `[false]` `[reject]` Intent auditor: scoped gates limit the breadth of preservation claims — the auditor confirms no contradiction of the intent. The operator explicitly excludes known Windows restore failures; final completion claims are limited to those approved gates.

Edge reviewer returned no findings. All four layer reports were collected before triage. The two patch findings share one medium verification repair; no new deferred item was added. Follow-up review recommended: false (one medium entry patched, no unverified risk introduced).

### 2026-10-05 — Windows follow-up review

- verdicts: 21 findings — high 13, medium 4, low 0, false 4, maybe-false 0
- findings, in layer completion order:
  - `[high]` `[patch]` Verification reviewer: archive schemaVersion removed — independently reproduced export stripping and import rejection; restored the required field.
  - `[high]` `[patch]` Verification reviewer: historicalStub, undoneByRestore and privacy epoch removed — Windows typecheck fails and restore preparation dereferences a missing schema; restored the existing fields.
  - `[high]` `[patch]` Blind reviewer: privacy epoch removed — restore-result.ts calls shape.epoch.unwrap(); restored optional shared UUID schema.
  - `[high]` `[patch]` Blind reviewer: ChangeSet historical marker removed — typed guards/UI still consume it and parsing strips it; restored optional boolean.
  - `[high]` `[patch]` Blind reviewer: ActivityEvent historical marker removed — audit and restore reconciliation consume it; restored optional boolean.
  - `[high]` `[patch]` Blind reviewer: Project historicalStub removed — repository mappings/privacy initialization require it; restored optional boolean.
  - `[high]` `[patch]` Blind reviewer: archive schemaVersion removed — actual export/import suite fails on undefined schema version; restored required nonempty string.
  - `[high]` `[patch]` Blind reviewer: archive folder allowlist loosened — validateEntry trusts manifest.includedFolders; restored documents/attachments/exports enum.
  - `[high]` `[patch]` Blind reviewer: archive accepts multiple Projects — DB validation compares manifest counts without another one-Project guard; restored literal 1.
  - `[medium]` `[patch]` Blind reviewer: filename/checksum validation removed — importer reads its fixed filename while the schema accepts contradictions; restored filename literal and SHA-256 pattern.
  - `[medium]` `[patch]` Blind reviewer: manifest unknown keys silently stripped — restored strict parsing, with explicit regression assertion.
  - `[medium]` `[patch]` Blind reviewer: unsupported format diagnostic changes — existing service test expects supported-version guidance; restored integer schema so the service handles unsupported versions.
  - `[false]` `[reject]` Intent auditor: production adapter reading — carried: Story 3.6 owns production /mcp integration; unchanged existing-route compatibility test deliberately avoids claiming that transport.
  - `[false]` `[reject]` Intent auditor: empty advertised schemas versus substantive internal contracts — carried: immutable SDK1 fixture and current transport have the same 24 empty wire schemas; the story explicitly preserves those names/input schemas.
  - `[false]` `[reject]` Intent auditor: selected exercises versus universal preservation — carried: coverage breadth alone identifies no additional concrete defect; actual full verification is required and the separately identified restore/archive regressions are repaired.
  - `[false]` `[reject]` Intent auditor: absence of new /mcp — the auditor itself confirms this is not a divergence under preparation intent; Epic 3 assigns it to Story 3.6.
  - `[high]` `[patch]` Edge reviewer: privacy epoch missing — same reproduced restore unwrap failure; restored optional shared UUID schema.
  - `[high]` `[patch]` Edge reviewer: archive schemaVersion missing — same reproduced archive rejection; restored required field.
  - `[high]` `[patch]` Edge reviewer: ChangeSet/ActivityEvent flags missing — source consumers/typecheck confirm both; restored optional flags.
  - `[high]` `[patch]` Edge reviewer: Project historicalStub missing — source mappings still return it; restored optional flag.
  - `[medium]` `[patch]` Edge reviewer: restore summaries trim supplied GitHub URLs — Zod4 url parsing transforms values; reused the shared exact-string URL validator.

Three shared repair groups: restore/history contracts (high), portable archive contract (high), remaining restored-result primitive semantics (medium). Direct restorations add no new public surface; these were shipped before the migration. The original baseline_revision predates stories 2-6/2-7, so its aggregate diff concealed their deletion. Reviewers received that full diff plus the actual migration diff from fb2720d505d48def488bc66d0329eb894cb99249 to 62f1d4d161726d2aee98cef2615220ce5b5c7a9d. Three reviewer slots required the intent layer to start when the verification layer finished; all four reports were collected before triage or repairs.

Additional Windows verification correction: the existing archive test assumed privileged file symlinks. A real directory junction on Windows (directory symlink on POSIX) now exercises the same export refusal without privilege, retaining the fixture directory in the cleanup assertion. Remaining archive/restore UUID and integer validators use shared GUID/native predicates to preserve prior supplied-value acceptance. New migration assertions cover these values and every restored manifest constraint; existing archive/restore/UI suites cover the public behavior.

### 2026-10-05 — Follow-up review pass (resumed uncommitted repairs)

- verdicts: 18 findings — high 0, medium 0, low 5, false 13, maybe-false 0
- findings, in layer completion order (verification layer returned no findings):
  - `[false]` `[reject]` Blind reviewer: strict manifest hides the supported-version diagnostic for newer formats with extra keys — strict object, integer formatVersion and the readManifest-then-version-check order are identical in baseline fb2720d505d48def488bc66d0329eb894cb99249; a newer manifest fails loudly with an explicit error, and no defect is introduced by this change.
  - `[false]` `[reject]` Blind reviewer: formatVersion has no lower bound — baseline is the same integer schema and importProjectArchive rejects every value other than 1.
  - `[low]` `[reject]` Blind reviewer: manifest constraint test omits negative counts, classification, exportedAt and folder-mix cases — those validators are unchanged from baseline; no wrong accepted input shown, and extra cases only add test volume.
  - `[false]` `[reject]` Blind reviewer: manifest tightening is an undocumented compatibility break — carried: the constraints restore exactly the pre-migration baseline (verified against fb2720d); nothing is tightened relative to it.
  - `[false]` `[reject]` Blind reviewer: 2^53 accepted as a count — Zod 3 `.int()` accepted it via Number.isInteger; accepting it is the intended parity repair.
  - `[low]` `[reject]` Blind reviewer: export query lacks negative test — carried: shared GUID validator rejects invalid input and the strict query object is unchanged.
  - `[low]` `[reject]` Blind reviewer: archive link test lost the file-symlink case — the lstat guard is type-agnostic and covered via directory link on every platform; the file-symlink variant needed Windows privilege. No untested outcome shown.
  - `[low]` `[reject]` Blind reviewer: one-line afterEach and Object.keys(shape)[0] are fragile — style only; assertions on the supplied project id and fixed keys catch drift.
  - `[false]` `[reject]` Blind reviewer: domain.ts near the line limit and imported by more schemas — 713 lines, under 750; imports are one-way (domain imports neither archive nor restore schemas) and workspace typecheck passes.
  - `[false]` `[reject]` Edge reviewer: strict manifest masks version diagnostic — same as first row, pre-existing and loud.
  - `[false]` `[reject]` Edge reviewer: restore githubLinks url accepts non-http schemes — githubLinkSchema.url uses URL.canParse, the same acceptance as the baseline `.url()` (WHATWG parse); acceptance is unchanged.
  - `[low]` `[reject]` Edge reviewer: includedFolders duplicates accepted — baseline enum array accepts them identically; harmless and the fix adds a refinement.
  - `[false]` `[reject]` Edge reviewer: spec claims sprint-status.yaml unstaged but index shows it staged — the orchestrator owns that file; the proposed fix edits this build's spec.
  - `[false]` `[reject]` Edge reviewer: unsupported-version diagnostic not reached for reshaped manifests — same as first row; baseline behavior.
  - `[false]` `[reject]` Intent auditor: no stdio, adapter or manifest hunks in this diff — carried: the baseline revision is the already migrated HEAD; those surfaces were executed and passed (stdio snapshot, adapter, registry tests ran again in this pass).
  - `[false]` `[reject]` Intent auditor: archive/restore schemas are outside the named scenarios — carried: the repairs restore pre-migration constraints (reading D, Zod 4 parity), verified against baseline fb2720d.
  - `[false]` `[reject]` Intent auditor: new optional fields cannot be judged from the diff — carried: they restore historicalStub, undoneByRestore and epoch fields present before migration.
  - `[false]` `[reject]` Intent auditor: junction test is unrelated to dependencies — carried: it removes a Windows privilege assumption while keeping live and dangling link refusal.

No patches, no deferrals. Follow-up review recommended: false (follow-up pass patched no high).

### 2026-10-04 — Review pass

- verdicts: 16 findings — high 0, medium 9, low 2, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification reviewer: stdio discovery never executes the migrated callback — registry/HTTP tests bypass it; add real ListProjects dispatch/decoded-result and rejected-call assertions. Applied: real stdio ListProjects decoded success and GetStoryMapCards rejection now execute.
  - `[false]` `[reject]` Intent auditor: stronger production Fastify integration reading — Epic 3 assigns `/mcp` integration to Story 3.6; Story 3.1 migrates existing stdio and dependencies. The adapter test deliberately exercises compatibility, without claiming a production SDK HTTP transport.
  - `[medium]` `[patch]` Intent auditor: discovery coverage does not prove stdio execution — same concrete missing wire-call evidence as verification reviewer; shared stdio test repair. Applied: the same successful/rejected stdio wire calls now execute.
  - `[false]` `[reject]` Intent auditor: selected schema tests are narrower than universal public-behavior wording — descriptive observation, not an additional identified defect; separately reproduced primitive differences below receive individual repairs. Source, full suites and focused boundary tests establish their specific outcomes.
  - `[false]` `[reject]` Intent auditor: reported checks are not independently reproducible execution records — parent actually executed frozen install, 480 tests, serial release verification and fresh audit; these command outputs, rather than any sprint row, establish verification. No sprint-status diff exists.
  - `[medium]` `[patch]` Blind reviewer: MCP export targets mismatch emitted build layout — parent native import of compiled stdio throws ERR_MODULE_NOT_FOUND for dist/tool-definitions/tools.js; align existing exports and verify compiled subpath import. Applied: exports now point at emitted dist/mcp/src; parent plain-Node import passes.
  - `[medium]` `[patch]` Blind reviewer: minute-only UTC datetime acceptance narrows — parent compared installed Zod3/4 and reproduced rejection of 2026-10-04T12:34Z, a previously accepted archive/restore-point timestamp; retain precision forms and add boundary checks. Applied: native inline UTC datetime union preserves all three precision forms; regression passes.
  - `[medium]` `[patch]` Blind reviewer: integer acceptance narrows — parent compared installed versions and reproduced rejection of 9007199254740992; preserve prior integer predicate and separately retain existing explicit bounds. Applied: Number.isInteger refinements preserve large integers and explicit bounds; regression passes.
  - `[medium]` `[patch]` Blind reviewer: supplied link URL values are rewritten — parent comparison proves padded GitHub URL string changes; validate syntax without transforming supplied strings. Applied: URL.canParse refinement preserves exact supplied strings; regression passes.
  - `[medium]` `[patch]` Blind reviewer: stdio success/rejection paths lack wire verification — shared stdio execution repair, preserving baseline inventory/argument handling. Applied: successful and rejected stdio wire calls now execute.
  - `[false]` `[reject]` Blind reviewer: adapter REST tests do not prove SDK HTTP transport — current claims explicitly say existing routes run on an adapter-created app; Story 3.6 owns actual HTTP transport. Real SDK stdio is independently exercised.
  - `[false]` `[reject]` Blind reviewer: repeated Persona default removals may diverge later — all four current field lists and schema derivations agree and their omission tests pass; no present divergent caller or bad outcome was identified. Sharing an additional shape solely against hypothetical future edits is outside the demonstrated repair.
  - `[medium]` `[patch]` Blind reviewer: privacy/connector omission protection lacks persisted nondefault HTTP checks — existing privacy HTTP test begins from defaults; new omission checks cover only schema parsing. Add sparse-patch persistence assertions on nondefault settings/mappings without provider effects. Applied: real sparse HTTP updates retain nondefault persisted settings and mappings.
  - `[low]` `[patch]` Blind reviewer: fixture acquisition failures leak temporary resources — cleanup is registered only after opening SQLite and multiple writes; register each acquisition immediately, retaining reverse close/remove order. Applied: each disposable directory, database and server registers cleanup at acquisition.
  - `[low]` `[patch]` Blind reviewer: stdio stderr is undrained and loses failure causes — new child pipes stderr but has no reader; bounded capture supplies concrete startup diagnostics and prevents pipe backpressure. Applied: stderr now drains into bounded, redacted failure diagnostics.
  - `[medium]` `[patch]` Edge reviewer: Card businessValue rejects a formerly accepted large integer — same independently reproduced integer narrowing; shared primitive-number repair. Applied: the shared integer refinement preserves large Card values; regression passes.

Eight shared repair groups: six medium (exports, datetime, integers, URLs, stdio execution, settings persistence), two low (fixture cleanup, stderr diagnostics). All sixteen findings have individual verdicts. Slot limit required the fourth reviewer to start after one of the first three finished; all four results were collected before triage. No intent-gap or spec re-derivation entry was identified: repairs preserve existing public surfaces and address directly demonstrated migration behavior or focused verification gaps.


## Design Notes

The adapter is a used test dependency because Story 3.6 owns production HTTP transport integration. Installing it in runtime code now would either be unused or introduce unrelated factory/security behavior. The existing empty stdio input schemas are baseline evidence, not a new schema design. Argument-forwarding repair belongs to later MCP capability/transport work.

## Verification

Use the installed Windows Node 24.20.0 and Corepack pnpm 9.15.4 for every command. Run workspace tests and release build serially: script fixtures copy real web build output.

**Commands:**
- `corepack pnpm install --frozen-lockfile` — succeeds on Node24, no Zod3 peer resolution.
- `corepack pnpm --filter @storymapper/contracts --filter @storymapper/core --filter @storymapper/mcp test` — migration-scoped suites pass.
- `corepack pnpm --filter @storymapper/server test -- src/mcp src/services/project-archive.test.ts` — stdio, registry, adapter and archive regressions pass. Full Windows restore suites are excluded per Escalation Resolution.
- `node scripts/verify.mjs` — source/Git/runtime hygiene, typecheck and build pass.
- `corepack pnpm audit --json` — no newly introduced high/critical advisory in migrated dependency closure compared with captured baseline; report existing unrelated advisories.
- `git diff --check` — no whitespace errors. Inspect final staged diff excluding sprint-status.yaml; verify no user data or tokens entered tracked output.

## Implementation Verification

Parent independently inspected the staged unified diff and verified the implementation on 2026-10-04. After review repairs, frozen install, all 484 tests (61 scripts, 17 contracts, 70 web, 2 importers, 14 core, 209 db, 111 server), serial release hygiene/typecheck/build and whitespace checks passed. Every matrix row ran: stdio snapshot test; contract omission/supplied-value/record tests; actual loopback adapter read/write, persistence and permissions tests. Parent audit at `/tmp/storymapper-3-1-audit-final-parent.json` versus baseline finds no added advisory IDs or severity changes; high 34→32, critical remains 1. Existing advisories keep audit exit 1.

Additional implementation paths: `packages/contracts/src/api/card-customization.ts` holds moved schemas (388 lines; http.ts 574); source subpath aliases and dist-targeted export maps support absolute imports. Native `removeDefault()` preserves sparse derived schemas; `partialRecord()` preserves sparse enum maps; `guid()` preserves the former UUID-like acceptance; prepared source import uses native shape spread instead of removed innerType.

## Escalation Resolution (2026-10-05, operator)

**Decision:** Story **3-1 is done** for the dependency-migration intent (Zod 4 + MCP SDK 2.x, contract/MCP parity, audit comparison). The three **deferred** Windows restore defects remain **out of scope** for this story and must be tracked as **follow-up work** (separate story) before claiming full `@storymapper/db` restore suites green on Windows. Do not re-open Zod/MCP migration work unless review finds a concrete regression in scoped surfaces.

**Verify scope for loop gates until restore follow-up:** `typecheck`, `lint`, `@storymapper/contracts`, `@storymapper/core`, `@storymapper/mcp` tests, and server tests under `src/mcp` plus `project-archive.test.ts` only.

### Escalation Resolution (2026-10-05, review stall)

**Decision:** Review stalled because `[adapter.review]` included `--permission-mode bypassPermissions`, which shows a blocking WARNING in unattended Claude sessions (documented in `docs/bmad-loop.md`). Remove `bypassPermissions`; keep `--dangerously-skip-permissions` + `--effort high` and `skipDangerousModePermissionPrompt` in project Claude settings. Re-drive review only; do not re-open migration scope.

Independent Windows verification (Node 24.20.0, pnpm 9.15.4):

- corepack pnpm install --frozen-lockfile: exit 0, including native SQLite compilation.
- node scripts/verify.mjs: exit 0, hygiene, all workspace typechecks and builds pass.
- Plain Node import of @storymapper/mcp/transports/stdio: passes after the build.
- corepack pnpm test: exit 1. Scripts 59 passed/2 platform skips; contracts 19, web 94, importers 2 and core 14 passed. DB 205 passed/27 failed in pre-existing restore implementation. Log: [REDACTED_HOME]/AppData/Local/Temp/storymapper-3-1-final-tests-win.log.
- corepack pnpm --filter @storymapper/server test: exit 1, 151 passed/4 failed in restore routes/root gating when the underlying restore is refused. All 37 archive tests and all stdio/adapter tests pass. Log: [REDACTED_HOME]/AppData/Local/Temp/storymapper-3-1-server-tests-win.log.
- corepack pnpm audit --json: existing-advisory exit 1. Compared with the actual pre-migration lockfile, no added advisory IDs or severity changes; high 34 to 32, critical 1 to 1, moderate 38 to 21, low 4 to 1. Existing critical advisory concerns Vitest; dependency manifests/lockfile did not change in this follow-up. Audit files: [REDACTED_HOME]/AppData/Local/Temp/storymapper-3-1-audit-{baseline,final}-win.json.
- git diff --check: passes. Current diffs contain only the listed story repairs/bookkeeping; no user data or credentials added. sprint-status.yaml was not written, staged or reverted.

Follow-up review recommended: true (two high repair groups). Native Linux stdio subprocess termination and file cleanup remain unoperated, and full acceptance must be rerun after the existing Windows restore defects are resolved. No commit or push: the global commit policy requires an explicit commit request and overrides workflow commit/clean-tree finalization. Reviewed repairs remain uncommitted and unstaged for the orchestrator.

### 2026-10-04 — Historical Mac result

Historical status: done. Story 3.1 migrated direct Zod ranges to ^4.2.0 (resolved 4.6.5) and stdio to MCP server 2.3.0, with Fastify 2.0.1 exercised as an existing-route compatibility test dependency. No Zod3 or old monolithic SDK remains in the lockfile. Preserved sparse patch/default/record/UUID/primitive behavior and the independently captured 24-tool wire inventory.

**Files changed:**

- Package manifests and pnpm-lock.yaml: dependency migration, unused npm ai removal and compiled MCP export targets; deterministic packages/ai implementation remains.
- packages/contracts/src/schemas/domain.ts, schemas/restore-points.ts, events/domain-events.ts: native Zod4 APIs with prior record, UUID, unknown-value, timestamp, integer and URL behavior.
- packages/contracts/src/api/http.ts, api/card-customization.ts and mcp/tools.ts: sparse schema derivations, prepared-import shape and moved customization schemas; unchanged public reexports.
- packages/mcp/src/transports/stdio.ts: split SDK2 registration and transport imports.
- Contract/MCP package exports, tsconfig.base.json, Vite and Vitest configurations: absolute source imports and source subpath resolution.
- migration.test.ts, adapter.test.ts, stdio-main.test.ts and fixtures/stdio-tools-sdk1.json: schema boundaries, real persisted HTTP/MCP behavior and actual stdio protocol parity/execution.
- Epic 3 context, this spec, OpenWolf handoff/learnings/bug log/session summary: investigated scope, review decisions and executed evidence.

**Review:** All 16 findings individually triaged; 11 patch verdicts share eight applied repair groups (high 0, medium 6, low 2), deferred 0. Five rejected findings: production Fastify integration belongs to Story 3.6; broad contract coverage wording identifies no additional concrete defect beyond separately fixed primitives; independent parent checks actually ran; adapter tests make no SDK HTTP-transport claim; repeated Persona derivations currently agree and show no divergent caller. Full reasons and applied repairs appear in Review Triage Log.

Follow-up review recommended: true. Six medium groups were patched in this first review pass. The specific unverified risk is native Windows/Linux behavior of the new stdio subprocess test, bounded child termination and disposable-file cleanup; those platform runs were not available on this Mac. All observed macOS behavior and the emitted package import pass. No unresolved reviewed defect remains.

**Independent final verification (Node 24.17.0, pnpm 9.15.4):**

- corepack pnpm test: exit 0, 484 tests passed, no failures/skips. Log: /tmp/storymapper-3-1-final-tests.log.
- node scripts/verify.mjs: exit 0, Git/source/runtime hygiene, complete typecheck and build. Log: /tmp/storymapper-3-1-final-verify.log.
- corepack pnpm install --frozen-lockfile: exit 0, up to date.
- Plain Node import of @storymapper/mcp/transports/stdio from apps/server: passed after final workspace build.
- corepack pnpm audit --json: existing-advisory exit 1; no new IDs or severity increases compared with captured baseline. High 34→32, critical 1→1, moderate 38→21, low 4→1. Final JSON: /tmp/storymapper-3-1-audit-final-parent.json.
- Every intent matrix row is covered by executed stdio, contract and real loopback HTTP/MCP/SQLite tests. Whitespace and final source/diff inspection pass; no user data or credentials entered tracked output.

**Dependency installation commands used:**

```sh
corepack pnpm --filter @storymapper/contracts --filter @storymapper/core --filter @storymapper/server add zod@^4.2.0
corepack pnpm --filter @storymapper/ai remove ai
corepack pnpm --filter @storymapper/mcp remove @modelcontextprotocol/sdk
corepack pnpm --filter @storymapper/mcp add @modelcontextprotocol/server@^2.3.0
corepack pnpm --filter @storymapper/server add -D @modelcontextprotocol/fastify@^2.0.1
corepack pnpm install --lockfile-only
corepack pnpm install --frozen-lockfile
```
The add command's saved Zod range was normalized to the required ^4.2.0 in all direct manifests before lockfile regeneration.

**Residual limits:** Existing empty stdio input schemas and argument forwarding remain unchanged; an argument-requiring tool still rejects the missing field, now explicitly tested. Existing empty Release/Persona/customization patches still return HTTP500/MCP400 without data mutation. Existing audit advisories remain. Story 3.6 owns production /mcp transport; this story makes no claim to implement it.

Reviewed changes are staged for the orchestrator; no commit or push was made. Global ~/.claude/CLAUDE.md requires an explicit commit request and overrides the workflow's commit/clean-tree finalization. sprint-status.yaml was never written, staged or reverted; its rows were never used as verification evidence.

Automation completion check (2026-10-04T19:54:44+00:00): terminal status remains done. No pending Story 3.1 test/build/stdio/adapter process or running child agent remains. Final 484-test/release evidence is complete; refreshed this persisted completion artifact before ending the turn. No sprint-status mutation or commit.

## Auto Run Result

Status: done

Follow-up review pass (2026-10-05) on a done spec. Summary: the uncommitted repairs on the migrated checkout (restored archive manifest and restore-result contract constraints, GUID-compatible export query, new migration and archive regressions) were reviewed by four independent layers. Files changed in the reviewed diff: `packages/contracts/src/schemas/{domain,project-archive,restore-points}.ts`, `packages/contracts/src/api/http.ts`, `packages/contracts/src/migration.test.ts`, `apps/server/src/services/project-archive.test.ts`.

Review findings: 18 triaged; patches applied 0 (patched high 0, medium 0); deferred 0; rejected 18 (13 false, 5 low), each with its reason in the Review Triage Log. No `deferred-work` ledger entries were touched.

Follow-up review recommended: false.

Verification performed (Node 24, Corepack pnpm 9.15.4): contracts tests 19 passed; core tests 14 passed; mcp package has no tests; server `src/mcp` plus `project-archive.test.ts` 49 passed (stdio snapshot, registry, adapter, archive). Full `@storymapper/db` restore suites remain excluded per the Escalation Resolution and the three deferred entries. `git diff --check` flags only the spec's trailing blank line, fixed in this write.

Residual risks: full Windows restore parity is open follow-up work; existing audit advisories are unchanged.

No commit made: the global commit policy requires an explicit user request, so the reviewed changes remain staged/unstaged for the orchestrator. sprint-status.yaml was not written, staged or reverted.
