---
title: Agentic Story Mapper epic topics
created: 2026-09-29
updated: 2026-11-08
status: historical
---

# Epic topics

Date: 2026-11-08. Version: 2.

Reproducing statement: Preserve the original epic-planning topics and sequencing as historical input tied to its baseline, with clear links to the resulting epics and current release work.

**Historical planning input.** These themes preceded the implementation stories and describe the 2026-09-29 planning baseline at commit `5e4a647`. Feature gaps, counts, dependency versions and suggested sequencing below are not a current backlog or release assessment. Use the resulting [epics](../../epics.md), current [PRD](prd.md), [architecture spine](../../architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md) and [release checklist](../../../../docs/public-release-readiness.md) instead of restarting this plan.

Themes for the epics step, not stories. Derived from `prd.md` (FR-1 to FR-59), the FR status table in `review-code-alignment.md` and the architecture spine (AD-1 to AD-24). "Code at planning baseline" refers to commit `5e4a647`.

## Before epics

Baseline gap pass: verify FR-10 and the unverified sub-conditions in the review table (PRD Open Question 3), so epics start from the real delta. The architecture decisions are settled in the spine.

## Topics

### T1 Code health for a public showcase
FR: NFR-7, NFR-8. Spine: AD-1, AD-2, AD-3, AD-16, AD-17, AD-19. Includes the unit of work with required actor context, the write gate, repositories per aggregate, the boundary, size and classification scripts, `packages/ai` folded into `core`, unused dependencies removed. Code at planning baseline: `storymapper-repository.ts` 3,797 lines, `routes/index.ts` 1,405, `DiscoveryMatrix.tsx` 955, `contracts/api/http.ts` 906, repository test file 815; 9 test files, none for web, contracts, ai, mcp. Sequence first: T5 to T8 all touch these files.

### T2 Persistence, migrations and restore points
FR: FR-2, FR-44, FR-46, FR-47, FR-57. Spine: AD-7 to AD-10, AD-12, AD-17. Includes drizzle migrations with foreign-key check, version counters and `next_card_number`, the `external_refs` table, the project lock, restore points and the restore protocol, sequence and epoch for events. Code at planning baseline: `CREATE TABLE IF NOT EXISTS` plus ad hoc `ALTER TABLE`, empty `migrations` directory, archive manifest version hardcoded `0.1.0`. Needed before any tagged release and before FR-52 adds columns.

### T3 Agent interface completion
FR: FR-30 to FR-35, FR-58, FR-59. Spine: AD-2, AD-5, AD-6, AD-11, AD-13, AD-23. Includes MCP SDK 2.x with the Fastify adapter and stateful sessions, the operation registry, safety switches and human-only use cases, tool-call audit, SSE stream, Host and Origin validation, persisted templates and MCP prompts. Code at planning baseline: 24 tools; no MCP tools for Roadmaps, Annotations, Workflow Statuses, Story Templates, Source Document import or read, reports, exports, ChangeSet list, approve and reject, `CreateStoryMap`; Write and GitHub switches exist via privacy settings but the HTTP tool-call route and audit output hash and host are unverified; stdio only; AI templates hardcoded; host config emits `corepack pnpm --dir` commands.

### T4 Agent-driven planning with BMad (headline topic)
FR: FR-51 to FR-54, FR-56, SM-7. Spine: AD-4, AD-5, AD-7, AD-10, AD-11. Code at planning baseline: ChangeSet model has entity types and `baseUpdatedAt` for conflicts; no agent-submitted batch, no external reference, no visual preview, no bulk status by external reference, no recipe. Depends on T1, T2, T3 and the architecture decisions. Candidate sub-themes: submit and validate ChangeSets, external references, preview on Tree and Planning Views, recipe and end-to-end test with a 30-Story set, status sync.

### T5 Board and Views completion
FR: FR-9 to FR-12, FR-14, FR-16, FR-17, FR-47 to FR-50. Code at planning baseline: dnd-kit in three components, keyboard handling in `DiscoveryMatrix` only, collapse present, Card Key prefix stored but UI unverified, no Focus Release, no view display settings, `VITE_DEV_FEATURES` still hides navigation, delete wiring for customization unverified, parking, history and attachments exist without UI checks.

### T6 Connections, credentials and GitHub flows
FR: FR-3, FR-22, FR-26 to FR-29, FR-55. Code at planning baseline: tokens only from `.env` or `gh` CLI, connection validation exists, `push_preview_enabled` setting can disable the Dry Run (must become mandatory), no single-ticket import in Card creation, provider registry has no unknown-id test.

### T7 Privacy, audit and export
FR: FR-1, FR-36 to FR-39, FR-25. Code at planning baseline: privacy mode plus per-connector switches overlap, `externalLlm` and `updateChecks` switches have no feature behind them, exports split between view export and the privacy panel, no release notes generation, "no outbound traffic when idle" unaudited.

### T8 Install and first run
FR: FR-4 to FR-6, FR-18, FR-34 (paths). Code at planning baseline: Windows PowerShell only, repo-local Node, no browser auto-open, no diagnosis command for users, no sample map, no Story Map template mechanism, onboarding panel in German without checklist.

### T9 English UI and documentation
FR: FR-7, FR-41. Code at planning baseline: German in `OnboardingPanel`, `ProjectArchivePanel`, `CardDetailModal`; README, RUNBOOK, usability report, templates and issue templates German; no central UI string source. Translation of README and RUNBOOK is its own step.

### T10 Open-source release readiness (last)
Includes the dependency upgrade wave (AD-22: audit gate, Drizzle 0.45.2 or later, zod 4, Vitest, Vite, Tiptap) as a release prerequisite.
FR: FR-40, FR-42, FR-43, FR-45. Code at planning baseline: `pnpm audit` reports 63 advisories, no LICENSE, CONTRIBUTING, SECURITY, code of conduct, CI workflows; playbook PDF of unknown provenance; team-specific tooling and templates; employer-specific commits in history. The history route (rewrite or fresh repository, Open Question 1) is decided at the very end, immediately before publication.

### T11 Plan visualization and drift
FR: FR-60 to FR-64, FR-14 (Slices and Graph Views). Spine: AD-5, AD-10, AD-11, AD-17, AD-24. Code at planning baseline: Release swimlanes and a Timeline exist; no dependencies, no Slices view, no graph, no what-changed panel, no drift report. Includes the `card_dependencies` table and `dependency` operation, cycle check in `resolve`, pure checks in `core`, the drift tool and the three web views. Built after the validation gate.

## Suggested order

T1 and T2 (foundations), then T3 and T4 (headline), then the validation gate of PRD section 6.3, then T11 and the Core parts of T5 to T7, T8 and T9 in parallel where files do not collide, T10 last. Later-tier items (PRD section 6.3) get no v1.0 effort.

## Changelog

- 2026-11-08 v2: Label original topics and sequencing as historical, tie implementation observations to the planning baseline and point to the resulting epics and current release work.
