import { describe, expect, it, vi } from "vitest";
import { resolveGitHubIssueDatabaseId, writeGitHubSubIssue } from "./github-sub-issues";
import type { GitHubApiRequest } from "./github-remote-push";

describe("GitHub sub-issue primitives", () => {
  it("resolves the database ID only for the reviewed issue identity", async () => {
    const request = vi.fn().mockResolvedValue({ id: 1007, number: 7, html_url: "https://github.com/owner/repo/issues/7" });
    expect(await resolveGitHubIssueDatabaseId(request as GitHubApiRequest, "repos/owner/repo", 7, "https://github.com/owner/repo/issues/7")).toBe(1007);
    expect(request).toHaveBeenCalledWith("GET", "repos/owner/repo/issues/7");
    request.mockResolvedValueOnce({ id: 1007, number: 7, html_url: "https://github.com/other/repo/issues/7" });
    await expect(resolveGitHubIssueDatabaseId(request as GitHubApiRequest, "repos/owner/repo", 7, "https://github.com/owner/repo/issues/7")).rejects.toThrow("identity");
    request.mockResolvedValueOnce({ id: "node-id", number: 7, html_url: "https://github.com/owner/repo/issues/7" });
    await expect(resolveGitHubIssueDatabaseId(request as GitHubApiRequest, "repos/owner/repo", 7, "https://github.com/owner/repo/issues/7")).rejects.toThrow("identity");
  });

  it("sends separate add and remove requests with the numeric database ID", async () => {
    const request = vi.fn().mockResolvedValue({});
    await writeGitHubSubIssue(request as GitHubApiRequest, "repos/owner/repo", "remove", 3, 1007);
    await writeGitHubSubIssue(request as GitHubApiRequest, "repos/owner/repo", "add", 4, 1007);
    expect(request.mock.calls).toEqual([
      ["DELETE", "repos/owner/repo/issues/3/sub_issue", { sub_issue_id: 1007 }],
      ["POST", "repos/owner/repo/issues/4/sub_issues", { sub_issue_id: 1007 }]
    ]);
    await expect(writeGitHubSubIssue(request as GitHubApiRequest, "repos/owner/repo", "add", 4, 0)).rejects.toThrow("positive");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
