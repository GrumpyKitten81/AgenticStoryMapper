import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, GitBranch, HardDrive, ShieldCheck, Upload } from "lucide-react";
import { appStrings as strings } from "@storymapper/ui-strings";
import { renderProjectArchiveImportButton, renderProjectArchiveImportOutcome, useProjectArchiveImport } from "@storymapper/web/features/project-archive/ProjectArchiveImport";
import { ProjectPicker } from "@storymapper/web/features/onboarding/ProjectPicker";
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
  const archiveImport = useProjectArchiveImport();

  const finish = () => {
    completeOnboarding();
    if (projectParams) {
      void navigate({ to: "/projects/$projectId/story-maps", params: projectParams });
    } else {
      void navigate({ to: "/" });
    }
  };
  return { settings, finish, projectParams, projects: projects.data?.projects ?? [], archiveImport };
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

        {renderOnboardingFacts()}

        {renderProjectChoice(model)}

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

function renderProjectChoice({ projects, archiveImport }: ReturnType<typeof useOnboardingPanelState>) {
  return <div className="onboarding-projects">
    {projects.length > 0 ? <section aria-labelledby="onboarding-open-project">
      <h3 id="onboarding-open-project">{strings.openExistingProject}</h3>
      <ProjectPicker projects={projects} />
    </section> : null}
    <section aria-labelledby="onboarding-import-project" className="project-archive-panel">
      <h3 id="onboarding-import-project">{strings.importProjectArchive}</h3>
      <p className="project-archive-hint">{strings.importProjectArchiveHint}</p>
      <div className="project-archive-actions">{renderProjectArchiveImportButton(archiveImport, strings.importProjectArchive)}</div>
      {renderProjectArchiveImportOutcome(archiveImport)}
    </section>
  </div>;
}

function renderOnboardingFacts() {
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
