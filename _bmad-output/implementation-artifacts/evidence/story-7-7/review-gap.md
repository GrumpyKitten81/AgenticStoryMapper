### Ticket imports do not verify the selected Release metadata baseline

- **Changed surface:** `acknowledgeSelectedRelease` records the selected Release metadata in `apps/server/src/application/sync/github-ticket-command.ts:87`.
- **Impacted consumer or site:** Sync health compares that metadata against the current Release at `packages/core/src/reports/sync-health.ts:35`.
- **Existing test evidence:** **Regression gap.** The persistence test at `apps/server/src/application/sync/github-ticket-command.test.ts:66` asserts the acknowledged `releaseId` and title hashes, but omits `releaseMetadata`. Repository searches for the ticket command, helper, and import references located the command and transport tests; none I read assert this metadata. The subsequent-sync test at `apps/server/src/mcp/tools/complete-surface.test.ts:718` imports without a Release. Sync-health tests construct their own baselines.
- **Missing verification:** Assert the selected Release metadata survives import and reopening, and that the imported Card initially reports `synced`.
- **Demonstration:** Remove the call to `acknowledgeSelectedRelease` at `github-ticket-command.ts:35`. The checked assertions still pass because `singleIssueOperations` independently records `releaseId`; the metadata remains null.
- **Consequence:** An untouched imported Card assigned to a Release would immediately appear locally changed and `unsynced`.
- **Disposition:** `patch` — extend the existing ticket persistence test to assert persisted Release metadata and the resulting `getWorkItemSyncHealth` output.

### “Open existing Card” verifies dismissal but not navigation

- **Changed surface:** The duplicate-ticket callback closes the composer and selects the existing Card at `apps/web/src/features/story-map/components/CardComposer.tsx:58`.
- **Impacted consumer or site:** `apps/web/src/features/story-map/views/DiscoveryView.tsx:17` uses the selected ID to navigate to that Card.
- **Existing test evidence:** **Regression gap.** The test at `apps/web/src/features/story-map/components/ticket-creation.test.tsx:111` clicks “Open existing Card,” then checks only that the ticket section disappears and no import request occurs. Repository searches for `existingCardId`, `Open existing Card`, and the composer references found no other test asserting navigation from this action.
- **Missing verification:** Assert that the route selects the returned `existingCardId` and its Card Detail opens.
- **Demonstration:** Remove `onSelectCard(cardId)` from the callback while retaining `onClose()`. Both existing assertions still pass.
- **Consequence:** The action could dismiss the draft without opening the existing Card.
- **Disposition:** `patch` — extend the mounted duplicate-ticket test to assert the selected route ID and visible Card Detail.