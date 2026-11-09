import { describe, expect, it, vi } from "vitest";
import { completeGitHubList, findGitHubMarkerMatches, readGitHubPushInputs, writeGitHubIssue, writeGitHubMilestone, type GitHubApiRequest } from "./github-remote-push";

const issue = { number: 7, html_url: "https://github.com/owner/repo/issues/7", title: "Issue", body: "<!-- storymapper:footer:start -->\n<!-- stable-marker -->\n<!-- storymapper:footer:end -->", state: "open", labels: [{ name: "external" }], type: { name: "Task" }, milestone: { number: 3, title: "Release", due_on: null, description: "Authored milestone goal", state: "closed" } };
const milestone = { number: 3, html_url: "https://github.com/owner/repo/milestone/3", title: "Release", description: "Goal\n\n<!-- stable-marker -->", due_on: null, state: "open" };
const exact = { title: "Issue", body: "Body", labels: ["external", "status:todo"], issueType: "Task", remoteState: "open" as const, milestoneNumber: 3 };

describe("explicit GitHub effects", () => {
  it("sends the exact native type, complete labels and reviewed Milestone number in one write", async () => {
    const request = vi.fn().mockResolvedValue(issue);
    const result = await writeGitHubIssue(request as GitHubApiRequest, "repos/owner/repo", exact);
    expect(request.mock.calls).toEqual([["POST", "repos/owner/repo/issues", { title: "Issue", body: "Body", labels: ["external", "status:todo"], type: "Task", milestone: 3 }]]);
    expect(result).toMatchObject({ remoteId: "7", milestoneNumber: 3, milestoneDescription: "Authored milestone goal", milestoneState: "closed", issueType: "Task", labels: ["external"] });
  });

  it("reviews state and Milestone clearing without adding hidden writes", async () => {
    const request = vi.fn().mockResolvedValue(issue);
    await writeGitHubIssue(request as GitHubApiRequest, "repos/owner/repo", { ...exact, remoteId: "7", remoteState: "closed", milestoneNumber: null, labels: [] });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("PATCH", "repos/owner/repo/issues/7", { title: "Issue", body: "Body", labels: [], type: "Task", milestone: null, state: "closed" });
  });

  it("rejects unsupported compound effects before the first modifying call", async () => {
    const request = vi.fn();
    await expect(writeGitHubIssue(request as GitHubApiRequest, "repos/owner/repo", { ...exact, remoteState: "closed" })).rejects.toThrow("separately reviewed state");
    await expect(writeGitHubIssue(request as GitHubApiRequest, "repos/owner/repo", { ...exact, parentIssueNumber: 1 })).rejects.toThrow("separately reviewed relationship");
    expect(request).not.toHaveBeenCalled();
  });

  it("writes one explicit Milestone including cleared goal/date and released state", async () => {
    const request = vi.fn().mockResolvedValue(milestone);
    await writeGitHubMilestone(request as GitHubApiRequest, "repos/owner/repo", { remoteId: "3", title: "Renamed", description: "", dueOn: null, state: "closed" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("PATCH", "repos/owner/repo/milestones/3", { title: "Renamed", description: "", due_on: null, state: "closed" });
  });
});

describe("complete repository evidence", () => {
  it("traverses repository pages rather than capped search and excludes pull requests", async () => {
    const request = vi.fn().mockResolvedValueOnce(Array.from({ length: 100 }, (_, number) => ({ ...issue, number: number + 10, body: "" }))).mockResolvedValueOnce([issue, { ...issue, number: 8, pull_request: {} }, { ...issue, number: 9, body: "Authored text <!-- stable-marker -->" }]);
    const result = await findGitHubMarkerMatches(request as GitHubApiRequest, "repos/owner/repo", "issue", "stable-marker");
    expect(result).toMatchObject({ complete: true, matches: [{ remoteId: "7" }] });
    expect(request.mock.calls.map((call) => call[1])).toEqual(["repos/owner/repo/issues?state=all&per_page=100&page=1", "repos/owner/repo/issues?state=all&per_page=100&page=2"]);
  });

  it("retains ambiguous matches and refuses failed or malformed listing evidence", async () => {
    const request = vi.fn().mockResolvedValue([milestone, { ...milestone, number: 4 }]);
    expect((await findGitHubMarkerMatches(request as GitHubApiRequest, "repos/owner/repo", "milestone", "stable-marker")).matches).toHaveLength(2);
    request.mockRejectedValueOnce(new Error("transport failed"));
    await expect(findGitHubMarkerMatches(request as GitHubApiRequest, "repos/owner/repo", "issue", "stable-marker")).rejects.toThrow("transport failed");
    request.mockResolvedValueOnce({ partial: true });
    await expect(completeGitHubList(request as GitHubApiRequest, "repos/owner/repo/issues")).rejects.toThrow("incomplete");
  });

  it("reads native repository types, labels and complete Milestones with permission evidence", async () => {
    const request = vi.fn().mockResolvedValueOnce({ permissions: { push: true } }).mockResolvedValueOnce([{ name: "Task", is_enabled: true }, { name: "Disabled", is_enabled: false }]).mockResolvedValueOnce([{ name: "external" }]).mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ ...milestone, number: index + 10 }))).mockResolvedValueOnce([milestone]);
    const result = await readGitHubPushInputs(request as GitHubApiRequest, "repos/owner/repo");
    expect(result).toMatchObject({ writable: true, issueTypes: ["Task"], labels: ["external"] });
    expect(result.milestones).toHaveLength(101);
    expect(request.mock.calls.at(-1)?.[1]).toContain("milestones?state=all&per_page=100&page=2");
  });
});

it("retains absent REST Issue Milestone metadata and rejects incomplete standalone Milestones", async () => {
  const request = vi.fn().mockResolvedValue({ ...issue, milestone: { number: 3, title: "Release", due_on: null } });
  const result = await writeGitHubIssue(request as GitHubApiRequest, "repos/owner/repo", exact);
  expect(result.milestoneDescription).toBeUndefined();
  expect(result.milestoneState).toBeUndefined();
  for (const field of ["description", "state"] as const) {
    const incomplete: Partial<typeof milestone> = { ...milestone };
    delete incomplete[field];
    request.mockResolvedValue(incomplete);
    await expect(writeGitHubMilestone(request as GitHubApiRequest, "repos/owner/repo", { title: "Release", description: "", dueOn: null, state: "open" })).rejects.toThrow("incomplete Milestone metadata");
  }
});
