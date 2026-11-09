import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import { GitHubStatusSourceFields } from "@storymapper/web/features/github-sync/GitHubStatusSourceFields";
import type { CardLevel, ConnectorConnection } from "@storymapper/contracts";
import type { Dispatch, SetStateAction } from "react";
import { githubConnectStrings as strings, panelStrings } from "@storymapper/ui-strings";
import type { ConnectionDraft } from "@storymapper/web/features/github-sync/connection-draft";
type ReleaseSource = ConnectorConnection["releaseSource"];

export function GitHubConnectionFields({ projectId, draft, setDraft }: { projectId: string; draft: ConnectionDraft; setDraft: Dispatch<SetStateAction<ConnectionDraft>> }) {
  return <>
        <label>{panelStrings.name}<input value={draft.name} onChange={(event) => setDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
        <label>{panelStrings.owner}<input placeholder={strings.ownerGuidance} value={draft.owner} onChange={(event) => setDraft((draft) => ({ ...draft, owner: event.target.value }))} /></label>
        <label>{panelStrings.repository}<input placeholder={strings.repositoryGuidance} value={draft.repository} onChange={(event) => setDraft((draft) => ({ ...draft, repository: event.target.value }))} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.readOnly} onChange={(event) => setDraft((draft) => ({ ...draft, readOnly: event.target.checked }))} />{panelStrings.readOnly}</label>
        <label>{panelStrings.exportLabel}<input value={draft.defaultLabel} disabled={draft.readOnly} onChange={(event) => setDraft((draft) => ({ ...draft, defaultLabel: event.target.value }))} /></label>
        <div className="github-inline-fields">
          <label>
            {panelStrings.releaseSource}<select value={draft.releaseSource} onChange={(event) => setDraft((draft) => ({ ...draft, releaseSource: event.target.value as ReleaseSource }))}>
              <option value="milestone">{panelStrings.milestone}</option>
              <option value="iteration">{panelStrings.iteration}</option>
              <option value="none">{panelStrings.none}</option>
            </select>
          </label>
          <label>{panelStrings.iterationField}<input value={draft.iterationFieldName} onChange={(event) => setDraft((draft) => ({ ...draft, iterationFieldName: event.target.value }))} /></label>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={draft.labelsAsAnnotations} onChange={(event) => setDraft((draft) => ({ ...draft, labelsAsAnnotations: event.target.checked }))} />{panelStrings.importLabelsAsAnnotations}</label>
        <fieldset className="form-stack"><legend>{mapConceptStrings.outbound}</legend><p>{mapConceptStrings.outboundHint}</p>{(["story", "task", "bug", "spike", "feature", "epic", "theme"] as const).map((cardType) => <label key={cardType}>{mapConceptStrings.planningTypes[cardType]}<input disabled={draft.readOnly} value={draft.issueTypeMapping.find((entry) => entry.cardType === cardType)?.issueType ?? ""} onChange={(event) => setDraft((current) => ({ ...current, issueTypeMapping: [...current.issueTypeMapping.filter((entry) => entry.cardType !== cardType), { cardType, issueType: event.target.value }] }))} /></label>)}</fieldset>
        <GitHubTypeMappingEditor draft={draft} setDraft={setDraft} />
        <GitHubStatusSourceFields projectId={projectId} draft={draft} setDraft={setDraft} />
  </>;
}

function GitHubTypeMappingEditor({ draft, setDraft }: { draft: ConnectionDraft; setDraft: Dispatch<SetStateAction<ConnectionDraft>> }) {
  return (
    <div className="status-mapping-list">
      <strong>{mapConceptStrings.importPlacement}</strong>
      <p>{mapConceptStrings.importHint}</p>
      {draft.typeMapping.map((entry, index) => (
        <div className="type-mapping-row" key={index}>
          <label><span>{panelStrings.match}</span><input value={entry.match} onChange={(event) => setDraft((current) => ({ ...current, typeMapping: current.typeMapping.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, match: event.target.value } : candidate) }))} /></label>
          <label><span>{mapConceptStrings.level}</span><select value={entry.level} onChange={(event) => setDraft((current) => ({ ...current, typeMapping: current.typeMapping.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, level: event.target.value as CardLevel } : candidate) }))}>
            <option value="activity">{panelStrings.activity}</option>
            <option value="step">{panelStrings.step}</option>
            <option value="story">{panelStrings.story}</option>
            <option value="note">{panelStrings.note}</option>
          </select></label>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => setDraft((current) => ({ ...current, typeMapping: [...current.typeMapping, { match: "", level: "story" }] }))}>{panelStrings.addTypeMapping}</button>
    </div>
  );
}
