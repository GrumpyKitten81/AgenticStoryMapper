import type { Dispatch, SetStateAction } from "react";
import { useCustomization } from "@storymapper/web/app/api";
import { githubStatusStrings as strings } from "@storymapper/web/ui-strings/github-status";
import type { ConnectionDraft } from "@storymapper/web/features/github-sync/connection-draft";

type StatusMappingDraft = ConnectionDraft["statusMapping"][number];

export function GitHubStatusMappingEditor({ projectId, draft, setDraft }: { projectId: string; draft: ConnectionDraft; setDraft: Dispatch<SetStateAction<ConnectionDraft>> }) {
  const customization = useCustomization(projectId);
  const statuses = [...new Set([...[...(customization.data?.workflowStatuses ?? [])].sort((a, b) => a.position - b.position).map((status) => status.name), ...draft.statusMapping.map((entry) => entry.localStatus)])];
  const unmapped = statuses.filter((status) => !draft.statusMapping.some((entry) => entry.localStatus === status));
  const update = (localStatus: string, entry: StatusMappingDraft | undefined) => setDraft((current) => ({ ...current, statusMapping: replaceEntry(current.statusMapping, localStatus, entry) }));
  return (
    <div className="status-mapping-list">
      <strong>{strings.mappingHeading}</strong>
      <p>{strings.mappingHint}</p>
      {customization.error ? <p role="alert">{customization.error.message}</p> : null}
      {statuses.map((localStatus) => {
        const entry = draft.statusMapping.find((candidate) => candidate.localStatus === localStatus);
        return <div className="status-mapping-row" key={localStatus}>
          <label><span>{strings.localStatus}</span><input value={localStatus} readOnly /></label>
          <label><span>{strings.remoteState}</span><select aria-label={strings.remoteStateFor(localStatus)} value={entry?.remoteState ?? ""} onChange={(event) => update(localStatus, event.target.value ? { localStatus, remoteState: event.target.value as StatusMappingDraft["remoteState"], labels: entry?.labels ?? "" } : undefined)}>
            <option value="">{strings.notMapped}</option>
            <option value="open">{strings.open}</option>
            <option value="closed">{strings.closed}</option>
          </select></label>
          <label><span>{strings.labels}</span><input aria-label={strings.labelsFor(localStatus)} value={entry?.labels ?? ""} disabled={!entry} onChange={(event) => entry && update(localStatus, { ...entry, labels: event.target.value })} /></label>
        </div>;
      })}
      {unmapped.length ? <p role="status">{strings.unmapped(unmapped)}</p> : null}
    </div>
  );
}

function replaceEntry(mapping: StatusMappingDraft[], localStatus: string, entry: StatusMappingDraft | undefined): StatusMappingDraft[] {
  if (!entry) return mapping.filter((candidate) => candidate.localStatus !== localStatus);
  return mapping.some((candidate) => candidate.localStatus === localStatus) ? mapping.map((candidate) => candidate.localStatus === localStatus ? entry : candidate) : [...mapping, entry];
}
