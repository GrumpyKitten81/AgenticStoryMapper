import { AlertTriangle, CheckCircle2, CircleDot, Info, Link2Off } from "lucide-react";
import { panelStrings } from "@storymapper/ui-strings";
import { useBacklogHealth, useSourceCoverage } from "@storymapper/web/app/api";

interface ReportsPanelProps {
  projectId?: string | undefined;
  storyMapId?: string | undefined;
}

const issueLabels = {
  "missing-description": panelStrings.missingDescription,
  "missing-estimate": panelStrings.missingEstimate,
  "missing-source": panelStrings.missingSource,
  "missing-github-link": panelStrings.missingGitHubLink
};

export function ReportsPanel(props: ReportsPanelProps) {
  return renderReportsPanel(useReportsPanelState(props));
}

function useReportsPanelState({ projectId, storyMapId }: ReportsPanelProps) {
  const coverage = useSourceCoverage(projectId);
  const health = useBacklogHealth(storyMapId);
  const coverageRatio = coverage.data?.coverageRatio ?? 0;
  const readinessRatio = health.data?.readinessRatio ?? 0;
  const issues = health.data?.issues ?? [];
  return { issues, health, coverageRatio, readinessRatio, coverage };
}

function renderReportsPanel(model: ReturnType<typeof useReportsPanelState>) {
  const { issues, health, coverageRatio, readinessRatio, coverage } = model;
  return (
    <section className="panel reports-panel">
      <div className="panel-heading-row">
        <h2>{panelStrings.reports}</h2>
        {issues.length === 0 && health.data ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>

      <div className="report-metrics">
        <div className="report-metric">
          <span>{panelStrings.sourceCoverage}</span>
          <strong>{Math.round(coverageRatio * 100)}{panelStrings.percentSymbol}</strong>
        </div>
        <div className="report-metric">
          <span>{panelStrings.backlogHealth}</span>
          <strong>{Math.round(readinessRatio * 100)}{panelStrings.percentSymbol}</strong>
        </div>
      </div>

      {health.isLoading || coverage.isLoading ? <p>{panelStrings.loadingReports}</p> : null}

      {health.data ? (
        renderReportTables(model, health.data)
      ) : null}

      <div className="report-issue-list">
        {issues.slice(0, 8).map((issue) => (
          <article className={`report-issue ${issue.severity}`} key={`${issue.cardId}-${issue.type}`}>
            <div>
              <strong>{issue.cardKey}</strong>
              <span>{issue.cardTitle}</span>
            </div>
            <span>{issueLabels[issue.type]}</span>
          </article>
        ))}
      </div>

      {health.data && issues.length === 0 ? <p>{panelStrings.noBacklogHealthIssuesFound}</p> : null}
      {issues.length > 8 ? <p>{panelStrings.moreIssuesCount(issues.length - 8)}</p> : null}
    </section>
  );
}

function renderReportTables(model: ReturnType<typeof useReportsPanelState>, data: NonNullable<ReturnType<typeof useReportsPanelState>["health"]["data"]>) {
  const { health } = model;
  return <div className="report-summary">
    <div className="metric-row">
      <span>{panelStrings.healthyStories}</span>
      <strong>
        {data.healthyStories}{panelStrings.ratioSeparator}{data.totalStories}
      </strong>
    </div>
    <div className="issue-count-grid">
      <span><AlertTriangle size={14} /> {panelStrings.descriptionCount(data.issueCounts["missing-description"])}</span>
      <span><CircleDot size={14} /> {panelStrings.estimateCount(data.issueCounts["missing-estimate"])}</span>
      <span><Link2Off size={14} /> {panelStrings.sourceCount(data.issueCounts["missing-source"])}</span>
      <span><Info size={14} /> {panelStrings.gitHubCount(data.issueCounts["missing-github-link"])}</span>
    </div>
  </div>;
}
