# Single Agent mode replaces Agent access, protection and approval flags

- Status: accepted
- Date: 2026-10-28
- Deciders: maintainer

## Context and Problem Statement

Projects carried three overlapping Agent flags (`agentAccess`, `agentProtection`, `allowAgentApproval`). Their combinations were hard to understand in the UI and one combination (approval on, protection on) produced the non-obvious state "Agents may approve but not apply" accepted in [0004](0004-optional-agent-changeset-approval.md).

## Decision Drivers

- One understandable control in the UI.
- Unchanged enforcement for every state that remains reachable.
- Human-only control of safety settings stays.

## Considered Options

1. Keep three independent flags.
2. One ordered Agent mode with four levels.
3. One Agent mode with five levels that keeps "approve without apply".

## Decision Outcome

Chosen option: "One ordered Agent mode with four levels", because it covers the common states with a single choice and keeps the existing enforcement for each of them.

| `agentMode` | Former flags | Agents read/propose | Agents apply approved ChangeSets / remote writes | Agents approve |
| --- | --- | --- | --- | --- |
| `off` | access off | no | no | no |
| `propose` | protection on | yes | no | no |
| `apply` (default) | defaults | yes | yes | no |
| `autonomous` | approval on | yes | yes | yes, including own proposals |

The `github` switch stays independent. Migration `0001_agent_mode` maps stored rows by precedence: access off → `off`, protection on → `propose`, approval on → `autonomous`, otherwise `apply`. A stored "approval on + protection on" row becomes `propose`. Server checks use `agentAccessEnabled`, `agentProtected` and `agentApprovalAllowed` from `packages/core`.

### Consequences

- Good: one setting in the UI, audit export and MCP permissions; fewer invalid combinations.
- Bad: "Agents approve, humans apply" is no longer expressible; such Projects lose Agent approval on migration.
- Neutral: Prior approval records and activity events keep their original flag payloads.
