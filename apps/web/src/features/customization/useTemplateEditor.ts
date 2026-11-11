import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AiFunctionTemplate, CreateAiTemplateRequest } from "@storymapper/contracts";
import { panelStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

type TemplateDraft = Omit<CreateAiTemplateRequest, "projectId">;
const emptyDraft = (): TemplateDraft => ({ id: "", name: "", instructions: "", arguments: [], examples: [] });

export function useTemplateEditor(projectId: string) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const current = useRef(draft);
  const selection = useRef(editingId);
  current.current = draft;
  selection.current = editingId;
  const select = (template?: AiFunctionTemplate) => {
    save.reset();
    remove.reset();
    setEditingId(template?.id);
    setDraft(template ? { id: template.id, name: template.name, instructions: template.instructions, arguments: template.arguments, examples: template.examples, outputSchemaName: template.outputSchemaName } : emptyDraft());
  };
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ["ai-function-templates", projectId] }); };
  const save = useMutation({
    mutationFn: async () => {
      if (!isPersonasEnabled && (draft.id.trim() === "personas" || editingId === "personas")) throw new Error("Persona feature is disabled");
      const submitted = { ...draft };
      const result = editingId
        ? await api.updateAiTemplate(projectId, editingId, { name: draft.name, instructions: draft.instructions, arguments: draft.arguments, examples: draft.examples, outputSchemaName: draft.outputSchemaName || null })
        : await api.createAiTemplate({ ...draft, projectId });
      return { ...result, submitted, previousId: editingId };
    },
    onSuccess: ({ template, submitted, previousId }) => {
      invalidate();
      if (selection.current !== previousId) return;
      setEditingId(template.id);
      if (JSON.stringify(current.current) === JSON.stringify(submitted)) select(template);
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!isPersonasEnabled && id === "personas") throw new Error("Persona feature is disabled");
      return api.deleteAiTemplate(projectId, id);
    },
    onSuccess: (_result, id) => { invalidate(); if (selection.current === id) select(); }
  });
  const saveDraft = () => { save.reset(); remove.reset(); save.mutate(); };
  const deleteTemplate = () => { save.reset(); remove.reset(); if (editingId) remove.mutate(editingId); };
  const error = save.error ?? remove.error;
  return { draft, setDraft, editingId, select, save, remove, saveDraft, deleteTemplate, error: error instanceof Error ? error.message : error ? panelStrings.templateSaveFailed : "" };
}
