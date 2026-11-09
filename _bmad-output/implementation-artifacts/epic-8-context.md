# Epic 8 Context: Ready for the public

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

Date: 2026-10-20. Version: 3.

Reproducing statement: Compile concise Epic 8 developer context from the epics, PRD, architecture and UX; preserve accepted publication decisions without copying private material or claiming acceptance.

## Goal

Prepare Agentic Story Mapper for public distribution with safe Project upgrades, current dependencies, enforceable checks, three-platform continuous integration, English documentation, MIT community files, audited content and versioned releases. Keep implementation completion distinct from the remaining maintainer publication actions.

## Stories

- Story 8.1: Baseline migration and upgrade path
- Story 8.2: Dependency upgrade wave
- Story 8.3: Quality gate scripts
- Story 8.4: Continuous integration on three operating systems
- Story 8.5: License and community files
- Story 8.6: Public documentation in English
- Story 8.7: Audit of content and tooling
- Story 8.8: Versioned releases
- Story 8.9: Agentic-coding reference material

## Requirements & Constraints

- Support Windows, macOS and Linux using installed Node 24, Corepack and pinned pnpm; no repository-local runtime. Pull requests run typecheck, tests, build and quality gates on every platform. Document required merge protection and record fresh-clone quickstart results per platform.
- One local command fails on any quality-gate failure: dependency/layer boundaries, source size, table classification, hygiene, capability parity and MIT-compatible dependency licenses. Every logic package needs meaningful tests and at least 60 percent line coverage. Limits are 750 lines and 100 KB per source file and 50 lines per function, with actionable diagnostics.
- Hygiene rejects tracked secrets, SQLite files, Project/user data and non-English strings in UI strings, seeds and templates. Findings and evidence must never expose credentials or private content.
- Online vulnerability audit is a separate informational pull-request report. Release publication fails on critical/high advisories or unavailable results, alongside quality and content-publication failures. Residual advisories retain package, reason and owner.
- Accepted publication is private and independent under MIT as Agentic Story Mapper; employer permission and name checks are waived. Explicit `[COPYRIGHT_HOLDER]`, `[PRIVATE_SECURITY_CONTACT]` and `[CONDUCT_CONTACT]` markers are permitted during implementation. Missing reporting channels remain visibly inactive; required private declarations must be completed before publication, never invented.
- Audit tracked content and history for secrets, personal/customer/employer material and redistribution rights. Generalize, translate or remove team-specific tooling and examples; remove all employer references from current tracked publication inputs and obsolete provider identifiers outside history. Prove the playbook PDF redistributable or remove it. Encoded or ignored copies cannot evade cleanup; paired GitHub skills remain synchronized.
- Unresolved findings, required declarations and incomplete/stale audits block publication. After contributor material is complete, the maintainer chooses history rewriting versus a fresh repository and audits that exact final candidate. The first public push belongs to the maintainer.

## Technical Decisions

- Enforce the architecture's dependency direction: contracts own shared schemas; core stays pure; db owns SQL; HTTP and MCP share application use cases. Workspace imports use declared package entries, and cross-feature web imports use public indexes. Only db imports SQLite/Drizzle runtime libraries. Inject time and identifiers into core; no Node imports or ambient randomness.
- After the release baseline, generated Drizzle SQL is the sole schema path. A successful pre-migration snapshot precedes mutation. Disable foreign keys outside migration transactions, check them afterward and abort on violations. Refuse newer schemas, populated unjournaled databases and prototype databases with recovery instructions. Verify supported migrations using populated previous-schema fixtures and per-table row counts.
- Restore and archive import migrate supported older databases forward without mutating original inputs or accepting a failed candidate. Version JSON payloads explicitly. Keep schema identity, archive format and application version distinct; preserve journal/redaction rules and refuse unsupported formats. SQLite transactions do not imply rollback of filesystem or remote effects.
- Upgrade dependency majors sequentially with passing checks recorded before each next step; update the architecture stack to installed versions. Standard finalization produces one reviewed story commit, without per-upgrade commits or a separate execution lane. Drizzle must meet the security-fixed minimum with compatible tooling; contracts migrate once for the required SDK/schema upgrades.
- CI uses frozen installation and native SQLite on each OS, read-only pull-request jobs and verified immutable Action pins. Required hosted protection needs actual maintainer configuration; YAML alone proves neither enforcement nor platform acceptance.
- Read application version from root `package.json`, including health and archive manifests. Semantic-version tags drive release builds and notes. Release gates require current publication evidence; tests use local fixtures rather than initiating a public release.

## UX & Interaction Patterns

Errors name the cause and next action; upgrade/refusal and Restore flows explain recovery and consequences. Public documentation follows actual platform commands and explains that Agent protection guards cooperative tool use. Preserve English microcopy, keyboard paths and accessible names through upgrades. The accessibility scope is WCAG 2.1 AA at desktop widths of at least 768 px, excluding Reflow; native rendering and screen-reader checks remain separate acceptance evidence.

## Cross-Story Dependencies

Use numerical story order. Migration and dependency upgrades underpin quality checks; those checks feed CI, license validation and releases. Community files and actual launcher/migration behavior underpin English documentation. The audit consumes that material, release automation consumes its blocking result, and the contributor walkthrough follows the delivered workflow. Audit again after Story 8.9 and final history disposition. Earlier native accessibility, credential and interrupted-push prerequisites remain visible; new automated checks do not establish that they ran.

## Changelog

- 2026-10-20 v3: Distilled current planning and accepted preparation decisions; retained private-declaration, audit and maintainer publication boundaries.
