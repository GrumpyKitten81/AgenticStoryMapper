# Canonical GitHub identity in external references

- Status: proposed
- Date: 2026-10-19
- Deciders: maintainer
- Consulted: Epic 7 preparation, Story 7.3 source investigation

Reproducing statement: Record the Story 7.3 decision to make adapter-owned `github` external references the single GitHub identity source. Version: 1.

## Context and Problem Statement

GitHub identity was duplicated across `github_links`, sync links and source evidence. Ownership, navigation, deletion and archive behavior could diverge between the copies, and every consumer had to reconcile them.

## Decision Drivers

- One scoped binding per entity and per remote resource, independent of connection ids.
- Auditable hard deletion and surviving provenance.
- Portable archives that carry no GitHub payload.
- No prototype migration or compatibility reader.

## Considered Options

1. Keep `github_links` and derive the other copies.
2. Canonical `external_refs` rows with `system = 'github'`; sync state and source evidence key to the ref id.

## Decision Outcome

Chosen option: "Canonical `external_refs` rows", because it leaves one identity store, with sync state holding only `externalRefId`, connection and baselines, and public shapes derived by join.

### Consequences

- Good: ownership conflicts are rejected before mutation; deletion records a typed `externalRef.deleted` Activity; archives redact one row kind plus nested payloads.
- Good: the footer carries a stable marker, so renames and prefix changes do not break identity.
- Bad: operation schema version 5 makes pending older proposals stale; history stays readable and nothing converts it.
- Bad: databases created before this change are unsupported; there is no migration or backfill.
- Neutral: public names such as `GitHubLink` remain as joined projections.
