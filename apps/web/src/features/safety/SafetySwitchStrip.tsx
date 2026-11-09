import { agentModeSchema, type AgentMode, type UpdateSafetySettingsRequest } from "@storymapper/contracts";
import { Shield, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { api, useSafetySettings } from "@storymapper/web/app/api";

interface SafetySwitchStripProps {
  projectId: string | undefined;
}

export function SafetySwitchStrip(props: SafetySwitchStripProps) {
  const result = useSafetySwitchStripState(props);
  if (result === null) return result;
  return renderSafetySwitchStrip(result);
}

function useSafetySwitchStripState({ projectId }: SafetySwitchStripProps) {
  const dialogTitleId = useId();
  const queryClient = useQueryClient();
  const settingsQuery = useSafetySettings(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const settings = settingsQuery.data?.settings;

  const updateSettings = useMutation({
    mutationFn: (patch: UpdateSafetySettingsRequest) => {
      if (!projectId) throw new Error(panelStrings.projectIsRequired);
      return api.updateSafetySettings(projectId, patch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["safety-settings", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
    }
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  if (!projectId) return null;

  const agentMode: AgentMode = settings?.agentMode ?? "apply";
  const github = settings?.github ?? false;
  return { agentMode, setDialogOpen, github, dialogRef, dialogTitleId, updateSettings };
}

type SafetySwitchStripModel = Exclude<ReturnType<typeof useSafetySwitchStripState>, null>;

function renderSafetySwitchStrip(model: SafetySwitchStripModel) {
  const { agentMode, setDialogOpen, github, dialogRef, dialogTitleId, updateSettings } = model;
  const states = [strings.safetySwitchState(strings.agentMode, strings.agentModes[agentMode].label), strings.safetySwitchState(strings.githubSwitch, github ? strings.on : strings.off)];
  return (
    <div className="safety-switch-strip">
      <button type="button" className={`secondary icon-button safety-pill${agentMode === "off" || agentMode === "propose" ? " safety-pill-protection" : ""}`} title={strings.safetySummaryTooltip(states)} aria-label={strings.safetySummaryLabel(states)} onClick={() => setDialogOpen(true)}>
        {agentMode === "off" || agentMode === "propose" ? <ShieldCheck size={16} aria-hidden /> : <Shield size={16} aria-hidden />}
      </button>
      <dialog ref={dialogRef} className="safety-settings-dialog" aria-labelledby={dialogTitleId} onClose={() => setDialogOpen(false)}>
        <form method="dialog" className="safety-settings-form">
          <h2 id={dialogTitleId}>{strings.safetySwitchSettingsTitle}</h2>
          <p className="safety-forwarding-notice">{strings.agentForwardingNotice}</p>
          <fieldset className="safety-agent-modes" disabled={updateSettings.isPending}>
            <legend>{strings.agentMode}</legend>
            {agentModeSchema.options.map((mode) => (
              <label key={mode} className="safety-settings-row">
                <input type="radio" name="agent-mode" checked={agentMode === mode} onChange={() => updateSettings.mutate({ agentMode: mode })} />
                <span>
                  <strong>{strings.agentModes[mode].label}</strong>
                  <small>{strings.agentModes[mode].consequence}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="safety-settings-row">
            <input type="checkbox" checked={github} disabled={updateSettings.isPending} onChange={(event) => updateSettings.mutate({ github: event.target.checked })} />
            <span>
              <strong>{strings.githubSwitch}</strong>
              <small>{strings.githubSwitchConsequence}</small>
            </span>
          </label>
          <button type="submit" className="secondary">{strings.close}</button>
        </form>
      </dialog>
    </div>
  );
}
