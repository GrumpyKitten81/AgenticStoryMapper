import { DomainError } from "@storymapper/contracts";
import type { GitHubApiRequest } from "@storymapper/github/providers/github-remote-push";

export async function resolveGitHubIssueDatabaseId(request: GitHubApiRequest, repositoryPath: string, number: number, reviewedUrl: string): Promise<number> {
  assertPositive(number);
  const issue = await request<{ id?: unknown; number?: unknown; html_url?: unknown }>("GET", `${repositoryPath}/issues/${number}`);
  if (!issue || issue.number !== number || issue.html_url !== reviewedUrl || typeof issue.id !== "number" || !Number.isSafeInteger(issue.id) || issue.id <= 0) {
    throw new DomainError("conflict", "GitHub Issue identity does not match the reviewed child.");
  }
  return issue.id;
}

export async function writeGitHubSubIssue(request: GitHubApiRequest, repositoryPath: string, operation: "add" | "remove", parentNumber: number, childDatabaseId: number): Promise<unknown> {
  assertPositive(parentNumber);
  assertPositive(childDatabaseId);
  return request(operation === "add" ? "POST" : "DELETE", `${repositoryPath}/issues/${parentNumber}/${operation === "add" ? "sub_issues" : "sub_issue"}`, { sub_issue_id: childDatabaseId });
}

function assertPositive(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DomainError("validation", "GitHub relationship requires positive numeric identities.");
}
