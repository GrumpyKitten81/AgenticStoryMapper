---
epic: 0
status: draft
date: YYYY-MM-DD
---

# Epic {N} Preparation: {Title}

<!-- Cross-story implementation contract. Consumed by bmad-build-auto step 02. Regenerate with bmad-prepare-epic when epic design changes. -->

## Goal

{One paragraph: what this epic delivers together.}

## Story sequence

| Order | Story | Depends on | One-line deliverable |
| --- | --- | --- | --- |
| 1 | {N}.1 | — | … |

## Shared design decisions

{APIs, aggregates, schema/migration strategy, error model, UI patterns, MCP tools, ChangeSet boundaries—decisions that every story must honor.}

## Interfaces between stories

{What story M exposes or leaves ready for story M+1.}

## Non-goals (epic)

{Explicit exclusions for this wave.}

## Verification strategy

{Which packages/tests verify cross-story behavior; no story-specific task lists here.}

## Open questions

{Empty or list; must be empty before `status: ready`.}
