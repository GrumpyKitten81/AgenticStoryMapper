import { describe, expect, it } from "vitest";
import { buildGitHubMilestoneDescription, gitHubMilestoneMarker, managedLabelDiff, stripGitHubMilestoneMarker } from "@storymapper/core";

describe("reviewed remote payload helpers", () => {
  it("removes only managed labels and preserves unrelated labels exactly", () => {
    expect(managedLabelDiff(["external", "status:todo", "old-map", "old-annotation"], ["status:active", "new-map"], ["status:todo", "status:active", "old-map", "new-map", "old-annotation"])).toEqual({ labels: ["external", "new-map", "status:active"], additions: ["new-map", "status:active"], removals: ["old-annotation", "old-map", "status:todo"] });
  });

  it("keeps stable Release identity through name changes and preserves authored description bytes", () => {
    const marker = gitHubMilestoneMarker({ id: "release-id", storyMapId: "map-id" }, "project-id");
    const description = "\r\nGoal with trailing whitespace \r\n";
    const body = buildGitHubMilestoneDescription(description, marker);
    expect(stripGitHubMilestoneMarker(body)).toBe(description);
    expect(buildGitHubMilestoneDescription(body, marker)).toBe(body);
    expect(body.match(/<!-- storymapper:/gu)).toHaveLength(1);
  });
});
