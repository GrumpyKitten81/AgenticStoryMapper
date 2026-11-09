import type { SyncItemResult } from "@storymapper/contracts";

export const incomingGitHubStrings = {
  title: "Incoming GitHub changes",
  review: "Review and apply local changes. Outgoing changes require a separate Dry Run and confirmation.",
  prepared: "Preparation results",
  outgoing: "Prepare outgoing Dry Run",
  open: "Open source item",
  states: {
    succeeded: "Succeeded",
    failed: "Failed",
    proposed: "Proposed",
    unchanged: "Unchanged",
    already_linked: "Already linked",
    conflict: "Conflict",
    not_attempted: "Not attempted"
  } satisfies Record<SyncItemResult["status"], string>
} as const;
