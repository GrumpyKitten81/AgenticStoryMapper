# Epic 5 Context: See and judge the cut

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

Reproducing statement: Compile focused developer context for Epic 5 from the current epics, PRD, architecture and UX planning artifacts. Date: 2026-10-14. Version: 2. Changelog: Preserved initial compilation and added the explicit Story 5.1 acceptance exception and Epic-5-only continuation authorization.

## Goal

Help users judge whether their planned cut is sound: make Card dependencies explicit, expose Release Slices and blockers, visualize relationships, summarize others' changes and identify drift from synchronized source plans. Preserve the human/Agent planning loop through auditable changes and accurate comparison evidence.

## Stories

- Story 5.1: Dependencies between Cards
- Story 5.2: Slices view
- Story 5.3: Dependency graph view
- Story 5.4: What changed since I looked
- Story 5.5: Plan drift report

## Requirements & Constraints

- Dependencies connect Cards in the same Story Map and remain acyclic. Reject self-edges, cross-map links and cycles after resolving identities and external-reference aliases; cycle errors name the cycle. Repeated sets and absent-edge unsets are domain no-ops.
- Slices summarize Stories by Release with count, estimates, configured workflow status distribution, blockers and progress per Activity. A prerequisite in a later Slice or unscheduled produces a visible violation in Slices and Planning. Unscheduled membership stays explicit.
- Compare two explicitly recorded immutable Plan states of the same Story Map, labelled Before/After with stable identity and capture time. Added/Removed follows stable Story identity; Moved follows changed Release assignment, including Unscheduled. Release rename and within-Slice reorder alone are not moves. Retain captured membership and displayed values after edits, deletion and reopening; report unavailable/incompatible states visibly. Comparison is read-only.
- Graph filters cover Activity, Slice, status and assignee. Selection exposes prerequisites and dependents; the blocked list names open prerequisites. The graph and accessible table provide equivalent information.
- What changed groups committed Activity Events by actor and affected Card, excluding this browser client rather than all human actors. Preserve unseen concurrent commits when marking seen; Restore resets the epoch. Agent-session restore points remain reachable.
- Drift compares the active cut with durable synchronized fields and membership for one scoped external system. Report added/removed Cards, Slice movements and changed title, description or status with real old/new values; distinguish archive from physical deletion. Reopening and Restore preserve coherent baseline evidence. Republish after reconciling source clears drift. Unknown systems fail with available systems named; Agentic Story Mapper never writes source files.
- Performance remains 100 ms for board interactions and 300 ms for filtering on 1,000 Cards; Graph interactions after layout remain within 100 ms on 200 Cards. Others' committed changes appear within 2 seconds. Core desktop flows target WCAG 2.1 AA with keyboard alternatives; the agreed desktop scope excludes Reflow.

## Maintainer acceptance exception

On 2026-10-14 the maintainer explicitly relaxed the measured Story 5.1 timing requirement, accepted the story, requested its commit and authorized continuing only Epic 5. Story 5.1's existing 1,000-Card full filter reset has a scoped 1,000 ms acceptance budget (visible 604.8 ms; background 785.3 ms); failed original 300 ms measurements and inherited debt remain in its version-5 spec. Other budgets and later-story requirements remain unchanged. Do not re-block Story 5.1 on this accepted exception or infer verification from sprint bookkeeping. The latest instruction explicitly authorizes the Story 5.1 commit despite its preserved original no-commit intent. The orchestrator alone owns sprint-status.yaml and deferred-work.md.

## Technical Decisions

- Contracts are the sole typed schema source. HTTP and MCP call shared actor-aware application use cases; data access stays in DB repositories and unit-of-work transactions. Domain dependency checks, blockers, Slice comparison, progress and drift are pure core functions with meaningful golden tests.
- Card owns dependency links. Actual owned-edge changes increment the dependent root version exactly once atomically with history and audit. Deleting a Card removes incoming/outgoing links and updates surviving dependents whose owned links changed. Copy remaps internal links; archive and Restore preserve coherent edges.
- Typed dependency set/unset operations share the registry's pure describe/resolve path. Non-human writes produce ChangeSets before separate application; preview and executor agree, baseline conflicts reject the whole selected application and failures roll back domain effects. Card dependency edges are separate from ChangeSet selection dependencies.
- Versioned roots protect owned rows/links; baseline checks compare transaction-start versions. Card history may coalesce and cannot reconstruct immutable Plan states or synchronized old values. Synchronized evidence must retain removed identities when ordinary references disappear.
- External identity is scoped to Story Map (Project for project entities). Applied external-reference upserts bind synchronized versions and addressed values to the final applied state. Partial/deselected publication leaves unaddressed entities and other systems' baselines unchanged; human conflicts cannot silently advance baselines.
- Live updates use ordered epoch/sequence server-sent events, origin-client metadata and one event per transaction. Keep last-seen sequence per Project and epoch client-side; marking seen advances only to observed high water. Preserve audit paging, hold-updates and dirty-editor guards.
- Research, pin and justify the Graph layout library's current maintenance state and license before adopting it; pass the license allowlist. Keep loopback, privacy and atomicity policies intact.

## UX & Interaction Patterns

- Slices and Graph are navigable views with their own map-scoped URLs. Slice lanes show numeric status summaries and `Blocked order` rows. Provide explicit Record plan state and Before/After selection controls; comparisons retain each state's Release lanes and name old/new Slice for moves.
- Dependencies show count/related keys on both Cards and editable controls in the Card modal. Mouse, keyboard and form movement share the same human use case and retain focus continuity.
- Every state uses words and glyphs, including Added, Removed, Moved and Blocked order. Use English strings from the shared string module and existing actor/change marker components.
- Graph keyboard controls are focus-scoped pan/zoom, dependency-then-title node traversal and Enter selection. Its pressed-state toggle shares filters/selection with the table: Card, Depends on, Required by, Blocked order. Remove the hidden surface from tab order.
- What changed and Plan drift open as drawers, close with Escape and return focus to their trigger. Preserve dirty fields and queue board-shape updates during focused editing, dialogs and drag.

## Cross-Story Dependencies

Epic 3 supplies actor-aware use cases, versioning, audit, Restore and ordered live updates; Epic 4 supplies typed operation registry, preview/executor, protected Agent application and scoped publication. Story 5.1 supplies dependency snapshots to 5.2 and 5.3; 5.3 shares 5.2's pure blockers. Story 5.5 uses the Slices drawer and external publication baseline, while 5.4 builds on Activity/live-update metadata. The historical validation gate does not require Epic 5 drift functionality, and its acceptance evidence must not be inferred from sprint bookkeeping.
