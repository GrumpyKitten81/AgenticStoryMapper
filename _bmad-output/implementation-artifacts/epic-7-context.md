# Epic 7 Context: Plan with GitHub

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

Reproducing statement: Compile developer context for Epic 7 from the epics, PRD, architecture and UX planning artifacts; retain only shared requirements and decisions. Date: 2026-10-18. Version: 1. Changelog: Initial compilation reflecting accepted Epic 7 decisions.

## Goal

Let users connect GitHub, create linked Cards from tickets, and plan through push, import and sync with explicit consent, reviewable remote effects and visible conflicts. Keep credentials outside shared Project data and preserve human work through durable identity, truthful outcomes and auditable local changes.

## Stories

- Story 7.1: Credentials in a user-level file
- Story 7.2: Connect GitHub in the app
- Story 7.3: GitHub identity in external references
- Story 7.4: Push with a mandatory Dry Run
- Story 7.5: Import and sync
- Story 7.6: Conflicts and Sync Health
- Story 7.7: Import a single ticket while creating a Card
- Story 7.8: Provider extension points

## Requirements & Constraints

- Credentials never enter Project data, responses, logs, Activity, snapshots or archives. Store UI-entered credentials in atomically replaced user-level `credentials.json`: `%APPDATA%/StoryMapper` on Windows, `~/.config/storymapper` elsewhere, mode 0600 on POSIX. Resolve authenticated CLI, then user file, then environment. Missing sources advance; malformed/unreadable selected sources or rejected credentials fail visibly without changing accounts. Status and actual provider identity must agree, including CLI subprocess environment behavior. Credential status is a local probe, not remote verification.
- GitHub defaults off. Only explicit human candidate Verify may contact GitHub while off; it persists nothing and does not enable the switch. Separate Connect persists and enables with audit. Ordinary operations, MCP and background checks have no exception. The app guides terminal-based CLI login without launching interactive authentication. Connections default read-only.
- Every outgoing Issue/Milestone effect requires an immutable persisted Dry Run and human UI confirmation of that exact plan id. Revalidate local/remote evidence, connection, mapping and Restore epoch; drift requires re-review. Persist intent before each modifying call. Explicit resume reconciles stable markers and stops on uncertain results. Retain per-item links, errors and not-attempted outcomes; prevent duplicate confirmation. Restore cannot undo remote effects.
- Every incoming domain mutation uses an attributed `github` ChangeSet with initiating identity, restore point on apply and atomic audit. Protection retains proposals; Agent approval never authorizes remote writes. Protected Agent push is refused before provider mutation.
- New imports retain hierarchy, native type and provenance but begin Unscheduled without creating or assigning Releases. Later explicit Release sync may propose assignment; distinguish initial null placement from intentional Milestone removal.
- Three-way merge protects local divergence even in read-only mode. Maintain one unresolved conflict per canonical reference/field, preserve reviewed evidence through refresh or convergence, and block only that field until successful explicit resolution. Remote-wins uses an incoming ChangeSet; local-wins uses a confirmed remote plan. Cancel, failure and refusal leave conflicts open.
- Map Activity/Step/Story to available native Issue types; preserve imported types and refuse invalid mappings. Synchronize mapped status and opted-in Annotation assignments while preserving unrelated labels and reusable definitions. Do not create Annotations from unknown labels. Preview configurable export/structure labels separately. Notes are excluded from delivery sync. Milestone identity survives rename; name, goal, due date and open/released state are explicit effects. Iteration is inbound-only.
- Preserve authored Markdown. The machine footer supplies Story Map, Card Key, stable reconciliation marker and a loopback Card link; exclude it from description baselines. Never put local Workflow Status into the Issue body. Auth, network, rate-limit and incomplete responses are explicit failures, never proof of deletion.

## Technical Decisions

- Canonical GitHub identity is adapter-owned, scoped `external_refs`; sync association/state/baselines reference its id without duplicating entity or remote identity. Generic writes cannot claim the reserved `github` system. Enforce unique scoped ownership; provenance-only copies do not gain active sync ownership. Remove duplicate legacy identity paths without prototype compatibility.
- Hard local deletion atomically removes live refs while retaining minimal scoped historical evidence for deleted-local health. Health derives unsynced, conflict, stale, deleted-remote and deleted-local counts and navigation from durable baselines/conflicts/deletion evidence without provider calls. Version and sync conflicts share `ConflictReport`.
- Keep incoming ChangeSet execution separate from remote plans and adapter bookkeeping. Recheck scope, permissions and epoch after provider awaits. Archive classification must cover new sync records and redact GitHub refs/evidence without removing other reference systems. Follow the existing pre-release schema path and current-schema Restore contract.
- Keep provider integration behind work-item and publishing interfaces. A new adapter changes only its module, contract enum, registry and credential registration; shared import/conflict/confirmed-plan orchestration must remain reusable. Unknown ids fail before side effects. GitHub remains the only shipped provider; publishing remains interface-only.

## UX & Interaction Patterns

Use the shared keyboard-operable dialog with distinct Verify, off-switch notice and Connect steps. Preserve drafts on errors, Cancel, connection detours and stale responses; name the next action and never echo tokens. Report retained credential-file effects truthfully if final database confirmation fails. Show actual credential source when CLI precedence differs from a pasted candidate.

Keep GitHub actions discoverable when disabled and explain the blocking switch. Show clickable Issue numbers, per-item push results, field diffs and persistent health evidence. Ticket lookup accepts Issue HTTPS URLs, `owner/repo#N`, or positive `N`/`#N` with a selected/default connection, preserving composer placement/text/template. Protected proposals must not be announced as created Cards. Scope changes and Restore invalidate late responses and old intentions.

## Cross-Story Dependencies

Implement in story order. Credentials support connection and provider use; canonical identity underpins all later sync flows. The push story establishes the sole remote-write protocol; import/sync establishes the shared incoming ChangeSet path. Conflict resolution uses both paths, ticket creation reuses connection/identity/import/conflict behavior, and the final provider extension exercise validates these shared boundaries.
