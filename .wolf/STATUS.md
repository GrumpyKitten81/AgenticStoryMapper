# Agentic Story Mapper branding handoff

Date: 2026-11-08. Version: 20.

Reproducing statement: Adopt the user-selected Agentic Story Mapper product name across maintained documentation and product text while preserving operational identifiers and historical evidence.

## Current scope

The user selected **Agentic Story Mapper** as the new product name. Documentation, planning prose, agent instructions, BMad project metadata, community templates, UI titles/help, CLI diagnostics and generated MCP descriptions use it. Technical package/MCP identifiers, environment variables, credential/database paths, actual GitHub URLs and historical artifact paths remain stable. README explains these identifiers and uses an explicit `agentic-story-mapper` clone destination. The user authorized committing and pushing this rename to the existing origin/main. No new remote repository, tag, publication, Git-history rewrite or user-data change is part of this action.

MCP-first onboarding is delivered at `bf35489ad5c9f17707fbdcf4f7ec2c02156ba783`; the preceding documentation cleanup remains delivered. Immutable evidence and orchestrator tracking are preserved. Historical naming decisions retain their original names/dates, with the new 2026-11-08 decision recorded separately.

The active release checklist contains two steps: choose and verify the final version/candidate, then publish through the existing separately authorized procedure. Additional assurance is not a mandatory new backlog; demonstrated failures still need correction. Existing quality, advisory and exact-candidate publication gates remain intact.

## Documentation cleanup

- Release/usability reports retain current completion work and PRD finding IDs instead of old proposal lists.
- Contributor and release-note guidance follow the accepted Linux-CI/platform policy.
- README now separates application use, MCP reference, contributions, release operation and optional development automation.
- The active contributor walkthrough no longer asks users to replay the old pinned README-correction exercise or its evidence-manifest ceremony. Historical Story8.9 evidence remains in its spec.
- BMad round-trip instructions use MCP for Agent data operations and distinguish recipe mapping from structural levels/planning types. Human approval remains a separate UI action.
- Obsolete single-run analysis was removed from the loop guide; automation/tooling docs are explicitly maintainer material. Unavailable platform checks are recorded as limits, not an automatic release prohibition.
- This handoff replaces the accumulated previous-handoff dump. Detailed delivered story evidence remains in `_bmad-output/`; requirements, architecture/ADRs, active automation inputs, orchestrator tracking and hook-owned indexes/memory were not removed.

## Evidence

Branding verification: full build, workspace typecheck, 47 web tests, 73 server tests, 12 core footer tests, generated capabilities, hygiene, size and whitespace passed. 159 local links/anchors across 56 affected Markdown files resolve. Independent review corrections cover stable Windows credential paths, articles, historical decisions and maintained automation comments. Initial sandbox server/CLI checks encountered EPERM for local process/socket operations; authorized retries passed 73 server tests and 76 startup/diagnostic/runtime tests (208 focused tests total). Python helper compilation passed; the owned temporary server stopped; listener closure was verified and disposable runtime artifacts were removed. Browser rendering remains unverified because CUA has no available browser; an isolated server printed the new product name successfully.

Earlier delivered onboarding:35 UI tests,2 actual setup/start cases,3 stdio lifecycle/shared-runtime tests and web typecheck passed. Actual Codex CLI0.160.0 used the generated command to read Projects/Maps, create one empty disposable map, retain an unapplied proposal and reconnect after a changed-port restart. Both test servers stopped cleanly. Desktop/narrow visual checks, genuine user-authored planning, personal persistent host registration and Claude Code live acceptance remain unverified.

The preceding report/template cleanup passed21 release tests,54 affected local links/anchors, hygiene and whitespace. The broader cleanup passed101 local links/anchors across34 files, the capability-manifest check (141 capabilities) and whitespace checks; no fresh full product quality gate, advisory audit, publication scan or unavailable-platform acceptance is inferred from editorial edits.

## Remaining work

Select the actual release candidate and run its required checks when release execution is requested. Keep unavailable visual/platform coverage explicit. The possible Windows installation problem from issue8 is unconfirmed; the mandatory multi-OS CI demand is superseded. Release umbrella issue1 remains open; its onboarding delivery comment is6726751011.

For a future lean public repository, separate historical development archives deliberately after resolving current instruction/requirement/automation references. `_bmad-output/` contains roughly36MiB of tracked history/evidence; application runtime does not require every completed story artifact. Do not bulk-delete the current tree during this documentation cleanup.

## Changelog

- 2026-11-08 v20: Record the selected product name, stable technical identifiers, independent review and actual branding verification limits.

- 2026-11-08 v19: Replace repeated historical handoffs with current scope/evidence and record the broader documentation cleanup.
