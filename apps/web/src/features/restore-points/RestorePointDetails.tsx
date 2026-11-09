import type { RestorePoint } from "@storymapper/contracts";
import { restorePointPresentation as presentation } from "@storymapper/web/features/restore-points/restore-point-presentation";

export function RestorePointDetails({ point }: { point: RestorePoint }) {
  return <details className="restore-point-details">
    <summary>{presentation.technicalDetails}</summary>
    <dl>
      <dt>{presentation.fileName}</dt><dd>{point.fileName}</dd>
      <dt>{presentation.class}</dt><dd>{point.class}</dd>
      <dt>{presentation.schema}</dt><dd className="restore-point-schema">{point.schemaVersion}</dd>
      <dt>{presentation.createdUtc}</dt><dd><time dateTime={point.createdAt}>{point.createdAt}</time></dd>
    </dl>
  </details>;
}
