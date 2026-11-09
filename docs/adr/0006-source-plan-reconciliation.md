# Source-plan baselines and explicit reconciliation

- Status: accepted
- Date: 2026-10-16
- Version: 1
- Deciders: maintainer, explicit approval in this development session

Reproducing statement: Record the approved resolution of Story5.5's source-reconciliation gap, preserving human changes and existing upsert conflict protection. Changelog: initial approved decision.

## Context and Problem Statement

Human changes make an external reference's syncedVersion stale. Ordinary upsert correctly refuses that conflict, but SM-10 also requires an explicit way to reconcile the updated source and clear drift. Coalesced Card history and deleted ordinary refs cannot supply durable synchronized old values.

## Decision Drivers

- Preserve ordinary human-conflict refusal and auditable ChangeSet application.
- Retain exact per-system/map old values and removed identities independently of manual Plan states.
- Refuse stale or divergent acknowledgment without partial baseline advancement.

## Considered Options

1. Add a separate human-approved matching-state acknowledgment operation.
2. Treat a fresh upsert baseVersion as authority to acknowledge human drift.
3. Remove and recreate external bindings.

## Decision Outcome

Choose option1, explicitly accepted by the maintainer. Retain versioned per-system/map synchronization evidence independently of ordinary refs and manual Plan states. Normal addressed publication captures final committed values only for addressed entries.

An Agent may propose an **Accept source reconciliation** ChangeSet step after reconciling its source. A human reviews and approves its submitted source projection. Application rechecks reviewed root versions, observed baseline and binding evidence, and equality of proposed source fields/membership with current local state. Intervening changes or divergent source values refuse the transaction atomically. Only addressed synchronization evidence and matching extant refs' syncedVersion advance. Card fields and manual Plan states do not change. Agent approval or auto-apply cannot bypass this human gate. Ordinary separately reviewed Card mutations remain the route for divergent values.

Agentic Story Mapper does not read or write external source files to certify their contents. Approval concerns the explicit submitted source projection. Exact schemas, repository tables and resolver integration are implementation planning choices constrained by these semantics.

### Consequences

- Human Slice moves can be acknowledged after source reconciliation without weakening ordinary upsert checks.
- Durable evidence survives deletion, reopening and Restore; partial publication and other systems remain independent.
- A new operation must participate in preview, human approval, atomic application, auditing and conflict handling. No generic conflict bypass is introduced.
