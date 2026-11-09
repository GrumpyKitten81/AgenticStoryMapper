import { DomainError, type RemoteMilestone, type RemotePushEffect } from "@storymapper/contracts";
import type { RemoteWorkItem } from "@storymapper/github";

export type RemotePushResult = RemoteWorkItem | RemoteMilestone;

export function normalizedDueOn(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DomainError("validation", "Remote Milestone returned an invalid due date.");
  return date.toISOString();
}

export function remotePushEvidence(value: RemotePushResult, milestones: RemoteMilestone[] = []): object {
  if ("body" in value) {
    const milestone = milestones.find((row) => row.remoteNumber === value.milestoneNumber);
    return { kind: "issue", remoteId: value.remoteId, title: value.title, body: value.body, state: value.state.toLowerCase(), labels: [...new Set(value.labels)].sort(), issueType: value.issueType ?? null, parentNumber: value.parentNumber ?? null,
      milestoneNumber: value.milestoneNumber ?? null, milestone: value.milestone ?? milestone?.title ?? null, milestoneDueOn: normalizedDueOn(value.milestoneDueOn ?? milestone?.dueOn), milestoneDescription: value.milestoneDescription ?? milestone?.description ?? null, milestoneState: value.milestoneState ?? milestone?.state ?? null };
  }
  return { kind: "milestone", remoteId: value.remoteId, title: value.title, description: value.description, dueOn: normalizedDueOn(value.dueOn), state: value.state.toLowerCase() };
}

export function remoteMatchesIntent(payload: RemotePushEffect["payload"], remote: RemotePushResult): boolean {
  if (payload.remoteId !== undefined && payload.remoteId !== remote.remoteId) return false;
  if ("body" in payload && "body" in remote) return payload.title === remote.title && payload.body === remote.body && payload.remoteState === remote.state.toLowerCase() && payload.issueType === remote.issueType && sameLabels(payload.labels, remote.labels) && payload.milestoneNumber === (remote.milestoneNumber ?? null) && (payload.parentIssueNumber === undefined || payload.parentIssueNumber === remote.parentNumber);
  if ("description" in payload && "description" in remote) return payload.title === remote.title && payload.description === remote.description && normalizedDueOn(payload.dueOn) === normalizedDueOn(remote.dueOn) && payload.state === remote.state.toLowerCase();
  return false;
}

function sameLabels(left: string[], right: string[]): boolean {
  const expected = [...new Set(left)].sort();
  const actual = [...new Set(right)].sort();
  return expected.length === actual.length && expected.every((label, index) => label === actual[index]);
}
