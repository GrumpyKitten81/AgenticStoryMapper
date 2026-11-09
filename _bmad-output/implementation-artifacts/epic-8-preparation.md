---
epic: 8
status: ready
date: 2026-10-19
version: 2
---

# Epic 8 Preparation: Ready for the public

Reproducing statement: Prepare all nine Epic 8 stories for BMAD Loop implementation against current source and tests. Apply the maintainer's private MIT publication decision, omission of name checks, permission for private-detail placeholders, removal of employer references, and standard BMAD Loop story finalization for dependency upgrades. Preparation does not start development or publication.

## Goal

Deliver a release migration baseline, upgraded dependencies, enforceable local checks, three-platform continuous integration (CI), English community and operating documentation, a resolved publication audit, tagged-release automation and a reproducible contributor workflow.

Inspected source initially at `b2f2e967cc45a0c948ad3c2bb7378efb35eaf3e3` with the Epic 7 remediation present in the working tree. An external commit recorded that remediation during preparation; the implementation baseline is now `443ae09d6cc622954191149d9d7415709e3c4f3e` (2026-10-19). No commit was created by this preparation. Code-review-graph tools were unavailable; implementation and test inspection supplied the code map. Sprint rows identify story keys only and are not acceptance evidence.

## Story sequence

| Order | Story and detail plan | Depends on | Deliverable |
| --- | --- | --- | --- |
| 1 | [8.1 Migration](story-plan-8-1-baseline-migration-and-upgrade-path.md) | Delivered Epics 1–7 | Sole journaled SQL migration path and protected upgrades |
| 2 | [8.2 Dependencies](story-plan-8-2-dependency-upgrade-wave.md) | 8.1 | Audited upgrades with verified intermediate steps and one story commit |
| 3 | [8.3 Gates](story-plan-8-3-quality-gate-scripts.md) | 8.1, 8.2 | One deterministic local quality command |
| 4 | [8.4 CI](story-plan-8-4-continuous-integration-on-three-operating-systems.md) | 8.3 | Node 24 checks on Windows, macOS and Linux |
| 5 | [8.5 Community](story-plan-8-5-license-and-community-files.md) | 8.3 | MIT/community files and generic English templates |
| 6 | [8.6 Documentation](story-plan-8-6-public-documentation-in-english.md) | 8.1, 8.4, 8.5 | Accurate English quickstart and runbook |
| 7 | [8.7 Audit](story-plan-8-7-audit-of-content-and-tooling.md) | 8.5, 8.6 | Current-tree cleanup and full-history findings |
| 8 | [8.8 Releases](story-plan-8-8-versioned-releases.md) | 8.1–8.7 | Shared application version and gated tag workflow |
| 9 | [8.9 Reference](story-plan-8-9-agentic-coding-reference-material.md) | 8.3–8.8 | Verified contributor walkthrough |

Use numerical order. Recheck the final candidate after 8.9 because its documentation and dry-run evidence are created after the initial 8.7 audit. Dependency arrows describe implementation contracts, not permission to mark earlier stories complete.

## Current-code alignment

| Area | Observed baseline | Consequence |
| --- | --- | --- |
| Migration | `connection.ts` runs inline DDL and `ensureColumn`; no migrations directory or Drizzle config. | Replace bootstrap, not merely add a migration beside it. Capture Epic 7 canonical refs, remote plans/executions and operation schema 11. |
| Restore/archive | `databaseSchemaVersion` hashes DDL; restore filenames recognize only `dev-sha256-*`; archive service rejects any other schema before staging. | Upgrade identification, listing, candidate validation, recovery markers and archive admission together. |
| JSON | Plan states and source-plan baselines already have schema siblings; many other JSON columns do not. | Inventory every persisted JSON field; extend parsers and writers, preserving existing independent operation versions. |
| Dependencies | Lockfile has Drizzle ORM 0.38.4/Kit 0.30.6, Vitest 2.1.9, Vite 6.4.3 plus transitive Vite 5.4.21, Tiptap 2.27.2. Zod 4 and split MCP 2 packages already exist. | Historical advisory counts are not current evidence. Re-audit; do not repeat completed Zod/MCP migrations. |
| Gates | `check-hygiene`, `check-capabilities`, `verify.mjs`, classification and DB import/file-size tests exist. | Extend and compose existing checks. Coverage, workspace/layer/feature checks, complete size and license gates are missing. |
| CI/community | Issue templates and agent files exist; workflow directory and root community files are absent. | Generalize existing templates; add only missing surfaces. |
| Documentation | README/runbook are German and contain stale credential, archive and MCP claims. | Rewrite from actual launcher and provider behavior, not literal translation. |
| Versions | Health and archive already read root metadata; MCP HTTP server still advertises literal `0.1.0`. | Consolidate one server-side version reader and test compiled paths. |

## Shared design decisions

### Maintainer decisions accepted on 2026-10-19

1. Publication is private and independent of the employer; retain MIT and Agentic Story Mapper. Do not require employer permission or perform GitHub/npm/trademark name checks. This is the maintainer's scope decision, not a legal certification by an Agent.
2. Remove every employer-specific reference, including the company identifier named in this conversation, from the current tracked repository. Include code, environment examples, tool defaults, skills in both copies, templates, documentation, planning files and publishable evidence. Do not preserve such content by encoding it or hiding it behind an ignore rule. Historical occurrences enter the history-disposition gate below.
3. Private details may use clearly labeled placeholders until the maintainer supplies them. Use `[COPYRIGHT_HOLDER]`, `[PRIVATE_SECURITY_CONTACT]` and `[CONDUCT_CONTACT]`; never invent identity, contact addresses or a working reporting channel. Story 8.5 may deliver these placeholders under this explicit exception. Publication remains held while required license/reporting details are unresolved.
4. Story 8.2 follows standard BMAD Loop finalization: upgrade one major at a time with tests green before the next, then one reviewed story commit. The maintainer explicitly withdrew the per-upgrade commit requirement on 2026-10-19; no separate execution/adoption lane or orchestrator customization is needed. This preparation creates no commits.

### Migration and data boundaries

1. Follow AD-9: an empty database is created from generated baseline SQL; a nonempty database without the release journal is a refused prototype, even when its DDL happens to match. Never stamp an existing prototype as migrated. Older supported release journals migrate forward; newer, unknown, malformed or divergent journals fail with specific manual recovery instructions before DDL or business writes.
2. Keep one DB-owned migration boundary consuming Drizzle-generated SQL and journal metadata. Upgrade Drizzle first in 8.1 to the required non-vulnerable line (at least the story's 0.45.2 minimum) and compatible Kit; resolve exact versions/audit at implementation time. No package install, lockfile update or live audit is part of this preparation.
3. Inspect journal state before initialization. For each pending migration on an existing file-backed database, publish a durable `pre-migration` restore point before mutation; failure, including retention failure, stops migration. Fresh empty and `:memory:` databases have no prior user state to snapshot; they still run the same baseline SQL. Migration opens run under owned single-writer admission before serving requests, not through an HTTP/MCP migration operation.
4. Set and verify `foreign_keys=OFF` outside the migration transaction; apply SQL and journal advancement atomically, check foreign keys before accepting that migration, and restore `foreign_keys=ON` before normal use. A violation must leave no accepted invalid database or falsely advanced journal. Stock Drizzle's synchronous dialect issues its own BEGIN/COMMIT: do not wrap it blindly in the existing `runProtectedMigration` transaction or assume a later check can roll it back. Step 02 must select the minimal DB adapter execution boundary that proves per-migration rollback/check ordering; do not copy a second bootstrap or depend on private ORM internals.
5. Database release schema identity, archive `formatVersion`, application SemVer, JSON payload versions and `operationsSchemaVersion` are separate concerns. Define the release schema identity once from the committed migration chain; preserve it consistently in snapshots, manifests, health and recovery markers. Unknown journal/hash combinations are refused, not interpreted by timestamp alone. The migration journal is explicitly infrastructure: classification checks must distinguish it from domain aggregate tables without exempting arbitrary new tables. Never redact it from portable databases.
6. Supported old Restore/archive inputs are migrated as prepared copies before current-schema/domain validation and publication. Validate original archive checksum, format, source schema, counts and redaction against the source version first; do not compare old input with current-only schemas or silently scrub unsafe archives. Original archives/snapshots remain unchanged. Preserve the active database on any failed candidate; retain existing ownership, drain, recovery, epoch reset and truthful retained-file-effect behavior. Recovery markers describe the prepared target schema, not the old source schema. Prototype snapshots/archives remain refused.
7. Every persisted JSON column gets an explicit sibling version and a matching versioned reader/writer. Reuse `schema_version`/`operations_schema_version` where they already identify the corresponding payload; distinguish other independently versioned payloads when necessary. Null stays null; malformed or future live payloads fail visibly. Applied/undone historical ChangeSet bytes and their historical versions stay intact and non-executable. No compatibility parser for pre-release databases. Do not reinterpret a stored confirmed remote plan into new consent; schema changes invalidate executable plans when necessary while preserving outcome/reconciliation evidence.

### Checks, CI and publication boundaries

1. Story 8.3 supplies `corepack pnpm check` as the local blocking aggregate. It composes typecheck, meaningful tests with per-package line coverage of at least 60%, build, boundaries, size, classification, hygiene, capability parity and license checks. Do not claim coverage from `--passWithNoTests`; explicitly classify only packages with no executable logic. Include server/web and actual logic packages, all intended source in denominators, and separately run existing serial audit-performance/a11y gates. Preserve existing diagnostic-only timing policies.
2. The blocking aggregate excludes online vulnerability audit so 8.4 can run `corepack pnpm audit --audit-level high` as a separate nonblocking PR report. Story 8.8 makes that audit blocking for releases, including failed/unavailable registry responses. Unknown scanner results are failures, not a clean report. The content publication gate is also blocking for releases; it is distinct from dependency advisories.
3. Extend `check-hygiene` with safe tracked-file inspection and location/category diagnostics, never secret values. Full-history scanning belongs to 8.7 and final publication; it cannot be replaced by today's filename check for `.env`. Restrict scans to tracked/publication inputs and Git objects, not ignored user Projects, credential files, caches or machine homes.
4. Enforce architecture AD-1 and feature public entrypoints, 750-line/100,000-byte files and 50-line functions without baselining violations away. Fix only violations exposed by these required gates. Epic 7 A6 feature-boundary debt is within 8.3; A5 composer tests, DW-119 and unrelated domain work are not silently absorbed. Classify the sync runtime cycle accurately; layer compliance alone does not certify absence of cycles.
5. MIT is already selected, so 8.3 can define its dependency-license allowlist before 8.5 writes the root license. Check resolved dependency license expressions, dual licenses and unknown/unlicensed entries explicitly; record package, version and rule. Avoid a SaaS scanner or invented license metadata.
6. CI uses the installed Node 24 and Corepack's root-pinned pnpm, frozen lockfile and native SQLite built on each OS. No repo-local Node, copied cross-OS native modules, provider credentials or login flows. PR jobs are read-only; only the release-publishing job gets required write permission. Pin third-party Actions to verified full commit SHAs. Required branch/ruleset checks need maintainer configuration, not merely YAML.
7. 8.7 resolves current-tree findings and records historical findings without printing secret/user content. Unknown provenance of the existing PDF requires evidence or removal, never assumed redistribution permission. Generalize or remove employer-specific tooling; keep the surviving GitHub skills' two copies synchronized. Audit reports/evidence and instruction files are part of the publication surface too.
8. Existing history disposition remains a final maintainer choice: rewrite history or publish from a clean repository, then repeat the full audit on that exact result. No history rewrite, remote deletion, push, tag, public release, account settings or unsolicited messages during preparation. New release automation must fail closed on unresolved publication findings or required private-detail placeholders in the actual license/reporting declarations; instructional references to marker names are not missing declarations. A deliberate maintainer tag after all prerequisites triggers release; implementation tests use local fixtures/stubs.
9. Epic 6 native accessibility prerequisites and Epic 7 remaining platform/reader/credential/interrupted-push acceptance stay visible in the release checklist. Passing new CI is not evidence these ran. 8.9's resulting contributor material must be included in a final 8.7-style audit before the first public push.

## Interfaces between stories

| Producer | Consumer | Contract |
| --- | --- | --- |
| 8.1 | 8.3, 8.4, 8.6, 8.8 | Journaled schema identity, migration runner/assets, candidate upgrades, populated migration tests and recovery instructions |
| 8.2 | 8.3–8.9 | Current lockfile, per-upgrade verification evidence, installed-version architecture table |
| 8.3 | 8.4, 8.5, 8.8, 8.9 | `pnpm check`, stable diagnostic/exit contracts, coverage and MIT-compatible license rules |
| 8.4 | 8.6, 8.8 | Three-platform job names, artifacts and documented required-check settings |
| 8.5 | 8.6–8.9 | Community files, generic templates and explicit unresolved private-detail markers |
| 8.7 | 8.8, final candidate | Sanitized findings with resolutions, revision/scan scope, and blocking publication result |
| 8.8 | 8.9 | Root application version reader, SemVer tag validation and release gate invocation |

Concrete new helper filenames in the plans are proposed code-map targets, not existing APIs. Step 02 verifies and refines them. Contracts remain in `packages/contracts`; SQL and database access remain in `packages/db`; core stays pure.

## Loop dispatch contract

All nine stories, including 8.2, use standard sequential BMAD Loop execution and one reviewed delivery commit per story. Intermediate upgrade commits are not required; each major upgrade must still pass its checks before the next begins, with results recorded in the story evidence.

1. Commit preparation artifacts only on an explicit commit request. Before any later run/resume execute `node scripts/bmad-loop-preflight.mjs` under Node 24; then validate the loop and inspect its dry-run plan. No login is started automatically.
2. After implementation/loop dispatch is explicitly requested, use the ordinary `bmad-loop run --epic 8` workflow in numerical story order. A bounded first wave remains optional, not an 8.2 requirement.
3. Keep normal dev → verify → independent review → fix/verify → story-commit finalization. The orchestrator owns sprint updates; no separate 8.2 adoption or installed-tool modification is needed.

All plans are ready for dev step 02. Preparation does not itself authorize or start loop execution.

## Non-goals (epic)

No second provider or publish backend, new cloud/SaaS dependency, telemetry, background update check, old-prototype adoption, unrelated domain refactor, name search, live-account test, history rewrite, first public push or new native acceptance claim. Preparing plans does not execute the nine stories, modify sprint/deferred ledgers, grant future broad Git permissions or certify license ownership.

## Verification strategy

1. Migration: fresh/reopen/current no-op; populated supported previous journals; every-table row counts plus key JSON/history/identity readback; newer/no-journal/hash divergence refusal; snapshot/retention/DDL/FK failure; foreign-key mode restored; process interruption and reopen. Exercise baseline SQL plus a test-only generated next migration rather than a fabricated shipped schema feature. Fixtures are disposable, never local user data.
2. Lifecycle: old supported restore and archive forward migration; unchanged original inputs; invalid JSON and archive redaction refusal; candidate failure leaves active state untouched; recovery-marker interruption; mounted dirty/pending edits across epoch resets and lower restored root versions.
3. Upgrades: unit/transport/provider contracts, actual Markdown edit-save-reload, drag/keyboard/zoom/focus, Query/Router patch behavior, exported build paths and SQLite ABI. Keep the existing serial audit tests and full release verification.
4. Gates: deliberate failing fixtures for every rule, missing/empty coverage, scanner/license failure and subprocess exit propagation. No secret-bearing diagnostics or broad ignores. Confirm a passing aggregate on the actual tree.
5. CI/release: execute on all three OSes, record job URLs/revisions when available, prove PR advisory failure is informational and the same release failure is blocking. Exercise release conditions with fixtures before any real tag; never claim remote execution from YAML parsing.
6. Publication: scan current tracked tree and reachable history, prove provenance/removal, resolve each finding, fill required private details and audit the exact final history after the maintainer's disposition. Include 8.9 additions and retain named native prerequisites.

Preparation validation: existing hygiene scan passes under Node 24.17.0; all four `scripts/check-hygiene.test.mjs` tests pass. All ten preparation artifacts pass exact loader-key, unique-match, frontmatter, required-section and local-link checks. Epic 1–7 bodies are byte-identical to the committed baseline; existing product source, sprint-status and deferred-work files retain their baseline hashes. No runnable Epic 8 spec was created. `git diff --check` passes. No dependency audit or product acceptance suite is claimed by these preparation-only checks.

## Open questions

None for implementation design. Maintainer-supplied private details, final history disposition, platform acceptance remain explicit operational/publication prerequisites; they are not fabricated as completed evidence.

## References

- [Epics](../planning-artifacts/epics.md), [PRD](../planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md), [Architecture](../planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md).
- [Consumption](../../docs/bmad-epic-preparation.md), [Loop](../../docs/bmad-loop.md), [Epic7](epic-7-retro-2026-10-19.md).
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations), [Custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations), [Synchronous dialect source](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/sqlite-core/dialect.ts): checked 2026-10-19; transaction behavior must be verified again for the selected installed version.
- [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use): checked 2026-10-19 for immutable action pins and least-privilege workflow permissions.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 2 | 2026-10-19 | Apply the maintainer correction: standard one-commit-per-story loop execution for 8.2; retain per-upgrade verification |
| 1 | 2026-10-19 | Initial nine-story preparation; the original separate upgrade-commit routing is superseded by version 2 |
