import { levelDescriptionTemplates } from "@storymapper/web/features/customization/level-templates";
import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import type { CardLevel } from "@storymapper/contracts";
import type { StoryTemplate } from "@storymapper/contracts";
import { useState } from "react";
import { panelStrings as strings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";

export function TemplatePicker({ templates, dirty, disabled = false, onApply, level, onApplyDescription, descriptionDirty = dirty, descriptionDisabled = false }: { templates: StoryTemplate[]; dirty: boolean; disabled?: boolean; onApply: (template: StoryTemplate) => void; descriptionDirty?: boolean; descriptionDisabled?: boolean; level?: CardLevel; onApplyDescription?: (description: string) => void }) {
  const [selectedLevel, setSelectedLevel] = useState<Exclude<CardLevel, "note">>();
  const [selected, setSelected] = useState<StoryTemplate>();
  return <>
    {level && level !== "note" && onApplyDescription ? <select value="" disabled={disabled || descriptionDisabled} aria-label={mapConceptStrings.levelTemplate} onChange={(event) => {
      const selected = event.target.value as Exclude<CardLevel, "note">;
      if (!selected) return;
      if (descriptionDirty) setSelectedLevel(selected); else onApplyDescription(levelDescriptionTemplates[selected]);
    }}><option value="">{mapConceptStrings.levelTemplate}</option>{(["activity", "step", "story"] as const).map((item) => <option key={item} value={item}>{mapConceptStrings.templateLabels[item]}</option>)}</select> : null}
    {selectedLevel ? <Dialog title={strings.replaceTemplateTitle} description={mapConceptStrings.replaceLevelDescription} onClose={() => setSelectedLevel(undefined)}><div className="button-row"><button type="button" disabled={disabled || descriptionDisabled} onClick={() => { onApplyDescription!(levelDescriptionTemplates[selectedLevel]); setSelectedLevel(undefined); }}>{strings.replaceTemplate}</button><button type="button" className="secondary" onClick={() => setSelectedLevel(undefined)}>{strings.cancel}</button></div></Dialog> : null}
    {templates.length ? <select value="" disabled={disabled} aria-label={strings.applyTemplate} onChange={(event) => {
      const template = templates.find((item) => item.id === event.target.value);
      if (!template) return;
      if (dirty) setSelected(template);
      else onApply(template);
    }}>
      <option value="">{mapConceptStrings.savedTemplates}</option>
      {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
    </select> : null}
    {selected ? <Dialog title={strings.replaceTemplateTitle} description={strings.replaceTemplateDescription} onClose={() => setSelected(undefined)}>
      <button type="button" disabled={disabled} onClick={() => { onApply(selected); setSelected(undefined); }}>{strings.replaceTemplate}</button>
      <button type="button" className="secondary" onClick={() => setSelected(undefined)}>{strings.cancel}</button>
    </Dialog> : null}
  </>;
}
