### DW-1: Existing linked sentences retain component-level word order; translating into a language that requires moving the link would require adjusting composition.
origin: spec-deferred d337a7f199ad
location: apps/web/src/features/story-map/components/CardDetailModal.tsx:288
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: CardDetailModal already split the GitHub connection notices around Link elements before this story. All phrase text is now centralized, but JSX still determines link placement. No alternate locale or localization runtime is requested in Story 1.1.
status: open

### DW-2: HTTP test fixtures retain temporary SQLite directories and do not explicitly close their database clients.
origin: spec-deferred c087025ccc04
location: apps/server/src/http/routes/index.test.ts:12
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: All eleven existing createRoutes tests construct temporary repositories, while Fastify close has no database-client cleanup hook. The new default-language regression follows this pre-existing fixture convention. Address the shared test fixture lifecycle separately; no local project database is involved.
status: open

### DW-3: Existing English count labels do not consistently handle singular and plural forms.
origin: spec-deferred c16e1a2b6bfc
location: apps/web/src/ui-strings/index.ts:103
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: Before this story, RootLayout rendered cards/releases for every count, BacklogList rendered stories for every count, and CardTile rendered source for every positive count. Central formatters preserve those existing outputs. A grammar correction is separate from this same-meaning copy extraction.
status: open

### DW-4: Contract enum values such as sync states, privacy mode and last-run mode/status are rendered as raw identifiers instead of English labels, and the same sync state is labeled differently in two
origin: spec-deferred d005a66bd026
location: apps/web/src/features/story-map/components/BoardToolbar.tsx:66
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: Before this story, BoardToolbar showed the option text remote_deleted/local_deleted while GitHubSyncPanel showed Remote deleted for the same value; GitHubSyncPanel rendered link.syncState and lastRun mode/status directly, and PrivacyExportPanel rendered privacyMode with a strict-local fallback. The migration centralized these with unchanged output. One label map per contract enum would resolve both.
status: open

### DW-5: Interface timestamps in Card version history and the audit route use the browser default locale, while the HTML export pins en-US.
origin: spec-deferred 3aef4563abe8
location: apps/web/src/app/routes/audit.tsx:20
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: Before this story, CardDetailModal and audit.tsx both called toLocaleString() without a locale; the migration kept that behavior (ui-strings versionHistory, audit.tsx:20) and only replaced the hard-coded de-DE export locale. A German-locale browser shows German date order in the interface.
status: open

### DW-6: English copy capitalizes object names inconsistently (Story Map, Story map, story map), contrary to the epic's consistent naming rule.
origin: spec-deferred d9fde63e7759
location: apps/web/src/ui-strings/index.ts:7
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: The original English copy already mixed these forms; the migration preserved each site's wording in appStrings, panelStrings and storyMapStrings. Epic 1 context requires consistent names (Project, Story Map, Card, ...), but Story 1.1 acceptance only requires same-meaning translation and behavior unchanged apart from language.
status: open

### DW-7: Tracked OpenWolf files hard-code a machine-specific Node path and record agent tooling issues as project bugs.
origin: spec-deferred 67b13c0f0f0f
location: .wolf/cerebrum.md
source_spec: `spec-1-1-english-ui-from-one-string-module.md`
severity: low
reason: .wolf/STATUS.md and .wolf/cerebrum.md name /Users/alexander/.nvm/versions/node/v24.17.0/bin, which does not exist on other machines; .wolf/buglog.json holds story-1-1 tooling entries. The fix edits agent-context files, so it is deferred.
status: open

### DW-8: Native Windows clean-clone setup/start/browser/cleanup acceptance remains unexecuted.
origin: spec-deferred 71a05aa4a25a
location: Story 1.3 Windows acceptance
source_spec: `spec-1-3-one-command-to-set-up-and-start-on-any-system.md`
severity: medium
reason: This session runs on macOS arm64 and has no native Windows runner. POSIX command regressions and fresh source-copy smoke pass; they do not establish Windows acceptance or timing.
status: open

### DW-9: Native Windows and Linux setup/start/browser/cleanup behavior remains unverified on this macOS host.
origin: spec-deferred 421119757f3b
location: Story 1.3 supported-platform acceptance
source_spec: `spec-1-3-one-command-to-set-up-and-start-on-any-system.md`
reason: Intent review distinguishes platform dispatch code from native acceptance. Windows has no runner; Docker is installed but its daemon is unavailable. Native clean-source smoke and runtime tests on those hosts would settle the remaining portability evidence.
status: open

### DW-10: Automatic default-browser tab rendering was not visually observed on macOS.
origin: spec-deferred 2ca13fedaa98
location: scripts/start.mjs browser acceptance
source_spec: `spec-1-3-one-command-to-set-up-and-start-on-any-system.md`
reason: Real native open completed successfully after owned health; native-window inspection returned cgWindowNotFound. A separately opened Chrome tab rendered onboarding and Story Maps. Observing the automatically opened tab in an available desktop session would close this acceptance evidence gap.
status: open

### DW-11: Corepack discovery may fail on Node installs whose PATH entry is a shell shim or a Windows layout without node_modules/corepack.
origin: spec-deferred 2deae20468a4
location: scripts/runtime.mjs:9
source_spec: `spec-1-3-one-command-to-set-up-and-start-on-any-system.md`
reason: runtime.mjs corepackEntry realpaths the first PATH match and runs it with node, and on Windows requires node_modules/corepack/dist/corepack.js beside corepack.cmd. asdf/Volta-style shims or non-bundled Windows Corepack would fail with a SyntaxError or the generic missing-Corepack message. Running setup under such shims and on native Windows would settle it.
status: open

### DW-12: Native Windows and Linux doctor/start diagnostics and cleanup acceptance remain unexecuted.
origin: spec-deferred 43af69ce30f4
location: Story 1.4 supported-platform acceptance
source_spec: `spec-1-4-understandable-failures-and-a-doctor-command.md`
reason: All command tests and unmocked acceptance ran on macOS. Native supported-host runs would settle the remaining platform behavior; mocks and dispatch branches alone do not establish it.
status: open

### DW-13: Browser opening now pipes opener stdout/stderr; a Linux opener whose browser descendant inherits the pipes could keep the child from closing until the ten-second deadline.
origin: spec-deferred 9923105b822d
location: scripts/runtime.mjs:openBrowser, scripts/processes.mjs:run
source_spec: `spec-1-4-understandable-failures-and-a-doctor-command.md`
reason: scripts/runtime.mjs openBrowser passes diagnostics to run(), which pipes stdio and waits for the close event. Whether real xdg-open descendants hold those pipes depends on the desktop and browser; macOS and the fixture opener do not show it. A native Linux start with the real opener would settle it (ignored opener stdio would be the repair if it reproduces).
status: open

### DW-14: downloadArtifact revokes the blob URL synchronously after anchor.click(), which may cancel the download in some browsers.
origin: spec-deferred d0e59a6dc9e7
location: apps/web/src/app/api.ts:143-149
source_spec: `spec-1-5-sample-map-and-getting-started-checklist.md`
reason: Unverified (maybe-false): Chrome acceptance downloaded real HTML and ZIP files, so the pattern works there. Firefox/Safari behavior with an immediate revoke was not exercised. Settle by downloading an HTML export and the project archive in Firefox and Safari; if it fails, delay the revoke (for example setTimeout) after click.
status: open

### DW-15: Missing milestone values abort conflict serialization.
origin: spec-deferred 61fc853367df
location: packages/db/src/repositories/work-item-repository.ts:287
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Both original and current createSyncConflict stringify undefined into required local_value_json/remote_value_json columns when a milestone is removed.
status: resolved
resolution: 2026-10-07 Story 3.4; Missing milestones are serialized as null; work-item-sync and sync-review regressions pass. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-16: Push and sync use different GitHub issue-body representations.
origin: spec-deferred fade9e6cf6d7
location: apps/server/src/services/work-item-sync.ts:241
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Original and current push hash generated issue bodies; sync compares and sends raw Card descriptions, causing false local-change detection and removal of generated metadata.
status: resolved
resolution: 2026-10-07 Story 3.4; One core issue formatter is shared by push/sync/health; LF/CRLF idempotence and unchanged refresh tests pass. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-17: Independent remote edits can be overwritten by a full local sync payload.
origin: spec-deferred bafeacb9bb4d
location: apps/server/src/services/work-item-sync.ts:178
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: high
reason: Original and current conflict detection blocks overlapping changed fields but sends all local fields after non-overlapping changes; a local title update can overwrite a remote description update.
status: resolved
resolution: 2026-10-07 Story 3.4; Per-field non-overlapping merges retain remote title/body/status/milestone and non-status labels; overlapping fields still conflict. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-18: Conflict resolution can apply stale Card data after awaited provider calls.
origin: spec-deferred 6579cd96c8d1
location: apps/server/src/http/routes/index.ts:561
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Baseline and current local/remote resolution branches capture Card/link input before remote awaits; a newer human edit can be overwritten or reported synced despite pending differences.
status: resolved
resolution: 2026-10-07 Story 3.4; Conflict use cases revalidate captured database/Card/link/connection/map/release state after provider awaits; endpoint edits are preserved with409. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-19: Pending sync state can remain inaccurate after a later provider failure.
origin: spec-deferred a0ca37096b1c
location: apps/server/src/services/work-item-sync.ts:84
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Baseline and current earlier results remain committed after subsequent failure; later status/release edits of earlier Cards are not reflected by the text-only health check or the skipped final phase.
status: resolved
resolution: 2026-10-07 Story 3.4; Mixed-batch items retain actual successes, failed/not-applied/not-attempted statuses and failed runs; state/health reflect pending fields. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-20: Unchanged read-only refreshes append Card versions and activity.
origin: spec-deferred fefd1ca6f1cc
location: apps/server/src/services/work-item-sync.ts:216
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Original and current read-only sync unconditionally applies remote payloads and calls updateCard even when mapped values are identical.
status: resolved
resolution: 2026-10-07 Story 3.4; Apply only changed remote fields; unchanged read-only refresh preserves Card version and Activity. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-21: Version numbering materializes every previous Card snapshot.
origin: spec-deferred ee4511339983
location: packages/db/src/repositories/cards-repository.ts:409
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: low
reason: The unchanged numbering implementation selects full version rows to count them; growing histories incur avoidable reads inside a transaction.
status: open

### DW-22: A Card deleted during remote creation leaves the external result unlinked.
origin: spec-deferred f129255e5981
location: apps/server/src/services/work-item-sync.ts:108
source_spec: `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md`
severity: medium
reason: Baseline and current link upsert reject a missing Card after the provider returns; settling detached result storage or reconciliation requires a separate integration policy.
status: resolved
resolution: 2026-10-07 Story 3.4; Deleted Cards produce failed items containing remote ID/URL and original-project remoteUnpersisted Activity, without recreation/deletion. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-23: HTTP and stdio retain independent database writers and process-local write gates.
origin: spec-deferred 553c2476bbfb
location: apps/server/src/mcp/stdio-main.ts:11
source_spec: `spec-2-2-create-and-list-restore-points.md`
severity: medium
reason: The baseline stdio process opened the same SQLite database directly before this story. The architecture gate is in-process; a stdio write can occur between snapshot publication and a migration transaction in another process. Single-writer server/bridge topology remains Epic 8 work.
status: open

### DW-24: A deleted or hidden Card target bypasses ChangeSet conflict preflight and leaves the proposal approved after an explicit not-found failure.
origin: spec-deferred 9cda9db1e313
location: packages/db/src/repositories/changesets-repository.ts:75
source_spec: `spec-2-3-version-counters-on-every-editable-root.md`
severity: medium
reason: The baseline timestamp preflight already skipped absent Cards, and both baseline and current apply updateCard fail explicitly before SQLite rolls the transaction back. HTTP/MCP mark conflict only for ChangeSetConflictError. Integer-token substitution did not introduce this behavior; Epic 3 owns the full conflict surface, including deleted targets.
status: open

### DW-25: Existing saved Card snapshots do not retain owned relationship or attachment values for historical comparison.
origin: spec-deferred dc369b2d4775
location: packages/db/src/repositories/cards-repository.ts:414
source_spec: `spec-2-4-read-a-card-s-history.md`
severity: medium
reason: The unchanged baseline writeCardVersion stores only Card scalar snapshots. Owned-only actions already created versions without relationship snapshots before Story 2.4. Historical relationships cannot be reconstructed accurately from current join tables; this read feature exposes every retained version and explicitly reports the absence of scalar changes, without inventing values. Complete aggregate historical capture would require a separate write/storage change.
status: open

### DW-26: AI/MCP Story picker and server selectedStoryCards still filter only status !== "archived", so Stories under archived or parked ancestors remain selectable for AI proposals.
origin: spec-deferred 0758f0e58afb
location: apps/web/src/features/ai-mcp/AiMcpPanel.tsx:126
source_spec: `spec-2-5-park-archive-and-delete-as-separate-actions.md`
severity: medium
reason: Edge-hunter and verification-gap reviewers cite apps/web/src/features/ai-mcp/AiMcpPanel.tsx:126 and apps/server/src/http/routes/index.ts selectedStoryCards; register-tools.ts proposeHappyPathSlice(snapshot.cards) has no filter at all. Pre-existing behavior at surfaces the intent does not name; fix is switching to visibleCards plus a route assertion.
status: resolved
resolution: 2026-10-07 Story 3.4; Server/MCP proposal selectors and rendered AI picker use visibleCards ancestry; AI use-case and picker regressions pass. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-27: Directory rename durability during actual power loss remains unverified.
origin: spec-deferred a210eee6923c
location: packages/db/src/restore-recovery.ts
source_spec: `spec-2-6-restore-the-project-to-a-restore-point.md`
reason: Ready-file and database content fsync do not prove directory metadata durability across power loss. A native storage/power-loss campaign on supported filesystems would settle the actual failure and platform guarantee; deterministic process-crash recovery is being verified independently.
status: open

### DW-28: Other already-open browser clients retain stale data until live epoch resets arrive.
origin: spec-deferred 557080b9a508
location: apps/web/src/app/api.ts
source_spec: `spec-2-6-restore-the-project-to-a-restore-point.md`
severity: medium
reason: The app already lacks cross-client invalidation for ordinary mutations. Story 3.10 explicitly owns epoch reset/refetch and all open Views reloading; this story reloads its initiating app and persists the epoch required by that work.
status: open

### DW-29: Independent HTTP and stdio database writers are not coordinated by the process-local restore gate.
origin: spec-deferred 9e56622b5e2c
location: apps/server/src/mcp/stdio-main.ts:11
source_spec: `spec-2-6-restore-the-project-to-a-restore-point.md`
severity: medium
reason: Existing DW-23 records the separate stdio writer and local-only gate. Story 3.6 owns the stdio bridge and the process-model stories own single-writer locking; shared-handle HTTP use cases drain correctly here.
status: open

### DW-30: Fresh and ALTER-migrated databases produce different sqlite_schema DDL text, so their schema fingerprints differ (this story's epoch, historical_stub and undone_by_restore columns follow the existing
origin: spec-deferred 43ee7bdb2d67
location: packages/db/src/restore-validation.ts:6
source_spec: `spec-2-6-restore-the-project-to-a-restore-point.md`
severity: low
reason: CREATE TABLE declares `epoch TEXT NOT NULL` while ensureColumn adds `epoch TEXT NOT NULL DEFAULT ''`; the same divergence already exists for earlier ensureColumn columns. A database's own restore points always match it, so only cross-database exchange (Story 2.7 archive import, Epic 8 migrations) can observe it.
status: open

### DW-31: Existing saved portable files can retain previously exported Sync Activity payloads.
origin: spec-deferred cbc9eab4e226
location: packages/db/src/repositories/audit-repository.ts:118; apps/server/src/services/project-archive.ts
source_spec: `spec-2-7-portable-project-archive.md`
severity: medium
reason: Audit JSON/Markdown exports serialize full Activity values. When manually saved under exports, archive file copying retains that content unchanged, as it did in the baseline. Database aggregate redaction cannot sanitize arbitrary pre-existing files. A structured audit-export redaction policy and fixture would settle the repair.
status: open

### DW-32: Existing ZIP imports have no decoded-size or entry-count resource budget.
origin: spec-deferred 143bf6da70ee
location: apps/server/src/services/project-archive.ts
source_spec: `spec-2-7-portable-project-archive.md`
severity: medium
reason: Baseline JSZip loadAsync/extraction already allocated unbounded decompressed entries. A compressed upload can exhaust memory or disk; current CRC checking increases work. Establish supported archive budgets and add a bounded extraction regression in the owning hardening work.
status: open

### DW-33: Actual power-loss durability of archive folder publication remains unverified.
origin: spec-deferred b337c412cb48
location: apps/server/src/services/project-archive.ts
source_spec: `spec-2-7-portable-project-archive.md`
reason: Atomic rename and rollback tests establish process-level behavior, not native storage directory durability. Existing DW-27 records this limitation. Native filesystem fault injection and power-loss execution on Windows/Linux/macOS would settle it.
status: open

### DW-34: Existing restore-point filenames exceed SQLite's usable Windows path length in the default temporary directory.
origin: spec-deferred 1505f108628d
location: packages/db/src/restore-points.ts:48
source_spec: `spec-3-1-contracts-on-zod-4-and-the-current-mcp-sdk.md`
severity: high
reason: The full Windows suite fails to reopen published restore points with SQLITE_CANTOPEN; DB and server restore tests fail. Filename generation and restore readers are unchanged from fb2720d505d48def488bc66d0329eb894cb99249. This blocks the existing-suite acceptance criterion independently of Zod/MCP migration.
status: resolved
resolution: 2026-10-07 Story 3.4; Every native SQLite Restore reader uses resolveSqlitePath; full Windows DB 232/232 includes all Restore tests without short-temp substitution. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-35: Existing restore recovery fsync uses a read-only descriptor that fails on Windows.
origin: spec-deferred cd42ab0de2d3
location: packages/db/src/restore-recovery.ts:50
source_spec: `spec-3-1-contracts-on-zod-4-and-the-current-mcp-sdk.md`
severity: high
reason: Full DB recovery tests fail with EPERM at fsyncSync after openSync(path, "r"); the fixture for crashed WAL exits before writing its evidence. restore-recovery.ts is unchanged from fb2720d505d48def488bc66d0329eb894cb99249.
status: resolved
resolution: 2026-10-07 Story 3.4; Existing writable-descriptor fsync repair retained; real crash/WAL recovery and complete Windows DB 232/232 pass. Final workspace 658 passed,2 Script skips; no DB skips.

### DW-36: Existing restore-point rename failure test assumes POSIX error codes.
origin: spec-deferred d12f304358c4
location: packages/db/src/restore-points.test.ts:192
source_spec: `spec-3-1-contracts-on-zod-4-and-the-current-mcp-sdk.md`
severity: medium
reason: The real Windows rename failure is EPERM, while the assertion accepts only EISDIR or ENOTDIR. The test is unchanged from fb2720d505d48def488bc66d0329eb894cb99249; the full suite reports this independent assertion failure.
status: resolved
resolution: 2026-10-07 Story 3.4; Windows EPERM rename expectation and fixture handle cleanup repaired; full Windows DB 232/232 passes. Final workspace 658 passed,2 Script skips; no DB skips.


### DW-37: Repeated unchanged divergent syncs append duplicate open conflicts for the same Card and field.
origin: spec-deferred 4e4988adb1a5
location: apps/server/src/services/work-item-sync.ts finishSyncItem
source_spec: `spec-3-4-use-case-layer-for-the-remaining-capabilities.md`
severity: medium
reason: Baseline 89fda62 and the final implementation create a conflict on every divergent refresh. Three-layer review classified this unchanged lifecycle as pre-existing and outside DW-15–20/22/26 repairs. A separate lifecycle decision and deduplication regression are required.
status: open

### DW-38: Persisted HTTP/bridge mutation attribution and explicit disabled-Project wire denial remain unverified because inherited empty SDK input schemas discard supplied arguments.
origin: spec-deferred a2ffc52ca9ec
location: packages/mcp/src/transports/server.ts; apps/server/src/mcp/http.test.ts
source_spec: `spec-3-6-mcp-on-the-app-port-and-a-stdio-bridge.md`
severity: medium
reason: SDK discovery preserves the existing 24 empty schemas. Targeted mutations cannot reach application handlers with required IDs; registry and /api/mcp/call tests do not establish /mcp mutation acceptance. Verify persisted actorId/mcpSessionId and disabled-target non-mutation after the pre-existing input-schema repair.
status: open

### DW-39: Recovery changes the bridge client name to stdio-bridge; its effect on future persisted mutation attribution is unverified.
origin: spec-deferred 8968c2147ab1
location: scripts/mcp-bridge.mjs:initialize; apps/server/src/mcp/http.ts:createSession
source_spec: `spec-3-6-mcp-on-the-app-port-and-a-stdio-bridge.md`
reason: First initialization forwards clientInfo; replacement initialization uses a fixed name while retaining only the session ID as persistent bridge state. HTTP derives actorId from that name. Current SDK argument loss prevents targeted mutations and their audit writes. Exercise originating-host attribution before and after recovery when those calls become executable; read-only acceptance does not prove it.
status: open

### DW-40: Ownership scans may cause noticeable latency for large linked Source Document snapshots.
origin: spec-deferred 8960c82c6a10
location: apps/server/src/mcp/tools/project-scopes.ts:37-64,110
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
reason: The resolver scans Projects and document details once per linked chunk. No measured latency or representative large-project workload establishes the user-visible harm. A benchmark with many documents and linked chunks would settle it; if material, targeted repository ownership lookups or call-local indexing would address it.
status: open

### DW-41: Agent mutations still use direct application writes pending the explicitly staged Epic 4 operation registry and executor.
origin: spec-deferred cfb0b71475b4
location: apps/server/src/mcp/tools/register-tools.ts and generated docs/mcp-tools.md
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
severity: high
reason: The pre-existing MCP adapters already perform direct writes; Story 3.7 acceptance expressly records operation-registry membership as an Epic 4 gap. This inventory expansion preserves that staged design and verifies only application of already human-approved ChangeSets, not universal ChangeSet-first routing. The broader repository policy remains unmet until the Epic 4 work lands.
status: open

### DW-42: ListChangeSets may slow down on a large Activity log because each applied-delete ChangeSet rescans all Activity.
origin: spec-deferred 267c5321fa0b
location: apps/server/src/mcp/tools/project-scopes.ts:98-140
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
reason: historicalScopeResolvers calls repository.listActivity() without a Project filter and rebuilds the owner map once per ChangeSet that contains a delete. Cost grows with applied-delete ChangeSets times Activity rows, but no measurement shows user-visible latency. A benchmark with many applied-delete ChangeSets and a large Activity log would settle it; if material, build the owner index once per ListChangeSets call or add an indexed repository query.
status: open

### DW-43: Internal MCP error IDs lack retained diagnostic cause.
origin: spec-deferred 29db97c1239c
location: apps/server/src/application/errors.ts
source_spec: `spec-3-8-record-every-tool-call.md`
severity: medium
reason: Baseline register-tools.invokeTool already converted unexpected exceptions with asDomainError; replyWithError skips logging DomainError. The current generic audited envelope preserves that pre-existing limitation. A future safe correlated diagnostic must avoid raw secrets.
status: open

### DW-44: Global unscoped audit sorting at substantial history sizes remains unmeasured.
origin: spec-deferred 9a48b0e279d6
location: packages/db/src/repositories/audit-repository.ts
source_spec: `spec-3-8-record-every-tool-call.md`
reason: All new indexes start with project_id; old unscoped listActivity also sorted the full history without a global timestamp index. Correctness is covered, but substantial-history query plans and latency are needed to establish a material bad outcome.
status: open

### DW-45: First-page cost with very large affected-object arrays remains unmeasured.
origin: spec-deferred ce653ef3e14e
location: apps/server/src/mcp/tools/audit-tool-call.ts
source_spec: `spec-3-8-record-every-tool-call.md`
reason: The contract bounds event count and deliberately retains relevant IDs. Current actual-browser and strict read benchmarks pass; measuring twenty large-result calls against representative large maps would settle whether metadata size causes a material rendering failure. Do not truncate required IDs on speculation.
status: open

### DW-46: Restore recovery still reads full internal Project history before selecting restore records.
origin: spec-deferred db14364fe76f
location: apps/server/src/application/restore/restore.use-cases.ts
source_spec: `spec-3-8-record-every-tool-call.md`
severity: low
reason: The baseline imperative recovery reader already fetched all Project Activity and parsed complete snapshots; the dedicated endpoint reduces returned evidence to validated restore records. A repository-only projection can optimize that pre-existing processing cost later.
status: open

### DW-47: Markdown audit identities can contain markup and newlines.
origin: spec-deferred 59048fdaf2f5
location: packages/core/src/publishing/export-formatters.ts
source_spec: `spec-3-8-record-every-tool-call.md`
severity: medium
reason: Baseline buildAuditMarkdown already interpolated actor and session text without escaping, including initialized MCP host identity. An initialization name containing a newline and Markdown can forge apparent Markdown rows; JSON evidence remains structured. This is pre-existing formatter behavior.
status: open

### DW-48: Imported raw GitHub title/body hashes can appear stale in the existing normalized sync-health report.
origin: spec-deferred b273c1b86cfc
location: packages/db/src/repositories/tool-proposals-repository.ts; packages/core/src/reports/sync-health.ts
source_spec: `spec-3-9-one-writer-health-and-orderly-shutdown.md`
severity: medium
reason: Baseline Python insert_links and update_existing_card hashed raw detail.title/detail.body. The HTTP transport retains those baselines; core sync-health compares normalized Card titles and formatted bodies. Changing that inherited representation requires separate sync semantics work.
status: open

### DW-49: Existing orphan Story placement in the board tool conflicts with the skill's Not assigned authoring policy.
origin: spec-deferred 3680833b54ad
location: tools/import_github_board_view.py; .agents/skills/github-board-import/SKILL.md; .claude/skills/github-board-import/SKILL.md
source_spec: `spec-3-9-one-writer-health-and-orderly-shutdown.md`
severity: medium
reason: Baseline Python resolved_parent used the Parking lot Step for orphan Stories, whereas both baseline skill copies specify Not assigned. This story preserves both established behavior and authoring instructions rather than silently choosing a new policy.
status: open

### DW-50: Map copies do not retain direct GitHub issue relationships, matching the pre-existing copy tool.
origin: spec-deferred 5a11d2827b85
location: packages/db/src/repositories/map-copy-repository.ts
source_spec: `spec-3-9-one-writer-health-and-orderly-shutdown.md`
severity: medium
reason: Baseline tools/copy_story_map.py did not copy GitHub link tables. Current copies retain Source links and attachments and record sourceStoryMapId in the auditable copy action, but no per-Card direct GitHub link. A provenance-only relationship design must distinguish source attribution from remote sync ownership.
status: open

### DW-51: Actual POSIX operating-system signal acceptance remains unexecuted on the Windows host.
origin: spec-deferred c1631c31d8c4
location: apps/server/src/runtime-lifecycle.test.ts
source_spec: `spec-3-9-one-writer-health-and-orderly-shutdown.md`
reason: Windows tests run the installed Node signal handlers through fixture IPC, plus real owned IPC shutdown and durable audits. Real SIGINT/SIGTERM branches exist but require a POSIX run; Windows evidence does not prove those platform boundaries.
status: open

### DW-52: Existing server-side file import accepts arbitrary readable file paths; sensitive-source import authority remains unspecified.
merged_from: c166011 DW-40
origin: spec-deferred 02ab2ffcfbdf
location: apps/server/src/services/prepare-source-document-import.ts:5
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
severity: high
reason: HTTP source import already used readFileSync on filePath before this story. The merged MCP boundary rejects filePath and requires inline content; this concern now applies only to human HTTP imports. A separate authorized-source boundary decision is needed; no credentials were accessed in tests.
status: open


### DW-53: Chunk ownership resolution may become expensive for large Project source inventories.
merged_from: c166011 DW-41
origin: spec-deferred 70149cb5b61c
location: apps/server/src/mcp/tools/project-scopes.ts
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
reason: chunkScope traverses Project document summaries. No representative workload or measured delay was supplied; large-source timing would establish whether this is a user-visible performance issue.
status: open


### DW-54: Unbounded synchronous file-source preparation may block the shared runtime for large or special files.
merged_from: c166011 DW-42
origin: spec-deferred 29a6d2389edd
location: apps/server/src/services/prepare-source-document-import.ts:5
source_spec: `spec-3-7-complete-mcp-tool-surface.md`
reason: The inherited human HTTP preparation also reads whole files synchronously. No representative workload or reproduced blocking establishes harm; regular-file/size authority policy and measured workload would settle this medium risk.
status: open

### DW-55: Existing own Persona mutations leave cached Story Map/report dependencies stale because their mutation callbacks do not invalidate those queries.
origin: spec-deferred 9cdde7481642
location: apps/web/src/features/personas/PersonaDetail.tsx
source_spec: `spec-3-10-live-board-updates.md`
severity: medium
reason: Baseline PersonaDetail already invalidates only personas/customization/activity. Story3.10 targets external Agent/sync/other-tab delivery and suppresses own echoes; it does not introduce this own-mutation omission. A separate dependency-invalidation repair should test a real Persona mutation against a previously cached map/report.
status: open

### DW-56: Inherited macOS Node24.17.0 launcher test fails in the full script gate with Undici setTypeOfService EINVAL.
origin: spec-deferred 8706aa75a948
location: scripts/commands.test.mjs:260
source_spec: `spec-3-12-persisted-product-context-and-templates-as-mcp-prompts.md`
severity: medium
reason: Both full pnpm test runs and the unchanged standalone script-suite retry produced 76 passed / 1 failed at scripts/commands.test.mjs:260. The unchanged isolated abrupt-launcher-loss test passed. Existing buglog story-3-7-recovery-node-tos predates this story; retain failed output without source or assertion suppression.
status: open

### DW-57: AGENTS.md still describes packages/ai as deterministic template/regex logic although the package was removed.
origin: spec-deferred fe7129482fb9
location: AGENTS.md:45
source_spec: `spec-3-12-persisted-product-context-and-templates-as-mcp-prompts.md`
severity: low
reason: AGENTS.md:45 (Conventions) names packages/ai; the package no longer exists and the logic lives in packages/core/src/proposals. The fix edits an agent-context file.
status: open

### DW-58: Resolved historical verification failure: macOS Node24.17.0 launcher probe hit Undici setTypeOfService EINVAL.
origin: spec-deferred 9083bd03430f
location: scripts/commands.test.mjs:260
source_spec: `spec-3-12-persisted-product-context-and-templates-as-mcp-prompts.md`
severity: medium
reason: Both full pnpm test runs and the unchanged standalone script-suite retry produced 76 passed / 1 failed at scripts/commands.test.mjs:260. The unchanged isolated abrupt-launcher-loss test passed. Existing buglog story-3-7-recovery-node-tos predates this story. Resolved in this repair by directly checking TCP refusal, retaining unexpected errors and all shutdown assertions; final exact full gate passes 973 tests.
status: open

### DW-59: Source chunks are read back ordered by the locator string, so heading-path locators sort alphabetically and block ordinals lexically (Guide#10 before Guide#2), not in document order; the unchanged
origin: spec-deferred 4b523137700a
location: packages/db/src/repositories/sources-repository.ts:94
source_spec: `spec-4-1-import-markdown-and-txt-sources-with-stable-chunks.md`
severity: medium
reason: packages/db/src/repositories/sources-repository.ts getSourceDocumentDetails orders by sourceChunks.locator; the ordering predates this story (paragraph#10 sorted before paragraph#2 already), but the unchanged path now returns that order next to an in-document-order import response.
status: open

### DW-60: SourceDocumentsPanel unchanged notice (role="status") and import error alert (role="alert") have no web render test.
origin: spec-deferred 5fa3c87b2728
location: apps/web/src/features/source-documents/SourceDocumentsPanel.tsx:66
source_spec: `spec-4-1-import-markdown-and-txt-sources-with-stable-chunks.md`
severity: low
reason: No test file under apps/web/src references SourceDocumentsPanel; server tests assert status "unchanged" and HTTP 200 only. Flipping the status condition would keep every test green.
status: open

### DW-61: GitHub issue URLs are not scheme-restricted and are rendered as anchor hrefs.
origin: spec-deferred a2602ad40262
location: packages/contracts/src/api/http.ts:483, apps/web/src/features/story-map/components/CardDetailModal.tsx:358
source_spec: `spec-4-2-provenance-on-every-card.md`
severity: low
reason: github_links.url is validated only with URL.canParse and Card detail renders it with href; the same pattern existed at baseline in the linked GitHub rows.
status: open


### DW-62: Story 4.5 View Settings classification decided as planned-only outside Epic 4's exposed-write catalog (planning requirement revision).
origin: epic-4 supervision 20261012
location: _bmad-output/implementation-artifacts/story-plan-4-5-operation-registry-for-the-remaining-objects.md:27
source_spec: `spec-4-5-operation-registry-for-the-remaining-objects.md`
severity: p2 — scope decision (not a defect)
reason: The Story 4.5 plan and Epic 4 preparation named `view_settings` as an effect to implement, but source contains no view_settings contract/table/repository/owner (DB schema/classification declares exactly four customization families). FR-12 per-View settings is a documented PRD-gap explicitly not committed as new functionality. The supervisor locked the scope decision that View Settings is a planned-only family outside Epic 4's exposed-write catalog; parity/classification treats it as explicitly excluded rather than an unexplained gap. This DW records the decision for traceability so it is a planning requirement revision, not a silent removal. Implementation continues 4-5 without inventing View Settings fields.
status: open

### DW-63: A failed post-commit subscriber prevents later subscribers and afterCommit from running.
origin: spec-deferred dc436c08dfc4
location: packages/db/src/unit-of-work.ts:74
source_spec: `spec-4-6-changeset-executor.md`
severity: medium
reason: The baseline UnitOfWork already iterates listeners without independent error capture and runs afterCommit afterward. Story4.6 preserves a committed successful outcome with a loud diagnostic; independent publication fan-out is pre-existing deferred work.
status: open

### DW-64: Deferred command proposals and successful call audits are not persisted atomically.
origin: spec-deferred ef3d4ee62016
location: apps/server/src/application/changeset/changeset-command.ts
source_spec: `spec-4-7-writing-agent-tools-run-through-changesets.md`
severity: medium
reason: The pre-existing executeChangeSetCommand creates the proposal in its own transaction before the MCP wrapper writes its successful audit; an audit-insert failure leaves that retained proposal. This predates Story 4.7. Applied command effects and their success audit remain atomic and covered.
status: open

### DW-65: Repeated pulls can retain duplicate open conflicts for one Card/connection/remote field.
origin: spec-deferred fd2948b2a902
location: packages/db/src/repositories/work-item-repository.ts and apps/server/src/services/sync-merge.ts
source_spec: `spec-4-7-writing-agent-tools-run-through-changesets.md`
severity: medium
reason: The existing human repository/sync path already creates a conflict on every divergence without deduplication (historical duplicate-conflict lifecycle DW-37). New shared conflict checks truthfully refuse applying one while its same-field duplicate remains open. Follow-up lifecycle work must reconcile these existing rows; no automatic resolution is inferred.
status: open

### DW-66: Sync link state can disagree with existing durable open conflicts after divergence disappears.
origin: spec-deferred 098fe1e887a8
location: apps/server/src/services/work-item-sync.ts:finishSyncItem
source_spec: `spec-4-7-writing-agent-tools-run-through-changesets.md`
severity: medium
reason: The pre-existing human finishSyncItem computes state from newly detected fields only, independently of persisted open conflict rows. The new incoming path preserves this calculation. A scoped conflict lifecycle repair must reconcile link state against durable open rows.
status: open

### DW-67: Clearing a remote assignee does not clear the local assignee.
origin: spec-deferred 038044dcfe4e
location: apps/server/src/services/sync-merge.ts:applyRemoteFields
source_spec: `spec-4-7-writing-agent-tools-run-through-changesets.md`
severity: medium
reason: The unchanged shared human applyRemoteFields helper and the new incoming preparation both require a truthy remote.assignee. This predates the story; fixing it must define the existing provider unassigned representation and preserve human mapping semantics.
status: open

### DW-68: Existing-target empty slices have inconsistent direct versus AI lifecycle behavior.
origin: spec-deferred 1c9534f7ab16
location: apps/server/src/application/changeset/changeset.use-cases.ts; apps/server/src/services/ai-proposal-change-set.ts
source_spec: `spec-4-10-slicing-proposals-and-release-notes.md`
severity: medium
reason: The baseline direct generator stored an empty ChangeSet when its chosen Release existed and no visible Stories remained; the baseline AI service rejected zero operations. Both behaviors predate Story4.10. Empty-new requests contain a Release create. A separate empty-slice policy decision/test would reconcile this inherited behavior.
status: open

### DW-69: Existing AI proposal success/error messages can arrive after navigation to another Story Map.
origin: spec-deferred 287e396c61c9
location: apps/web/src/features/ai-mcp/useAiMcpPanelState.ts
source_spec: `spec-4-10-slicing-proposals-and-release-notes.md`
severity: medium
reason: The baseline useProposalEditor callbacks update shared message state without submitted-scope checks. This behavior is unchanged by Story4.10. Its new direct-tool error rendering is separately repaired in this story. A deferred successful AI proposal followed by a map switch would demonstrate the inherited message issue.
status: open

### DW-70: Global and map-specific Workflow Statuses can share a name with conflicting groups.
origin: spec-deferred 7ba82aafc065
location: packages/db/src/repositories/customizations-repository.ts:21
source_spec: `spec-4-11-delivery-status-from-agents.md`
severity: medium
reason: Existing create/update allows duplicate names; Card.status stores only the name. Tracking chooses configured position order while release notes classify any matching done group. Existing fixed Tracking icons already disagreed for duplicate builtin names. Resolving identity/precedence is a pre-existing configuration policy issue.
status: open

### DW-71: Detail-modal category choices remain visually color-only, unlike the new tile category chips.
origin: spec-deferred ad64a62aa3ef
location: apps/web/src/features/story-map/components/CardDetailModal.tsx:334
source_spec: `spec-6-2-create-and-edit-cards.md`
severity: low
reason: Pre-existing empty swatch buttons retain accessible labels and now selected-state semantics; central glyph/word additions apply to tile controls. Sighted users still rely on swatch colors/tooltips in detail.
status: open

### DW-72: Planning business-value and effort inline edits still omit blanks and submit invalid fractions without local validation.
origin: spec-deferred 0c0afa4ebbe1
location: apps/web/src/features/story-map/components/CardTile.tsx:159
source_spec: `spec-6-2-create-and-edit-cards.md`
severity: medium
reason: Pre-existing CardTile planning handlers send undefined for blanks and Number(value) for other text; the non-nullable integer API rejects invalid numbers and omission retains saved numbers. Modal validation now explicitly refuses these drafts, but unchanged Planning handlers retain their earlier behavior.
status: open

### DW-73: Roadmap progress still prints estimate totals in points instead of the story map estimation unit.
origin: spec-deferred cf1c329dd986
location: apps/web/src/ui-strings/index.ts:148
source_spec: `spec-6-2-create-and-edit-cards.md`
reason: panelStrings.roadmapProgress hard-codes pts and RoadmapPanel passes no unit; unverified whether a roadmap can span story maps with different units, which would settle the intended behavior.
status: open

### DW-74: Discovery Create buttons stay live while the board shows a ChangeSet preview snapshot.
origin: spec-deferred 53df1037fd9a
location: apps/web/src/features/story-map/components/DiscoveryMatrix.tsx:225
source_spec: `spec-6-2-create-and-edit-cards.md`
severity: medium
reason: The story-map shell passes the preview snapshot into DiscoveryMatrix; the Create buttons and composer are not gated on preview. The earlier inline add controls were equally ungated, so this predates Story 6.2.
status: open

### DW-75: Native browser pointer/form equivalence, Tab order and assistive presentation remain unverified.
origin: spec-deferred 673b60437274
location: DiscoveryMatrix, MoveAreaDialog, DeleteCardsDialog and other move surfaces
source_spec: `spec-6-3-move-cards-by-mouse-keyboard-or-form.md`
reason: Safari selection returned cgWindowNotFound (-10005); iab creation returned Browser is not available: iab. Real jsdom pointer/form/focus tests and actual TCP persistence/reopen pass, but cannot establish native screen-reader or browser acceptance.
status: open

### DW-76: Arbitrary mixed create/move/selected-delete ChangeSet conflict-list completeness has not been independently exercised.
origin: spec-deferred efe6a4e4f350
location: packages/core/src/changesets/operation-conflicts.ts
source_spec: `spec-6-3-move-cards-by-mouse-keyboard-or-form.md`
reason: Single-command complete conflict sets, selected cleanup, aliases and deferred Apply are tested. The initial conflict collector computes effects from the persisted snapshot while resolution sees preceding operations. A composite changing existing affected roots would settle aggregate all-conflict completeness; atomic resolution refusal remains checked.
status: open

### DW-77: Composer, Release and update mutations carry no preview guard, now that preview also reaches Discovery.
origin: spec-deferred ed539645f80d
location: apps/web/src/features/story-map/useStoryMapBoardState.ts
source_spec: `spec-6-3-move-cards-by-mouse-keyboard-or-form.md`
reason: useStoryMapBoardState guards only moveCard and deleteCards with the read-only preview error; createCard, updateCard, createRelease and the other mutations never had one in any view. Whether the preview board hides those controls was not checked.
status: open

### DW-78: Planning pointer-drag baseline forwarding and Backlog preview gating have no executed test.
origin: spec-deferred 4f7f0690bfa7
location: SwimlaneGrid.tsx, BacklogList.tsx
source_spec: `spec-6-3-move-cards-by-mouse-keyboard-or-form.md`
reason: A real-pointer Backlog test now proves the drag-start baseline survives a snapshot advance, and Slices has the same. A Planning equivalent could not be driven in jsdom because the cell droppables need layout the mocks did not supply. SwimlaneGrid passes the same shared hook value.
status: open

### DW-79: Final native layout/focus/accessibility and a native planned selected-GitHub flow remain unverified.
origin: spec-deferred 880303055879
location: BoardToolbar, DeleteCardsDialog, GitHubSyncPanel and global.css
source_spec: `spec-6-4-search-filter-and-bulk-actions.md`
reason: Earlier Safari native AX and screenshot checks confirmed retained hidden selection, full-set Delete confirmation/Cancel, accessible filter names and excluded Notes with GitHub disabled. They exposed hidden-attribute CSS and toolbar clipping/focus defects, repaired with executed stylesheet/DOM/focus tests. Final pressKey and getApp both returned cgWindowNotFound (-10005), preventing final-build native recheck or owned-tab cleanup. A controlled final native check of keyboard/focus/layout and planned selected scope would settle this boundary; no full WCAG, screen-reader or live GitHub write acceptance is claimed.
status: open

### DW-80: Tree zero-row removal can leave no focus recovery target.
origin: spec-deferred a7bc65b345cf
location: apps/web/src/features/story-map/components/TreeGrid.tsx
source_spec: `spec-6-5-collapse-card-keys-and-notes.md`
severity: medium
reason: TreeGrid returns an empty-state div without treeRef when all roots disappear. This branch and absence of an empty-board focus target predate Story6.5; hierarchy collapse itself always retains a root. A focused final-root removal/empty transition remains a separate existing boundary.
status: open

### DW-81: Native combined hierarchy/Release collapse and pinned-lane geometry is not exhaustively verified.
origin: spec-deferred 2e915a78a7d4
location: DiscoveryMatrix.tsx and DiscoveryLanes.tsx
source_spec: `spec-6-5-collapse-card-keys-and-notes.md`
reason: Mounted tests execute neighboring-column traversal, both collapse dimensions, disabled hidden surfaces, retained selection and reconnected ResizeObserver measurements. Safari confirms Activity collapse/reload, shared Tree/Discovery Step collapse and prefix conflict/application. Native sticky overlap/alignment across combined states, zoom and scrolling still requires a controlled visual/keyboard pass; jsdom geometry assertions do not establish this.
status: open

### DW-82: Existing Release-management report omits current GitHub work-item links from readiness risks.
origin: spec-deferred f38e2dfe5ed9
location: packages/db/src/repositories/releases-repository.ts:112
source_spec: `spec-6-6-the-five-core-views.md`
severity: medium
reason: getStoryMapReportData reads legacy githubLinks only; importRemoteWorkItems writes remoteWorkItemLinks. Tracking now correctly reads both, exposing pre-existing cross-surface disagreement. No server report changed in this frontend story.
status: open

### DW-83: Pre-existing Discovery global creation controls stretch vertically beside the board.
origin: spec-deferred d791d9cad697
location: apps/web/src/styles/global.css:680
source_spec: `spec-6-6-the-five-core-views.md`
severity: medium
reason: Native Safari screenshot at1800x975 shows tall Create Activity/Step/Story/Note columns. Baseline global.css has row flex discovery-workspace with card-create-actions as sibling; unchanged by this story. Native window became unavailable before further checks.
status: open

### DW-84: Discovery grid uses display: contents on role=row/rowheader/columnheader wrappers, whose accessibility exposure in Safari/WebKit is unverified.
origin: spec-deferred f993f2714954
location: apps/web/src/features/story-map/components/DiscoveryMatrix.tsx
source_spec: `spec-6-6-the-five-core-views.md`
reason: Only jsdom attribute tests exist; the spec forbids claiming native accessibility from jsdom. Settle with a native VoiceOver or accessibility-tree check of the Discovery grid.
status: open

### DW-85: Board toolbar absence and Activity/Step header aria-selected remain asserted only indirectly; dependent write guards exist.
origin: spec-deferred 80baf33b0828
location: apps/web/src/features/story-map/components/DiscoveryLanes.tsx:47
source_spec: `spec-6-6-the-five-core-views.md`
severity: low
reason: Toolbar absence is now asserted in the preview test; Activity/Step columnheader aria-selected/aria-description has no dedicated assertion. Low risk, accessibility-only.
status: open

### DW-86: Planning number fields disable the focused input while a card update is pending, dropping keyboard focus after Enter.
origin: spec-deferred 8ae9235213f4
location: apps/web/src/features/story-map/components/CardTile.tsx:195
source_spec: `spec-6-6-the-five-core-views.md`
severity: low
reason: disabled={readOnly || updatePending || ...} pattern pre-dates this story (updatePending was already passed from SwimlaneGrid); tests assert the disabled state. Replacing it with readOnly/aria-busy changes the pending contract.
status: open

### DW-87: Board persona name projection dereferences personaById.get(id)! and would throw on a cardPersonas link whose persona is absent from the snapshot.
origin: spec-deferred 33879c0c7c92
location: apps/web/src/features/story-map/useStoryMapBoardState.ts:66
source_spec: `spec-6-6-the-five-core-views.md`
reason: Canonical snapshots keep links consistent; whether a projected ChangeSet preview snapshot can drop a Persona but keep its link was not established. Settle by projecting a persona-removing ChangeSet preview and mounting a board.
status: open

### DW-88: Unsaved attachment Label/path/type fields are discarded when leaving an otherwise clean Card modal.
origin: spec-deferred 77e39f0683c8
location: apps/web/src/features/story-map/components/CardDetailModal.tsx:49
source_spec: `spec-6-7-card-detail-as-a-deep-linkable-modal.md`
severity: medium
reason: Pre-existing attachmentDraft state is separate from the persisted Card draft and isDirty. The same reset/unmount behavior exists at baseline905cdd53b5e48e338b1206768ddc1d9490306225; this story protects accepted and pending Card writes but does not add attachment-draft persistence.
status: open

### DW-89: Rapid native browser gestures interleaved with corrective history.go events remain unverified.
origin: spec-deferred 4b7ba21ae844
location: patches/@tanstack__history@1.162.0.patch
source_spec: `spec-6-7-card-detail-as-a-deep-linkable-modal.md`
reason: Resume review Blind7 identifies a possible event-ordering risk around the single ignoreNextPop flag, without a reproduced defect. Automated repeated traversal Cancel/Discard and subsequent cursor tests pass; final native rapid-gesture checks would settle whether a user event can precede the corrective pop event.
status: open

### DW-90: A restore go(delta) that targets a history index outside the browser's session range could leave ignoreNextPop set and swallow the next genuine traversal.
origin: spec-deferred 668c0bf48c77
location: patches/@tanstack__history@1.162.0.patch
source_spec: `spec-6-7-card-detail-as-a-deep-linkable-modal.md`
reason: Follow-up Edge9 claim: the patched onPushPopEvent sets ignoreNextPop before win.history.go(restoreDelta/resumeDelta) and clears it only on the matching pop. Both indices come from router-created entries of the same session, so an out-of-range delta was not shown reachable; a native run with truncated session history would settle it.
status: open

### DW-91: Native browser keyboard, visual, screen-reader and connected browser-to-persistence acceptance remain unverified.
origin: spec-deferred b8642185ce3d
location: apps/web/src/features/customization/CustomizationEditor.tsx; TemplatePicker.tsx; PersonasPanel.tsx
source_spec: `spec-6-8-manage-personas-annotations-statuses-and-templates.md`
reason: Browser inventory exposed no browser surface; Safari binding failed with Computer Use cgWindowNotFound. DOM/router tests, real HTTP/MCP commands and SQLite reopen/parity pass independently. A disposable native CRUD/scope/template/confirmation flow plus screen-reader checks would settle this boundary. Review Blind10 and Intent1/2 share this single deferral.
status: open

### DW-92: Story Templates keep a stale defaultStatus name after the matching workflow status is renamed or deleted.
origin: spec-deferred 3da8fee2ea10
location: packages/db/src/repositories/customizations-repository.ts; packages/core/src/changesets/customization-resolution.ts
source_spec: `spec-6-8-manage-personas-annotations-statuses-and-templates.md`
severity: low
reason: Status rename/delete rewrites Card names only; StoryTemplate.defaultStatus is a plain string copied at apply time, so a later template apply can create a Card with a status that no longer exists. Pre-existing: definition-only rename already left templates untouched.
status: open

### DW-93: Personas scoped to a removed Story Map are read-only and cannot be deleted in the Persona editor.
origin: spec-deferred b0ac5c64d564
location: apps/web/src/features/personas/PersonasPanel.tsx:104
source_spec: `spec-6-8-manage-personas-annotations-statuses-and-templates.md`
reason: PersonasPanel passes unavailable=true to PersonaDetail when the Persona's map is not among visible maps, disabling edit and Delete; PersonasPanel.scope.test.tsx pins the refusal for a retained draft. Unverified whether retained removed-map Personas must stay editable/deletable (Design Notes only promise that for unused customization definitions). A product decision plus a disposable removed-map Persona flow would settle it.
status: open

### DW-94: Agent cardPersona/cardAnnotation set/unset still apply immediately when agentProtection is off.
origin: spec-deferred 7443c584fba3
location: apps/server/src/application/changeset/changeset-command.ts:19
source_spec: `spec-6-8-manage-personas-annotations-statuses-and-templates.md`
severity: low
reason: The new proposal-only gate covers persona, annotation, workflowStatus and storyTemplate entities only; Card link operations keep their pre-existing agentProtection behavior and were not part of this change.
status: open

### DW-95: Full native accessibility and forced-failure/inactive-map Restore acceptance remain unverified.
origin: spec-deferred 6b209ff3556a
location: apps/web/src/features/releases; apps/web/src/app/live/useLiveUpdates.ts
source_spec: `spec-6-9-manage-releases-and-read-their-summary.md`
reason: Native Safari exercised full fields/create/reopen, dirty Cancel, actual409/Keep mine, released scope across list/Planning/Tracking/Discovery and actual server restart/reloaded editor. Focused routed and delayed/failed Restore DOM tests cover repaired boundaries. Final native build also passed real MCP proposal projection, readonly controls, Close preview, actual dirty-editor Restore reset, restored fields and subsequent versioned Save. Full screen-reader, zoom, forced-colors/WCAG and native forced delayed/failed inactive-map Restore checks remain unverified; DOM/live regressions plus independent source recheck cover those races. Safari lost its window handle at final cleanup; the owned server is stopped.
status: open

### DW-96: Full native desktop accessibility and platform/screen-reader conformance remains unverified (I2/I3).
origin: spec-deferred 9308c1179991
location: evidence/story-6-10/native-acceptance.json
source_spec: `spec-6-10-performance-and-accessibility-budgets.md`
reason: Bounded Safari keyboard/zoom observations and automated DOM/contrast checks do not establish full rendered contrast, target geometry, scrolled sticky-focus occlusion, complete UJ sequences, forced-colors/reduced-motion preferences or screen-reader speech/interaction. Settle with the complete native desktop rendering/journey matrix, VoiceOver/Safari and NVDA/Firefox acceptance; no full WCAG pass is claimed.
status: open

### DW-97: Partial GraphQL search responses may suppress incomplete-response or permission failures.
origin: spec-deferred 89e5060af75e
location: packages/github/src/providers/github-provider.ts:73
source_spec: `spec-7-1-credentials-in-a-user-level-file.md`
severity: medium
reason: CLI and Octokit partial-search catches predate this story. They retain partial search data after provider errors. Resolve provider completeness in the later identity/import work; do not infer remote deletion from incomplete reads.
status: open

### DW-98: A CLI milestone HTTP422 is still assumed to mean an existing milestone.
origin: spec-deferred 91d98a6a6d08
location: packages/github/src/providers/github-provider.ts:196
source_spec: `spec-7-1-credentials-in-a-user-level-file.md`
severity: medium
reason: The prior implementation suppressed every milestone-create failure; this story narrows suppression and tests unexpected failures stop before issue mutation. Duplicate identity is not yet confirmed for every422; later confirmed remote-plan/reconciliation work must distinguish validation causes.
status: open

### DW-99: Native Windows credential ACL and atomic replacement acceptance remain unverified.
origin: spec-deferred d27cb8ddd9a5
location: apps/server/src/services/credential-file.ts
source_spec: `spec-7-1-credentials-in-a-user-level-file.md`
reason: macOS real filesystem tests and simulated APPDATA paths pass; they do not establish Windows ACL/ownership, unsafe-parent handling or replacement of an existing file on native Windows. Execute the bounded credential fixture on a Windows runner with disposable APPDATA before claiming native acceptance. Real CLI/account acceptance is also not claimed by intercepted transport tests.
status: open

### DW-100: Real GitHub account and installed CLI authentication acceptance remains unverified.
origin: spec-deferred 5fa641d63da0
location: packages/github/src/providers/github-provider.ts
source_spec: `spec-7-2-connect-github-in-the-app.md`
reason: Controlled provider/CLI transports and final native Safari disposable fixture pass. They do not establish real account/repository access. Execute a separately authorized real GitHub smoke; any interactive login requires explicit human presence confirmation. Native Windows credential ACL/replacement acceptance remains the carried Story7.1 limitation.
status: open

### DW-101: Full native platform and screen-reader release acceptance remains unverified.
origin: spec-deferred 129b115b8ca3
location: apps/web/src/features/github-sync/GitHubConnectDialog.tsx
source_spec: `spec-7-2-connect-github-in-the-app.md`
reason: Final macOS Safari fixture proves running-app CLI Verify/Connect/reconnect, header state and bounded keyboard focus. Full VoiceOver and Windows/NVDA/Firefox matrix, especially multiple-window lost-response/Restore recovery, was not executed. Run that matrix before native release certification.
status: open

### DW-102: Token-mode Milestone lookup does not search later result pages.
origin: spec-deferred 3317e51cd681
location: packages/github/src/providers/github-provider.ts:198
source_spec: `spec-7-3-github-identity-in-external-references.md`
severity: medium
reason: Blind review B8 confirmed the unchanged token listMilestones call inspects one page. An existing exact Milestone beyond that page can trigger a redundant create and visible422 failure. CLI pagination is handled; a separately scoped token pagination repair and multi-page regression remain.
status: open

### DW-103: Native browser navigation and screen-reader/platform acceptance remain unverified.
origin: spec-deferred 46821cce4534
location: apps/web/src/features/story-map/components/TreeGrid.tsx
source_spec: `spec-7-3-github-identity-in-external-references.md`
reason: Intent audit I3 and native-acceptance.json record no available CUA browser surface. Automated DOM links and actual ephemeral HTTP/SDK origins pass. Native link activation, browser navigation, reader behavior and the platform matrix require observation before native release acceptance.
status: open

### DW-104: Live GitHub account and installed CLI acceptance remain unverified.
origin: spec-deferred 6e0a352f022c
location: packages/github/src/providers/github-provider.ts
source_spec: `spec-7-3-github-identity-in-external-references.md`
reason: Intent audit I4 distinguishes controlled provider/CLI transports from a live account smoke. No real credentials, live GitHub or user Projects were accessed. A separately authorized real-account run would settle this boundary; any interactive login requires confirmed human presence.
status: open

### DW-105: Issue bodies no longer publish the Estimate and Priority lines.
origin: spec-deferred 55aae81bdcc3
location: packages/core/src/publishing/github-footer.ts:21
source_spec: `spec-7-3-github-identity-in-external-references.md`
reason: Follow-up blind review BH2: the replaced body builder wrote Estimate and Priority beneath the references block; the footer-only builder omits them, and neither the intent nor the plan says whether that loss is wanted. A maintainer decision on whether Issue bodies must keep both values would settle it; no test asserted them.
status: open

### DW-106: One integrated native browser/provider journey remains unverified
origin: spec-deferred 4f126d3fd797
location: n/a
source_spec: `spec-7-4-push-with-a-mandatory-dry-run.md`
reason: Component API mocks plus actual HTTP/MCP/provider transport tests establish separate seams; a native controlled browser journey would establish the combined UI surface.
status: open

### DW-107: Abrupt OS termination during a remote call remains unverified
origin: spec-deferred 9b3e0984238f
location: n/a
source_spec: `spec-7-4-push-with-a-mandatory-dry-run.md`
reason: Fault-injected outcomes and actual SQLite reopen/Restore verify durable recovery; a separately controlled child-process kill with persistent fake remote state would establish literal process-death acceptance.
status: open

### DW-108: Native platform/reader and live GitHub/installed CLI acceptance remain unverified
origin: spec-deferred 411e098a32a8
location: n/a
source_spec: `spec-7-4-push-with-a-mandatory-dry-run.md`
reason: CUA has no browser surface; no live-account acceptance run authorized. Native/platform and separately authorized account observations would settle these boundaries.
status: open

### DW-109: Marker reconciliation lists every repository Issue once per effect at plan and execution time
origin: spec-deferred 2f408c804014
location: packages/github/src/providers/github-remote-push.ts findGitHubMarkerMatches
source_spec: `spec-7-4-push-with-a-mandatory-dry-run.md`
reason: findGitHubMarkerMatches pages all Issues (state=all) per effect; a push of hundreds of Cards against a large repository could exhaust the REST rate limit. Measuring request counts for a 500-Issue disposable repository, or sharing one complete listing per run, would settle it.
status: open

### DW-110: GitHub may return a normalized Milestone due_on time different from the sent T00:00:00.000Z
origin: spec-deferred 365453541abb
location: apps/server/src/services/remote-push-evidence.ts remoteMatchesIntent
source_spec: `spec-7-4-push-with-a-mandatory-dry-run.md`
reason: remoteMatchesIntent compares due dates as exact instants; if GitHub rewrites the time of day, every dated Release Milestone write would end interrupted with a content-mismatch conflict. An observation of due_on round-trip on a disposable repository, which is not authorized here, would settle it.
status: open

### DW-111: Pre-existing assignee synchronization does not clear absent remote assignees or merge assignee divergence.
origin: spec-deferred dca0a5b3b420
location: apps/server/src/application/sync/github-pull-command.ts
source_spec: `spec-7-5-import-and-sync.md`
severity: medium
reason: B10: The baseline direct writer also used a truthy remote assignee check. Frozen intent preserves assignee semantics and excludes broad assignee synchronization; no expansion is made in Story 7.5.
status: open

### DW-112: Native browser and live-account operator acceptance remain unverified.
origin: spec-deferred ef2d2ee97557
location: evidence/story-7-5/native-acceptance.json
source_spec: `spec-7-5-import-and-sync.md`
reason: I4: Fake-provider HTTP/SDK/actual stdio and React integration fixtures cover automated surfaces. CUA inventory provides no browser surface; no user credentials or live provider writes were used. An observed native operator journey would settle the remaining acceptance question.
status: open

### DW-113: Native browser/provider resolution and connected Restore-to-pending-resolution acceptance remain unverified (I2, I3).
origin: spec-deferred b5400e03c15b
location: GitHubSyncPanel and native acceptance
source_spec: `spec-7-6-conflicts-and-sync-health.md`
reason: Browser inventory exposed no usable browser. Fixture UI/HTTP/core/DB tests passed, but do not establish a connected native keyboard, focus, screen-reader, platform or live-account journey. Settle with an observed disposable-provider browser resolution and actual Restore while a resolution is pending, without real user data.
status: open

### DW-114: Pre-existing linked Release goal and released-state edits can remain shown as synced (P2B5).
origin: spec-deferred 5d7a47e41544
location: packages/core/src/reports/sync-health.ts:49; apps/server/src/services/remote-push-plan.ts:90; packages/db/src/repositories/releases-repository.ts:46
source_spec: `spec-7-6-conflicts-and-sync-health.md`
severity: medium
reason: Before Story7.6, Release links retained persisted syncState while releaseSyncBaseline/syncReleaseMetadata omitted goal and released state. updateRelease changes neither link state nor those missing baselines. remote-push-plan publishes goal as Milestone description and released as Milestone state. Settling this requires acknowledged evidence for those published fields and independent edit regressions; current Story7.6 name/date projection does not introduce the omission.
status: open

### DW-115: Assembled native connection-to-ticket-creation, rendered Issue navigation and reader/platform/live-provider acceptance remain unverified (I4–I6).
origin: spec-deferred c7a8bb8a2e61
location: n/a
source_spec: `spec-7-7-import-a-single-ticket-while-creating-a-card.md`
reason: Parent CUA inventory returned browsers:[]; shared connection and composer tests plus actual HTTP/MCP/reopened SQLite tests pass separately. A disposable-provider native journey including Connect, replacement review, protected Apply and Issue navigation would settle this medium unverified risk. No live GitHub credential/account smoke was run.
status: open

### DW-116: The connector validation safety switch gates only provider "github", so a registered alternate provider validates and reads remotely while the project's github switch is off.
origin: spec-deferred b0427f64bee4
location: apps/server/src/application/connector/connector.use-cases.ts:38
source_spec: `spec-7-8-provider-extension-points.md`
severity: medium
reason: connector.use-cases.ts assertEnabled checks body.provider === "github" and the project safety settings expose only a github flag; the line predates this story and the extension suite sets github: true, so no test covers the off state. Only github ships, so it is unreachable in production today.
status: open

### DW-117: No alternate-provider test locks or resolves a Milestone/release field conflict (sync-field-locks disputedTarget and sync-resolution-agreement assignment lookup).
origin: spec-deferred 14aff53dabc1
location: packages/core/src/changesets/sync-field-locks.ts:47
source_spec: `spec-7-8-provider-extension-points.md`
severity: medium
reason: Both sites now compare against the connection provider; only github core tests and alternate title conflicts exist, so reverting either comparison to "github" would not fail any test. Needs an enum-injected fixture with a milestone-field conflict.
status: open

### DW-118: Deleting a Card or Release whose alternate-provider ref is cited by another Card's attached evidence is not exercised (cards-repository referencingCards, releases-repository evidenceOwners).
origin: spec-deferred a3f8effa79e8
location: packages/db/src/repositories/cards-repository.ts:231
source_spec: `spec-7-8-provider-extension-points.md`
severity: medium
reason: Both queries now use the registered provider set; the extension suite's only alternate deletion has no citing Card, so restoring the github-only filter would pass all tests. Can extend the attached-evidence test with a delete.
status: open

### DW-119: Standalone incoming Milestone reconciliation requires a linked Card.
origin: bmad-build-review epic-7-retro-blockers BH2
location: apps/server/src/application/sync/github-pull-command.ts:18
source_spec: `spec-epic-7-retro-blockers.md`
severity: medium
reason: Incoming preparation reads Card bindings only. An empty linked Release can publish reviewed local metadata and refuses divergent remote metadata, but has no standalone incoming consumer. This limitation predates the repair. The refusal now names the existing explicit reviewed Push as the available local-choice path; adding standalone incoming reconciliation is separate work.
status: open

- source_spec: `spec-epic-7-retro-blockers.md`
  summary: Support incoming Milestone reconciliation for linked Releases without Cards if that scope is later authorized.
  evidence: Review BH2 traced prepareIncomingItems filtering cardId links. Final repair safely refuses remote drift and exposes the existing explicit reviewed Push alternative; no standalone incoming feature was added.

### DW-120: Exercise an older supported Restore/archive upgrade through the running browser lifecycle.
origin: spec-deferred 4b99e445f366
location: Restore/archive browser lifecycle
source_spec: `spec-8-1-baseline-migration-and-upgrade-path.md`
reason: Unverified: service and browser lifecycle tests pass independently, but no running browser has adopted an older generated release and demonstrated epoch/cache/dirty-editor reset end to end. A disposable older-release input through the existing HTTP/browser surface would settle this concern.
status: open

### DW-121: Nothing automated detects divergence between schema/tables.ts and the committed generated baseline SQL.
origin: spec-deferred 003ed72bc89b
location: packages/db/src/schema/tables.ts, packages/db/migrations
source_spec: `spec-8-1-baseline-migration-and-upgrade-path.md`
severity: medium
reason: Verification-gap review: migration tests assert selected constraints and the JSON inventory only; drizzle-kit check ran manually. A CHECK, index or default added to tables.ts without a generated migration (or SQL edited alone) passes every current test. The same drift class existed with the former bootstrap DDL, so it is not introduced here.
status: open

### DW-122: The proxy-smoke optimizer waits have no overall deadline; an actual stalled optimizer remains unverified.
origin: spec-deferred ca3ea899f142
location: _bmad-output/implementation-artifacts/evidence/story-8-2/proxy-smoke.mts:43
source_spec: `spec-8-2-dependency-upgrade-wave.md`
reason: E1/B5: request fetches are timed out, but request-idle, scanProcessing and dependency-processing waits are not. All recorded Vite runs completed. Reproduce a reachable optimizer stall and observe exit/cleanup to establish the alleged hang.
status: open

### DW-123: DescriptionEditor editable-state changes emit the existing update callback.
origin: spec-deferred 4077e3e17832
location: apps/web/src/features/story-map/components/DescriptionEditor.tsx:26
source_spec: `spec-8-2-dependency-upgrade-wave.md`
severity: low
reason: B1: both Tiptap2.27.2 and3.32.0 setEditable default emitUpdate=true; the application already called it before this upgrade. Card Detail value-based dirty detection and title-only Markdown preservation pass. Follow up separately on non-user callback semantics.
status: open

### DW-124: Native browser clipboard HTML/plain-text extraction and OS paste remain unverified.
origin: spec-deferred fb885814ba1c
location: apps/web/src/features/story-map/components/DescriptionEditor.test.tsx:63
source_spec: `spec-8-2-dependency-upgrade-wave.md`
reason: B2/I2: actual ProseMirror paste parsing, transactions and exact Markdown serialization pass in JSDOM, but a native clipboard/DOM paste dispatch was not executed. Run an isolated real browser paste to settle possible incompatibility.
status: open

### DW-125: A broader existing-Markdown compatibility corpus remains unverified.
origin: spec-deferred 6dc4fbe4bb23
location: apps/web/src/features/story-map/components/DescriptionEditor.test.tsx
source_spec: `spec-8-2-dependency-upgrade-wave.md`
reason: B3: no mismatch was shown for ordered/nested lists, blockquotes, code, strike or hard breaks. Current focused tests exercise toolbar formats, prop sync, paste, unchanged descriptions and exact save/reload. Compare those additional supported formats between actual v2/v3 runtimes to settle possible serialization risk.
status: open

### DW-126: Native execution and rendered boot of the final compiled browser bundle remain unverified.
origin: spec-deferred 3a11f1b562ae
location: _bmad-output/implementation-artifacts/evidence/story-8-2/proxy-smoke.mts:41
source_spec: `spec-8-2-dependency-upgrade-wave.md`
reason: B4: actual proxy transformation, production static/deep-route bytes and mounted React suites pass, but the smoke does not execute the compiled application in a native browser. Run a disposable built-app browser boot/render check to settle possible runtime-import or boot risk.
status: open

### DW-127: Native Windows/Linux and actual screen-reader acceptance remain open operational prerequisites.
origin: spec-deferred 4c653b3d45b8
location: _bmad-output/implementation-artifacts/evidence/story-8-2/acceptance-limits.json
source_spec: `spec-8-2-dependency-upgrade-wave.md`
severity: medium
reason: I3: this run executes on macOS Node24 only. Existing platform/reader acceptance from prior epics remains open; automated launcher/a11y checks do not certify those surfaces. Owners are the platform and accessibility acceptance maintainers.
status: open

### DW-128: The existing English-copy guard uses German token and character heuristics, not universal language identification.
origin: spec-deferred 27bb6d7bcaf4
location: scripts/check-hygiene.mjs:15
source_spec: `spec-8-3-quality-gate-scripts.md`
severity: medium
reason: Review I3: findViolations retains the pre-existing NFC/word/umlaut detector. Current static copy is checked with those rules; they do not classify every possible non-English string. An agreed acceptance corpus and language review are needed to extend the policy without treating names and domain terms as errors.
status: open

### DW-129: db tests import server use cases, so the db manifest declares a devDependency on server while the boundary gate exempts tests from layer direction.
origin: spec-deferred b439f63b5eb2
location: packages/db/package.json:24
source_spec: `spec-8-3-quality-gate-scripts.md`
severity: medium
reason: Review B4/E3: six db test files import @storymapper/server subpaths (pre-existing); declaring them makes db and server a workspace-level cycle that AD-1 layering does not allow for production code. Moving those integration tests to the server package would remove the coupling.
status: open

### DW-130: The repaired sync-service import cycle has no regression guard.
origin: spec-deferred 43476826d222
location: apps/server/src/services/sync-values.ts:1
source_spec: `spec-8-3-quality-gate-scripts.md`
severity: low
reason: Review V4: sync-values.ts breaks the work-item-sync/sync-merge/sync-conflict-resolution cycle, but check-boundaries has no cycle detection, so re-adding the import passes typecheck, tests and the gate. The spec reports cycle evidence separately and requests no acyclicity gate.
status: open

### DW-131: Hosted OS execution and platform quickstart acceptance remain unverified.
origin: spec-deferred 9432ab950ceb
location: .github/workflows/ci.yml:10
source_spec: `spec-8-4-continuous-integration-on-three-operating-systems.md`
reason: Workflow syntax and macOS arm64 local commands pass. No authorized remote PR run was created; actual Windows/macOS/Linux hosted provisioning, native SQLite and full shared gates require run URLs/results. Native Windows/Linux quickstart and browser/reader evidence remain separate prior prerequisites.
status: open

### DW-132: Repository merge-protection activation remains an operational prerequisite.
origin: spec-deferred 94afa93d269a
location: docs/RUNBOOK.md:211
source_spec: `spec-8-4-continuous-integration-on-three-operating-systems.md`
reason: The runbook documents exact required names and active ruleset/branch configuration. No repository settings were changed or certified. Authorized maintainer settings evidence and a failing or missing quality check preventing merge would settle enforcement.
status: open

### DW-133: Global `npm install --global corepack@0.35.0` over the runner's bundled Corepack is unproven on hosted Linux/macOS.
origin: spec-deferred 458ecf96e1e6
location: .github/workflows/ci.yml:33
source_spec: `spec-8-4-continuous-integration-on-three-operating-systems.md`
reason: Edge review asserts an EEXIST bin-link collision could fail every quality and audit job at setup. The bin link targets the same package directory and local installation succeeds, so the claim is not established; no hosted run exists to confirm either way. A hosted run's Provision Corepack step result would settle it.
status: open

### DW-134: Issue forms now use English section labels while .cursor/rules/card-authoring.mdc and docs/templates/*.md still prescribe German headings, splitting the ticket-template source of truth.
origin: spec-deferred 60fffc78d922
location: .cursor/rules/card-authoring.mdc:10
source_spec: `spec-8-5-license-and-community-files.md`
severity: medium
reason: card-authoring.mdc:10-12 names the German sections (Fähigkeit und Nutzen, Erfolgskriterien, Scope und Abgrenzung, Anmerkungen) and says it mirrors docs/templates; the rewritten forms use English labels and dropped some sections. The fix edits an agent-context rule file, so it is outside this story.
status: open

### DW-135: No check in corepack pnpm check or CI validates issue-form structure or the CONTRIBUTING.md command and CI-name claims; only the unwired Ruby story-evidence script does.
origin: spec-deferred 9b3d46038e44
location: scripts/check.mjs
source_spec: `spec-8-5-license-and-community-files.md`
severity: medium
reason: scripts/check.mjs and .github/workflows/ci.yml reference neither .github/ISSUE_TEMPLATE nor CONTRIBUTING.md. A later duplicated field id or renamed Quality job would pass every gate. Closing it adds a script test to the gate aggregate, which this story's intent excludes; candidate for Story 8.7/8.8.
status: open

### DW-136: Native Windows and Linux fresh-checkout quickstarts remain unverified.
origin: spec-deferred db57377511ec
location: README.md:Quickstart
source_spec: `spec-8-6-public-documentation-in-english.md`
severity: medium
reason: This host is native macOS. Docker daemon is unavailable and macOS PowerShell is not native Windows. Need actual fresh-checkout setup/start/health/browser/stop results on each missing OS; CI/source tests are insufficient.
status: open

### DW-137: Native macOS visible/rendered browser acceptance remains unverified.
origin: spec-deferred 403282d05423
location: evidence/story-8-6/native-browser.json
source_spec: `spec-8-6-public-documentation-in-english.md`
severity: medium
reason: Genuine OS opener and HTTP HTML/JS/CSS probes succeeded, but CUA reported cgWindowNotFound and no accessible application tab. Need a native visual browser observation; no screenshot/UI pass is claimed.
status: open

### DW-138: Review confirms full three-platform and native visible-browser acceptance is still outstanding.
origin: spec-deferred 992f982c24db
location: README.md:Quickstart and evidence/story-8-6/native-browser.json
source_spec: `spec-8-6-public-documentation-in-english.md`
severity: medium
reason: I3: macOS setup/start/health/assets/stop and opener dispatch passed; Windows/Linux execution and macOS rendered-window observation were unavailable. Obtain exact native results on each required surface. This review does not close the two previously recorded verification prerequisites.
status: open

### DW-139: No automated gate keeps README/RUNBOOK links, anchors and English text from regressing.
origin: spec-deferred b7c9ee7ba86f
location: scripts/check-hygiene.mjs:8
source_spec: `spec-8-6-public-documentation-in-english.md`
severity: medium
reason: Gap reviewer: check_links.py is a retained one-off; scripts/check-hygiene.mjs non-English scan excludes README.md and docs/. The story forbids gate changes, so adoption (Node test or check-hygiene extension) belongs to a later story.
status: open

### DW-140: .env.example sets PORT=4317, which disables automatic port selection when copied.
origin: spec-deferred 2a461fb75e59
location: .env.example:2
source_spec: `spec-8-6-public-documentation-in-english.md`
severity: low
reason: Pre-existing product configuration file, untouched by this story; RUNBOOK and README now document the caveat. Changing the example is a configuration change the intent excludes.
status: open

### DW-141: Validated asset dispositions need a concrete approval contract before future acceptance can be claimed.
origin: spec-deferred d7138336d868
location: scripts/check-publication-content.mjs:84
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
reason: The scanner deliberately regenerates unresolved findings and rejects manual verdict changes. No validated provenance input was supplied. Provide an actual approved asset record bound to its exact bytes and define the consuming workflow to determine whether a resolution path is required; no waiver or approval API was invented.
status: open

### DW-142: Actual asset/copied-material rights and binary privacy remain unreviewed publication prerequisites.
origin: spec-deferred 3262229b38cf
location: publication-audit.json
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
severity: medium
reason: Existing PNGs, nested JPEGs, copied skills and historical private content lack supplied substantive privacy/redistribution evidence. The exact-candidate gate must remain blocked until the maintainer supplies provenance/review or removes the actual material and rescans.
status: open

### DW-143: Live reader and native lifecycle integration have not been exercised.
origin: spec-deferred dcf75f6c1c76
location: GitHub reader skills and local hooks/plugin
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
reason: CLI argv parsing, synchronized copies and installed executable/argument identities pass. No lifecycle relay or live account action was executed, and no concrete failure was observed. Authorized disposable reader/lifecycle execution and native Windows evidence would settle a prospective integration defect.
status: open

### DW-144: The earlier fixed-port fixture observed one unexplained foreign request.
origin: spec-deferred 9103096c93bb
location: scripts/runtime-port.test.mjs:28
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
reason: Initial aggregate failed foreignRequests0 versus actual1. Isolated/observed diagnostics, an unchanged aggregate rerun and final post-review aggregate passed. No caller was reproduced and no assertion/scheduling/deadline was changed; a reproduced request with its source would settle the cause.
status: open

### DW-145: Native invalid-byte filename/ref integration remains unavailable.
origin: spec-deferred d9099d2179c7
location: scripts/check-publication.test.mjs
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
reason: Both narrowly scoped native fixture creations return EPERM even under reviewed local execution. Raw malformed-buffer and historical-tree tests pass. A filesystem capable of creating these native inputs is needed for the two integrations; no sandbox-only cause or Windows acceptance is inferred.
status: open

### DW-146: A real-candidate Node checker once aborted with native allocator corruption.
origin: spec-deferred 5deef4351c5c
location: scripts/check-publication.mjs; resume/native-runtime-observation.json
source_spec: `spec-8-7-audit-of-content-and-tooling.md`
reason: Initial independent check exited133 with empty tool output. A temporally aligned Node diagnostic reports native heap corruption in SyncProcessRunner frames. The unchanged fresh check matched the blocked report. No originating JavaScript or sandbox-only cause is established. The fresh final scan also exited133; its aligned diagnostic reports SIGTRAP and native free-block corruption with SyncProcessRunner frames. Selected evidence: resume/fresh-native-scan-observation.json and fresh-native-scan-diagnostic.json. No source repair was applied; originating runtime diagnosis remains required.
status: open

### DW-147: Actual hosted release automation and native acceptance remain unverified.
origin: spec-deferred 40c1824ffe6c
location: .github/workflows/release.yml; docs/RUNBOOK.md
source_spec: `spec-8-8-versioned-releases.md`
reason: Local fixture success and workflow syntax do not establish real GitHub execution. A separately authorized exact-tag run with all three quality job URLs, blocking audit output, authenticated raw/peeled tag checks, accepted exact publication evidence and confirmed release outcome would settle hosted behavior. No real tag, push or release was performed. Existing Windows/Linux quickstart, native browser/reader/clipboard, credential and interrupted-push prerequisites remain open.
status: open

- source_spec: `_bmad-output/implementation-artifacts/spec-agentic-story-mapper-branding.md`
  summary: Verify the Agentic Story Mapper brand and affected welcome/Agent setup text in a browser at desktop and narrow widths.
  evidence: CUA returned no in-app browser and an empty browser inventory on 2026-11-08; build, typecheck and focused UI tests passed, but actual wrapping/overflow cannot be established from these checks.
