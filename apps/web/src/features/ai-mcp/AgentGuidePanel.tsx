import { useState, type ReactElement } from "react";
import { Bot, ClipboardCopy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { McpHostConfigsResponse } from "@storymapper/contracts";
import { appStrings } from "@storymapper/ui-strings";
import { useApiHealth, useMcpHostConfigs } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { CopyButton } from "@storymapper/web/components/CopyButton";
import { agentGuideStrings as strings } from "@storymapper/web/ui-strings/agent-guide";
import { agentHostIds, buildAgentInstructionPrompt, hostRegistration, isCliHost, type AgentHostId } from "@storymapper/web/features/ai-mcp/agent-prompts";

export function AgentGuidePanel(): ReactElement {
  const [host, setHost] = useState<AgentHostId>("claudeCode");
  const configs = useMcpHostConfigs();
  const health = useApiHealth();
  const projectId = useActiveStoryMapStore((state) => state.lastActiveProjectId ?? state.activeProjectId);
  return <section className="panel agent-guide-panel form-stack">
    <div className="panel-heading-row"><h2>{appStrings.agent}</h2><Bot size={16} /></div>
    <p>{strings.intro}</p>
    <p>{strings.prerequisites}</p>
    <fieldset className="form-stack">
      <legend>{strings.chooseHost}</legend>
      {agentHostIds.map((id) => <label key={id} className="radio-row">
        <input type="radio" name="agent-host" checked={host === id} onChange={() => setHost(id)} /><span>{strings.hosts[id]}</span>
      </label>)}
    </fieldset>
    {configs.isError ? <div className="form-stack">
      <p role="alert">{strings.loadFailed(configs.error.message)}</p>
      <button type="button" className="secondary" disabled={configs.isFetching} onClick={() => { void configs.refetch(); }}>{strings.retry}</button>
    </div> : configs.data ? <HostInstructions host={host} configs={configs.data} /> : <p role="status">{strings.loading}</p>}
    <p>{strings.verify}{health.data ? ` ${strings.serverHealthy}` : ""}</p>
    <p>{strings.safety} {appStrings.agentForwardingNotice}</p>
    {projectId ? <Link to="/projects/$projectId/audit" params={{ projectId }}>{strings.linkActivity}</Link> : null}
    <p>{strings.docsHint}</p>
  </section>;
}

function HostInstructions({ host, configs }: { host: AgentHostId; configs: McpHostConfigsResponse }): ReactElement {
  const storyMapId = useActiveStoryMapStore((state) => state.lastActiveStoryMapId);
  const registration = hostRegistration(configs, host);
  const prompt = buildAgentInstructionPrompt(window.location.origin, host, configs, storyMapId);
  return <>
    <div className="form-stack">
      <h3>{isCliHost(host) ? strings.cliRegistration : strings.jsonRegistration}</h3>
      <code className="config-code">{registration}</code>
      <CopyButton text={registration}>{strings.copyRegistration}</CopyButton>
    </div>
    <div className="form-stack">
      <h3>{strings.instructionHeading}</h3>
      <textarea readOnly rows={8} value={prompt} aria-label={strings.instructionHeading} />
      <CopyButton text={prompt} className=""><ClipboardCopy size={16} /> {strings.copyPrompt}</CopyButton>
    </div>
  </>;
}
