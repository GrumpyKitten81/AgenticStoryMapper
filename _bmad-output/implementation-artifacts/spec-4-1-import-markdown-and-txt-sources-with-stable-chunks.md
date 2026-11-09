---
title: 'Import Markdown and TXT sources with stable chunks'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: f569ce47a0800ded262bf6e503113700ff855713
baseline_commit: f569ce47a0800ded262bf6e503113700ff855713
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-4-preparation.md']
warnings: ['oversized']
deferred:
  - summary: >-
      Source chunks are read back ordered by the locator string, so heading-path locators sort alphabetically and block ordinals lexically (Guide#10 before Guide#2), not in document order; the unchanged response therefore can differ in order from the first import response.
    evidence: |-
      packages/db/src/repositories/sources-repository.ts getSourceDocumentDetails orders by sourceChunks.locator; the ordering predates this story (paragraph#10 sorted before paragraph#2 already), but the unchanged path now returns that order next to an in-document-order import response.
    location: >-
      packages/db/src/repositories/sources-repository.ts:94
    severity: medium
  - summary: >-
      SourceDocumentsPanel unchanged notice (role="status") and import error alert (role="alert") have no web render test.
    evidence: |-
      No test file under apps/web/src references SourceDocumentsPanel; server tests assert status "unchanged" and HTTP 200 only. Flipping the status condition would keep every test green.
    location: >-
      apps/web/src/features/source-documents/SourceDocumentsPanel.tsx:66
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every source import allocates fresh random document/chunk ids and hashes content inside the UoW, so re-importing identical content duplicates documents/chunks and card evidence links to unstable chunk identities. Markdown locators track only the latest heading (no ancestry), treat headings inside fenced code as headings, and carry no stable block index.

**Approach:** Prepare content plus sha256 hash before the UoW; deduplicate on (project, type, hash) under the write gate backed by a unique index; derive chunk ids deterministically from document id and stable locator (Markdown: fence-aware heading path plus block index); restrict supported types to markdown/txt and remove the unsupported importer stubs with their dependencies.

## Boundaries & Constraints

**Always:**
- Hash = sha256 of the content exactly as supplied (byte-exact, no normalization) — existing hash contract; splitting normalizes CRLF for locators.
- Document id = randomUUID allocated once at first import; chunk id = sha256(`${documentId}:${locator}`) hex.
- Unchanged import returns the existing document and persisted chunks: no new rows, no activity row; HTTP 200 (imported stays 201).
- MCP input remains inline-only (no filePath, non-empty content); file reads happen only in the HTTP prepare step before SQLite.
- Contracts stay the single schema source; every consumer of a changed shape updates in the same change.

**Never:**
- No DOCX/PDF/XLSX/image import, no new host-file authority or size policy.
- No migration of existing prototype projects (AD-9: dev databases disposable, in-place transition only).
- No fallbacks or compatibility shims for removed types/stubs; no second client schema.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New Markdown import | Nested/repeated headings, lists, tables, fenced blocks | status "imported"; each chunk has heading-path + block-index locator; same (documentId, locator) always yields the same chunk id | No error expected |
| Fenced heading | `# X` inside a ``` fence | Content of the enclosing chunk, not a heading | No error expected |
| Repeated import | Same project/type/content hash, incl. back-to-back | status "unchanged"; existing document/chunk ids; no duplicate rows, no activity | No error expected |
| Cross-project | Identical content in two projects | Same locators; different document/chunk ids and owners | No error expected |
| Changed content | Same title, modified text | New immutable document; old document and its card links untouched | No error expected |
| Unsupported type | type "docx" via HTTP or MCP | Rejection listing markdown/txt as supported | Validation error (400 / MCP validation) |
| MCP file path | filePath in MCP input | Rejected (inline-only, strict schema) | Validation error |
| CRLF vs LF | Same logical text, different line endings | Identical locators and chunk texts; distinct hashes, hence distinct documents | No error expected |
| Missing file | HTTP import with unreadable filePath | 500 "failed before unit of work", no domain rows (existing behavior) | Existing error path preserved |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:3,260-288` -- uuidSchema; sourceDocumentSchema type enum (8 types → markdown/txt); sourceChunkSchema.id and cardSourceLinkSchema.chunkId (uuid → sha256 hex)
- `packages/contracts/src/api/http.ts:149-172` -- importSourceDocumentRequestSchema (already markdown/txt only); preparedSourceDocumentImportSchema (+content; add fileHash, restructure fields so MCP input derives inline-only); importSourceDocumentResponseSchema (+status); createCardSourceLinkRequestSchema.chunkId
- `packages/contracts/src/mcp/tool-inputs.ts:45,98-101` -- ImportSourceDocument input re-derived from request fields (no fileHash, no filePath); DeleteCardSourceLink chunkId
- `packages/contracts/src/migration.test.ts:170`, `mcp/tool-inputs.test.ts:37` -- schema tests to update
- `packages/importers/src/markdown/import-markdown.ts:41-72` -- splitMarkdownIntoChunks (latest-heading only, no fence tracking) → heading stack + fence awareness
- `packages/importers/src/txt/import-txt.ts:1` -- splitTextIntoChunks (paragraph#N; keep)
- `packages/importers/src/index.ts`, `src/{docx,pdf,xlsx,images}/*.ts` -- stubs to delete; `package.json:14-23` mammoth/pdf-parse/xlsx/@types/pdf-parse to remove
- `apps/server/src/services/prepare-source-document-import.ts:4` -- add fileHash computation
- `apps/server/src/application/source-document/source-document.use-cases.ts:19` -- passes prepared input; return type already ImportSourceDocumentResponse
- `apps/server/src/mcp/tools/register-content-tools.ts:13-15` -- MCP handler runs prepareSourceDocumentImport before the use case
- `apps/server/src/http/routes/source-document-routes.ts:19-35` -- 201 → 201 imported / 200 unchanged
- `packages/db/src/repositories/sources-repository.ts:15-54` -- importSourceDocument: random ids, hash inside UoW, no dedup → dedup lookup + derived chunk ids + status
- `packages/db/src/schema/tables.ts` (sourceDocuments) -- unique index definition; `packages/db/src/connection.ts:40,416` -- migrate(): dedup transition + CREATE UNIQUE INDEX (pattern at 416)
- `apps/web/src/app/api.ts:565-566` -- importSourceDocument return type (+status)
- `apps/web/src/features/source-documents/SourceDocumentsPanel.tsx:19-31` -- unchanged notice + error alert (role="alert" pattern used across panels)
- `apps/web/src/ui-strings/index.ts:320-329` -- panelStrings (add unchanged string)
- `apps/server/src/mcp/http.test.ts:62,78-104` -- MCP inline-only + hash-over-raw-content assertions; `mcp/tools/complete-surface.test.ts:76,275` -- response shape (+status)
- ~20 direct `repository.importSourceDocument({...})` call sites in packages/db tests, `packages/db/src/fixtures/archive-demo.ts:17`, apps/server services/mcp tests -- add fileHash

## Tasks & Acceptance

- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `mcp/tool-inputs.ts` -- add sha256HexSchema; restrict sourceDocumentSchema.type to markdown/txt; chunk/link ids → hex; prepared schema +fileHash with request fields restructured so the MCP input derives inline-only without fileHash; response +status -- single schema source, all consumers updated together
- [x] `packages/importers/src/markdown/import-markdown.ts` + its test -- fence-aware heading stack; locator `<heading path>#<1-based global block ordinal>` (path joined " > ", pre-heading `paragraph#N`); extend tests: nesting, repeated headings, lists, tables, fences, CRLF stability
- [x] `apps/server/src/services/prepare-source-document-import.ts`, `application/source-document/source-document.use-cases.ts`, `mcp/tools/register-content-tools.ts` -- compute fileHash in prepare on both transports; use case/core never read files
- [x] `packages/db/src/repositories/sources-repository.ts`, `schema/tables.ts`, `connection.ts` -- dedup lookup by (projectId, type, fileHash) inside the UoW; unchanged → existing rows + status; new → derived chunk ids, activity only on import; catch SQLITE_CONSTRAINT_UNIQUE on insert → re-read and return unchanged; migrate(): delete duplicate documents keeping the oldest per key, then CREATE UNIQUE INDEX IF NOT EXISTS (AD-9 in-place)
- [x] `packages/importers/src/index.ts`, delete `src/{docx,pdf,xlsx,images}/`, `package.json` -- remove stubs and mammoth/pdf-parse/xlsx/@types/pdf-parse; `corepack pnpm install` for the lockfile
- [x] `apps/web/src/app/api.ts`, `features/source-documents/SourceDocumentsPanel.tsx`, `ui-strings/index.ts` -- typed +status response; unchanged notice (role="status") and import error alert (role="alert"); preserve the existing flow
- [x] Update affected tests: contracts schema tests, ~20 direct repository call sites (+fileHash), complete-surface/http MCP response shapes -- typecheck-driven

**Acceptance Criteria:**
- Given Markdown with nested, repeated headings, lists, tables and fences, when imported, then every chunk carries the correct heading-path/block locator and repeated (documentId, locator) input yields identical chunk ids.
- Given identical content in two projects, when imported, then locators match while document/chunk ids and project ownership differ.
- Given identical project/type/hash, including back-to-back imports, when repeated, then the existing document/chunks return with status "unchanged" and no duplicate domain rows or activity exist.
- Given changed content with linked old chunks, when imported, then a new immutable document exists and the old document/links remain untouched.
- Given unsupported input, when imported via HTTP or MCP, then rejection lists markdown/txt and no docx/pdf/xlsx/image stubs, exports or dependencies remain in source, manifest or lockfile.
- Given UI, use-case and real MCP imports, when verified, then supported imports work end to end, MCP rejects file paths, human file preparation precedes SQLite, and LF/CRLF/nested/repeated/fenced cases pass.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 39 findings — high 0, medium 4, low 28, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: migration cascade deletes links of duplicate documents — AD-9/Design Notes prescribe keeping the oldest and cascading; intent excludes re-pointing prototype data.
  - `[false]` `[reject]` Blind: migration not transactional/versioned — duplicates are removed before the index is created, so index creation cannot fail on them; statements are idempotent.
  - `[low]` `[reject]` Blind: legacy UUID chunk ids and old types fail new schemas — intent: dev databases disposable, no migration of prototype projects.
  - `[low]` `[reject]` Blind: repository trusts caller fileHash — hash contract is prepare-before-UoW by design; both transports use prepare; guard adds complexity.
  - `[low]` `[reject]` Blind: parsed content then raw input fields — values identical, cosmetic.
  - `[low]` `[reject]` Blind: SQLITE_CONSTRAINT_UNIQUE catch likely dead — spec task requires it as the race guard; fix would edit spec.
  - `[low]` `[reject]` Blind: loose error-shape check in catch — narrow code check, rethrows otherwise; negligible.
  - `[low]` `[reject]` Blind: unchanged import ignores new title/filePath — intent: unchanged returns the existing document.
  - `[low]` `[reject]` Blind: hash not byte-exact for file reads — utf8 decode before hashing predates this story.
  - `[medium]` `[patch]` Blind: heading regex strips trailing `#` without whitespace ("# Learn C#" becomes "Learn C") — regex now `(.+?)(?:\s+#+)?\s*$`, regression test added.
  - `[false]` `[reject]` Blind: chunk ids not stable across changed content — intent: changed content creates a new immutable document.
  - `[low]` `[patch]` Blind: chunk-id formula duplicated in importMarkdownDocument, unused `index` param — deleted the caller-less importMarkdownDocument/ImportedDocument and the unused param.
  - `[false]` `[reject]` Blind: isEntityId/affectedEntityIds loosened — chunk ids (previously uuids) must stay in affected ids; project-scopes resolves by key without uuid validation.
  - `[false]` `[reject]` Blind: removal of stubs/dependencies and missing docs — intent mandates removal; AGENTS.md "reserved" wording stays accurate.
  - `[low]` `[reject]` Blind: UI stale notice on project switch/no success feedback — cosmetic, fix adds state handling.
  - `[low]` `[patch]` Blind: mis-indented fixture lines in complete-surface.test.ts — re-indented.
  - `[low]` `[reject]` Blind: missing tests for empty file, concurrency, large documents — pre-existing behaviors, fix adds guards/tests of no everyday impact.
  - `[medium]` `[defer]` Edge: chunks ordered by locator string — pre-existing orderBy; deferred.
  - `[low]` `[reject]` Edge: fileHash not checked against content — duplicate of the hash-trust finding.
  - `[low]` `[reject]` Edge: legacy chunk ids/types after migration — AD-9, as above.
  - `[low]` `[reject]` Edge: duplicate cleanup deletes links — as above.
  - `[medium]` `[patch]` Edge: trailing `#` heading regex — same root cause as the Blind regex finding; patched together.
  - `[low]` `[reject]` Edge: empty-title heading enters stack — mirrors prior behavior, cosmetic path.
  - `[false]` `[reject]` Edge: unterminated fence swallows rest — matches CommonMark semantics.
  - `[low]` `[reject]` Edge: backtick opener with backticks in info string — CommonMark corner case; fix adds a branch.
  - `[low]` `[reject]` Edge: unchanged drops new title/path — intent.
  - `[false]` `[reject]` Edge: chunk UNIQUE error returns partial document as unchanged — locators are unique per document so chunk-id collisions are unreachable.
  - `[low]` `[patch]` Edge: importMarkdownDocument duplicates chunk-id rule and has no callers — fixed with the Blind duplicate finding.
  - `[low]` `[reject]` Edge: utf8 decode before hashing — pre-existing.
  - `[low]` `[reject]` Edge: TXT now LF-normalizes, Design Notes say otherwise — behavior matches the intent CRLF row; fix would edit the spec.
  - `[low]` `[reject]` Edge: migration leaves legacy ids — AD-9.
  - `[low]` `[reject]` Gap: legacy UUID chunk ids rejected by link schemas, untested — intent excludes migration of prototype projects.
  - `[low]` `[defer]` Gap: SourceDocumentsPanel notice/alert have no render test — server contract covered; recorded in deferred.
  - `[medium]` `[patch]` Gap: heading regex trailing `#` — same root cause as above; patched.
  - `[low]` `[reject]` Gap: catch branch dead and untested — spec-required race guard.
  - `[low]` `[reject]` Gap: migration drops links — as above.
  - `[low]` `[reject]` Intent: matrix rows tested at different surfaces (no LF/CRLF pair, MCP docx asserts code only) — behavior covered by existing assertions; negligible.
  - `[false]` `[reject]` Intent: MCP path shares prepare containing readFileSync — strict MCP schema excludes filePath and requires content, so the read is unreachable.
  - `[low]` `[reject]` Intent: repository trusts hash, no mismatch test — duplicate of the hash-trust finding.

## Design Notes

- Chunk identity: document id stays randomUUID (allocated once, immutable); chunk id = sha256(`${documentId}:${locator}`) hex — deterministic per document, no UUIDv5 dependency.
- Markdown locator: `<heading path>#<1-based global block ordinal>`; heading path = ancestor titles joined by " > "; content before any heading keeps `paragraph#N`. The global ordinal is unique per document, so repeated headings never collide; documents are immutable, so locators stay stable for the document's life.
- LF/CRLF: hash is byte-exact over supplied content (existing contract, asserted in http.test.ts); Markdown chunk text is LF-normalized by the splitter and TXT keeps original in-paragraph line endings (both existing). CRLF/LF twins therefore deduplicate as distinct documents with identical locators.
- Unchanged is a no-op: no activity row, no version effects (source documents are not versioned roots), HTTP 200.
- Startup transition (AD-9 pre-tag, dev DBs disposable): before creating the unique index, delete duplicate documents keeping the oldest per (project_id, type, file_hash); chunks and their card links cascade. Idempotent no-op on clean databases.
- MCP input is re-derived from the request field set (inline-only, strict) so agents never send fileHash or filePath; both transports run the same prepare step before the use case.

## Verification

**Commands:**
- `corepack pnpm --filter @storymapper/contracts test` -- expected: pass (schema + migration tests)
- `corepack pnpm --filter @storymapper/importers test` -- expected: pass (locator/fence/CRLF cases)
- `corepack pnpm --filter @storymapper/db test` -- expected: pass (dedup, cross-project, changed-content cases)
- `corepack pnpm --filter @storymapper/server test` -- expected: pass (HTTP + real /mcp acceptance)
- `corepack pnpm --filter @storymapper/web typecheck` -- expected: pass
- `node scripts/verify.mjs` -- expected: Git/source hygiene, typecheck and build pass
- `git diff pnpm-lock.yaml` -- expected: only mammoth/pdf-parse/xlsx/@types-pdf-parse removals

## Auto Run Result

Status: done

**Summary:** Markdown/TXT source imports now hash prepared content before the UoW, deduplicate on (project, type, hash) behind a unique index (HTTP 201 imported / 200 unchanged), derive chunk ids as sha256(documentId:locator), and chunk Markdown with a fence-aware heading path plus a global block ordinal. DOCX/PDF/XLSX/image stubs and their dependencies are removed.

**Follow-up review pass changes (this pass):**
- `packages/importers/src/markdown/import-markdown.ts` -- heading regex keeps trailing `#` that is part of the title; removed caller-less importMarkdownDocument/ImportedDocument.
- `packages/importers/src/markdown/import-markdown.test.ts` -- regression test for "Learn C#" and closing `##`.
- `packages/db/src/repositories/sources-repository.ts` -- dropped unused map index.
- `apps/server/src/mcp/tools/complete-surface.test.ts` -- fixture indentation.

**Review findings:** 39 reported -- patches applied: 4 entries (heading regex medium x4 rows, duplicate chunk-id/dead export low x2 rows, indentation low); deferred: 2 (locator ordering medium, panel render test low); rejected: all others, each with reason in the Review Triage Log (7 false, 25 low).

**Follow-up review recommended:** false (follow-up pass; no high patched; patched: 0 high, 4 medium rows sharing one root cause, 3 low).

**Verification:** contracts (50), importers (7), db (252), server (392 + 5 audit-performance) tests pass; web typecheck passes; `node scripts/verify.mjs` completed; lockfile diff is 191 deletions only.

**Residual risks:** pre-existing locator-string chunk ordering (deferred); UI notice untested; legacy prototype databases with UUID chunk ids are unsupported by design (AD-9).
