import type { ChangeOperation, Release } from "@storymapper/contracts";
import { proposeHappyPathSlice } from "@storymapper/core";

export function buildReleaseSliceOperations(storyMapId: string, candidate: ReturnType<typeof proposeHappyPathSlice>, release: Release | undefined, versionsByCardId: Map<string, number>, rationale?: string): ChangeOperation[] {
  return release
    ? candidate.cardIds.map((cardId): ChangeOperation => ({
        op: "update",
        entity: "card",
        operationId: `assign-card-${cardId}`,
        entityId: cardId,
        baseVersion: versionsByCardId.get(cardId)!,
        after: { releaseId: release.id },
        reason: rationale ?? `Include in ${release.name} happy-path release slice.`
      }))
    : [{
        op: "create",
        entity: "release",
        operationId: "create-release-1",
        entityId: "proposed-release-1",
        after: {
          storyMapId,
          name: candidate.name,
          goal: candidate.goal
        },
        reason: rationale ?? "Create a release for the proposed happy-path slice."
      } satisfies ChangeOperation, ...candidate.cardIds.map((cardId): ChangeOperation => ({
        op: "update",
        entity: "card",
        operationId: `assign-card-${cardId}`,
        entityId: cardId,
        baseVersion: versionsByCardId.get(cardId)!,
        after: { releaseId: "proposed-release-1" },
        reason: rationale ?? "Assign to proposed happy-path release."
      }))];

}
