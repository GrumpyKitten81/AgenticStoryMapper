# Epic 4 Context: Agents cut and publish, humans review

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->
<!-- Reproducing statement: Compile Epic 4 developer context from the reconciled epics, PRD, architecture, UX and accepted approval/atomicity decisions; omit individual acceptance details and code-derived facts. Date: 2026-10-10. Version: 1. Changelog: Initial context after all readiness-policy decisions were resolved. -->

## Goal

Let Agents publish and refresh a planning cut as one reviewable ChangeSet, with trustworthy provenance, stable external identities, server-side preview, atomic local apply, restore points and delivery updates. Humans control protection and approval permissions. BMad supplies planning content through generic tools rather than a product-specific parser.

## Stories

- Story 4.1: Import Markdown and TXT sources with stable chunks
- Story 4.2: Provenance on every Card
- Story 4.3: External references on Cards, Releases and Personas
- Story 4.4: Operation registry for the core objects
- Story 4.5: Operation registry for the remaining objects
- Story 4.6: ChangeSet executor
- Story 4.7: Writing agent tools run through ChangeSets
- Story 4.8: An Agent submits its own ChangeSet
- Story 4.9: Preview a ChangeSet on the board
- Story 4.10: Slicing proposals and release notes
- Story 4.11: Delivery status from Agents
- Story 4.12: The BMad round trip
- Story 4.13: Validation gate with five BMad users (five browser simulations; historical key retained)

## Requirements & Constraints

- Stay local-first, loopback-only and English, without an LLM provider, telemetry or new cloud dependency. Source import supports Markdown/TXT only; MCP imports require inline content.
- Every non-human domain write is represented by a ChangeSet before application. New command ChangeSets can auto-apply without protection; proposal generators always propose. Stored proposals need explicit approval under the Project policy.
- Humans may approve their own UI proposals. Project flag `allowAgentApproval` defaults off and is human-controlled. When on, Agents may approve their own or other actors' proposals, including while protection is on. Protection still prevents every Agent apply; human apply remains available. Rejection, settings, credentials and restore remain human-only.
- Record actual proposing/approving actor identity, host and session. Approval checks ownership, Agent access and current approval permission inside its transaction. Agent apply checks current access/protection. Disabling approval permission prevents new Agent approvals and preserves recorded prior approvals.
- Cards show chunk, structured GitHub or free-text origin evidence, or recorded manual/inference origin. Do not fabricate historical origin. Source versions and earlier links remain retained; unchanged imports create no duplicate documents/chunks.
- External identities are unique within their real scope and resolve repeat publication without duplicates. Human changes since the addressed system's last baseline conflict rather than being overwritten; another system's baseline is not silently advanced.
- Keep slicing lean: built-in happy path, generic BMad-supplied Release/assignment cuts, deterministic read-only release notes. No additional strategy engine or BMad parser.
- Validate the workflow through five recorded browser simulations on disposable Projects. These establish functional acceptance, not real-user demand; never fabricate measurements or count blocked scenarios as passed.

## Technical Decisions

- Contracts are the single API/MCP/UI schema source. Domain operation payloads are typed; each supported member has one pure core description/resolution pair. Repositories persist resolved changes without duplicating hierarchy/position semantics.
- Application use cases require ActorContext and shared capability descriptors. Cover current writable domain families and existing source/link/copy/import effects. Explicitly classify administration, ChangeSet lifecycle, confirmed remote push and audit/sync bookkeeping instead of recursively wrapping them as proposals. AI template editing stays human-only; future dependency functionality stays in Epic 5.
- Preview resolves selected operations sequentially on the server, including earlier simulated changes. Local references address earlier operations only and never override real persisted ownership. Dependency deselection is transitive; approval binds immutable operations and selection.
- The write gate creates one pre-apply snapshot outside the transaction, then applies selected local operations in order. Check existing roots against transaction-start versions, collecting every conflicting operation. Invalid/conflicting selected work aborts the whole batch; no automatic partial application. Replays of applied or restore-undone ChangeSets are refused.
- Domain rows, root versions, Card history, operation Activity and successful mutation audit commit atomically; emit live events only after commit. Card history follows the accepted concurrency/coalescing model. File preparation and remote effects stay outside SQLite; failed local apply leaves no visible file links and explicitly reports retained effects. Remote push retains a confirmed Dry Run.
- Schema versions accompany ChangeSets. Incompatible pending schemas, including approved rows, become stale and require resubmission/fresh approval; retain applied history. Preview/apply equality compares semantic state for unchanged input/state, normalizing allocated ids, keys and time.
- Measure apply with snapshot/history/audit included on the defined fixture, using the recorded nominal/CI tolerance. Run benchmarks serially, preserve failures, and keep preview/status-call bounds separate. No relative-overhead gate is introduced.

## UX & Interaction Patterns

- Render the server preview in Tree and Planning; expose every non-Card operation through labelled before/after review controls. No client-side preview engine or later view is required.
- Change markers combine words and glyphs with color on opaque pills. Removed Cards remain visible struck through. Status includes Conflict; schema staleness differs from ordinary version conflicts.
- Incoming edits invalidate review state rather than silently changing approved content. Preserve dirty editors and focus; display conflicts and explicit deselection/resubmission actions. Applied results arrive through live events and remain reviewable in Activity.
- The Agent settings expose the human-controlled approval toggle and actual current policy. Review records distinguish human and Agent approvers; permission does not conceal protection or actor identity.

## Cross-Story Dependencies

Epic 3 supplies shared use cases, audit, versions, restore and live updates. Import precedes provenance; external identities precede the core registry, remaining registry, executor, routing, submission and board preview. Slicing/status commands follow routing. The BMad round trip follows sources/identities and submission/review/slicing/status; browser validation follows the round trip. Remove duplicate persistence semantics only when the executor is integrated. Epic 4 requires neither Epic 5 drift/dependency views nor Epic 7 GitHub identity migration.
