import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { appStrings, panelStrings as strings } from "@storymapper/ui-strings";
import { useCustomization, useStoryMaps } from "@storymapper/web/app/api";
import { CustomizationEditor, type CustomizationSelection } from "@storymapper/web/features/customization/CustomizationEditor";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

interface CustomizationPanelProps {
  projectId: string | undefined;
  storyMapId: string | undefined;
}

export function CustomizationPanel({ projectId, storyMapId }: CustomizationPanelProps) {
  const maps = useStoryMaps(projectId);
  const [selectedScope, setSelectedScope] = useState(storyMapId ?? "");
  const validScope = maps.data?.storyMaps.some((map) => map.id === selectedScope && map.projectId === projectId) ? selectedScope : undefined;
  const unavailable = Boolean(selectedScope && !validScope);
  const customization = useCustomization(projectId, selectedScope || undefined);
  const [selection, setSelection] = useState<CustomizationSelection>();
  const map = maps.data?.storyMaps.find((item) => item.id === validScope);
  const data = customization.data;
  const groups = [
    { kind: "status" as const, label: strings.workflow, help: strings.workflowHelp, itemLabel: strings.status, items: data?.workflowStatuses ?? [] },
    { kind: "annotation" as const, label: strings.annotations, help: strings.annotationsHelp, itemLabel: strings.annotation, items: data?.annotations ?? [] },
    { kind: "template" as const, label: strings.templates, help: strings.templatesHelp, itemLabel: strings.template, items: data?.storyTemplates ?? [] }
  ];
  return <section className="panel form-stack customization-panel">
    <h2>{strings.customization}</h2>
    <p className="helper-text">{strings.customizationIntro}</p>
    <div className="customization-scope-row">
    <label className="customization-scope">{strings.customizationScope}<select value={selectedScope} disabled={maps.isPending} onChange={(event) => { setSelectedScope(event.target.value); setSelection(undefined); }}>
      <option value="">{appStrings.projectWide}</option>
      {unavailable ? <option value={selectedScope}>{strings.unavailableScope}</option> : null}
      {(maps.data?.storyMaps ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <p className="customization-effective-scope">{strings.effectiveScope(unavailable ? strings.unavailableScope : map?.name ?? appStrings.projectWide)}</p>
    {projectId && isPersonasEnabled ? <Link className="customization-personas-link" to="/projects/$projectId/personas" params={{ projectId }}>{appStrings.personas}</Link> : null}
    </div>
    <p className="helper-text">{strings.customizationScopeHelp}</p>
    {maps.error || customization.error ? <p role="alert">{(maps.error ?? customization.error)?.message}</p> : null}
    {customization.isPending ? <p>{strings.loadingCustomization}</p> : null}
    {groups.map(({ kind, label, help, itemLabel, items }) => <section className="customization-block" key={kind}>
      <div className="customization-block-head">
        <h3>{label}</h3>
        <button type="button" className="secondary" disabled={!projectId || !data || unavailable || Boolean(maps.error)} onClick={() => setSelection({ kind })}><Plus size={14} />{strings.newItem(itemLabel)}</button>
      </div>
      <p className="helper-text">{help}</p>
      {data && !items.length ? <p className="helper-text">{strings.noCustomizationItems}</p> : null}
      <div className="customization-list">{items.map((item) => <div className="custom-chip" key={item.id}>
        <span>{strings.scopedItem(item.name, item.storyMapId ? maps.data?.storyMaps.find((candidate) => candidate.id === item.storyMapId)?.name ?? appStrings.storyMap : appStrings.projectWide)}</span>
        <button type="button" className="secondary" aria-label={strings.editItem(item.name)} disabled={unavailable || Boolean(maps.error)} onClick={() => setSelection({ kind, item })}>{strings.edit}</button>
      </div>)}</div>
    </section>)}
    {selection && projectId && data ? <CustomizationEditor key={`${projectId}:${selectedScope}:${selection.kind}:${selection.item?.id ?? "new"}`} projectId={projectId} storyMapId={selectedScope || undefined} unavailable={unavailable || Boolean(maps.error)} selection={selection} data={data} onClose={() => setSelection(undefined)} /> : null}
  </section>;
}
