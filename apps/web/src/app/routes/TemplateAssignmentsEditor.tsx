import { cardTypeSchema, storyMapSchema, updateStoryMapRequestSchema, type StoryMap, type StoryTemplate } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { appStrings as strings } from "@storymapper/ui-strings";
import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import { api } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { ConflictAlert } from "@storymapper/web/features/conflicts/ConflictAlert";

interface AssignmentDraft {
  map: StoryMap;
  assignments: Record<string, string>;
  baseVersion: number;
}

function draftAssignments(map: StoryMap): Record<string, string> {
  return Object.fromEntries(cardTypeSchema.options.map((cardType) => [cardType, map.templateAssignments?.find((entry) => entry.cardType === cardType)?.storyTemplateId ?? ""]));
}

function assignedEntries(assignments: Record<string, string>) {
  return cardTypeSchema.options.filter((cardType) => assignments[cardType]).map((cardType) => ({ cardType, storyTemplateId: assignments[cardType]! }));
}

export function TemplateAssignmentsEditor({ storyMap, templates, readOnly = false }: { storyMap: StoryMap | undefined; templates: StoryTemplate[]; readOnly?: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<AssignmentDraft>();
  const pending = useRef(false);
  const save = useMutation({
    meta: { ownsConflict: true },
    mutationFn: (input: AssignmentDraft) => api.updateStoryMap(input.map.id, { templateAssignments: assignedEntries(input.assignments) }, input.baseVersion),
    onSuccess: (_saved, input) => {
      client.invalidateQueries({ queryKey: ["story-map", input.map.id] });
      client.invalidateQueries({ queryKey: ["card-reviews", input.map.projectId] });
      client.invalidateQueries({ queryKey: ["story-maps", input.map.projectId] });
      setDraft(undefined);
    },
    onSettled: () => { pending.current = false; }
  });
  function submit(input: AssignmentDraft) {
    if (readOnly || pending.current) return;
    const assignments = assignedEntries(input.assignments);
    if (!updateStoryMapRequestSchema.safeParse({ templateAssignments: assignments }).success) return;
    pending.current = true;
    save.mutate(input);
  }
  const visibleTemplates = templates.filter((template) => template.storyMapId === null || (draft && template.storyMapId === draft.map.id));
  return <>
    {storyMap ? <button type="button" className="secondary icon-button topbar-title-edit" aria-label={strings.editTemplateAssignments} title={strings.editTemplateAssignments} disabled={readOnly} onClick={() => {
      save.reset();
      setDraft({ map: storyMap, assignments: draftAssignments(storyMap), baseVersion: storyMap.version });
    }}><LayoutTemplate size={16} /></button> : null}
    {draft ? <Dialog title={strings.editTemplateAssignments} description={strings.templateAssignmentsDescription(draft.map.name)} dismissible={!save.isPending} onClose={() => { if (!pending.current) setDraft(undefined); }}>
      <form aria-busy={save.isPending} onSubmit={(event) => { event.preventDefault(); if (!isConflictError(save.error)) submit(draft); }}>
        {cardTypeSchema.options.map((cardType) => <label key={cardType}>{mapConceptStrings.planningTypes[cardType]}<select disabled={readOnly || save.isPending} value={draft.assignments[cardType] ?? ""} onChange={(event) => setDraft({ ...draft, assignments: { ...draft.assignments, [cardType]: event.target.value } })}><option value="">{strings.templateAssignmentNone}</option>{visibleTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>)}
        <ConflictAlert error={save.error} entityId={draft.map.id} name={draft.map.name} disabled={readOnly || save.isPending}
          onReload={(conflict) => {
            const current = storyMapSchema.parse(conflict.current);
            setDraft({ map: current, assignments: draftAssignments(current), baseVersion: conflict.currentVersion });
            save.reset();
          }}
          onKeepMine={(conflict) => {
            const next = { ...draft, baseVersion: conflict.currentVersion };
            setDraft(next);
            save.reset();
            submit(next);
          }} />
        {save.error && !isConflictError(save.error) ? <p role="alert">{save.error.message}</p> : null}
        <button type="button" className="secondary" disabled={save.isPending} onClick={() => setDraft(undefined)}>{strings.close}</button>
        <button type="submit" disabled={readOnly || save.isPending || isConflictError(save.error)}>{strings.saveTemplateAssignments}</button>
      </form>
    </Dialog> : null}
  </>;
}
