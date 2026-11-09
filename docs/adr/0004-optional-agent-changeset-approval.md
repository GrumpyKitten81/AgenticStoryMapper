# Optional Agent approval of ChangeSets

- Status: superseded by [0010-single-agent-mode](0010-single-agent-mode.md)
- Date: 2026-10-10
- Deciders: maintainer

Reproducing statement: Record the requested default human approval policy with a human-controlled flag permitting Agent approvers; resolve self-approval and protection interactions before Epic 4 execution. Version: 2. Changelog: Maintainer explicitly accepted Agent self-approval and protection precedence.

## Context and Problem Statement

The local app has one human actor. Rejecting approval by every proposing actor blocks approval of UI-generated human proposals. The maintainer confirmed that own human proposals may be approved, and requested a flag that can also permit Agent approvers.

## Decision Drivers

- Human-only approval remains the default.
- The human explicitly controls whether Agents may approve.
- Approval permissions, real actors and safety-state changes remain auditable.
- Approval must not imply an undocumented exception to apply protection.

## Considered Options

1. Human-only approval without an exception.
2. Human-only by default with an explicit Project flag permitting Agent approval.

## Decision Outcome

The maintainer chose option 2 in this chat. `allowAgentApproval` defaults to `false`; only a human can change it. The local human may approve its own UI proposal. Enabling the flag permits the guarded Agent approval capability; Project ownership, Agent access and the flag are checked inside the approval transaction. Actual proposing and approving actors are stored without accepting identity claims from tool input. Rejection, restore and settings remain human-only.

On 2026-10-10 the maintainer explicitly confirmed: enabled Agents may approve their own or another actor's proposals; `agentProtection` continues to prevent every Agent apply. Approval may occur while protection is on, without applying domain rows or creating a restore point. Human apply remains available. `ApplyChangeSet` recognizes an approval recorded from a human or an Agent authorized at approval time, while checking current Agent access and protection in the applying transaction. Switching the approval flag off blocks future Agent approval transactions and retains prior approval evidence. Story 4.6 owns contracts, migration, settings UI, approval capability and policy acceptance; no application code has changed yet.

With Agent access on and an already approved proposal for the apply column:

| `allowAgentApproval` | `agentProtection` | Agent approves own/other proposal | Agent applies approved proposal |
| --- | --- | --- | --- |
| false | false | Refused | Allowed |
| false | true | Refused | Refused |
| true | false | Allowed | Allowed |
| true | true | Allowed | Refused |

### Consequences

- Stored proposals still require an explicit, audited approval action.
- Approval lifecycle does not recursively generate another ChangeSet.
- PRD, architecture, UX and Story 4.6 share the completed policy; acceptance must cover all four flag/protection combinations and flag changes under the write gate.
