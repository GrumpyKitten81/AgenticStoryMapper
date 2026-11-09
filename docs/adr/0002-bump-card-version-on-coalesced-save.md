# Bump the Card version on every accepted save

- Status: accepted
- Date: 2026-10-09
- Deciders: Agentic Story Mapper maintainers

## Context and Problem Statement

AD-7 let a same-actor Card save within 60 seconds update the latest `card_versions` row without changing `cards.version`. `baseVersion` is the optimistic concurrency token (Story 3.11). All human clients share `actorId "local-user"`, so two browser tabs coalesce with each other: tab 1 saves at N without a version change, tab 2 still sends `baseVersion` N, matches and silently overwrites. An Agent whose session wrote the latest history row has the same effect on a stale human baseline.

## Decision Drivers

- Story 3.11: a conflicting save must never succeed silently.
- Keep `max(card_versions.version) == cards.version` and the unique `(card_id, version)`.
- Keep Card history compact; no schema change.

## Considered Options

1. Every save bumps the version and adds a history row (history is collapsed on read).
2. Keep coalescing and check `baseVersion` only against other actors.
3. Separate concurrency and history counters (new column, migration).
4. Every save bumps the version; a coalesced save rewrites the latest history row under the new version.

## Decision Outcome

Chosen option: 4. The concurrency token changes with every accepted save, history stays as compact as before, and no schema change is needed. Option 2 weakens the 3.11 race acceptance, option 3 is the largest change, option 1 adds a read-side collapse feature.

### Consequences

- Good: a stale `baseVersion` never matches after any accepted save, whoever wrote it.
- Good: history reads (`listCardHistory`, `listCardHistoryPage`) sort by version and need no change.
- Bad: version numbers in Card history can have gaps (a coalesced row jumps to the new version).
- Neutral: the Story 3.10 live layer reads the committed root version and needs no code change; the 3.10 requirement line "Retain coalesced Card version semantics" no longer holds. Clients must send the version returned by their previous save as the next baseline, otherwise an Autosave conflicts with itself.

## Changelog

- 2026-10-09: Accepted; supersedes the coalescing sentence of AD-7.
