import { useState, type ReactElement } from "react";
import { Terminal } from "lucide-react";
import type { McpHostConfigsResponse } from "@storymapper/contracts";
import { appStrings, panelStrings } from "@storymapper/ui-strings";
import { agentSetupStrings as strings } from "@storymapper/web/ui-strings/agent-setup";
import { useMcpHostConfigs } from "@storymapper/web/app/api";

export function AgentSetupPanel(): ReactElement {
  const configs = useMcpHostConfigs();
  return <div className="mcp-config-panel form-stack">
    <div className="panel-heading-row"><h2>{appStrings.agentSetup}</h2><Terminal size={16} /></div>
    <p>{strings.intro}</p>
    <ol className="form-stack">
      <li>{strings.prerequisites}</li>
      <li>{strings.configure}</li>
      <li>{strings.restart}</li>
      <li>{strings.verify}</li>
    </ol>
    <p>{strings.connectionStatus}</p>
    <p>{strings.safety} {appStrings.agentForwardingNotice}</p>
    {configs.isError ? <div className="form-stack"><p role="alert">{strings.loadFailed(configs.error.message)}</p><button type="button" className="secondary" disabled={configs.isFetching} onClick={() => { void configs.refetch(); }}>{strings.retry}</button></div> : configs.data ? <HostConfigs configs={configs.data} /> : <p role="status">{strings.loading}</p>}
  </div>;
}

function HostConfigs({ configs }: { configs: McpHostConfigsResponse }): ReactElement {
  return <>
    <ConfigBlock title={panelStrings.developmentCommand} value={configs.development} />
    <ConfigBlock title={strings.claudeDesktop} value={configs.claudeDesktop} />
    <ConfigBlock title={strings.cursor} value={configs.cursor} />
    <ConfigBlock title={panelStrings.vscodeMcpJson} value={configs.vsCode} />
  </>;
}

function ConfigBlock({ title, value }: { title: string; value: McpHostConfigsResponse["development" | "claudeDesktop" | "cursor" | "vsCode"] }): ReactElement {
  const [copyStatus, setCopyStatus] = useState("");
  const text = JSON.stringify(value, null, 2);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(panelStrings.configCopied);
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
      setCopyStatus(panelStrings.configCopyFailed);
    }
  }
  return <details className="disclosure">
    <summary>{title}</summary>
    <div className="form-stack">
      <code className="config-code">{text}</code>
      <button type="button" className="secondary" onClick={() => { void copy(); }}>{panelStrings.copyConfiguration}</button>
      <span role="status">{copyStatus}</span>
    </div>
  </details>;
}
