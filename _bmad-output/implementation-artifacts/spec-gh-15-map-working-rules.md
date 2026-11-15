---
title: 'Story Map working rules in Agent context'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '90853d2f5f08e3d60aeef5afa5d2adf54eaded75'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story Maps cannot record their own advisory working rules for agents and contributors. The existing Agent context dialog is only 420 px wide on desktop and makes ten fields hard to navigate.

**Approach:** Add a dedicated free-text `workingRules` field to map-scoped Product Context, expose it through the existing API and MCP context path, and reorganize the dialog into Overview, Working rules, and More context. Preserve existing human protection, ChangeSet review, and GitHub confirmation behavior. Explain the advisory scope in the map concepts article and its in-app rendering.

## Boundaries & Constraints

**Always:** Rules belong to the selected Story Map, default to an explicitly empty string, and remain advisory. Saving any other context field must preserve the rules. Keep drafts while switching dialog sections. Preserve accessible keyboard operation and responsive layout. Make a 700 px desktop dialog with a single-column narrow layout.

**Never:** Infer machine policy from the text, block mutations based on it, inherit project-level rules into map context, or add a separate Story Map JSON import workflow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rules edit | Map A receives free text, then an empty string | Create, read, update, and clear only Map A's rules | Existing save errors remain visible and draft is retained |
| Missing rules | Fresh or migrated map without rules | UI and GetProductContext expose empty `workingRules` | No implicit policy |
| Agent change | UpsertProductContext for a map by non-human actor | Proposed ChangeSet carries rules; Apply remains separately controlled | Existing refusal and GitHub safeguards remain |
| Export | Map copy, JSON/Markdown export, project archive Restore | Map rules survive where context metadata is retained | No new map JSON importer |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/schemas/domain.ts` and `packages/contracts/src/api/http.ts` define Product Context and its patch; `packages/contracts/src/schemas/remaining-operations.ts` defines ChangeSet fields.
- `packages/db/src/schema/tables.ts`, `packages/db/src/repositories/projects-repository.ts`, and `packages/db/src/repositories/row-mappers.ts` persist and read map-scoped context. Migrations live in `packages/db/migrations/`.
- `apps/web/src/features/product-context/` owns the dialog and draft; `apps/web/src/styles/card-editing.css` defines the shared 420 px dialog; use a scoped class and central spacing tokens.
- `apps/server/src/mcp/tools/register-content-tools.ts`, `apps/server/src/application/ai/prompts.ts`, and `apps/web/src/features/ai-mcp/agent-prompts.ts` cover MCP retrieval and Agent guidance.
- `packages/core/src/publishing/export-formatters.ts` renders Markdown; JSON export includes snapshot context. Map copy includes Product Context; project archive includes SQLite.
- `docs/story-map-levels-and-issues.md` is rendered directly by `MapConceptGuide`, so one article edit updates in-app help.

## Tasks & Acceptance

**Execution:**
- [x] Contracts, DB migration, repository and ChangeSet operation -- add `workingRules` with empty default and map-specific persistence; preserve partial-update semantics.
- [x] Web editor and shared styles -- add three accessible sections, advisory example, wider desktop dialog, responsive one-column layout, and shared Save/Close actions.
- [x] Agent prompts, map article and export -- make rules visible to agents and humans, include them in Markdown, and document the advisory boundary.
- [x] Tests -- cover the matrix, map isolation, dialog behavior, copies/exports/archive, and protection invariants; run focused suites and typechecks.
- [x] Browser -- inspect desktop and narrow dialog, tab keyboard behavior, focus, scrolling, reload, and map switching.

**Acceptance Criteria:**
- Given two maps in one project, when rules are edited on one, then the other retains its own rules and both survive reload.
- Given a map with or without rules, when an Agent retrieves context, then the response explicitly includes its map-scoped `workingRules` string.
- Given existing protection settings, when rules are saved or an Agent proposes changes, then approval and remote GitHub write safeguards behave as before.
- Given a desktop or narrow browser, when the dialog is opened, then its fields are readable, grouped, keyboard reachable, and do not cause horizontal overflow.

## Implementation Notes

`workingRules` is persisted on map context only. The existing ChangeSet and GitHub confirmation gates remain authoritative. Markdown export contains the literal free text in a safe fenced block.

## Verification

**Commands:**
- `corepack pnpm --filter @storymapper/contracts test` -- context contracts pass.
- `corepack pnpm --filter @storymapper/db test` -- migration and persistence tests pass.
- `corepack pnpm --filter @storymapper/server test` -- MCP and archive tests pass.
- `corepack pnpm --filter @storymapper/web test` -- dialog and navigation tests pass.
- `corepack pnpm --filter @storymapper/web typecheck` -- no TypeScript errors.

Focused contract, database, core, server, and web tests passed. All affected package typechecks and the web build passed. Desktop and narrow browser checks covered save, reload, two-map isolation, focus, tabs, scrolling, and overflow. The full Web suite has unrelated source-copy and 1,000-card diagnostic failures in this environment; the full Server suite cannot initialize under the sandbox `ps` restriction. The repository quick verifier stops at Corepack version detection.

## Review Triage Log

| Finding | Verdict | Route and evidence |
| --- | --- | --- |
| Project-scoped writes can contain rules | medium | Patch: `UpsertProductContext` accepts the field without a map ID; map-specific rules should reject a nonempty project-level write. |
| No-map Agent prompt omits later context retrieval | low | Patch: after a map is chosen, the prompt should direct `GetProductContext`; the current no-map branch only asks what to map. |
| Editing before context loads can overwrite rules | medium | Defer: `useContextDraft` already sends whole drafts for all Product Context fields; the race predates this change and needs a separate editor synchronization fix. |
| Simultaneous clients can overwrite a newer rule | medium | Defer: the existing whole-context save has no revision check for any field; this is a pre-existing concurrency behavior. |
| Raw Markdown rules can create map headings | medium | Patch: the formatter inserts unescaped free text, so a `##` line becomes a structural heading. Contain it in a safe fenced block. |
| Markdown export trims rule whitespace | low | Patch: `.trim()` changes entered free text in Markdown output; preserve it in the same fenced block. |
| Map article implies CSV preserves rules | low | Patch: CSV omits Product Context, so name JSON and Markdown exports explicitly. |
| No populated pre-0006 migration regression | medium | Patch: migration tests do not assert the new default for an existing context row; add a focused upgrade test. |
| Dialog tests omit keyboard navigation | medium | Patch: click coverage does not exercise tab key handling or focus. |
| Dialog tests omit submit and map switching | medium | Patch for submit: hook testing bypasses form submit. Browser inspection already verified reload and two-map isolation; repository tests cover the latter. |
| Verification-gap: dialog Save action untested | medium | Patch: same submit gap as above, independently found and verified in `workspace-navigation.test.tsx`. |
| Verification-gap: section keyboard action untested | medium | Patch: same tab keyboard gap as above, independently found and verified in `workspace-navigation.test.tsx`. |
