import { vi } from "vitest";
import type { RemotePushEvidence } from "@storymapper/contracts";
import type { WorkItemProvider } from "@storymapper/github";

export function reviewedPushProviderFixture() {
  return {
    readPushInputs: vi.fn(async () => { throw new Error("Unexpected reviewed push capability read."); }),
    findRemoteItemsByMarker: vi.fn(async () => { throw new Error("Unexpected reviewed push reconciliation."); }),
    writeRemoteIssue: vi.fn(async () => { throw new Error("Unexpected reviewed Issue write."); }),
    writeMilestone: vi.fn(async () => { throw new Error("Unexpected reviewed Milestone write."); })
  };
}

export function reviewedPushPlanningFixture(evidence: RemotePushEvidence): WorkItemProvider {
  return {
    ...reviewedPushProviderFixture(),
    readPushInputs: vi.fn(async () => evidence),
    findRemoteItemsByMarker: vi.fn(async () => ({ complete: true as const, matches: [] })),
    validateConnection: vi.fn(async () => { throw new Error("Unexpected connection verification."); }),
    listRemoteItems: vi.fn(async () => { throw new Error("Unexpected incoming Issue listing."); }),
    getRemoteItem: vi.fn(async () => { throw new Error("Unexpected bound Issue read."); }),
    createOrUpdateRemoteItem: vi.fn(async () => { throw new Error("Unexpected legacy Issue write."); })
  };
}
