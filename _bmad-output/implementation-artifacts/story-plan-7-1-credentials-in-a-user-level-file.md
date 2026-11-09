---
epic: 7
story: 1
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.1: Credentials in a user-level file

Reproducing statement: Reconcile Story 7.1 with actual environment-first credential code and specify one resolver, safe user-level storage and secret-free outputs for Epic 7. Version: 1. Date: 2026-10-18.

## Intent

Resolve GitHub access outside Project data and prepare a human-only token writer for the guided connection story. Source priority and failure behavior must be observable without revealing credentials.

## Cross-story constraints

- Follow [Epic 7 preparation](epic-7-preparation.md), engineering constraints 1–2 and D1/D4 for later onboarding; no login process or flag change in this story.
- 7.2 consumes the file writer and sanitized source statuses. Every later provider path consumes the same resolver.
- AD-14 explicitly permits the user's credential file. This does not authorize the implementation agent to read or persist real credentials during development/testing.

## Design decisions (this story)

- Existing `resolveGitHubAuth`/`resolveProviderAuth` are the application seam; replace environment-first selection rather than adding another resolver in routes/providers.
- Resolve CLI → user file → environment. File is `credentials.json` beneath the AD-14 directory. Represent only GitHub's required token value; no account manager, per-Project token, encryption service or configurable directory.
- Missing source is distinct from malformed/unreadable source. Continue after absent CLI/file; fail visibly on an unusable selected source. Authentication/network failure never selects a different account silently. If every source is absent, name the file and CLI/environment alternatives.
- CLI subprocesses must use the intended CLI credentials, rather than accidentally inheriting a higher-priority GitHub environment token. Inspect `gh` invocation boundaries, not only the status helper. The public status/source and actual provider identity must agree.
- Writer takes a human-only candidate from 7.2, uses atomic replace and 0600 on POSIX, and returns no token. Safe parent/file handling refuses unsafe locations instead of following a Project-local symlink. Sanitized errors identify location/cause without echoing contents.
- Credential-status reads use local configured-source probes; they do not run a network-backed `gh auth status` on mount while GitHub is off. Explicit provider verification is separate and returns verified status.
- Status adds `user-file` to the contracts enum and reports configured/unavailable/actionable cause without raw process output or file contents. Existing public `authMode` is not a second independent source selector.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, `api/http.ts`: define sanitized file-source status and credential-action input/output at the single schema source. Secret-write input must never appear on MCP or generic ChangeSet surfaces.
2. `apps/server/src/services/credentials.ts`: implement source resolution, path selection, restricted file writer and focused filesystem/process error handling. Split a small dedicated file only if needed for the existing size boundaries.
3. `packages/github/src/providers/github-provider.ts` and application connector/sync callers: consume only resolved auth; ensure CLI subprocess environment honors the selected source and remove `.env`-editing instructions from the product path.
4. `apps/server/src/http/routes/infrastructure-routes.ts` and existing application/manifest classifications: expose sanitized status; keep file writing behind the human-only application boundary supplied to 7.2, never a token-returning read endpoint.
5. Add focused resolver/filesystem and actual output-boundary tests using a generated canary in isolated home/AppData fixtures. Assert no credential call occurs on a disabled provider action and no real home or environment is altered.

## Preliminary code map

- `apps/server/src/services/credentials.ts`: `githubCredentialStatuses`, `resolveGitHubAuth`, `resolveProviderAuth`.
- `apps/server/src/application/connector/connector.use-cases.ts`: current validation consumes status then resolves auth.
- `apps/server/src/application/sync/github-import-command.ts`, `github-pull-command.ts`, `sync-conflict.use-cases.ts`: alternate resolver consumers.
- `packages/github/src/providers/github-provider.ts`: CLI and Octokit invocation seams.
- `packages/contracts/src/schemas/domain.ts`: `credentialSourceSchema`, `credentialStatusSchema`.
- `packages/db/src/snapshot.ts`, `schema/classification.ts`; `apps/server/src/services/project-archive.test.ts`: actual export boundaries. User credentials must never enter SQLite in the first place.
- `tools/github_api/env.py` and standalone Python reader CLIs remain independent tooling. Do not rewrite their authentication semantics or both skill copies unless a concrete app-owned bypass is identified; document this scope rather than claiming all machine tools share the TypeScript function.

## Acceptance outline

- **Given** independently available CLI/file/environment identities **When** normal app resolution runs **Then** selection follows CLI → file → environment and reported/used identities match.
- **Given** an absent file and a valid environment source **When** resolution runs **Then** environment is used; **given** an unreadable/malformed selected file **Then** an actionable error occurs without a silent account change.
- **Given** file creation/replacement **When** reopened **Then** data matches the submitted in-memory canary and POSIX permissions are 0600; unsafe path or write failure leaves a visible error.
- **Given** canary credentials used through HTTP verification/failure **When** real logs, Activity, snapshots and archives are inspected **Then** none contain the canary, authorization header or request body.

## Out of scope

Connection wizard, `gh auth login`, live-token testing, secrets in Project data, OS keychain, OAuth/GitHub App integration, multiple credential profiles and standalone CLI refactoring.

## Risks and mitigations

- CLI commands can honor environment tokens even after `gh auth status`; test subprocess environments and source selection together.
- `0600` is POSIX-specific; use the platform's user location on Windows and execute native acceptance there without claiming POSIX mode tests establish Windows ACL behavior.
- File and SQLite are not atomic together; 7.2 must report retained credential-file effects if final connection/flag persistence fails.

## Open questions

None. The source order is required by the story; its contradictory missing-file acceptance has been reconciled. D1/D4 onboarding choices are accepted in ADR 0008.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Current-code baseline and credential/source/secret boundaries |
