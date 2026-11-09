---
title: Agentic Story Mapper PRD addendum
created: 2026-09-29
updated: 2026-11-08
status: historical
---

# Addendum: Agentic Story Mapper PRD

Date: 2026-11-08. Version: 2.

Reproducing statement: Retain the dated implementation baseline and design inputs behind the PRD, clearly separated from current product and operating guidance; preserve historical observations without treating them as present-day findings.

**Historical planning input.** The implementation observations below describe the 2026-09-29 baseline. Routes, tool counts, privacy modes, package names and release gaps are retained as historical context, not current instructions or acceptance results. Sections B and I record design inputs; read them alongside the current [PRD](prd.md) and [architecture spine](../../architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md). Use the [README](../../../../README.md), [Runbook](../../../../docs/RUNBOOK.md), [MCP inventory](../../../../docs/mcp-tools.md) and [release checklist](../../../../docs/public-release-readiness.md) for current operation and release work.

Depth that belongs downstream (architecture, UX, epics) or would pad `prd.md`. Sources: retired `docs/PRD.md`, retired `docs/GUI_IMPLEMENTATION_PLAN.md`, `docs/usability-report.md`.

## A. Implementation baseline (verified 2026-09-29 against code)

The prototype PRD section 0 (review of 2026-07-06) was superseded by these observations at the 2026-09-29 baseline:

- Web routes exist for `/onboarding`, story-map list, `discovery`, `tree`, `planning`, `backlog`, `tracking`, `timeline`, `releases`, `roadmaps`, `ai-mcp`, `github`, and per-Project `sources`, `customize`, `personas`, `github`, `audit` (`apps/web/src/app/router.tsx`).
- `@dnd-kit` is used in `BacklogList`, `DiscoveryMatrix`, `SwimlaneGrid`; Tiptap in `DescriptionEditor`; `CardDetailModal` exists.
- 24 MCP tools are registered in `apps/server/src/mcp/tools/register-tools.ts`, including `PushCardsToGitHub`, `ImportGitHubIssues`, `SyncGitHubLinks`, `ListGitHubLinks` and `PullStoryMapGitHubLinks`. Transport verified: stdio entry points only (HTTP transport not confirmed).
- Importers: Markdown and TXT real; DOCX, PDF, XLSX, image throw "reserved".
- `packages/ai` defines provider types only; proposal logic is deterministic.
- Missing for release: `LICENSE`, `CONTRIBUTING`, `SECURITY`, code of conduct, `.github/workflows`; README, RUNBOOK, templates and part of the UI are German; setup is Windows/PowerShell only; git history contains employer-specific tooling commits.
- `VITE_DEV_FEATURES` still gates navigation in `RootLayout.tsx` and `story-map-shell.tsx` (usability report S5).
- MCP permissions are derived per Project from privacy settings (`register-tools.ts`, `packages/mcp` permissions): write and GitHub tools are off unless enabled, so proposal-only is the default. No per-call approval exists. See `review-code-alignment.md`.
- retired wiki connector and retired work-item connector (code, schema, routes, UI, environment variables, documentation) were removed on 2026-09-29. `WorkItemProvider` and a new `PublishProvider` interface remain as extension points; GitHub is the only shipped provider.
- A Project archive (`.lsm.zip`, redacted snapshot, manifest v1) exists with export and import routes and a UI panel; card history, attachments and Activity parking exist without a requirement in the retired PRD (now FR-46 to FR-50).

Not verified per FR: keyboard operation (FR-9), collapse (FR-11), focus release and view settings (FR-12), full delete coverage (FR-17), Card Key prefix handling (FR-11). A verified gap pass belongs before epics (Open Question 3).

## B. Design decisions carried over from the GUI plan

- Routing: `@tanstack/react-router`, code-based configuration.
- One page component per View, sharing sub-components and hooks; no single board with a mode switch.
- One `CardTile` component with a `variant` prop for Discovery, Planning and Backlog.
- Card detail opens as a modal with URL state (`?card=<id>`).
- Rich text: Tiptap with Markdown serialization; `card.description` stays a Markdown string because it becomes the GitHub Issue body.
- Drag-and-drop on Story level through the existing `POST /api/cards/:cardId/move` operation.

## C. Route structure

```
/                                              -> first Project
/projects/:projectId/story-maps                -> Story Map list
/projects/:projectId/story-maps/:storyMapId    -> discovery
  discovery | tree | planning | backlog | tracking | timeline | slices | graph | releases | roadmaps | ai-mcp | github
/projects/:projectId/sources | customize | personas | github | audit
```

## D. Privacy Modes (from retired PRD)

| Mode | Behavior |
| --- | --- |
| Strict Local | No external LLM or GitHub access; MCP only for local hosts; no outbound requests. |
| Local + GitHub | GitHub API allowed, tokens local, no LLM access. |
| Agent Mode | MCP enabled for Claude, Copilot or Cursor; toolsets granular; every external agent action logged. |

## E. MCP tool inventory and risk classes (from retired PRD)

Discovery/Read: `ListProjects`, `ListStoryMaps`, `GetStoryMapData`, `GetStoryMapCards`, `GetStoryMapCardDetails`, `GetSourceDocument`, `GetStoryMapReleaseDetails`, `GetStoryMapPersonaDetails`, `ListGitHubLinks`: read-only.
Write, approval required: `CreateStoryMap`, `CreateStoryMapCard`, `UpdateStoryMapCard`, `MoveStoryMapCard`, `CreateStoryMapRelease`, `UpdateStoryMapRelease`, `CreateStoryMapPersona`, `UpdateStoryMapPersona`, `ImportGitHubIssues`, `SyncGitHubLinks`, `ApplyChangeSet`.
High-risk approval: `DeleteOrArchiveStoryMapCard`, `PushCardsToGitHub`.
Proposal, no direct write: `ProposeMapFromSourceDocument`, `ProposeBacklogGrooming`, `ProposeReleaseSlice`.

Verified at that baseline: `GetSourceDocument` and `CreateStoryMap` were not registered, while `PullStoryMapGitHubLinks` was registered but absent from the retired inventory. FR-30 requires the inventory and the registry to match.

## F. Deferred items with reasoning

- **retired work-item connector (S9, backlog 11):** removed from the product on 2026-09-29 because it cannot be tested; not deferred.
- **Portable `.lsm.zip` (S11, backlog 13):** implemented; now FR-46.
- **Onboarding wizard (backlog 12):** replaced in v1.0 by checklist and sample map (FR-6); wizard remains a candidate.
- **Non-Markdown import:** reserved importer interface; not needed for GitHub-first planning.

## G. Usability findings mapped to FRs

S1 → FR-4; S2 → FR-26; S3 → FR-5; S4 → FR-4 (browser auto-open); S5 → FR-16; S6 → FR-6, FR-18; S7 → FR-7; S8 → FR-26; S10 → FR-38; S12 → FR-22; S9, S11 → deferred (section F).

## H. Retired-PRD ideas worth keeping for later

- Acceptance quality bars: at least 90 % of agent-generated Cards carry a Source Link or an inference marker; a new Card at any level in at most two interactions.
- Roadmap prioritization by value versus effort and RICE (Could).
- PR, commit and branch linking to Cards, branch creation from a Card, GitHub Project item link (Could).
- Source diff on document re-import (Could).
- Visual map export as SVG.

## I. BMad Method mapping (assumption behind FR-54)

| BMad artifact | Agentic Story Mapper object | Notes |
| --- | --- | --- |
| Epic (`epics.md`) | Activity | External reference `bmad:epic-<n>`; epic goal in the description |
| none (BMad has no middle layer) | Step | One Step per Epic, named like the Epic (decided 2026-09-29) |
| Story `<epic>.<n>` | Story | Acceptance criteria in the description; external reference `bmad:story-<epic>.<n>` |
| MVP or sprint slice | Release (Slice) | Goal and dates from the plan; Stories assigned by the ChangeSet |
| Story file path | Source Link | Link to the file the Card came from |
| Sprint status value (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`) | Workflow Status | Statuses created or adapted by the Agent (FR-56) |

The recipe (Agent instructions) lives in this repository and uses only generic MCP tools: create Story Map, submit ChangeSet (FR-51), preview (FR-53), update by external reference (FR-52).

## Changelog

- 2026-11-08 v2: Explicitly label the implementation baseline and design inputs as historical, date relative observations and link current guidance. No historical finding was reverified or declared resolved.
