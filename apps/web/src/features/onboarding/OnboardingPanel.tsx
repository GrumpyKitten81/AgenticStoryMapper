import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, GitBranch, HardDrive, ShieldCheck, Upload } from "lucide-react";
import { appStrings as strings } from "@storymapper/ui-strings";
import { useProjects, useSafetySettings } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { useOnboardingStore } from "@storymapper/web/app/stores/onboarding-store";

export function OnboardingPanel() {
  return renderOnboardingPanel(useOnboardingPanelState());
}

function useOnboardingPanelState() {
  const navigate = useNavigate();
  const projects = useProjects();
  const activeProjectId = useActiveStoryMapStore((state) => state.activeProjectId) ?? projects.data?.projects[0]?.id;
  const safety = useSafetySettings(activeProjectId);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const projectParams = activeProjectId ? { projectId: activeProjectId } : undefined;
  const settings = safety.data?.settings;

  const finish = () => {
    completeOnboarding();
    if (projectParams) {
      void navigate({ to: "/projects/$projectId/story-maps", params: projectParams });
    } else {
      void navigate({ to: "/" });
    }
  };
  return { settings, finish, projectParams };
}

function renderOnboardingPanel(model: ReturnType<typeof useOnboardingPanelState>) {
  const { settings, finish, projectParams } = model;
  return (
    <section className="onboarding">
      <section className="panel onboarding-panel">
        <div className="panel-title-row">
          <h2>{strings.welcome}</h2>
          <ShieldCheck size={18} />
        </div>
        <p className="onboarding-intro">{strings.onboardingIntro}</p>

        {settings ? (
          <div className="privacy-mode">
            <span>{strings.safetySwitchSummary}</span>
            <strong>{strings.safetySwitchState(strings.agentMode, strings.agentModes[settings.agentMode].label)}{strings.listSeparator}{strings.safetySwitchState(strings.githubSwitch, settings.github ? strings.on : strings.off)}</strong>
          </div>
        ) : null}
        <div className="privacy-notice">
          <ShieldCheck size={16} />
          <span>{strings.agentForwardingNotice}</span>
        </div>

        {renderOnboardingFacts(model)}

        <div className="onboarding-actions">
          <button type="button" onClick={finish}>
            <CheckCircle2 size={16} />{strings.getStarted}</button>
          {projectParams ? (
            <Link className="button-link secondary" to="/projects/$projectId/github" params={projectParams}>
              <GitBranch size={15} />{strings.setupGithub}</Link>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function renderOnboardingFacts(model: ReturnType<typeof useOnboardingPanelState>) {
  const { } = model;
  return <div className="onboarding-facts">
    <div className="onboarding-fact">
      <HardDrive size={18} />
      <div>
        <strong>{strings.storedLocally}</strong>
        <small>{strings.storedLocallyHint}</small>
      </div>
    </div>
    <div className="onboarding-fact">
      <GitBranch size={18} />
      <div>
        <strong>{strings.outgoingGithub}</strong>
        <small>{strings.outgoingGithubHint}</small>
      </div>
    </div>
    <div className="onboarding-fact">
      <Upload size={18} />
      <div>
        <strong>{strings.exportSharing}</strong>
        <small>{strings.exportSharingHint}</small>
      </div>
    </div>
  </div>;
}
