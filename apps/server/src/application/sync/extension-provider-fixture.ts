import { vi } from "vitest";
import { DomainError } from "@storymapper/contracts/schemas/errors";
import type { RemoteIssuePayload, RemoteMilestone, RemoteMilestonePayload, RemotePushEvidence, WorkItemIdentity } from "@storymapper/contracts";
import type { RemoteWorkItem, WorkItemProvider } from "@storymapper/github";

export const extensionProviderId = "extension-fixture";

export function extensionIdentity(resource: WorkItemIdentity["resource"], number: number, scope: Pick<WorkItemIdentity, "owner" | "repository"> = { owner: "extension", repository: "fixture" }): WorkItemIdentity {
  return { ...scope, resource, remoteId: `${resource}-${number}`, number, url: `https://work-items.example.test/${scope.owner}/${scope.repository}/${resource}/${number}` };
}

export function extensionIssue(number = 1, scope?: Pick<WorkItemIdentity, "owner" | "repository">): RemoteWorkItem {
  const identity = extensionIdentity("issues", number, scope);
  return { identity, remoteId: identity.remoteId, remoteNumber: number, url: identity.url, title: `Extension item ${number}`, body: `Extension body ${number}`, labels: ["level:activity"], state: "open", issueType: "Task" };
}

export function extensionMilestone(number = 1): RemoteMilestone {
  const identity = extensionIdentity("milestone", number);
  return { identity, remoteId: identity.remoteId, remoteNumber: number, url: identity.url, title: `Extension release ${number}`, description: "Extension release goal", dueOn: "2026-11-20T00:00:00.000Z", state: "open" };
}

export function extensionProviderFixture() {
  const issues: RemoteWorkItem[] = [];
  const milestones: RemoteMilestone[] = [];
  const inputs: RemotePushEvidence = { issueTypes: ["Task"], labels: ["local-story-map", "story-map:LSM", "level:activity", "level:step", "level:story", "status:todo"], writable: true, milestones: [] };
  const provider = {
    validateConnection: vi.fn(async () => ({ ok: true, message: "Extension adapter verified." })),
    listRemoteItems: vi.fn(async () => structuredClone(issues)),
    getRemoteItem: vi.fn(async (_connection, _auth, remoteId: string) => {
      const item = issues.find((row) => row.remoteId === remoteId);
      return item ? { status: "found" as const, item: structuredClone(item) } : { status: "unavailable" as const };
    }),
    readPushInputs: vi.fn(async () => structuredClone({ ...inputs, milestones })),
    findRemoteItemsByMarker: vi.fn(async (_connection, _auth, kind: "issue" | "milestone", marker: string): ReturnType<WorkItemProvider["findRemoteItemsByMarker"]> => ({ complete: true, matches: structuredClone(kind === "issue" ? issues.filter((row) => row.body.includes(marker)) : milestones.filter((row) => row.description.includes(marker))) })),
    createOrUpdateRemoteItem: vi.fn(async () => { throw new DomainError("validation", "Extension adapter requires reviewed explicit effects."); }),
    writeRemoteIssue: vi.fn(async (_connection, _auth, payload: RemoteIssuePayload) => {
      const existing = issues.find((row) => row.remoteId === payload.remoteId);
      const identity = existing?.identity ?? extensionIdentity("issues", issues.length + 1);
      const milestone = milestones.find((row) => row.remoteNumber === payload.milestoneNumber);
      const item: RemoteWorkItem = { identity, remoteId: identity.remoteId, remoteNumber: identity.number, url: identity.url, title: payload.title, body: payload.body, labels: [...payload.labels], issueType: payload.issueType, state: payload.remoteState, ...(milestone ? { milestoneIdentity: milestone.identity, milestone: milestone.title, milestoneNumber: milestone.remoteNumber, milestoneDueOn: milestone.dueOn ?? undefined, milestoneDescription: milestone.description, milestoneState: milestone.state } : {}) };
      const index = issues.findIndex((row) => row.remoteId === item.remoteId);
      if (index < 0) issues.push(item); else issues[index] = item;
      return structuredClone(item);
    }),
    writeMilestone: vi.fn(async (_connection, _auth, payload: RemoteMilestonePayload) => {
      const existing = milestones.find((row) => row.remoteId === payload.remoteId);
      const identity = existing?.identity ?? extensionIdentity("milestone", milestones.length + 1);
      const item: RemoteMilestone = { ...payload, identity, remoteId: identity.remoteId, remoteNumber: identity.number, url: identity.url };
      const index = milestones.findIndex((row) => row.remoteId === item.remoteId);
      if (index < 0) milestones.push(item); else milestones[index] = item;
      for (const issue of issues) if (issue.milestoneNumber === item.remoteNumber) Object.assign(issue, { milestone: item.title, milestoneDueOn: item.dueOn ?? undefined, milestoneDescription: item.description, milestoneState: item.state });
      return structuredClone(item);
    })
  } satisfies WorkItemProvider;
  return { issues, milestones, inputs, provider };
}
