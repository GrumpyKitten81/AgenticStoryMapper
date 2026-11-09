import type { ConnectorConnection } from "@storymapper/contracts";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { githubConnectStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";
import { GitHubConnectionFields } from "@storymapper/web/features/github-sync/GitHubConnectionFields";
import { connectionToDraft, type ConnectionDraft } from "@storymapper/web/features/github-sync/connection-draft";
import { useGitHubConnect } from "@storymapper/web/features/github-sync/use-github-connect";

export interface GitHubConnectDialogProps {
  open: boolean;
  projectId: string;
  connection?: ConnectorConnection | undefined;
  onClose: () => void;
  onConnected?: ((connection: ConnectorConnection) => void) | undefined;
}

export function GitHubConnectDialog(props: GitHubConnectDialogProps) {
  const [draft, updateDraft] = useState(() => connectionToDraft(props.connection));
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const flow = useGitHubConnect({ ...props, draft, token, consent, onConnected: (connection) => { setToken(""); setConsent(false); props.onConnected?.(connection); } });
  const scope = `${props.projectId}:${props.connection?.id ?? ""}:${props.connection?.updatedAt ?? ""}`;
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    updateDraft(connectionToDraft(props.connection)); setToken(""); setConsent(false);
  }, [scope]);
  const setDraft = (value: SetStateAction<ConnectionDraft>) => {
    flow.invalidate();
    updateDraft(value);
  };
  if (!props.open) return null;
  return <Dialog title={strings.title} description={strings.description} onClose={() => { flow.invalidate(); props.onClose(); }}>
    <div className="github-connection-form form-stack">
      <label>{strings.method}<select value={draft.authMode} onChange={(event) => { setDraft((current) => ({ ...current, authMode: event.target.value as ConnectionDraft["authMode"] })); setConsent(false); }}>
        <option value="github-cli">{panelStrings.gitHubCLI}</option><option value="token">{panelStrings.token}</option>
      </select></label>
      {draft.authMode === "token" ? <><label>{strings.token}<input type="password" autoComplete="off" value={token} onChange={(event) => { flow.invalidate(); setToken(event.target.value); }} /></label><p>{strings.tokenHint}</p></> : <><p>{strings.cliHint}</p><button type="button" className="secondary" disabled={flow.pending !== null} onClick={flow.recheck}>{strings.recheck}</button></>}
      <GitHubConnectionFields projectId={props.projectId} draft={draft} setDraft={setDraft} />
      <label className="checkbox-row"><input type="checkbox" checked={consent} onChange={(event) => { flow.invalidate(); setConsent(event.target.checked); }} />{strings.consent}</label>
      {flow.cliStatus ? <p role="status">{flow.cliStatus}</p> : null}
      {flow.recoveryNotice ? <p role="status">{flow.recoveryNotice}</p> : null}
      {flow.error ? <p role="alert">{flow.error}</p> : null}
      {flow.pending ? <p role="status">{flow.pending === "recover" ? strings.recovering : flow.pending === "verify" ? strings.pendingVerify : flow.pending === "connect" ? strings.pendingConnect : strings.pendingRecheck}</p> : null}
      {flow.proof ? <div role="status"><p>{flow.proof.githubEnabled ? strings.verified : strings.offNotice}</p><p>{strings.verifiedSource(flow.proof.verifiedSource)}</p><p>{strings.operationalSource(flow.proof.operationalSource)}</p><p>{strings.writeCapability(flow.proof.capabilities.write)}</p><p>{flow.proof.capabilities.limitation}</p></div> : null}
      <div className="discovery-dialog-actions button-row">
        <button type="button" className="secondary" data-dialog-cancel onClick={() => { flow.invalidate(); props.onClose(); }}>{panelStrings.cancel}</button>
        <button type="button" className="secondary" disabled={flow.pending !== null || !flow.canVerify} onClick={flow.verify}>{flow.recoveryBlocked ? strings.reviewSaved : flow.safetyError ? strings.recheckSafety : strings.verify}</button>
        <button type="button" disabled={flow.pending !== null || flow.recoveryBlocked || !flow.proof} onClick={flow.connect}>{strings.connect}</button>
      </div>
    </div>
  </Dialog>;
}
