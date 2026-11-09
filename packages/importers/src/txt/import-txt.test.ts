import { describe, expect, it } from "vitest";
import { splitTextIntoChunks } from "./import-txt";

describe("splitTextIntoChunks", () => {
  it("splits plain text by blank-line paragraph blocks", () => {
    const chunks = splitTextIntoChunks("First requirement.\n\nSecond requirement.\ncontinued.");

    expect(chunks).toEqual([
      { locator: "paragraph#1", text: "First requirement." },
      { locator: "paragraph#2", text: "Second requirement.\ncontinued." }
    ]);
  });

  it("normalizes line endings without changing byte-exact document hashes", () => {
    expect(splitTextIntoChunks("First.\r\n\r\nSecond.\r\ncontinued.")).toEqual([
      { locator: "paragraph#1", text: "First." },
      { locator: "paragraph#2", text: "Second.\ncontinued." }
    ]);
  });
});
