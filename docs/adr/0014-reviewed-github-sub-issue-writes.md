# Reviewed GitHub sub-issue writes

- Status: proposed
- Date: 2026-11-24
- Deciders: maintainer

## Context and Problem Statement

GitHub import reads parent relationships, but reviewed push currently omits them. Card hierarchy changes need the same human review, conflict protection and durable recovery as other remote effects. This extends [ADR 0008](0008-epic-7-github-connection-and-sync-policy.md) without superseding its other decisions.

## Decision Drivers

- Make relationship ownership and each remote mutation visible before confirmation.
- Avoid overwriting remote parent changes or silently expanding the selected Cards.
- Recover safely from interrupted or partially successful changes.

## Considered Options

1. Review and journal each relationship mutation separately.
2. Hide relationship writes inside issue updates.
3. Use GitHub's `replace_parent` option as a compound write.

## Decision Outcome

Chosen option: 1, because separate effects expose the exact writes and their partial outcomes. Relationships are owned only within the selected connection's repository. A selected Card's desired parent is its bound parent Card, a parent created by the reviewed plan, or explicitly no parent. Unresolved, excluded unbound, source-only or foreign parents block the plan; selection is not expanded implicitly. Creates precede dependent relationships.

An add uses `POST /repos/{owner}/{repo}/issues/{parent_issue_number}/sub_issues`; a removal uses `DELETE /repos/{owner}/{repo}/issues/{parent_issue_number}/sub_issue`. Both send `{ "sub_issue_id": childDatabaseId }`. The numeric REST database ID is resolved and verified against the reviewed child identity; it is distinct from an issue number or GraphQL node ID. A change consists of a removal followed by a dependent add, not `replace_parent`.

The acknowledged remote parent is the three-way baseline. A remote change that differs from both baseline and desired parent blocks the reviewed push, including explicit Push. Fresh identity and parent observations are checked before each mutation. Convergence needs no write. Missing evidence cannot mean removal.

Each mutation has a durable exact intent before the request and a result plus fresh parent observation afterward. Resume treats the intended result as success, the expected prior value as eligible for controlled retry, and any third value as a conflict. A successful removal remains recorded if a later add fails; resume does not repeat completed effects. The original baseline advances only after the final relationship is verified or convergence is explicitly accepted.

Existing human confirmation, safety, read-only, epoch, ChangeSet and Card readiness protections continue to apply. A remote conflict resolution that moves a Card remains a separately reviewed ChangeSet.

### Consequences

- Good: Review and recovery show each write, including partial changes.
- Bad: A change is non-atomic and can temporarily leave a child without a parent. GitHub provides no parent compare-and-swap, so another writer can race between the pre-write observation and mutation.
- Neutral: The [GitHub sub-issues REST API](https://docs.github.com/en/rest/issues/sub-issues) supplies the relationship operations; ordinary issue payloads do not carry them.
