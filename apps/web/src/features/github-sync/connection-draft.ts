import type { CardLevel, ConnectorConnection, CreateConnectorConnectionRequest, UpdateConnectorConnectionRequest } from "@storymapper/contracts";
import { panelStrings } from "@storymapper/ui-strings";

type Provider = "github";
type AuthMode = "github-cli" | "token";
type ReleaseSource = NonNullable<ConnectorConnection["releaseSource"]>;

interface TypeMappingDraft {
  match: string;
  level: CardLevel;
}

interface StatusMappingDraft {
  localStatus: string;
  remoteState: "open" | "closed";
  labels: string;
}

export interface ConnectionDraft {
  provider: Provider;
  authMode: AuthMode;
  name: string;
  owner: string;
  repository: string;
  readOnly: boolean;
  defaultLabel: string;
  releaseSource: ReleaseSource;
  iterationFieldName: string;
  labelsAsAnnotations: boolean;
  typeMapping: TypeMappingDraft[];
  issueTypeMapping: ConnectorConnection["issueTypeMapping"];
  statusMapping: StatusMappingDraft[];
  statusSource?: ConnectorConnection["statusSource"];
}

export function createDefaultConnectionDraft(): ConnectionDraft {
  return {
    provider: "github",
    authMode: "github-cli",
    name: panelStrings.gitHubRepo,
    owner: "",
    repository: "",
    readOnly: true,
    defaultLabel: "local-story-map",
    releaseSource: "milestone",
    iterationFieldName: "Iteration",
    labelsAsAnnotations: false,
    issueTypeMapping: [],
    typeMapping: [
      { match: "epic", level: "activity" },
      { match: "feature", level: "step" }
    ],
    statusSource: { kind: "repository" },
    statusMapping: []
  };
}

export function createConnectionPayload(projectId: string, draft: ConnectionDraft): CreateConnectorConnectionRequest {
  return { projectId, ...connectorConnectionFields(draft) };
}

export function updateConnectionPayload(draft: ConnectionDraft): UpdateConnectorConnectionRequest {
  const { provider, ...input } = connectorConnectionFields(draft);
  return input;
}

function connectorConnectionFields(draft: ConnectionDraft): Omit<CreateConnectorConnectionRequest, "projectId"> {
  return {
    provider: draft.provider,
    statusSource: draft.statusSource ?? { kind: "repository" },
    authMode: draft.authMode,
    name: draft.name.trim(),
    owner: draft.owner.trim(),
    defaultLabel: draft.defaultLabel.trim() || "local-story-map",
    readOnly: draft.readOnly,
    releaseSource: draft.releaseSource,
    iterationFieldName: draft.iterationFieldName.trim() || "Iteration",
    labelsAsAnnotations: draft.labelsAsAnnotations,
    issueTypeMapping: draft.issueTypeMapping.map((entry) => ({ ...entry, issueType: entry.issueType.trim() })).filter((entry) => entry.issueType.length > 0),
    typeMapping: draft.typeMapping
      .map((entry) => ({ match: entry.match.trim(), level: entry.level }))
      .filter((entry) => entry.match.length > 0),
    statusMapping: draft.statusMapping.map((entry) => ({
      localStatus: entry.localStatus.trim(),
      remoteState: entry.remoteState,
      labels: entry.labels.split(",").map((label) => label.trim()).filter(Boolean)
    })).filter((entry) => entry.localStatus.length > 0),
    repository: draft.repository.trim()
  };
}


export function connectionToDraft(connection?: ConnectorConnection): ConnectionDraft {
  if (!connection) return createDefaultConnectionDraft();
  return { ...connection, provider: "github", authMode: connection.authMode as ConnectionDraft["authMode"], repository: connection.repository ?? "", issueTypeMapping: connection.issueTypeMapping.map((entry) => ({ ...entry })), typeMapping: connection.typeMapping.map((entry) => ({ ...entry })), statusMapping: connection.statusMapping.map((entry) => ({ localStatus: entry.localStatus, remoteState: entry.remoteState as "open" | "closed", labels: entry.labels.join(", ") })) };
}
