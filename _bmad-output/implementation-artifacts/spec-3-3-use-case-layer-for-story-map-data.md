---
status: done
date: 2026-10-07
version: 2
baseline_commit: 49b5f313ead24919d60922aee82c43985fb4405f
updated: 2026-10-10
updated_version: 3
---

**Reproducing statement:** Implement Epic 3 Story 3.3 — shared use-case layer for Story Map data aggregates (Story Map, Card, Release, Persona, Source Document, ChangeSet) with HTTP/MCP parity, capability manifest generation, and DomainError mapping per `_bmad-output/planning-artifacts/epics.md` Story 3.3.

## Summary

Story Map data capabilities now live under `apps/server/src/application/<aggregate>/` with typed use cases, `ActorContext`, and exported `CapabilityDescriptor` metadata. HTTP aggregate routes are thin adapters in `apps/server/src/http/routes/*-routes.ts`; MCP tools in `register-tools.ts` call the same use cases. Repository errors `ReleasePositionError` and `ChangeSetConflictError` extend `DomainError`. Capability manifest is generated from scanned descriptors and checked in CI via `pnpm check-capabilities` (also wired into `scripts/verify.mjs`).

## Verification evidence

| Check | Result |
| --- | --- |
| `corepack pnpm typecheck` | Pass (2026-10-06) |
| `corepack pnpm check-capabilities` | Pass — 32 capabilities |
| `corepack pnpm --filter @storymapper/server test` | Pass — 168/168 (2026-10-06, scoped server evidence; not full DB acceptance) |
| New tests | `capability-manifest.test.ts`, `mcp-http-parity.test.ts` |

### Error envelope changes (HTTP aggregate routes)

Aggregate routes now return `{ code, message, details? }` via `toErrorResponse`. Notable status changes:

- ChangeSet apply conflict: **409** (`conflict`) instead of 400
- Validation/not_found on aggregate routes include `code` field (e.g. card park validation, missing card)

### Windows restore follow-up (same session)

Pre-existing restore defects (long snapshot paths, read-only `fsync` on Windows) were fixed in `packages/db` (`resolveSqlitePath`, `syncFile` open mode). The earlier message-based Drizzle mapping was incomplete. Story 3.4 now rejects empty patches as typed validation errors, uses explicit historical/conflict errors and anonymizes unknown internal failures.

### Prior test notes (superseded)

- Earlier scoped acceptance did not establish complete native Windows DB Restore behavior or actor propagation on reads. The Story 3.4 evidence below supersedes those claims.

## Changelog

- 2026-10-06: Initial completion of Story 3.3 use-case layer, route extraction, manifest tooling, and MCP parity.
- 2026-10-10: Recorded the canonical parent revision for reproducible story-diff evidence.

## Reconciled closure (2026-10-07)

Story 3.4 completed the missing actors on reads, Card child operations, Human-only guards, proposal write classification, Release summary map/release identity, and shared typed errors. The earlier32-capability/168-server-test table is historical scoped evidence. Current105 descriptors cover98 actual domain routes and all24 existing MCP tools in both directions. Final native Windows workspace gates:658 tests passed,2 Script permission cases skipped; DB 232/232 without exclusions, server218/218, Core 28/28, Contracts 19/19, Web 95/95, Importers 2/2. Typecheck, deterministic manifest check, build, full release verification and whitespace pass.

Story 3.3 and3.4 are done; Epic 3 remains in progress. No later MCP transport/tools, Operation executor or untested platform acceptance is implied. See `spec-3-4-use-case-layer-for-the-remaining-capabilities.md` for full inventory, review decisions and remaining scope.

- 2026-10-07 v2: Corrected incomplete historical error/Restore claims and reconciled closure against actual complete tests.
