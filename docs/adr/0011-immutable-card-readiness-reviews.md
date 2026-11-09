# Immutable Card Definition of Ready reviews

Date: 2026-11-04. Version: 1.
Reproducing statement: Record the approved narrow ChangeSet-policy exception for structured Card readiness reports and the trusted agent-origin push gate.

- Status: accepted
- Deciders: Project owner

## Context and Problem Statement

An external invoking agent needs to attach structured Definition of Ready evidence without changing Card content. Agentic Story Mapper must not launch models. Human confirmation of an agent Dry Run must retain its initiating authority and exact outgoing content.

## Decision Outcome

Persist immutable review requests, reports, separate human decisions and correction selections in the Project-scoped, versioned `card_review_records` ledger. Direct audited report persistence is the user-authorized narrow exception to ChangeSet-first. Content corrections remain version-bound ChangeSets with separate recorded human approval and Apply. Reports do not change Card versions or sync baselines.

Bind reports to server-captured semantic input fingerprints, criteria/skill versions and the database epoch. Review the immutable Dry Run's actual outgoing Issue title/body/type. Gate unfinished agent-origin Issue effects immediately before writes and across confirmation/resume; warnings do not block. An enabled explicit human override records its reason against the exact plan and inputs and preserves existing safety/conflict checks.

Card type is nullable and independent of hierarchy. Clear legacy hierarchy-based outbound mappings during migration; operators explicitly remap Card types. Redacted portable archives omit the review ledger and its sensitive evidence payloads. Restore changes the epoch, making prior reports historical. Copies preserve Card type and start without another Card's reviews or exceptions.

## Consequences

- Invoking agents use the installed `card-dor-review` skill and shared MCP capabilities; pending work waits visibly without a background runner.
- Historical findings and waivers remain auditable; Card-specific exceptions are reversible.
- Explicit type and mapping are required for reviewed outgoing Issues, while local untyped Cards remain valid.

## Changelog

- 2026-11-04 v1: Record the approved review persistence and outgoing enforcement boundaries.
