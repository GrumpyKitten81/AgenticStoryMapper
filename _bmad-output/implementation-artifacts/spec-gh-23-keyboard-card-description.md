---
title: 'Keyboard access to Discovery card descriptions'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-approved implementation plan">

## Intent

**Problem:** Discovery cards expose their description only through a mouse tooltip, leaving keyboard and screen reader users unable to read it without opening the editor.

**Approach:** Add a compact description action to cards with descriptions that opens the full text in the existing accessible dialog. Preserve card navigation, focus return, preview access, and the existing board layout. Verify the behavior in tests and the browser, then commit, push, comment on Issue #23, and add the existing `review` label while leaving the issue open.

</frozen-after-approval>

## Implementation Notes

- Reuse `CardTile`'s existing action row and `Dialog`, plus `storyMapStrings.showDescription`. Keep the description button outside the primary card button so roving navigation remains unchanged.
- Existing OpenWolf index changes predate this work and are not part of the commit.
- The icon sits in the action group so cards with an assignee keep the same number of rows. Full descriptions use the Dialog's accessible description and preserve line breaks.
- Focused Web tests (68), Web typecheck, build, and live browser checks for Tab, Enter, Space, Escape, focus return, and desktop/narrow card layout passed. A native screen reader was not available.

## Review Triage Log

- Low, rejected: Markdown is exposed as complete plain text, consistent with the existing HTML-export description dialog; rich formatting would expand this issue's scope.
- Medium, patched: The initial preview test used a failed preview response. The successful projected-preview test now checks the projected description in the dialog.
- Low, rejected: The automated test uses click for activation; actual browser checks verified Tab, Enter, and Space on the native button.
- Medium, patched: Assignee plus the icon could add a card row. Moving the icon to the existing action group keeps the populated card compact.
