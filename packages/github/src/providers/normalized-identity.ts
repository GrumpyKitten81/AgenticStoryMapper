import { DomainError, remoteWorkItemIdentity, type ConnectorConnection, type WorkItemIdentity } from "@storymapper/contracts";
import type { RemoteWorkItem } from "./work-item-provider";

export function remoteMilestoneIdentity(connection: ConnectorConnection, remote: RemoteWorkItem): WorkItemIdentity | undefined {
  if (!remote.milestone && remote.milestoneNumber === undefined) return undefined;
  const issue = remoteWorkItemIdentity(connection, remote);
  const identity = connection.provider === "github" ? { owner: issue.owner, repository: issue.repository, resource: "milestone" as const, remoteId: String(remote.milestoneNumber), number: remote.milestoneNumber!, url: `https://github.com/${issue.repo}/milestone/${remote.milestoneNumber}` } : remote.milestoneIdentity;
  if (!identity || !remote.milestone || identity.number !== remote.milestoneNumber) throw new DomainError("validation", "Remote Milestone requires its normalized identity and number.");
  remoteWorkItemIdentity(connection, { remoteId: identity.remoteId, remoteNumber: identity.number, url: identity.url, identity }, "milestone");
  return identity;
}
