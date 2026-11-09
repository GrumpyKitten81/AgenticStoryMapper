# Agentic Story Mapper usability findings: historical traceability

Date: 2026-11-08. Document version: 0.4.0.

Reproducing statement: Remove obsolete usability work lists while preserving the finding IDs referenced by PRD success criterion SM-6; distinguish historical observations from current release work.

The original evaluation concerned a product owner without development or AI experience, using the 2026-07-22 product with 2026-09-29 scope corrections. It is not a current usability assessment. The detailed old proposals and sequencing have been removed because they do not establish remaining work today. This is a source/documentation reconciliation, not a new observed user test.

## Finding references

| ID | Historical observation | Current disposition |
| --- | --- | --- |
| S1 | PowerShell-only setup and manual browser opening | Current startup uses Node and opens the browser after health; actual platform coverage follows the release checklist. The supported guided entry is in the [README](../README.md#quickstart). A separate double-click launcher is not a current release task. |
| S2 | Mandatory manual environment-file/token setup | Local planning requires no `.env`, token or GitHub connection. Optional GitHub credentials follow the [Runbook](RUNBOOK.md#credentials-and-connection-consent), not the old setup instructions. |
| S3 | Technical startup errors without a recovery path | Setup/start provide actionable failures and `doctor.mjs`; current setup/start regression evidence is recorded in the [MCP onboarding note](../_bmad-output/implementation-artifacts/spec-gh-1-guided-mcp-onboarding.md). |
| S4 | Separate API and web addresses | UI/API share the actual URL printed by the launcher. |
| S5 | Main functions hidden behind `VITE_DEV_FEATURES` | That former developer gate is absent from current web source. Current feature flags are documented in the Runbook. |
| S6 | Empty first map without guidance | Empty maps are intentional. Toolbar help, neutral Activity/Step/Story templates and the MCP-first guided entry are available. No automatic user planning content is required. |
| S7 | Mixed interface languages | Current UI copy follows the English policy and source checks. This does not claim a new human language audit. |
| S8 | GitHub connection required developer-oriented credential setup | The current connection dialog provides explicit credential selection, Verify and Connect. Host accounts remain user-managed; this is not a newly observed credential/reader acceptance result. |
| S9 | Retired integration proposal | Withdrawn in the 2026-09-29 scope correction. |
| S10 | Export formats hard to discover | View exports are available from the map; structured/audit exports follow the Runbook. Consolidating every format is not a confirmed release defect. |
| S11 | Missing portable Project package | `.lsm.zip` import/export is implemented and documented in the [Runbook](RUNBOOK.md#portable-project-archives). |
| S12 | No single-ticket import while creating a Card | The [ticket composer](../apps/web/src/features/story-map/components/TicketCardComposer.tsx) supports ticket lookup, reviewed title/body population and linked Card creation. |

SM-6 in the [PRD](../_bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md) retains these IDs. They are not an additional backlog. Actual release work and acceptance limits belong in the [release checklist](public-release-readiness.md).

## Changelog

- 2026-11-08 v0.4.0: Replace obsolete journey/proposal lists with the referenced finding IDs and current source-based dispositions; retain the unobserved-usability boundary.
