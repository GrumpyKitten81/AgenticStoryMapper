import { describe, expect, it } from "vitest";
import { splitMarkdownIntoChunks } from "./import-markdown";

describe("splitMarkdownIntoChunks", () => {
  it("splits markdown by headings and paragraph breaks", () => {
    const chunks = splitMarkdownIntoChunks("# Goal\n\nFirst paragraph.\n\n## Details\nSecond paragraph.");

    expect(chunks).toEqual([
      { heading: "Goal", locator: "Goal#1", text: "First paragraph." },
      { heading: "Goal > Details", locator: "Goal > Details#2", text: "Second paragraph." }
    ]);
  });

  it("keeps heading ancestry through repeated headings and assigns a global block index", () => {
    expect(splitMarkdownIntoChunks("Before.\n\n# Guide\n\n- one\n- two\n\n## Setup\n\n| A | B |\n|---|---|\n\n## Setup\n\nDone.")).toEqual([
      { locator: "paragraph#1", text: "Before." },
      { heading: "Guide", locator: "Guide#2", text: "- one\n- two" },
      { heading: "Guide > Setup", locator: "Guide > Setup#3", text: "| A | B |\n|---|---|" },
      { heading: "Guide > Setup", locator: "Guide > Setup#4", text: "Done." }
    ]);
  });

  it("keeps fenced headings in their enclosing chunk and normalizes line endings", () => {
    const markdown = "# Guide\r\n\r\n```md\r\n# Not a heading\r\n```\r\n\r\n## Setup\r\n\r\nReady.";
    expect(splitMarkdownIntoChunks(markdown)).toEqual([
      { heading: "Guide", locator: "Guide#1", text: "```md\n# Not a heading\n```" },
      { heading: "Guide > Setup", locator: "Guide > Setup#2", text: "Ready." }
    ]);
  });

  it("does not treat a fence marker with trailing text as a closing fence", () => {
    expect(splitMarkdownIntoChunks("# Guide\n\n```md\n``` not closed\n# Still code\n```\n\n## End\n\nReady.")).toEqual([
      { heading: "Guide", locator: "Guide#1", text: "```md\n``` not closed\n# Still code\n```" },
      { heading: "Guide > End", locator: "Guide > End#2", text: "Ready." }
    ]);
  });

  it("keeps trailing hashes that are part of the title and strips closing sequences", () => {
    expect(splitMarkdownIntoChunks("# Learn C#\n\nOne.\n\n## Closed ##\n\nTwo.")).toEqual([
      { heading: "Learn C#", locator: "Learn C##1", text: "One." },
      { heading: "Learn C# > Closed", locator: "Learn C# > Closed#2", text: "Two." }
    ]);
  });
});
