---
epic: 8
story: 2
status: ready
date: 2026-10-19
version: 2
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.2: Dependency upgrade wave

Reproducing statement: Plan audited dependency upgrades one major at a time with tests green before the next, using standard BMAD Loop finalization as one reviewed story commit.

## Intent

Remove current critical/high dependency advisories while preserving editing, persistence, provider and test behavior, with recorded verification for each upgrade step.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); consume the completed 8.1 Drizzle baseline without regenerating historical SQL during unrelated upgrades.
- Use standard BMAD Loop execution and its single reviewed story commit. The maintainer withdrew per-upgrade commits; no separate execution/adoption lane or loop customization is required.
- Zod 4 and split MCP 2 packages are already present. Upgrade them only for an actual present advisory/compatibility need, not an obsolete baseline claim.

## Design decisions (this story)

Start from the actual frozen lockfile and fresh audit, distinguishing package/version, dependency path, severity, fix range and production/dev use. The old count of 63 advisories is historical only. Upgrade Vitest, Vite and Tiptap one major at a time, keeping their required peer/plugin/coverage/Markdown-adapter changes together as one coherent step. Exact versions are selected from current primary release/migration documentation and registry evidence during implementation.

Retain the root pnpm pin and Node 24 unless a necessary documented compatibility conflict is escalated. Keep native SQLite installed/executed under that same Node. Reassess the TanStack history patch against upgraded source; do not drop it just because install succeeds. Use no blanket audit ignore, unreviewed forced resolution, unused dependency or new LLM SDK.

Run meaningful checks after each major and before moving to the next. Record the package versions, checks and results for each step in story evidence; do not require or create a dedicated commit after each upgrade. The normal loop verifies/reviews the complete story and finalizes one story commit. This plan is no present Git action. Report unfixed advisories with package/version/path, reason and role owner; unresolved critical/high still prevents the release gate from passing.

## Task sequence

1. Root/workspace manifests and `pnpm-lock.yaml`: record actual installed/resolved versions and current full-tree audit; redact sensitive output and retain machine-readable advisory identities.
2. Vitest manifests/configs across workspaces: upgrade one major at a time with matching coverage tooling; preserve explicit serial audit-performance runs, diagnostic exclusions and failure propagation. Verify full relevant tests/typechecks/build before beginning the next major.
3. `apps/web/package.json`, `vite.config.ts`, React plugin and any required test-tool peers: upgrade Vite one major at a time; verify dev proxy/loopback behavior, production static assets/deep routes and server tests that build web. Record successful checks before beginning the next major.
4. Tiptap/Markdown dependencies and the actual shared Markdown editor: move compatible packages together per major; verify Markdown serialization, paste/content editing, save batching, unchanged descriptions and mounted dirty/Restore behavior. Record successful checks before beginning the next major.
5. Remaining advisory paths: apply minimal real fixes and remove unused dependencies only when established by usage. Preserve workspace boundaries and any reviewed runtime patch; do not restart completed schema/API migrations.
6. Architecture spine Stack table: record installed versions from the final lockfile/manifests and describe only current packages. Add a compact Stack table if none exists, rather than editing unrelated design decisions.
7. Run `corepack pnpm audit --audit-level high`, full tests/typecheck/build and `node scripts/verify.mjs`; record each major's versions/checks/results and remaining advisory owners. Complete normal independent review and story finalization before dispatching 8.3.

## Preliminary code map

- Root `package.json`, `pnpm-lock.yaml`, `patches/@tanstack__history@1.162.0.patch`.
- `apps/{web,server}/package.json`, `packages/*/package.json`, workspace `vitest.config.ts` files, `apps/web/vite.config.ts`.
- `apps/web/src/components`: locate the actual Tiptap Markdown editor and its connected Card-detail tests before changing it.
- Existing web live/Restore/navigation tests; server transport, archive and static-web suites; `scripts/commands.test.mjs` setup/frozen-install fixtures.
- `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md`.

## Acceptance outline

- **Given** the actual dependency graph **When** the final high-severity audit runs **Then** zero critical/high advisories remain, and a scanner failure is reported as failure.
- **Given** consecutive major upgrades **When** examining verification evidence **Then** each major passes its checks before the next begins, and standard loop finalization produces one reviewed story commit without per-upgrade commits.
- **Given** existing Markdown/board/transport behavior **When** upgraded packages run **Then** editing/save/reload, tests and production build preserve the established contracts.
- **Given** any unresolved advisory **When** delivery notes are read **Then** affected package/path, reason and owner are explicit, with no false clean-release claim.
- **Given** the final installed versions **When** reading the architecture Stack table **Then** it matches the lockfile and no removed package is presented as current.

## Out of scope

Changing Node/pnpm policy without a proven requirement, new app features, broad refactoring, audit suppression, history rewrite, installed-loop patches or public release.

## Risks and mitigations

- Vitest carries a separate Vite dependency: audit all paths, not only direct web dependencies.
- Tiptap Markdown peers may lag: verify primary compatibility information and real round-trip content, never silently switch document representation.
- A single final commit must not hide unverified intermediate upgrades: retain per-major version/check results in the story evidence and stop on failures before continuing.

## Open questions

None. The maintainer corrected the decision on 2026-10-19: standard loop execution and one story commit, with per-upgrade checks retained.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 2 | 2026-10-19 | Remove per-upgrade commits and separate execution; use standard loop story finalization with intermediate checks |
| 1 | 2026-10-19 | Initial upgrade plan; its per-upgrade commit requirement is superseded by version 2 |
