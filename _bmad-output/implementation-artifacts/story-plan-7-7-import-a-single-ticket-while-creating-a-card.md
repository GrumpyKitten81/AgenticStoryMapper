---
epic: 7
story: 7
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.7: Import a single ticket while creating a Card

Reproducing statement: Extend the current Card composer with ticket lookup and atomic linked creation, reusing connection, canonical identity, incoming ChangeSets and conflict/epoch safeguards from Epic 7. Version: 1. Date: 2026-10-18.

## Intent

Create a Card filled from one accessible GitHub Issue, in the location the user chose, with durable source evidence and a clickable Issue number.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md), [7.2 connection](story-plan-7-2-connect-github-in-the-app.md), [7.3 identity](story-plan-7-3-github-identity-in-external-references.md), [7.5 import](story-plan-7-5-import-and-sync.md) and [7.6 conflicts](story-plan-7-6-conflicts-and-sync-health.md).
- Reuse the shared connection dialog and incoming operation builder. Do not call ordinary createCard and then attempt to attach a ref/source link in separate requests.
- The import action is a `github` ChangeSet with initiating actor. Under protection it remains a proposal until the existing permitted human apply flow; never report the Card as created before actual apply.

## Design decisions (this story)

- Accept HTTPS `github.com/owner/repo/issues/N`, `owner/repo#N`, and `N`/`#N` only with a selected/default connection supplying the repository. Reject PR URLs, other hosts/schemes, embedded auth, malformed/zero ids and mismatched repositories before any provider call. No arbitrary URL fetching or provider inference.
- Lookup is read-only, explicit and cancellable. Verify Issue access before local domain persistence. Missing/inaccessible/auth/network failures are differentiated without claiming masked 404 proves deletion.
- On confirmation build Card + canonical external ref + sync baseline + typed Source Link as one operation dependency group. Use the composer-selected level, parent, Release and position, not the remote hierarchy. Bulk import's Unscheduled default does not override an explicitly chosen composer Release.
- Notes retain manual creation/source-citation behavior but are not offered active ticket-import ownership, matching the epic's Notes exclusion. Imported Issue type is retained independently of the user's selected Card level.
- Populate title/description only deliberately; replacing authored text requires the existing draft-confirmation pattern. Ticket fetch errors and connection-dialog detours retain text, template defaults and placement. Keep remote machine footer out of local description.
- Existing same-scope Issue binding returns/focuses the existing Card or an explicit already-linked outcome; it cannot create a duplicate or reassign another Card's identity. Cross-map/source-only evidence is not mistaken for active ownership.
- Capture Project/Map/parent/Release/connection/epoch before lookup and validate again before apply. A parent removed, Release changed, scope navigation or Restore requires re-review rather than creating in another location.

## Task sequence

1. `packages/contracts/src/api/http.ts`, `mcp/tool-inputs.ts`, `schemas/domain.ts`: strict ticket selector, explicit target placement and normalized lookup/creation result using the shared ChangeSet response; classify lookup/import in the capability manifest.
2. `apps/server/src/application/sync` and connector/sync HTTP routes: focused single-ticket lookup and import command, reusing provider auth/access/ownership checks and 7.5 operation builder with explicit placement.
3. `packages/core/src/changesets` and DB canonical refs/evidence: atomic operation dependencies, duplicate ownership refusal, source link/provenance, history/audit and base-version checks. No additional raw Drizzle in application code.
4. `apps/web/src/features/story-map/components/CardComposer.tsx`, board state/API and central strings: ticket field, connection state/link, lookup/review/populate, atomic create/proposal result, duplicate focus and accessible busy/error handling.
5. Reuse 7.2 Dialog return state; block old response adoption after input/scope/epoch changes and retain draft/placement across a connection detour, Cancel and provider failure.
6. Verify HTTP and both Agent surfaces, actual composer callback/request, successful reopened storage, duplicate/mismatch/unsafe URL/no-access refusal and audit-insert rollback. Exercise pending lookup/create across Restore and removal of parent/Release.

## Preliminary code map

- `apps/web/src/features/story-map/components/CardComposer.tsx`: current title/template/parent/Release/position and manual create mutation.
- `apps/web/src/features/story-map/components/card-creation.test.tsx`, `useStoryMapBoardState` and board lifecycle tests: current scope/draft/creation invariants.
- `apps/web/src/features/github-sync/GitHubConnectionsPanel.tsx`: reusable connect dialog from 7.2.
- `apps/server/src/application/sync/github-import-command.ts`: 7.5 single shared builder; add explicit placement without calling bulk import and moving afterward.
- `packages/github/src/providers/work-item-provider.ts`: existing `getRemoteItem` plus 7.3 normalized result/error semantics.
- `packages/db/src/repositories/source-evidence-repository.ts`, external-ref and Card repositories: canonical evidence, provenance and uniqueness.
- `packages/contracts/src/api/http.ts`, application capability manifest and generated MCP artifacts: one schema source and parity.

## Acceptance outline

- **Given** a valid Issue and composer placement **When** the user confirms **Then** title/description populate and one actual apply creates Card/ref/source/baseline atomically in that exact placement.
- **Given** GitHub off or no connection **When** using the ticket field **Then** the shared dialog appears, explains that the switch blocks normal use until explicit enablement, and returns with draft/placement retained.
- **Given** inaccessible/invalid/mismatched ticket **When** lookup/confirmation fails **Then** an actionable error appears and no Card/ref/source row was created.
- **Given** an already-owned Issue **When** imported again **Then** the existing Card is identified/focused and no duplicate is created.
- **Given** a successful created Card **When** shown/reopened **Then** its Issue number is clickable and its typed Source Link/provenance persists.
- **Given** protected or stale scope **When** an operation returns **Then** a proposal or refusal is shown truthfully and no late result overwrites the draft or creates in another Map.

## Out of scope

Arbitrary ticket providers, PR import, URL crawling, active GitHub ownership for Notes, implicit remote updates, automatic hierarchy relocation and a separate connection form.

## Risks and mitigations

- Existing composer submits immediately through manual createCard; the ticket path needs a single admitted command rather than chaining ordinary create/attach.
- A successful lookup is not apply authorization after ownership/epoch drift: revalidate all captured placement and identity inputs.
- User-entered URL must be parsed/validated locally before provider selection; never pass arbitrary URLs to fetch or subprocess shell interpolation.

## Open questions

None. Bare-id resolution and composer placement are fixed above from the existing single-ticket/composer requirements.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Atomic composer ticket-import and connection/draft integration |
