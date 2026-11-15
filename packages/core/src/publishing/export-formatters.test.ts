import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import { buildStoryMapMarkdown } from "@storymapper/core/publishing/export-formatters";

it("preserves working rules as literal Markdown with a safe fence", () => {
  const id = randomUUID();
  const time = "2026-11-15T00:00:00Z";
  const workingRules = "  # Apparent map section\n```\n\nKeep spacing  \n";
  const snapshot = storyMapSnapshotSchema.parse({
    storyMap: { id, projectId: id, name: "Map", version: 1, createdAt: time, updatedAt: time },
    cards: [], releases: [], cardDependencies: [],
    productContext: { id, projectId: id, storyMapId: id, workingRules, updatedAt: time }
  });
  const markdown = buildStoryMapMarkdown(snapshot, time);
  expect(markdown).toContain(`## Working rules (advisory)\n\n\`\`\`\`\n${workingRules}\`\`\`\`\n`);
});
