export const githubSyncSelectionStrings = {
  syncState: "Sync State",
  operationsHint: "Review the selected Cards with Plan, then choose Push to confirm the reviewed scope.",
  scope: "Selected Cards for GitHub",
  excludedSuffix: " — Excluded from push",
  count: (selected: number, eligible: number): string => `${selected} selected Cards; ${eligible} eligible Cards for push.`
} as const;
