import { DomainError } from "@storymapper/contracts";
import type { WorkItemIdentity, ConnectionVerificationFailure, ConnectorConnection, CredentialSource, RepositoryCapabilities, SyncPlanItem, RemoteIssuePayload, RemoteMilestone, RemoteMilestonePayload, RemotePushEvidence } from "@storymapper/contracts";

export interface ProviderAuth {
  token?: string | undefined;
  cliToken?: string | undefined;
  source?: CredentialSource | undefined;
}

export interface RemoteIteration {
  title: string;
  startDate?: string | undefined;
  duration?: number | undefined;
}

export interface RemoteWorkItem {
  statusEvidence?: import("@storymapper/contracts").GitHubStatusEvidence | undefined;
  statusCatalog?: import("@storymapper/contracts").GitHubStatusCatalog | undefined;
  identity?: WorkItemIdentity | undefined;
  milestoneIdentity?: WorkItemIdentity | undefined;
  remoteId: string;
  remoteNumber?: number | undefined;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
  milestone?: string | undefined;
  milestoneNumber?: number | undefined;
  milestoneDueOn?: string | undefined;
  milestoneDescription?: string | undefined;
  milestoneState?: string | undefined;
  assignee?: string | undefined;
  issueType?: string | undefined;
  parentNumber?: number | undefined;
  iteration?: RemoteIteration | undefined;
}

export type RemoteItemRead = { status: "found"; item: RemoteWorkItem } | { status: "unavailable" };

export interface CreatedRemoteWorkItem extends RemoteWorkItem {
  remoteId: string;
}

export interface ValidateConnectionResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown> | undefined;
  failure?: ConnectionVerificationFailure | undefined;
  capabilities?: RepositoryCapabilities | undefined;
}

export interface WorkItemProvider {
  listStatusProjects?(connection: ConnectorConnection, auth: ProviderAuth): Promise<Array<{ id: string; name: string; fieldId: string }>>;
  readPushInputs(connection: ConnectorConnection, auth: ProviderAuth): Promise<RemotePushEvidence>;
  findRemoteItemsByMarker(connection: ConnectorConnection, auth: ProviderAuth, kind: "issue" | "milestone", marker: string): Promise<{ complete: true; matches: Array<RemoteWorkItem | RemoteMilestone> }>;
  writeRemoteIssue(connection: ConnectorConnection, auth: ProviderAuth, payload: RemoteIssuePayload): Promise<RemoteWorkItem>;
  writeMilestone(connection: ConnectorConnection, auth: ProviderAuth, payload: RemoteMilestonePayload): Promise<RemoteMilestone>;
  validateConnection(connection: ConnectorConnection, auth: ProviderAuth): Promise<ValidateConnectionResult>;
  listRemoteItems(connection: ConnectorConnection, auth: ProviderAuth, query?: string): Promise<RemoteWorkItem[]>;
  createOrUpdateRemoteItem(connection: ConnectorConnection, auth: ProviderAuth, item: SyncPlanItem): Promise<CreatedRemoteWorkItem>;
  getRemoteItem(connection: ConnectorConnection, auth: ProviderAuth, remoteId: string): Promise<RemoteItemRead>;
}

export function requireRemoteItem(result: RemoteItemRead): RemoteWorkItem {
  if (result.status === "unavailable") throw new DomainError("not_found", "Remote Issue is unavailable; its identity is retained.");
  return result.item;
}
