# Record unscoped tool calls as runtime Activity

- Status: proposed
- Date: 2026-10-08
- Version: 2
- Deciders: Agentic Story Mapper maintainers

Reproducing statement: Record the Story 3.8 contract decision needed to audit every completed tool call, including global reads and invalid targets, without inventing Project ownership.

## Context and Problem Statement

AD-6 requires every tool call to produce Activity evidence. Activity currently requires an existing Project, but global reads and early refusals have no established owner. AD-17 already treats Activity as its own aggregate.

## Decision Drivers

- One Activity insert per completed call.
- Actual Project ownership and safety remain authoritative.
- No full payloads or credentials in public audit summaries.

## Considered Options

1. Attribute calls to an arbitrary Project.
2. Create a separate runtime audit store.
3. Permit nullable Project scope in the existing Activity aggregate.

## Decision Outcome

Chosen option: “Permit nullable Project scope.” Unscoped and multi-Project calls are runtime events. Human Project audit includes its scoped events plus clearly labeled runtime evidence; agent audit excludes runtime evidence and filters authorized Projects before pagination. Both exports use explicit metadata summaries. Raw internal history remains available to restore and ownership checks.

Concurrent completed calls from the same registry share an actor/session-bound audit commit through the existing UnitOfWork and write gate. A main-event-loop MessageChannel notification schedules pending records without a deadline or worker; its ports close when idle. Each call still performs one prepared Activity INSERT and waits for the transaction to commit before responding. A failed commit rejects every affected caller and rolls the batch back. Other registry identities commit separately. HTTP restore request draining and SDK shutdown draining retain pending calls until their audit commits finish.

### Consequences

- Restore preserves runtime evidence without manufacturing Projects.
- Portable Project archives exclude runtime events.
- The development schema fingerprint changes. AD-9 excludes migration of prototype databases and old restore points retain explicit incompatible-schema refusal.
- Audit metadata and responses remain separate from mutation transactions. Coalescing changes commit grouping only; durability settings and the single writer remain unchanged. Functional tests cover identity separation, whole-batch failure and recovery, restore draining and SDK shutdown draining. Strict paired performance tests cover sequential representative reads and concurrent cheap reads on both TCP surfaces.

## Changelog

- 2026-10-08: Initial proposed decision for Story 3.8.
- 2026-10-08: Add awaited same-identity concurrent audit commits following measured real-ingress overhead; preserve one INSERT per call and the existing writer.
