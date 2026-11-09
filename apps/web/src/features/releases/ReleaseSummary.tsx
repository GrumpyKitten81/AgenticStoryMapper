import type { ReleaseSummaryReport } from "@storymapper/contracts";
import { panelStrings, storyMapStrings } from "@storymapper/ui-strings";

export function ReleaseSummary({ summary, estimationUnit, showRisks = true }: { summary: ReleaseSummaryReport; estimationUnit?: string | undefined; showRisks?: boolean }) {
  return <>
      <div className="release-summary-grid">
        <div>
          <span>{panelStrings.cards}</span>
          <strong>{summary.totalCards}</strong>
        </div>
        <div>
          <span>{panelStrings.stories}</span>
          <strong>{summary.totalStories}</strong>
        </div>
        <div>
          <span>{panelStrings.estimate}</span>
          <strong>{estimationUnit ? storyMapStrings.estimateWithUnit(summary.estimateTotal, estimationUnit) : summary.estimateTotal}</strong>
        </div>
        <div>
          <span>{panelStrings.unestimated}</span>
          <strong>{summary.unestimatedCards}</strong>
        </div>
      </div>

      <div className="release-status-distribution">
        <h3>{panelStrings.statusDistribution}</h3>
        {Object.keys(summary.statusCounts).length ? <dl>{Object.entries(summary.statusCounts).map(([status, count]) => <div key={status}><dt>{status}</dt><dd>{count}</dd></div>)}</dl> : <p>{panelStrings.noStatuses}</p>}
      </div>
      <div className="release-unestimated-stories">
        <h3>{panelStrings.unestimatedStories}</h3>
        {summary.unestimatedStories.length ? <ul>{summary.unestimatedStories.map((story) => <li key={story.cardId} data-card-id={story.cardId}><strong>{story.cardKey}</strong> {story.cardTitle}</li>)}</ul> : <p>{panelStrings.noUnestimatedStories}</p>}
      </div>

      {showRisks ? <div className="release-risk-strip">
        <span>{panelStrings.descriptionCount(summary.riskCounts.missingDescription)}</span>
        <span>{panelStrings.sourceCount(summary.riskCounts.missingSource)}</span>
        <span>{panelStrings.gitHubCount(summary.riskCounts.missingGitHubLink)}</span>
      </div> : null}
  </>;
}
