---
epic: 4
story: 1
status: ready
date: 2026-10-10
version: 1
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.1: Import Markdown and TXT sources with stable chunks

Reproducing statement: Prepare Story 4.1 for stable Markdown/TXT source imports, scoped deduplication and removal of unsupported importers, without implementing it or editing sprint tracking.

## Intent

Deliver immutable requirement documents with deterministic, locatable chunks and an explicit unchanged result on repeated input. Fulfills FR-19 and AD-22.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md), especially source identity and file boundaries. Epic 3 shared use cases/UoW are prerequisites.
- Supply stable document/chunk/locator contracts for 4.2 and source-import registry coverage in 4.5/4.7. This story alone does not close universal Agent routing.

## Design decisions (this story)

Current repository import allocates random document/chunk ids on every call, hashes content inside UoW and has no deduplication. Markdown only remembers the latest heading and treats fenced headings as headings. TXT has paragraph locators. Preserve Markdown/TXT interface while improving locator semantics.

Prepare bytes/content and hash outside SQLite; deduplicate and persist under the write gate with a unique Project/type/hash key. Reuse the existing document and its chunks for unchanged input. Derive chunk identity from the persisted document identity and stable locator; include heading ancestry and block index so repeated headings do not collide. Project identities remain separate. Define LF/CRLF handling explicitly and test stable semantic locators without silently changing the content-hash contract.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, `packages/contracts/src/api/application-responses.ts`: restrict supported types, define locator/unchanged result shared by UI/use case/MCP, and update callers together.
2. `packages/importers/src/markdown/import-markdown.ts`, `packages/importers/src/txt/import-txt.ts`: implement deterministic block locators for nesting, repeated headings, lists, tables and fenced blocks; extend their existing tests.
3. `apps/server/src/services/prepare-source-document-import.ts`, `apps/server/src/application/source-document/source-document.use-cases.ts`: prepare immutable content/hash before UoW and retain inline-only Agent input. Core must not read files.
4. `packages/db/src/schema/tables.ts`, `packages/db/src/connection.ts`, `packages/db/src/repositories/sources-repository.ts`: add scoped deduplication and deterministic chunk persistence atomically; changed input creates a new document without replacing old links. Follow the preparation's AD-9 development-schema policy.
5. `packages/importers/src/index.ts`, unsupported `docx/`, `pdf/`, `xlsx/`, `images/` modules, package manifests and `pnpm-lock.yaml`: remove stubs, `mammoth`, `pdf-parse`, `xlsx` and all unsupported registrations/imports, using pnpm for the lockfile.
6. `apps/server/src/http/routes/source-document-routes.ts`, `apps/web/src/features/source-documents/SourceDocumentsPanel.tsx`, API/string modules: show unchanged/support errors and preserve actual import UI flow. Verify importer/contracts/db/server tests and affected web typecheck.

## Preliminary code map

Read the importers' existing Markdown/TXT tests; source repository import/link methods; `packages/db/src/repositories/storymapper-repository.test.ts` source coverage; server preparation and source routes; shared MCP input in `packages/contracts/src/mcp/tool-inputs.ts`. Current tests prove basic splitting and links, not stable identity/concurrent deduplication.

## Acceptance outline

- **Given** Markdown headings, paragraphs, lists, tables and fences or TXT paragraphs, **when** imported, **then** each chunk has the correct file/heading-path/block locator; repeated document-id/locator input yields identical chunk ids.
- **Given** identical content in two Projects, **when** imported, **then** locators match but document/chunk ids and owners differ.
- **Given** identical Project/type/hash, including concurrent imports, **when** repeated, **then** existing document/chunks return with “unchanged” and no duplicate domain rows.
- **Given** changed content and linked old chunks, **when** imported, **then** a new immutable document exists and old document/links remain untouched.
- **Given** unsupported input, **when** imported, **then** rejection lists Markdown/TXT; unsupported stubs/dependencies are absent from source, manifest and lockfile.
- **Given** UI, use-case and real MCP imports, **when** verified, **then** supported imports work, MCP rejects file paths, human file preparation occurs before SQLite, and LF/CRLF/nested/repeated/fenced cases pass.

## Out of scope

Provenance UI, full registry/executor routing, unsupported formats, new host-file authority/size policy or cleanup services, migration of prototype Projects.

## Risks and mitigations

Hash/locator changes can break evidence: retain old documents and establish exact deterministic fixtures. Concurrent deduplication needs transactional uniqueness, not a preflight-only read. Update source result consumers together to prevent “unchanged” from appearing as a new import.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial source-anchored import plan.
