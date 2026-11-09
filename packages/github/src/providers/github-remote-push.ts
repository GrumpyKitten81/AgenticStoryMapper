import { DomainError, type RemoteIssuePayload, type RemoteMilestone, type RemoteMilestonePayload, type RemotePushEvidence } from "@storymapper/contracts";
import type { RemoteWorkItem } from "@storymapper/github";

export type GitHubApiRequest = <T>(method: "GET" | "POST" | "PATCH", path: string, payload?: Record<string, unknown>) => Promise<T>;
interface MilestoneResponse { number: number; html_url: string; title: string; description: string | null; due_on: string | null; state: "open" | "closed" }
interface IssueResponse { number: number; html_url: string; title: string; body: string | null; state: string; labels: Array<string | { name?: string }>; type?: { name: string } | null; milestone?: { number: number; title: string; due_on: string | null; description?: string | null; state?: string } | null; pull_request?: unknown }

export async function completeGitHubList<T>(request: GitHubApiRequest, path: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await request<T[]>("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new DomainError("validation", "GitHub returned an incomplete repository listing.");
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}

export async function readGitHubPushInputs(request: GitHubApiRequest, repositoryPath: string): Promise<RemotePushEvidence> {
  const repo = await request<{ permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } }>("GET", repositoryPath);
  const issueTypes = await completeGitHubList<{ name: string; is_enabled?: boolean }>(request, `${repositoryPath}/issue-types`);
  const labels = await completeGitHubList<{ name: string }>(request, `${repositoryPath}/labels`);
  const milestones = await completeGitHubList<MilestoneResponse>(request, `${repositoryPath}/milestones?state=all`);
  return {
    writable: [repo.permissions?.push, repo.permissions?.maintain, repo.permissions?.admin].some((value) => value === true),
    issueTypes: issueTypes.filter((type) => type.is_enabled !== false).map((type) => type.name).sort(),
    labels: labels.map((label) => label.name).sort(),
    milestones: milestones.map(fromMilestone).sort((left, right) => left.remoteNumber - right.remoteNumber)
  };
}

export async function findGitHubMarkerMatches(request: GitHubApiRequest, repositoryPath: string, kind: "issue" | "milestone", marker: string): Promise<{ complete: true; matches: Array<RemoteWorkItem | RemoteMilestone> }> {
  const expected = `<!-- ${marker} -->`;
  if (kind === "milestone") {
    const milestones = await completeGitHubList<MilestoneResponse>(request, `${repositoryPath}/milestones?state=all`);
    return { complete: true, matches: milestones.filter((milestone) => milestone.description?.includes(expected)).map(fromMilestone) };
  }
  const issues = await completeGitHubList<IssueResponse>(request, `${repositoryPath}/issues?state=all`);
  return { complete: true, matches: issues.filter((issue) => !issue.pull_request && hasMachineMarker(issue.body, expected)).map(fromRestIssue) };
}

export async function writeGitHubIssue(request: GitHubApiRequest, repositoryPath: string, payload: RemoteIssuePayload): Promise<RemoteWorkItem> {
  if (payload.parentIssueNumber) throw new DomainError("validation", "Parent Issue changes require a separately reviewed relationship effect.");
  if (!payload.remoteId && payload.remoteState !== "open") throw new DomainError("validation", "Create an open Issue before a separately reviewed state update.");
  const values = { title: payload.title, body: payload.body, labels: payload.labels, type: payload.issueType, milestone: payload.milestoneNumber, ...(payload.remoteId ? { state: payload.remoteState } : {}) };
  const issue = await request<IssueResponse>(payload.remoteId ? "PATCH" : "POST", `${repositoryPath}/issues${payload.remoteId ? `/${positiveNumber(payload.remoteId)}` : ""}`, values);
  return fromRestIssue(issue);
}

export async function writeGitHubMilestone(request: GitHubApiRequest, repositoryPath: string, payload: RemoteMilestonePayload): Promise<RemoteMilestone> {
  const values = { title: payload.title, description: payload.description, due_on: payload.dueOn, state: payload.state };
  const milestone = await request<MilestoneResponse>(payload.remoteId ? "PATCH" : "POST", `${repositoryPath}/milestones${payload.remoteId ? `/${positiveNumber(payload.remoteId)}` : ""}`, values);
  return fromMilestone(milestone);
}

export function fromRestIssue(issue: IssueResponse): RemoteWorkItem {
  return { remoteId: String(issue.number), remoteNumber: issue.number, title: issue.title, body: issue.body ?? "", state: issue.state.toLowerCase(), labels: issue.labels.map((label) => typeof label === "string" ? label : label.name).filter((label): label is string => Boolean(label)), url: issue.html_url, milestone: issue.milestone?.title, milestoneNumber: issue.milestone?.number, milestoneDueOn: issue.milestone?.due_on ?? undefined, milestoneDescription: issue.milestone?.description === null ? "" : issue.milestone?.description, milestoneState: issue.milestone?.state?.toLowerCase(), issueType: issue.type?.name };
}

function fromMilestone(milestone: MilestoneResponse): RemoteMilestone {
  if (milestone.description !== null && typeof milestone.description !== "string" || !["open", "closed"].includes(milestone.state)) throw new DomainError("validation", "GitHub returned incomplete Milestone metadata.");
  return { remoteId: String(milestone.number), remoteNumber: milestone.number, url: milestone.html_url, title: milestone.title, description: milestone.description ?? "", dueOn: milestone.due_on, state: milestone.state };
}

function positiveNumber(value: string): number {
  if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new DomainError("validation", "GitHub effect requires a positive remote number.");
  return Number(value);
}

function hasMachineMarker(body: string | null, marker: string): boolean {
  return Boolean(body?.split("<!-- storymapper:footer:start -->").slice(1).some((part) => {
    const end = part.indexOf("<!-- storymapper:footer:end -->");
    return end !== -1 && part.slice(0, end).includes(marker);
  }));
}
