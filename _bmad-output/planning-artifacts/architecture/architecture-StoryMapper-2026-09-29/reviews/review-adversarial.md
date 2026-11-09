# Adversarial review: ARCHITECTURE-SPINE.md (Agentic Story Mapper v1.0)

Method: each finding names two units that obey every AD literally and still diverge, then gives the tightening text. Code evidence is from commit 5e4a647 (working tree). "Unit" = a story, epic or developer one level below the spine.

Verdict: the spine fixes layering well but leaves the write path, actor identity, restore, version counters and the ChangeSet vocabulary underspecified enough that two conforming epics (T3 tool completion and T4 agent planning) would ship incompatible mutation paths; 6 critical and 8 high holes need new or tightened ADs before epics start.

Severity count: critical 6, high 8, medium 8, low 4.

---

## Critical

### F-01 Agent can approve or apply its own ChangeSet; nobody owns "who approves" (critical)
- ADs: AD-4, AD-5, AD-2 (human-only list = "privacy settings, secrets" only).
- Unit A (T3, FR-30) adds `ApproveChangeSet`, `RejectChangeSet`, `ApplyChangeSet` as MCP tools with a use case each. Today `ApplyChangeSet` is already an MCP tool (`packages/mcp/src/tool-definitions/tools.ts`, permission "write").
- Unit B (T4) implements AD-5 literally: "With agentProtection on, every writing tool behaves as apply=false". Apply is a writing tool, so under protection it becomes a stored proposal of an apply, or, if exempted, applies directly.
- Collision: either the agent approves its own proposal in one call (protection void) or approval recurses into "proposed ChangeSet of an approval". Both conform. Also unspecified: a ChangeSet proposed while protection was off and approved after it was switched on.
- Fix, add to AD-5: "Approve, reject and apply of a ChangeSet, restore, and all settings are human-only use cases with no MCP tool, except `ApplyChangeSet` for a ChangeSet already in state `approved` by a human actor while `agentProtection` is off. The executor stores `proposedBy` and `approvedBy` and rejects approval where the approver is the proposing agent. `agentAccess` and `agentProtection` are read inside the applying transaction, not at request entry."

### F-02 Agent identity is derived from the transport; the flags are not a boundary (critical for AD-5)
- ADs: AD-5, AD-11, AD-12.
- AD-12: no token, same-user processes trusted, requests without `Origin` pass. Agent hosts (Claude Code CLI, Codex) run as the same user with a shell. They can `curl` `PUT /api/.../settings`, card routes or `POST /api/mcp/call` as "human" and skip `agentProtection`, `agentAccess` and ChangeSets entirely. Routes today (`apps/server/src/http/routes/index.ts`, 1,270 lines) call the repository directly; `logActivity` hardcodes actor `local-user`/`human`.
- Unit A (HTTP adapter) resolves actor = human for `/api/*`. Unit B (MCP adapter) resolves actor = agent for `/mcp`. Both conform; the flags protect against nothing an agent with a shell would do.
- Fix, prepend to AD-5 Rule: "`agentProtection` and `agentAccess` are guardrails against a cooperative agent using the tool surface, not a security boundary against a local process. The actor is `agent` iff the request arrived on `/mcp` or `/api/mcp/call`; every other route is `human`. This statement is repeated in the Agent panel and README. If a boundary is wanted, add a per-launch nonce (printed by `start.mjs`, injected into the served index.html, required on `/api` mutations, rejected on `/mcp`) and accept that an agent able to read the page can still obtain it; claim no more." Decide now; T3 and T7 otherwise assume different models.

### F-03 Restore: file swap versus open connections, in-flight work, audit trail, SSE sequence (critical)
- ADs: AD-7, AD-3, AD-10, AD-11.
- Code: `buildServer()` opens one `db`, builds `StoryMapperRepository(db)` once, and every route closure captures it. "Swaps the file, reopens it" leaves every captured repository on a closed handle unless something replaces them.
- Unit A (T2) writes `restoreSnapshot()` in `packages/db` that closes, renames, reopens and returns a new handle to nobody. Unit B (T3/T4) keeps constructor-injected repositories (DI rule). Both conform; after restore the use cases hit a closed database.
- Further collisions inside AD-7:
  1. Windows cannot rename an open SQLite file; stale `-wal`/`-shm` files next to the swapped file corrupt the restored database.
  2. In-flight async use cases (GitHub sync, import) finish after the swap and write into the wrong file or throw.
  3. Activity Log and ChangeSet tables live in the same file, so restore erases the record of the very agent action being undone and everything since (FR-33, FR-37); `project.restored` is the only trace.
  4. The SSE sequence lives in that table: it rewinds, so clients reconnecting with `Last-Event-ID` 500 to a table whose max is 300 miss new events until 500 is passed (see F-08).
  5. GitHub side effects are not restored: a card pushed after the snapshot loses its local link while the issue exists; next push creates a duplicate.
  6. Attachments and documents on disk are outside the snapshot; `card_attachments` rows and files diverge both ways.
  7. Crash between rename and WAL deletion leaves an unbootable project.
  8. A snapshot from a newer schema is refused only after the swap under the current wording.
- Fix, replace the restore sentence of AD-7: "Restore is one use case in `application/snapshots` guarded by the write gate (F-04). Order: (1) validate before touching anything: `PRAGMA integrity_check`, schema version not newer than the application, else refuse without swapping; (2) reject new requests with 503 and wait until in-flight use cases drain; (3) create the pre-restore snapshot; (4) close the connection, copy the snapshot to `storymapper.sqlite.restoring`, delete `-wal` and `-shm`, rename over the database; (5) reopen through a `DatabaseHandle` holder that repositories dereference per call (never a captured raw handle), migrate forward; (6) copy `activity_events` and `change_sets` rows newer than the snapshot into the restored database flagged `undone_by_restore`; (7) emit `project.restored` with a new `epoch`. A leftover `.restoring` file at startup is completed or rolled back deterministically. Restore does not touch remote systems; its result lists GitHub links created after the snapshot. Attachments are never deleted by a restore."

### F-04 AD-3 "one transaction" is neither implementable nor enforceable as written (critical)
- ADs: AD-3, AD-4, AD-7, AD-1.
- better-sqlite3 transactions are synchronous; use cases that call GitHub or importers are async. A read-await-write use case checks `baseVersion` before the await, which is stale after it. GitHub push cannot be one transaction (network writes, then row writes).
- Code today: `archiveCard`, `deleteCard`, `parkCard` do several `db.update` calls plus a separate `logActivity` with no transaction; `logActivity` hardcodes the actor. Nothing in AD-3 makes this fail CI.
- Two conforming units: A puts the transaction inside each repository method; B writes `applyChangeSet` as an async use case calling repository methods one by one, each its own transaction, then claims atomicity with an outer `db.transaction` that only nests if every inner call shares the handle. Both pass review.
- Snapshot-then-apply gap: `VACUUM INTO` cannot run inside a transaction, so "snapshot before apply" and "apply in one transaction" are two steps; a human edit between them is in the DB but not the restore point and is lost silently by restore.
- Fix, replace AD-3 Rule: "All mutations run through `unitOfWork.run(actorContext, fn)` in `packages/db`. `fn` is synchronous, receives `Tx`-bound repositories and performs no I/O other than SQLite. Repository write methods are reachable only through `Tx`; a repository built from the root handle exposes reads only. `actorContext` (actor type, actor id or host, MCP session id) is a required parameter of every use case and of `unitOfWork.run`; repository code never defaults an actor. Reads that inform a write and the base-version check happen inside `fn`. Network I/O happens before (planning) or after (recording) the transaction. A use case with external side effects writes a `planned` row per item, performs the effect, then records the result per item in a further transaction. One in-process write gate serializes every `unitOfWork.run`, snapshot and restore. CI fails if a module outside `packages/db` imports `better-sqlite3` or `drizzle-orm`, and a test fails if a mutating repository method runs without an active `Tx`."

### F-05 ChangeSet operations are untyped, cannot express half of FR-30, and preview and apply are two implementations (critical)
- ADs: AD-4, AD-15, AD-9.
- Code: `changeOperationSchema` has `entity` enum of 6, `op` enum of 7 and `before/after: z.unknown()`. `applyChangeSet` in the repository whitelists five `op:entity` keys and parses `after` with `asString/asRecord`. Contracts do not define the payload, contradicting AD-15.
- Not expressible today and not covered by AD-4: Roadmap and children (columns, swimlanes, cards, references), Annotations, Workflow Statuses, Story Templates, Product Context, card-persona and card-annotation links, attachments, park/un-park, restore from archive, unassign release, set/unset external reference, bulk status by external reference (FR-56), sibling reorder, permanent delete with child strategy, create Story Map. FR-30 lists agents writing these; FR-51 requires "every writing agent tool" to build a ChangeSet.
- Collision A: T3 completes tools for Annotations, finds no operation, writes directly (protection bypassed). Collision B: T4 adds Card operations only and calls the rest out of scope. Both conform because "every writing tool builds a ChangeSet" is untestable without an operation registry.
- Duplicate domain logic already exists: `assertParentAllowed` with its own `allowed` level map in `storymapper-repository.ts` versus `packages/core/src/story-map/hierarchy.ts`; sibling reindexing (`reindexSiblings`, `placeSameLevelAtIndex`) lives in the repository, so a pure `previewChangeSet` in core must re-implement position results or diverge from apply.
- Resolution timing: AD-9 "resolves to create or update at preview time". A ChangeSet proposed on day 1 (ref absent, so `create`) and another from the agent's re-run on day 2 (also `create`) both apply: duplicate or unique violation half way, which after review fails the whole atomic apply.
- Ordering: "dependents fall with them" is undefined. Unit A: only local-reference children. Unit B: also later operations on the same entity and moves under a created parent. Different operation sets get applied.
- Fix, add AD-4a "Operation registry": "`ChangeOperation` is a discriminated union on `(op, entity)` in contracts with a typed payload per member; `z.unknown()` payloads are forbidden. Each member has exactly one handler pair in `core`: `describe(snapshot, op)` (preview) and `resolve(snapshot, op)` returning the resulting entity changes (pure; positions and hierarchy validation included). `packages/db` persists resolved changes only, contains no operation semantics and no second hierarchy check. A writing use case without a registry member fails the parity test. Operations apply in array order; dependents of an operation are every later operation that references its local id or addresses the same entity or a descendant. External-reference upserts are stored as `upsert` operations and resolved to create or update inside the applying transaction; preview shows the current resolution and marks it 'may change'. Two proposed ChangeSets touching the same external reference are flagged at proposal time. Every `change_sets` row carries `operationsSchemaVersion`; a migration that changes operations rewrites `proposed` rows or marks them `stale`."

### F-06 GitHub import and sync mutate local Cards outside ChangeSet, versions and protection (critical)
- ADs: AD-4 ("GitHub push is not a ChangeSet"), AD-5, AD-14; AGENTS.md policy "External, GitHub, AI or agent-driven changes produce a ChangeSet first".
- `ImportGitHubIssues`, `SyncGitHubLinks`, `PullStoryMapGitHubLinks` are MCP tools (permission `github`) that create or update Cards (`apps/server/src/services/work-item-sync.ts`).
- Unit A treats them as "GitHub use cases": not a writing tool under AD-5, no ChangeSet, no restore point. Unit B treats them as writing tools and routes them through ChangeSets. Under `agentProtection=on` an agent calling sync changes the map with no preview, while AD-4 says agent writes are ChangeSets.
- `sync_conflicts` (persisted), HTTP 409 `conflict` (version) and ChangeSet status `conflict` are three unrelated conflict mechanisms with no interaction rule (agent sets status via FR-56 while sync pulls the remote status).
- Fix, tighten AD-4 and AD-14: "Any mutation of Story Map data whose actor is not `human` (agent, GitHub import or pull-sync, importer) is a ChangeSet, including the local half of a GitHub import or sync. Pull-sync creates a ChangeSet with actor `github` that takes a restore point and bumps versions like any apply, and is subject to `agentProtection` when an agent triggered it. GitHub push remains its own use case and writes only link and sync-state rows, never Card fields. Precedence: a version conflict aborts the operation; a sync conflict is persisted and blocks the field until resolved; both are reported through one `ConflictReport` contract."

---

## High

### F-07 Version counters: at least seven readings of AD-6 (high)
- ADs: AD-6, AD-3, AD-4.
- Code: cards carry `updated_at`; the operation schema has `baseUpdatedAt`; history version is `rows.length + 1` (`writeCardVersion`); `card_versions` cascades on card delete.
- Collisions:
  1. `Card.version` (counter) versus `card_versions.version` (row count): unit A writes counter+1, unit B keeps count+1; they diverge after any history deletion or import.
  2. What counts as a root mutation: `reindexSiblings` rewrites the position of every sibling. Bump all siblings (every drag conflicts with any agent edit under that parent) or none (position lost update)? Cascades such as `deleteRelease` nulling `release_id` and `ON DELETE SET NULL` bypass use cases entirely and bump nothing.
  3. Does a Card change bump `StoryMap.version`? If yes it is a hot counter and any `UpdateStoryMap` with a base version conflicts on every card edit; if no it cannot be a cache validator.
  4. Non-root entities (annotations, workflow statuses, templates, product context, roadmap children, links) have no version; ChangeSets over them have no base check.
  5. Two operations on one object in one ChangeSet: op 1 raises v3 to v4, op 2 carries base 3 and self-conflicts.
  6. Conflict handling: apply "reports conflicts" but is atomic; may the user deselect the conflicting operation and apply the rest, or does one conflict abort everything? UI and executor each pick one.
  7. Two tokens coexist in contracts (`baseUpdatedAt`, `baseVersion`).
- Fix, replace AD-6 Rule: "Versioned roots: Story Map, Card, Release, Persona, Roadmap (aggregate register, F-11). A root's `version` increments by exactly 1 in the transaction that changes the root row or any owned child row or link. Sibling position changes bump only the moved card. Foreign-key cascades never touch versioned roots: `ON DELETE SET NULL`/`CASCADE` from or to versioned roots is replaced by explicit use-case code that bumps versions. Story Map `version` changes only on Story Map fields. `card_versions.version` equals `cards.version`, unique `(card_id, version)`. `baseVersion` is checked once per object against the state before the ChangeSet starts; later operations on the same object are not re-checked. A conflict result lists every conflicting operation; the executor never applies a partial set, the user deselects and resubmits. `baseUpdatedAt` is removed from contracts. Children without their own version are protected by their root's version."

### F-08 SSE: unordered ids, restore rewinds the sequence, storm, self-echo (high)
- ADs: AD-10, AD-3, Consistency Conventions (ids UUID v4).
- `Last-Event-ID` replay needs a total order. Activity Event ids are UUID v4 and timestamps are assigned before commit; two transactions can commit opposite to their timestamps, so replay `WHERE created_at > x` skips one. Unit A orders by `created_at`, unit B by rowid; both conform.
- Restore rewinds the sequence (F-03).
- A 30-Story ChangeSet emits 30+ events; each makes the web invalidate and refetch the whole map (1,000 Cards) with a synchronous better-sqlite3 read on the one event loop (F-13).
- The editor's own write returns as an event, invalidates the query and resets Tiptap state under the typing user; events carry no originator.
- Chromium allows six HTTP/1.1 connections per origin; six tabs each holding one SSE stream starve API calls. `fastify.close()` hangs on open SSE streams.
- Fix, replace AD-10 Rule: "`activity_events` has a monotonically increasing integer `seq` (INTEGER PRIMARY KEY AUTOINCREMENT) assigned inside the transaction; the SSE `id` is `<epoch>:<seq>`. `epoch` is created with the database and regenerated by restore; a client with a different epoch receives `reset` and refetches everything. One SSE message per transaction lists `{entityType, entityId, version}` tuples plus `originClientId` (a header the web app sends with every mutating request). The web app ignores its own `originClientId` for editors holding unsaved local state and coalesces invalidations over 100 ms. The stream sends a heartbeat every 15 s and closes on shutdown. The web app holds one stream per browser profile (BroadcastChannel leader) or the server caps concurrent streams."

### F-09 External references: uniqueness, archive, delete, NULL scope, GitHub double bookkeeping (high)
- ADs: AD-9, AD-4, FR-49, FR-52, FR-54.
- Collisions:
  1. Unique `(story_map_id, entity_type, system, external_id)`: SQLite treats NULLs as distinct, so project-level Personas (`story_map_id` NULL in the schema) duplicate freely. The stated invariant "at most one reference per system per entity" needs a second unique `(entity_type, entity_id, system)`.
  2. `entity_id` is polymorphic and cannot carry a foreign key: deleting a Card orphans the row; a later upsert resolves to a nonexistent entity and the apply fails after review.
  3. Archived Cards keep their reference. Re-run after archive: unit A resolves to the archived card and updates it (stays archived; agent thinks it is live), unit B treats archived as absent and inserts, violating the unique key. FR-54 requires re-runs "without duplicates" and archiving of removed cards.
  4. `system` is a free string for agents, but GitHub identity already lives in `remote_work_item_links` and `github_links` (`remote_id`, `issue_number`). An agent writing `system=github` collides with the sync layer; two sources of truth per issue.
  5. `external_id` normalisation (case, whitespace, BMad ids `1.2` vs `1.02`) is unspecified.
  6. `story_map_id` is redundant per row; a Card move between maps leaves it stale.
- Fix, replace AD-9 Rule: "`external_refs(id, entity_type, entity_id, system, external_id, scope_id NOT NULL, created_at)` where `scope_id` is the Story Map id, or the Project id for project-level entities, never NULL. Unique `(scope_id, entity_type, system, external_id)` and unique `(entity_type, entity_id, system)`. `system` `github` is reserved and written only by the GitHub adapter (GitHub links move into this table; `remote_work_item_links` keeps only sync state keyed by `external_refs.id`); agent systems match `[a-z0-9-]+`. `external_id` is trimmed and case-sensitive; the recipe defines the id. A reference is deleted by the use case that deletes the entity, in the same transaction; archive keeps it. Upsert onto an archived entity resolves to `update` plus an implicit `unarchive` shown in the preview. A Card cannot change Story Map; a cross-map move is copy plus archive."

### F-10 Single-writer concurrency, second processes, external side effects (high)
- ADs: AD-11 ("a second writer"), AD-3, AD-7.
- Nothing prevents a second writer: two `start` runs on different ports with the same project folder, the Python CLIs in `tools/` (github-board-import writes local Agentic Story Mapper data), `doctor`, an archive import while the server runs. AD-11 claims to prevent a second writer but its Rule only covers ports.
- better-sqlite3 is synchronous: a 1,000-Card snapshot read or a 200-operation apply blocks the event loop, so SSE heartbeats, the 503 gate and MCP requests stall. No `busy_timeout` or checkpoint policy is stated.
- GitHub push: a crash after issue 6 of 12 leaves `sync_runs.planned`, 6 remote issues and no local links; a retry duplicates them.
- Fix, add to AD-11: "The server takes an exclusive lock on `<project>/.lock` (PID, start time) before opening the database and refuses to start when it is held. Other tools use the HTTP API only; no script opens the SQLite file for writing. `busy_timeout` and WAL auto-checkpoint are set. Work expected to exceed 100 ms of synchronous time runs on a worker thread with its own read-only connection, or is chunked where ChangeSet atomicity allows. Push records an intent row per issue before the call and reconciles by label or marker on retry before creating."

### F-11 No aggregate register: shared children have two owners, repository list incomplete (high)
- ADs: AD-6, AD-16, ER diagram.
- The repository split lists cards, releases, personas, roadmaps, sources, sync, changesets, activity, settings, snapshots. Unowned: annotations, workflow statuses, story templates, product context, connections, attachments, card versions, external refs, card-persona and card-annotation links. The ER diagram omits Roadmap children, Persona scope (project or map), Annotation, Template, Product Context.
- Collision: the card-persona link is written by the `cards` repository (T5 board) and by `personas` (T3 tools); each bumps a different root's version, or neither. `workflow_statuses` with `story_map_id NULL` (project default) versus a map override: two developers implement fallback resolution differently.
- Fix, add AD-20 "Aggregate register": "A table in the spine lists per aggregate: root table, owned child tables, owning repository and use-case folder, versioned yes/no, ChangeSet entity name, external-ref eligible, history (Card Version or none), scope (project or story map). A table without a row fails a schema-classification test (also used for archive redaction, F-12). A link table belongs to the aggregate that renders it and bumps that root."

### F-12 Migrations: cascade data loss, stored JSON shapes, retention, archive redaction (high)
- ADs: AD-8, AD-7, AD-13, FR-46.
- Drizzle-kit generates SQLite table rebuilds (create new, copy, drop old, rename). `PRAGMA foreign_keys` is a no-op inside the migrator's transaction, so `DROP TABLE cards` with `foreign_keys=ON` cascades into `card_personas`, `card_annotations`, `card_versions`, `card_source_links`, `github_links`. Fresh-install tests on empty databases stay green.
- Backfills (`version` from history, external refs from links, `seq`) cannot be "drizzle-kit generated SQL", yet AD-8 permits only generated files.
- JSON columns have no schema version: `change_sets.operations_json`, `card_versions.snapshot_json`, `activity_events.before_json/after_json`. After a migration adds fields, history views and pending ChangeSets fail to parse against the current Zod schema.
- Retention "newest N and a size cap": 20 ChangeSet applies evict the only pre-migration snapshot; a snapshot larger than the cap is dropped immediately.
- Archive redaction is a hardcoded four-table list in `packages/db/src/snapshot.ts`; a new table (GitHub refs, sync intents) ships unredacted. The manifest carries `formatVersion` but no schema version; `APP_VERSION` is hardcoded `0.1.0`.
- The maintainer's existing `default.lsm` (built with `CREATE TABLE IF NOT EXISTS` and `ensureColumn`) has no migration journal: migration 0000 fails with "table exists" unless refused explicitly.
- Fix, extend AD-8 and AD-7: "Every migration runs with `foreign_keys=OFF` outside the migrator transaction, followed by `PRAGMA foreign_key_check` and abort on any violation. CI runs each migration against a populated fixture database of the previous schema and asserts row counts per table. Data backfills use `drizzle-kit generate --custom`; hand-written DDL stays forbidden. Every JSON-bearing column has a `schemaVersion` sibling and readers use versioned parsers. Snapshots are classed `pre-migration`, `pre-restore`, `pre-apply`, `manual`; retention keeps the newest N per class, always pins the newest `pre-migration` and `pre-restore` until a later one succeeds, and the size cap never deletes the last snapshot of a class. Snapshot file names carry the schema version. A database with tables but no migration journal is refused with instructions to export from the old version. `redactedTables` is exported from `packages/db` next to the schema and the classification test (F-11) fails on any unclassified table. The archive manifest carries `schemaVersion` and the app version from `package.json`."

### F-13 The 1,000-Card budget is a test fixture, not an architectural constraint (high)
- NFR-1 appears only in the Testing row. Nothing constrains payload shape, indexes or event-loop use.
- The schema has no secondary indexes (cards by `story_map_id`, `parent_id`; refs; activity by seq). `nextCardNumber` loads every card of the map to compute a max on each create (`storymapper-repository.ts`), so a 200-operation ChangeSet is O(n squared). The map read returns the whole map on every invalidation.
- Unit A (T5 views) filters client-side over the full snapshot; unit B (T3 tools) adds server-side filtered reads; neither meets the 300 ms filter budget during an invalidation storm.
- Fix, add AD-21 "Performance budget": "On the 1,000-Card fixture: map read at most 150 ms; single-card mutation at most 30 ms; 200-operation apply at most 2 s; restore point at most 1 s; board interaction 100 ms. Each is a Vitest budget test in CI with 2x tolerance. Hot-path columns are indexed in the migration that introduces them. Card Key allocation uses a counter column `next_card_number` on `story_maps`, never a scan, and keys are never reused (a deleted highest key is otherwise handed out again, silently rebinding GitHub labels and issue text). The map endpoint supports `If-None-Match` on a separate cheap aggregate revision that may bump on any card change (distinct from `version`, F-07), so an invalidation storm costs no payload."

### F-14 Preview computed on the client against a stale cache (high)
- ADs: AD-4 ("only preview implementation (web preview, apply=false replies, protection conversion)"), paradigm diagram (web -> core).
- The web importing `core` computes preview from its TanStack cache; the server computes it against the database for `apply=false`. They differ whenever the cache lags an SSE event or the tab was in the background. What the reviewer sees is not what apply checks. Same for slicing, coverage and health: the server report (FR-39) and a client recomputation can disagree.
- Fix, add to AD-4: "Preview is always computed on the server against database state and returned by `GET /api/changesets/:id/preview` and in `apply=false` replies; the web renders it and never calls `previewChangeSet`. The `web -> core` edge is limited to pure UI hints (drag validity) that are never authoritative."

---

## Medium

### F-15 Stateless stdio bridge versus MCP session id and "first write of a session" (medium)
- AD-11 "holds no state", AD-3 "MCP session id", AD-7 "at the first write of an MCP session".
- Streamable HTTP identifies sessions by `Mcp-Session-Id`; a bridge that forwards each request without keeping the id yields a session per request (or none): either every write snapshots and evicts real restore points, or none does. Under `agentProtection` all writes are proposals; does storing one count as the "first write"?
- Fix: "The bridge keeps and forwards the `Mcp-Session-Id` it received (its only state). Activity events for actor `agent` require a session id; requests without one are rejected. Proposals never create a restore point; the first apply of a session does."

### F-16 Error contract stops at the JSON shape (medium)
- AD-15, Consistency "conflicts 409, disabled tool 403, restoring 503".
- Routes today return `{message}` with 400 and MCP tools throw `Error`; no code enumeration exists beyond the sentence. Each adapter maps errors itself (two tables to keep in sync). Validation, not found, constraint violation, migration required, lock held, hierarchy violation and size limits have no code.
- Fix, add to AD-15: "Use cases throw only typed `DomainError(code, details)` (codes enumerated in contracts with their HTTP status). One function `toErrorResponse(error)` serves HTTP and MCP; an unknown error is a 500 `internal` with a logged id and no message leakage. Multi-step failures (push, import) return a per-item result array, never one throw."

### F-17 `core` purity is unenforced for time and ids (medium)
- AD-1 lists core purity as `[ADOPTED]`, but `createChangeSet` and `createActivityEvent` in `packages/core` call `new Date()`, and the repository generates `randomUUID()`. Golden tests for preview and apply become nondeterministic, and preview of `create` cannot show final Card Keys.
- Fix, AD-1: "`core` imports no `node:*` module and calls no `Date`, `Math.random` or `crypto`; `Clock` and `IdSource` are injected. Preview shows placeholder keys `NEW-1..n`; real keys are assigned in the applying transaction."

### F-18 AD-2 parity test checks one direction only (medium)
- The manifest is hand-maintained: a use case missing from it passes; a tool wired to a different use case passes; a write use case without `ActorContext` passes.
- Fix: "Each use case file exports a descriptor `{name, kind: read|write|human-only, tool?, route?}`; the manifest is generated by scanning `application/**`. The parity test fails on an exported use case without a descriptor, on a `write` descriptor without an operation-registry member (F-05) or a tool, and on a route or tool that resolves to no descriptor."

### F-19 Tiptap autosave versus "editing any field creates a Card Version" (medium)
- FR-47/FR-50 and AD-3: each save writes a full JSON Card snapshot (including the Markdown description), an event and an invalidation (F-08). An autosaving editor produces dozens of versions per minute and self-conflicts (409) when its previous save is not yet reflected in its `baseVersion`.
- Fix: "Clients send the `version` returned by their previous save. The editor batches saves at most every 2 s. A save by the same actor within 60 s of the latest Card Version updates that version instead of adding one."

### F-20 Protection state read timing (medium)
- AD-4/AD-5: unit A reads `agentProtection` at request entry, unit B inside the apply. A flip between them applies a ChangeSet under protection; likewise `agentAccess` switched off during an in-flight `/mcp` call, and tool calls in flight during restore.
- Fix: covered by F-01 and F-03. Add test: "flag flip between proposal and apply" and "restore while a tool call is in flight".

### F-21 Operations and recovery are silent (medium)
- No statement on: log location and rotation (the current `<project>.lsm/logs` disappears from the spine's tree), a diagnostic endpoint for `doctor`, what the user does when the server refuses a newer database (AD-8 says "with instructions", without content), backup (snapshots live inside the folder they protect), graceful shutdown (checkpoint, close SSE), port discovery for the stdio bridge and generated host configs when the port is taken, Windows path length and antivirus locks during rename.
- Fix, add AD-22 "Operations": "Logs go to `<project>/logs/` with size rotation. `GET /api/health` returns version, schema version, epoch, write gate state and pending migration; `doctor` calls it. The server writes `<project>/.port` at start; the bridge and `doctor` read it. Shutdown order: stop accepting, drain, close SSE, checkpoint, close. Documentation names the manual recovery for every refusal state."

### F-22 Sibling and hierarchy semantics duplicated across layers (medium)
- Beyond F-05: `move` semantics (index vs neighbour, cross-parent, level constraints `activity > step > story`, `note` handling, `parked` flag) exist in the repository and in `core/hierarchy.ts`. T5 (drag and drop) and T4 (agent move operation) each extend the version they touch.
- Fix: covered by F-05 (`resolve` in core is the only implementation; the repository's `assertParentAllowed` and `placeSameLevelAtIndex` are deleted, and UI drag calls the same use case).

---

## Low

### F-23 Shared web components have no home (low)
- AD-17: one page component per View sharing components; `apps/web/src/components/` is `.gitkeep`, real components live in `features/story-map/components`. T5 and T6/T7 will duplicate modals. Add: "Cross-feature components live in `apps/web/src/components`; a feature imports another feature only through its `index.ts`; the AD-1 script enforces it."

### F-24 AD-12 leaves streaming endpoints implicit (low)
- The JSON content-type rule does not cover `GET /api/events` or `GET /mcp`. Cross-origin `EventSource` sends `Origin` (covered), but the AD should say so and require `Accept: text/event-stream` and the Host check on both endpoints.

### F-25 AD-19 "used import" is satisfiable by test-only imports (low)
- Count only non-test imports. Declare tool-only dependencies (`drizzle-kit`, Vitest) in the script's allow list so the script does not flag them.

### F-26 Contracts still carry `baseUpdatedAt` (low)
- See F-07 point 7; listed so the contracts epic removes the field explicitly.

---

## Enforceability verdict per AD

| AD | Enforceable as written? | Gap |
| --- | --- | --- |
| AD-1 | Partly | Import graph is checked. Core purity (time, ids, node builtins), SQL-only-in-db (better-sqlite3 and drizzle imports outside db) and feature-to-feature imports are not (F-04, F-17, F-23) |
| AD-2 | Partly | Parity is one-directional and the manifest hand-written (F-18) |
| AD-3 | No | Not implementable with async use cases and separate repository calls; no actor parameter; no CI check (F-04) |
| AD-4 | No | Untyped payload, duplicated preview and apply, resolution timing, undefined dependents, GitHub excluded (F-05, F-06, F-14) |
| AD-5 | No | Identity from transport, approval path, flag read timing (F-01, F-02, F-20) |
| AD-6 | No | Seven readings of version (F-07) |
| AD-7 | No | Live handles, audit erasure, side effects, retention, crash (F-03, F-12) |
| AD-8 | Partly | Table-rebuild cascade, backfills, stored JSON versions, legacy refusal (F-12) |
| AD-9 | No | NULL scope, orphans, archive, GitHub duplicate (F-09) |
| AD-10 | No | UUID ordering, epoch, storm, echo (F-08) |
| AD-11 | No | Second writer not prevented (F-10), bridge session state (F-15) |
| AD-12 | Yes | Minor (F-24) |
| AD-13 | Partly | Hardcoded redaction list; "no secret in events" has no test (F-12) |
| AD-14 | Partly | Reserved `system` namespace (F-09); sync conflict precedence (F-06) |
| AD-15 | Partly | Code enumeration and one mapping function absent (F-05, F-16) |
| AD-16 | Yes, with gap | Repository list incomplete (F-11) |
| AD-17 | Partly | Shared component home (F-23), preview location (F-14) |
| AD-18, AD-19 | Yes | Minor (F-25) |

## Silent dimensions
- Performance: no budgets, indexes, payload rules, event-loop blocking (F-13).
- Error handling: no code list, no single mapping function, no partial-failure shape (F-16).
- Concurrency of the single SQLite writer: no gate, no lock, sync-versus-async transaction problem (F-04, F-10).
- Operations: logs, health, shutdown, recovery, port discovery (F-21).
- Aggregates and ownership of shared children (F-11).
- Threat model for agent versus human on a loopback server (F-02).

## New or changed ADs, in priority order
1. AD-3 rewrite (unit of work, actor context, write gate, no I/O in transaction) - F-04.
2. AD-4a operation registry plus AD-4 changes (server-side preview, local half of GitHub import is a ChangeSet, upsert resolved at apply) - F-05, F-06, F-14.
3. AD-5 rewrite (threat model, human-only approvals, flags read in transaction) - F-01, F-02, F-20.
4. AD-7 restore protocol and snapshot retention classes - F-03, F-12.
5. AD-6 version semantics, AD-9 external reference schema, AD-10 sequence and epoch - F-07, F-09, F-08.
6. New AD-20 aggregate register, AD-21 performance budget, AD-22 operations; AD-8 and AD-11 tightening - F-10, F-11, F-12, F-13, F-21.
