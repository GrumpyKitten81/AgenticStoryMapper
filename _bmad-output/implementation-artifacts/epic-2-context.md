# Epic 2 Context: Project data you can trust

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->
<!-- Date: 2026-10-04. Version: 2. Purpose: compile Epic 2's goal, stories, requirements, technical decisions, UX patterns and dependencies from current planning artifacts into concise developer context. Changelog: refresh resolved one-Project archive scope and current-runtime import hot-switch. -->

## Goal

Make Project data dependable when humans and agents work together: changes commit completely with a named actor and consistent history, restore points recover unwanted changes, and portable archives preserve work across machines without exposing secrets.

## Stories

- Story 2.1: All-or-nothing changes attributed to an actor
- Story 2.2: Create and list restore points
- Story 2.3: Version counters on every editable root
- Story 2.4: Read a Card's history
- Story 2.5: Park, archive and delete as separate actions
- Story 2.6: Restore the Project to a restore point
- Story 2.7: Portable Project archive

## Requirements & Constraints

- Project folders preserve Story Maps, Cards, links and history across machines. Credentials stay outside Project data, snapshots, exports, logs and Activity Events; prefer GitHub CLI authentication, otherwise use the restricted user-level credential file.
- An archive contains exactly one logical Project and its redacted database snapshot, `documents/`, `attachments/`, `exports/` and a manifest. No other Project is included. Other Projects sharing a prototype runtime database do not need to be preserved or shipped; disposable demo fixtures are sufficient. Whole-runtime multi-Project bundles are out of scope.
- Archive import validates first, publishes a new Project folder, and hot-switches the current one-process runtime to that folder by draining in-flight work and reopening through the database holder. The imported Project becomes open without starting another server. Failed import leaves the previously open Project unchanged. Unsupported format or schema errors name the supported versions. Archives must work across operating systems.
- Archive export and import, restore, and on-demand restore points are human-only API capabilities with no MCP tools. Connector connections and other Sync-aggregate data are redacted; archives exclude secrets, `snapshots/`, `logs/`, `.lock` and `.port`.
- All mutations are atomic and attributed. History shows actor type, identity or MCP host, optional session, time and changed fields. Card history is paged; restoring an individual Card version is outside v1.0.
- Park hides an Activity with an explicit child strategy; Unpark places it at the board's end. Archive hides restorable Cards and excludes them from reports and counts. Delete is permanent after confirmation and creates an Activity Event. Parked Cards are also excluded from reports (planning assumption).
- Restore first protects current state with a pre-restore point. It preserves later actions as undone history, never contacts remote systems or deletes attachments, and reports GitHub links created since the selected point.

## Technical Decisions

- Contracts are the single Zod schema source. Core is pure domain logic; only `packages/db` accesses SQLite or Drizzle. Shared application use cases require explicit actor context and serve transport adapters; human-only capabilities remain explicit.
- Mutations use a synchronous unit-of-work transaction and transaction-bound repositories. Changes, Card Versions and Activity Events commit together; after-commit events never fire for rollback. Network work stays outside SQLite transactions. One in-process write gate serializes mutations, snapshots and restore. Repositories dereference the database holder on each call so replacing the handle takes effect without restarting.
- Versioned roots are Story Map, Card, Release, Persona and Roadmap. A root row or owned-child/link edit increments the owning root once per transaction; sibling reorder increments only the moved Card. Foreign-key actions never silently modify versioned roots. `baseVersion` is the concurrency token; Card history versions match the Card counter and are unique per Card/version. Rapid saves coalesce only for the same actor within the specified window.
- Restore points use `VACUUM INTO` a temporary file outside a transaction followed by publication on success. Classes are manual, pre-apply, pre-restore and pre-migration. Retention preserves the last point of each class and pins the newest protection points until successors succeed; configured planning assumptions are ten per class and a 1 GB cap.
- Restore validates database integrity and supported schema before changes, rejects new work with explained 503 responses while draining in-flight work, swaps through a recovery candidate, and reopens through the holder. Startup resolves interrupted swaps deterministically. Restored state carries a fresh epoch and an event; later Activity/ChangeSet records remain marked undone.
- Every schema table belongs to one aggregate classification; unclassified tables fail verification. Classification supplies an exported `redactedTables` list beside the schema. Sync tables include connector connections, remote work-item/GitHub links, sync runs and conflicts. External references are distinct from Sync state and survive archive export.
- Manifest fields are `formatVersion`, `schemaVersion` and application version read from `package.json`. Until Epic 8 introduces baseline versioned migrations, restore and archive import accept only the current schema. Development databases are disposable; prototype Projects are not migrated. Do not introduce legacy compatibility obligations.

## UX & Interaction Patterns

- One Project is open at a time. Story Maps provides Project archive actions; Activity provides restore points. Card History lives in Card detail with newest entries first, explicit actor/session attribution and expandable long before/after values.
- All actions are keyboard operable and use English strings from the shared string module. Errors identify cause and next action; destructive confirmations identify consequences and use action verbs.
- Shared Dialog contains focus, makes the background inert, closes only the top layer on Escape and restores focus to the opener or documented fallback. Destructive confirmations focus the least destructive action first; child-strategy choices use radio buttons and one verb-labelled confirm action.
- Persistent polite status and alert regions announce success and failures. Use visible focus outlines and adequate input borders; do not rely on color alone for actor/state cues. Restore confirmation explains that later work is undone and a protection point is created; completion reloads the app.

## Cross-Story Dependencies

- Atomic actor-aware transactions and holder-based database access underpin subsequent snapshots, versioning, lifecycle actions, restore and archive import. Version counters and history support later conflict detection; shared Dialog and announcement patterns support later UI work.
- Snapshot creation supplies pre-apply protection for the ChangeSet executor and pre-migration protection for release migrations. Epic 8 introduces the baseline migrator and forward migration of older restore points and archives; this epic must not implement that future compatibility path.
