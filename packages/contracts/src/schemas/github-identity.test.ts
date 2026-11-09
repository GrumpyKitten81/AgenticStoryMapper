import { describe, expect, it } from "vitest";
import { githubLocatorSchema, parseGitHubLocator } from "./github-identity.js";

describe("canonical GitHub locator", () => {
  it.each([
    "http://github.com/o/r/issues/1",
    "https://user:pw@github.com/o/r/issues/1",
    "https://github.com/o/r/issues/1?x=1",
    "https://github.com/o/r/issues/1#frag",
    "https://github.com/o/r/issues/1/",
    "https://github.com/o/r/pull/3",
    "https://github.com/o/r/issues/0",
    "https://github.com/o/r/issues/007",
    "https://github.com/o/../issues/1",
    "https://example.com/o/r/issues/1",
    "https://github.com/-o/r/issues/1"
  ])("rejects %s", (value) => {
    expect(parseGitHubLocator(value)).toBeUndefined();
    expect(githubLocatorSchema.safeParse(value).success).toBe(false);
  });

  it("normalizes owner and repository case", () => {
    expect(parseGitHubLocator("https://github.com/Org/Repo/issues/7")).toMatchObject({ url: "https://github.com/org/repo/issues/7", repo: "org/repo", resource: "issues", number: 7 });
    expect(githubLocatorSchema.parse("https://github.com/Org/Repo/milestone/2")).toBe("https://github.com/org/repo/milestone/2");
  });
});
