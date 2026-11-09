---
epic: 8
story: 8
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.8: Versioned releases

Reproducing statement: Plan one root application version source, SemVer-tag release automation with blocking quality/advisory/content gates, and the documented release Project upgrade policy without creating a tag or public release.

## Intent

Deliberately tagged, fully checked candidates produce truthful release notes and consistent application versions; unsafe or unaudited candidates do not publish.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); reuse 8.1 migrations, 8.3 checks, 8.4 platform jobs, 8.7 publication verdict and 8.5 placeholder markers.
- First public push/history disposition remains the maintainer's final action. Creating automation does not authorize this implementation to tag, push or publish.
- 8.9 additions must be rescanned before publication. Native Epic 6/7 prerequisites remain explicit.

## Design decisions (this story)

Health and archive already read root `package.json`; consolidate their duplicate readers and replace the MCP HTTP literal version. Use one server-side metadata module whose package path works in source and compiled execution, failing clearly for missing/invalid metadata. Do not push filesystem reads into pure core or conflate app SemVer with DB/payload/operation schema versions.

Use the same application version in server/protocol metadata, health and archive manifests. Root remains authoritative; workspace package versions are not independently advertised as app versions. Tests may supply fixture versions but no production hardcoded release version remains.

Create a deliberate `v<SemVer>` tag workflow validating exact tag/root-version agreement and building the checked-out immutable revision. Require three-platform checks, the high-severity dependency audit, content/publication gate and current candidate evidence before any release write. Registry/scanner failure or unresolved private-detail markers block release. Reuse CI contracts without a privileged bypass or token in PR jobs; only publishing has required write permission. No npm publishing, updater, binaries/installer system or background network behavior is implied by release notes.

Generate reviewable notes from the selected release range without reproducing private history content. Retain migration/upgrade instructions, prototype refusal and known acceptance limits. Test workflow decisions through local fixtures/stubs; a real GitHub release is separately authorized only after the maintainer's public-history decision and completed gates.

## Task sequence

1. Proposed `apps/server/src/app-version.ts`: provide validated root metadata once; integrate `http/routes/infrastructure-routes.ts`, `services/project-archive.ts`, `mcp/http.ts` and any other actual application version consumers found in step 02.
2. Version contract tests: mutate a disposable fixture root version and verify HTTP operational health, archive manifest and actual MCP initialization agree in source and compiled startup, with actionable invalid/missing metadata failures.
3. `.github/workflows/release.yml` plus only required small helpers: validate SemVer/tag equality, full three-platform quality results, advisory success and fresh publication result before release-note publication. Pin actions and minimize permissions.
4. Safe release-condition fixtures: prove high advisory, audit transport failure, unresolved/stale content findings, private markers, version mismatch and failed platform checks prevent the publishing step.
5. `docs/RUNBOOK.md` and contribution guidance: document maintainer-controlled tagging, notes, supported forward migrations, backup/manual recovery, no-journal prototype refusal and final-publication prerequisites.
6. Execute version/migration/quality regressions and workflow validation; retain exact local evidence and explicitly name remote/tag paths that were not executed. Do not create or push tags.

## Preliminary code map

- Root `package.json`; `apps/server/src/http/routes/infrastructure-routes.ts` existing APP_VERSION/health.
- `apps/server/src/services/project-archive.ts` existing APP_VERSION/manifest; `apps/server/src/mcp/http.ts` literal `0.1.0`.
- `packages/mcp/src/transports/server.ts` accepts supplied version; shared `packages/contracts/src/schemas/health.ts`.
- 8.1 migration runner/assets; 8.3 quality command; 8.4 CI workflow; 8.7 publication helper/report.
- New `.github/workflows/release.yml`, `docs/RUNBOOK.md` and actual transport/archive tests.

## Acceptance outline

- **Given** root app version **When** server/health/MCP/archive metadata is read **Then** all agree with it in source and compiled runs.
- **Given** a valid matching SemVer tag **When** authorized release automation runs **Then** it builds that exact revision, requires all quality/audit/publication checks and publishes notes only on success.
- **Given** any invalid version, high advisory, scanner failure, unresolved publication finding or required private marker **When** release conditions evaluate **Then** no publishing step is admitted.
- **Given** a supported older release Project **When** opened **Then** 8.1 migrates it safely or refuses with the documented instructions; no-journal prototype Projects remain refused.

## Out of scope

Real tag/push/release during implementation, npm publishing, installers, updater, history rewrite, prototype conversion, new migration engine or claiming unexecuted hosted release evidence.

## Risks and mitigations

- Root-relative paths differ after compilation: execute compiled metadata tests, not only source aliases.
- A green CI result from a different revision is insufficient: bind release checks/audit to the tagged candidate and fail on stale evidence.
- Public notes can quote unsafe commit text: generate only from audited history and retain the final content gate before publication.

## Open questions

None. Final tag/publication authorization and outstanding acceptance are operational prerequisites.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Shared version, blocking release checks and explicit maintainer publication boundary |
