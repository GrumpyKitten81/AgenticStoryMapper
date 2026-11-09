import { expect, it } from "vitest";
import { cardTooltip } from "@storymapper/web/features/story-map/card-tooltip";

it.each(["", " \n\t "])("keeps only the title for an empty description %j", (description) => {
  expect(cardTooltip({ title: "Title", description })).toBe("Title");
});

it("normalizes multiline whitespace and preserves content as plain text", () => {
  expect(cardTooltip({ title: "Title", description: "  First\n\n second\t<script>text</script>  " })).toBe("Title\n\nFirst second <script>text</script>");
});

it("only marks truncated descriptions and preserves complete Unicode characters", () => {
  const description = "🗺".repeat(300);
  expect(cardTooltip({ title: "Title", description })).toBe(`Title\n\n${description}`);
  expect(cardTooltip({ title: "Title", description: `${description} more` })).toBe(`Title\n\n${description}…`);
});
