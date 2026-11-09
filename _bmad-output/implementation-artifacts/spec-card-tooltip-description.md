---
title: 'Include a bounded description in Card tooltips'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'oneshot'
context: []
---

# Card tooltip description

Date: 2026-10-31. Version: 1.
Reproducing statement: Extend existing Card-item tooltips beyond the title with a reasonable bounded description excerpt.

<frozen-after-approval reason="User requested implementation">

## Intent

Extend the existing native title tooltips in CardTile and TreeGrid with the Card title, a blank line and at most300Unicode code points of normalized description. Collapse description whitespace so long Markdown/newline content cannot create an excessively tall tooltip; show an ellipsis only when content is truncated. Empty/whitespace-only descriptions retain title alone. Render plain text, never HTML. Keep existing accessible Card names, layout and all controls unchanged; no custom overlay, dependencies, configuration or data changes.

</frozen-after-approval>

## Implementation Notes

Small reversible change with no intent gaps. Shared helper in features/story-map/card-tooltip.ts used by CardTile title and TreeGrid title button. Existing native tooltip presentation is retained. Verify exact/over-limit boundaries, whitespace and Unicode, title-only behavior and both rendered consumers; focused tests plus web build/typecheck. Previous GUI/Agent changes committed separately as371bc61. No authorization to commit subsequent tooltip work is inferred.

## Changelog

- 2026-10-31 v1: Record bounded native tooltip behavior.


## Verification

Six tests passed across helper and rendered Discovery/Tree consumers. Web build including typecheck and whitespace check passed. Independent blind review found no substantiated issues. Native isolated browser confirms title-only fallback on empty Activity/Step and a truncated300-character description on Story in both Card and Tree. Existing native tooltip styling/layout retained; desktop/narrow browser checked. No user content modified; preview used pre-existing disposable test database only.

## Review Triage Log

- Blind reviewer: no supported findings; no deferred work.
