---
epic: 8
story: 6
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.6: Public documentation in English

Reproducing statement: Plan accurate English README/runbook content, actual three-platform quickstart verification and repaired document links, using the delivered launcher, migration and provider behavior.

## Intent

A new user installs and operates Agentic Story Mapper from current English instructions without inheriting obsolete prototype claims.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); consume 8.1 migration/refusal instructions, 8.4 CI evidence and 8.5 community/placeholder policy.
- Preserve privacy: no actual local paths, credentials, user Projects or employer identifiers in public examples.
- 8.8 adds final release/tag details; leave a defined follow-up boundary instead of documenting an unimplemented command.

## Design decisions (this story)

Rewrite README and RUNBOOK from inspected source. The existing text wrongly describes env-first credentials, an independent stdio database server and archive behavior as future work. Use actual installed Node 24/Corepack pnpm, `node scripts/setup.mjs`, `node scripts/start.mjs`, shared UI/API origin, loopback restrictions, single-writer bridge, CLI → user file → environment credentials, explicit connection consent and durable reviewed remote plans.

Describe only Markdown/TXT source import, canonical provider identities, protected incoming ChangeSets, human-confirmed outbound effects, prototype refusal, supported forward upgrades and safe manual recovery. State explicitly that cooperative-Agent protection/access controls are guardrails, not a local-process security boundary. Link the architecture spine and current community/check guidance.

Verify a fresh checkout quickstart on each supported OS with disposable generated Project state. Setup may need package-network access; app default-off behavior does not permit provider traffic. Retain exact revision, OS, installed Node/pnpm, executed commands and observed health/start/stop outcomes. Unit CI results alone do not establish README quickstart or browser-launch success. If an OS is unavailable, record the missing evidence and do not claim full story acceptance from one host.

Scan tracked Markdown references/anchors to documents removed or renamed during earlier stories. Repair actual broken targets; do not crawl ignored user data or rewrite the entire planning history as a translation project.

## Task sequence

1. Inspect actual `scripts/{setup,start,runtime,launcher,doctor}.mjs`, DB migration entrypoints, MCP host config and credential/connection use cases; list concrete discrepancies in story notes.
2. `README.md`: write concise English product scope, per-OS quickstart, local privacy/guardrails notice and links to runbook, architecture and community material.
3. `docs/RUNBOOK.md`: document actual configuration, owned startup/stop, health/diagnostics, credential sources, consent/protection, archive/Restore, migrations/prototype refusal and actionable recovery without copying old unsafe instructions.
4. Fix tracked references to removed documents and relevant stale install links. Preserve required Markdown metadata; do not manufacture unsupported install/package-manager choices.
5. Execute fresh-checkout quickstart on Windows/macOS/Linux with disposable state, record evidence and clean owned processes/files. Run link checks and 8.3's required gates for changed references/commands.

## Preliminary code map

- `README.md`, `docs/RUNBOOK.md`, current architecture spine and 8.5 community files.
- `scripts/{setup,start,runtime,launcher,doctor,processes}.mjs`; existing `commands.test.mjs`, `doctor.test.mjs` and `failures.test.mjs`.
- `apps/server/src/http/routes/infrastructure-routes.ts`, `apps/server/src/mcp/http.ts`, `scripts/mcp-bridge.mjs`, `apps/server/src/services/credentials.ts`.
- 8.1 migration runner, restore/archive APIs and 8.4 CI workflow.

## Acceptance outline

- **Given** a fresh clone per supported OS **When** its documented commands run **Then** setup/start/health/stop succeed and exact platform evidence is recorded.
- **Given** the README Agent section **When** read **Then** it states the cooperative-agent guardrail limit and links the current architecture spine.
- **Given** operational tasks and old/prototype Projects **When** following the runbook **Then** instructions match actual migration/refusal/credential/Restore behavior.
- **Given** tracked documents linking removed pages **When** checked **Then** targets/anchors resolve to current documents.

## Out of scope

New launcher behavior, provider account writes, interactive login without presence confirmation, broad historical translation, publishing a repository or claiming missing platform/reader evidence.

## Risks and mitigations

- Literal translation would preserve obsolete behavior: derive commands and assertions from current source and actual quickstart execution.
- Local host tests cannot establish all OSes: record unavailable matrix rows explicitly and obtain real CI/platform evidence before claiming acceptance.

## Open questions

None. Unavailable execution environments are verification prerequisites, not invented results.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Source-based English documentation and fresh-checkout evidence plan |
