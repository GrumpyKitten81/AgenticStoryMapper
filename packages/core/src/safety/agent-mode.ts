import type { SafetySettings } from "@storymapper/contracts";

type AgentModeSettings = Pick<SafetySettings, "agentMode">;

export const agentAccessEnabled = (settings: AgentModeSettings) => settings.agentMode !== "off";
export const agentProtected = (settings: AgentModeSettings) => settings.agentMode === "propose";
export const agentApprovalAllowed = (settings: AgentModeSettings) => settings.agentMode === "autonomous";
