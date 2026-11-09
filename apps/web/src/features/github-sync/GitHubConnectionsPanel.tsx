import type { CredentialStatus } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, GitBranch, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { githubConnectStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { api, useConnectorConnections, useCredentialStatus, useSafetySettings } from "@storymapper/web/app/api";
import { createDefaultConnectionDraft, createConnectionPayload, updateConnectionPayload, connectionToDraft } from "@storymapper/web/features/github-sync/connection-draft";
import { GitHubConnectionFields } from "@storymapper/web/features/github-sync/GitHubConnectionFields";
import { GitHubConnectDialog } from "@storymapper/web/features/github-sync/GitHubConnectDialog";

interface GitHubConnectionsPanelProps {
  projectId?: string | undefined;
  storyMapId?: string | undefined;
}

export function GitHubConnectionsPanel(props: GitHubConnectionsPanelProps) {
  return renderGitHubConnectionsPanel(useGitHubConnectionsPanelState(props));
}

function useGitHubConnectionsPanelState(props: GitHubConnectionsPanelProps) {
  const context = useConnectionSelection(props);
  const { projectId, credentialStatus, selectedConnectionId, setSelectedConnectionId, connectionDraft, setConnectionDraft, setMessage, invalidate } = context;

  const updateConnection = useMutation({
    mutationFn: () => {
      if (!selectedConnectionId) throw new Error(panelStrings.selectAConnectionFirst);
      return api.updateConnectorConnection(selectedConnectionId, updateConnectionPayload(connectionDraft));
    },
    onSuccess: () => {
      setMessage(panelStrings.connectionUpdated);
      invalidate();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.connectionUpdateFailed)
  });
  const validateConnection = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error(panelStrings.projectIsRequired);
      return api.validateConnectorConnection(createConnectionPayload(projectId, connectionDraft));
    },
    onSuccess: (result) => setMessage(result.message),
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.validationFailed)
  });
  const deleteConnection = useMutation({
    mutationFn: () => {
      if (!selectedConnectionId) throw new Error(panelStrings.selectAConnectionFirst);
      return api.deleteConnectorConnection(selectedConnectionId);
    },
    onSuccess: () => {
      setSelectedConnectionId("");
      setConnectionDraft(createDefaultConnectionDraft());
      setMessage(panelStrings.connectionDeleted);
      invalidate();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.deleteFailed)
  });

  const visibleCredentialStatuses = (credentialStatus.data?.credentials ?? []).filter((status) => status.provider === connectionDraft.provider);
  return { ...context, visibleCredentialStatuses, validateConnection, updateConnection, deleteConnection };
}

function renderGitHubConnectionsPanel({ projectId, storyMapId, connectorEnabled, connections, selectedConnectionId, setSelectedConnectionId, connectionDraft, setConnectionDraft, visibleCredentialStatuses, validateConnection, setConnectOpen, updateConnection, deleteConnection, connectOpen, selectedConnection, setMessage, message }: ReturnType<typeof useGitHubConnectionsPanelState>) {
  return (
    <section className="customization-block github-connections-panel">
      <h3><GitBranch size={15} /> {panelStrings.projectConnections}</h3>
      <p className="muted">{panelStrings.projectConnectionsHint}</p>
      {projectId && storyMapId ? (
        <Link className="button-link secondary" to="/projects/$projectId/story-maps/$storyMapId/github" params={{ projectId, storyMapId }}>
          <ArrowLeft size={16} /> {panelStrings.returnToStoryMapSync}</Link>
      ) : null}

      {!connectorEnabled ? (
        <p>
          <AlertTriangle size={15} /> {panelStrings.theGitHubConnectorIsDisabledInSafetySettings}
        </p>
      ) : null}

      <div className="customization-list">
        {(connections.data?.connections ?? []).map((connection) => (
          <span className="custom-chip" key={connection.id}>{connection.name} {panelStrings.categorySeparator}{connection.provider} {panelStrings.categorySeparator}{connection.owner}{connection.repository ? panelStrings.repositorySuffix(connection.repository) : ""}</span>
        ))}
      </div>

      <div className="github-connection-form form-stack">
        <select aria-label={strings.connectionSelection} value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)}>
          <option value="">{panelStrings.newConnection}</option>
          {connections.data?.connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
        {selectedConnectionId ? <>
          <label>{panelStrings.auth}<select value={connectionDraft.authMode} onChange={(event) => setConnectionDraft((draft) => ({ ...draft, authMode: event.target.value as "github-cli" | "token" }))}>
            <option value="github-cli">{panelStrings.gitHubCLI}</option><option value="token">{panelStrings.token}</option>
          </select></label>
          <GitHubConnectionFields projectId={projectId ?? ""} draft={connectionDraft} setDraft={setConnectionDraft} />
        </> : null}
        <CredentialStatusList credentials={visibleCredentialStatuses} />
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => validateConnection.mutate()} disabled={!projectId || !selectedConnectionId || !connectorEnabled}><ShieldCheck size={16} /> {panelStrings.validate}</button>
          <button type="button" onClick={() => setConnectOpen(true)} disabled={!projectId}>{strings.open}</button>
          <button type="button" className="secondary" disabled={!selectedConnectionId} onClick={() => updateConnection.mutate()}><RefreshCcw size={16} /> {panelStrings.update}</button>
          <button type="button" className="danger" disabled={!selectedConnectionId} onClick={() => deleteConnection.mutate()}><Trash2 size={16} /> {panelStrings.delete}</button>
        </div>
      </div>

      {projectId ? <GitHubConnectDialog open={connectOpen} projectId={projectId} connection={selectedConnection} onClose={() => setConnectOpen(false)} onConnected={(connection) => { setSelectedConnectionId(connection.id); setMessage(strings.connected); }} /> : null}
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

function CredentialStatusList({ credentials }: { credentials: CredentialStatus[] }) {
  return (
    <div className="privacy-notice path-display">
      <ShieldCheck size={16} />
      <span>{credentials.length > 0 ? credentials.map((credential) => credential.message).join(" ") : panelStrings.credentialStatusIsNotAvailableYet}</span>
    </div>
  );
}

function useConnectionSelection({ projectId, storyMapId }: GitHubConnectionsPanelProps) {
  const queryClient = useQueryClient();
  const connections = useConnectorConnections(projectId);
  const credentialStatus = useCredentialStatus();
  const privacy = useSafetySettings(projectId);
  const connectorEnabled = privacy.data?.settings.github ?? false;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | undefined>(undefined);
  const selectedConnection = connections.data?.connections.find((connection) => connection.id === selectedConnectionId);
  const [connectionDraft, setConnectionDraft] = useState(createDefaultConnectionDraft);
  const [connectOpen, setConnectOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const firstConnection = connections.data?.connections[0];
    if (selectedConnectionId === undefined && connections.data) setSelectedConnectionId(firstConnection?.id ?? "");
  }, [connections.data?.connections, selectedConnectionId]);

  useEffect(() => {
    setConnectionDraft(connectionToDraft(selectedConnection));
  }, [selectedConnection?.id, selectedConnection?.updatedAt]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["card-reviews", projectId] });
    queryClient.invalidateQueries({ queryKey: ["connector-connections", projectId] });
    queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };
  return { projectId, storyMapId, connections, credentialStatus, connectorEnabled, selectedConnectionId, setSelectedConnectionId, selectedConnection, connectionDraft, setConnectionDraft, connectOpen, setConnectOpen, message, setMessage, invalidate };
}
