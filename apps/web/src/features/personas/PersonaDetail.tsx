import { personaSchema, type Persona, type UpdatePersonaRequest } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { appStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";
import { affectedCustomizationCards } from "@storymapper/web/features/customization";
import { api, useCustomization } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { ConflictAlert } from "@storymapper/web/features/conflicts";
import { invalidateCardReports } from "@storymapper/web/features/story-map";

interface PersonaDetailProps {
  persona: Persona;
  projectId: string;
  onDeleted: () => void;
  unavailable?: boolean;
}

const TEXT_FIELDS: Array<{ key: keyof Persona; label: string; multiline?: boolean }> = [
  { key: "name", label: strings.personaFields.name },
  { key: "role", label: strings.personaFields.role },
  { key: "personaType", label: strings.personaFields.personaType, multiline: true },
  { key: "avatar", label: strings.personaFields.avatar },
  { key: "represents", label: strings.personaFields.represents },
  { key: "age", label: strings.personaFields.age },
  { key: "country", label: strings.personaFields.country },
  { key: "description", label: strings.personaFields.description, multiline: true },
  { key: "centralNeed", label: strings.personaFields.centralNeed, multiline: true },
  { key: "fachexpertise", label: strings.personaFields.fachexpertise, multiline: true },
  { key: "workLife", label: strings.personaFields.workLife, multiline: true },
  { key: "productExperience", label: strings.personaFields.productExperience, multiline: true },
  { key: "expectations", label: strings.personaFields.expectations, multiline: true },
  { key: "successIndicators", label: strings.personaFields.successIndicators, multiline: true },
  { key: "scopeNote", label: strings.personaFields.scopeNote, multiline: true }
];

function linesToList(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function refreshedDraft(draft: Persona, baseline: Persona, incoming: Persona, submitted: UpdatePersonaRequest = {}): Persona {
  return Object.fromEntries(Object.entries(incoming).map(([key, value]) => {
    const field = key as keyof Persona;
    const clean = JSON.stringify(draft[field]) === JSON.stringify(baseline[field]);
    const matchesSave = key in submitted && JSON.stringify(draft[field]) === JSON.stringify(submitted[field as keyof UpdatePersonaRequest]);
    return [key, clean || matchesSave ? value : draft[field]];
  })) as Persona;
}

function dirtyPatch(draft: Persona, baseline: Persona): UpdatePersonaRequest {
  const patch: Record<string, unknown> = {};
  for (const { key } of TEXT_FIELDS) if (draft[key] !== baseline[key]) patch[key] = draft[key];
  for (const key of ["goals", "pains"] as const) if (JSON.stringify(draft[key]) !== JSON.stringify(baseline[key])) patch[key] = linesToList(draft[key].join("\n"));
  return patch as UpdatePersonaRequest;
}

export function PersonaDetail(props: PersonaDetailProps) {
  return renderPersonaDetail(usePersonaDetailState(props));
}

function usePersonaDetailState(props: PersonaDetailProps) {
  const context = usePersonaDraft(props);
  const { persona, onDeleted, unavailable, deleteReview, setDeleteReview, confirmUnlink, deleteAdmission, setDraft, baseline, baseVersion, invalidate } = context;
  const update = useMutation({
    scope: { id: `persona:${persona.id}` },
    meta: { ownsConflict: true },
    mutationFn: (input: { personaId: string; patch: UpdatePersonaRequest; submitted?: UpdatePersonaRequest }) => api.updatePersona(input.personaId, input.patch, baseVersion.current),
    onSuccess: (saved, input) => {
      invalidate();
      if (baseline.current.id !== input.personaId) return;
      baseVersion.current = saved.version;
      const previous = baseline.current;
      baseline.current = saved;
      setDraft((value) => refreshedDraft(value, previous, saved, input.submitted ?? input.patch));
    }
  });
  const remove = useMutation({
    meta: { ownsConflict: true },
    mutationFn: () => api.deletePersona(persona.id, deleteReview!.definitionBefore.version, { ...deleteReview!, confirmUnlink }),
    onSuccess: () => {
      invalidate();
      onDeleted();
    },
    onError: () => {
      setDeleteReview(undefined);
      invalidate();
    },
    onSettled: () => { deleteAdmission.current = false; }
  });

  function saveText(key: keyof Persona, value: string) {
    if (unavailable || value === (baseline.current[key] as string)) return;
    update.mutate({ personaId: persona.id, patch: { [key]: value } as UpdatePersonaRequest });
  }

  function saveList(key: "goals" | "pains", value: string) {
    if (unavailable) return;
    update.mutate({ personaId: persona.id, patch: { [key]: linesToList(value) } as UpdatePersonaRequest, submitted: { [key]: value.split("\n") } });
  }
  return { ...context, update, remove, saveText, saveList };
}

function renderPersonaDetail(model: ReturnType<typeof usePersonaDetailState>) {
  const { update, persona, draft, unavailable, baseline, baseVersion, setDraft, invalidate, draftRef, customization, setConfirmUnlink, setDeleteReview, remove, deleteReview, confirmUnlink, deleteAdmission, saveText, saveList } = model;
  return (
    <div className="persona-detail">
      <ConflictAlert
        error={update.error}
        entityId={persona.id}
        name={draft.name || strings.unnamedPersona}
        disabled={unavailable || update.isPending}
        onReload={(conflict) => {
          const current = personaSchema.parse(conflict.current);
          baseline.current = current;
          baseVersion.current = conflict.currentVersion;
          setDraft(current);
          update.reset();
          invalidate();
        }}
        onKeepMine={(conflict) => {
          baseVersion.current = conflict.currentVersion;
          update.reset();
          const patch = dirtyPatch(draftRef.current, baseline.current);
          if (Object.keys(patch).length) update.mutate({ personaId: persona.id, patch });
        }}
      />
      {update.error && !isConflictError(update.error) ? <p role="alert">{update.error.message}</p> : null}
      <div className="persona-detail-header">
        <div className="persona-avatar large">{(draft.avatar || draft.name || strings.unknownAvatar).slice(0, 2)}</div>
        <div>
          <h2>{draft.name || strings.unnamedPersona}</h2>
          <span className="persona-scope-badge">{persona.storyMapId ? strings.mapLocal : strings.projectWide}</span>
        </div>
        <button type="button" className="danger" onClick={() => { if (customization.data) { setConfirmUnlink(false); setDeleteReview({ definitionBefore: persona, affectedCards: affectedCustomizationCards(customization.data, persona, "persona") }); } }} disabled={unavailable || remove.isPending || update.isPending || !customization.data || Boolean(customization.error)}>
          <Trash2 size={15} />{strings.delete}</button>
      </div>

      {unavailable ? <p role="alert">{panelStrings.unavailableScope}</p> : null}
      {customization.error || remove.error ? <p role="alert">{(customization.error ?? remove.error)?.message}</p> : null}
      {deleteReview ? <Dialog title={panelStrings.reviewDelete(persona.name)} dismissible={!remove.isPending} onClose={() => setDeleteReview(undefined)}>
        <p>{panelStrings.affectedCards(deleteReview.affectedCards.length)}</p>
        {deleteReview.affectedCards.length ? <label className="checkbox-row"><input type="checkbox" disabled={remove.isPending} checked={confirmUnlink} onChange={(event) => setConfirmUnlink(event.target.checked)} />{panelStrings.confirmUnlink}</label> : null}
        {remove.error ? <p role="alert">{remove.error.message}</p> : null}
        <div className="button-row">
          <button type="button" className="danger" disabled={unavailable || remove.isPending || Boolean(deleteReview.affectedCards.length && !confirmUnlink)} onClick={() => { if (!deleteAdmission.current) { deleteAdmission.current = true; remove.mutate(); } }}>{panelStrings.confirmDelete}</button>
          <button type="button" className="secondary" disabled={remove.isPending} onClick={() => setDeleteReview(undefined)}>{panelStrings.cancel}</button>
        </div>
      </Dialog> : null}
      {renderPersonaIdentity(model)}
    </div>
  );
}

function renderPersonaIdentity(model: ReturnType<typeof usePersonaDetailState>) {
  const { unavailable, draft, setDraft, saveText, saveList } = model;
  return <fieldset disabled={unavailable} className="persona-detail-grid" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    {TEXT_FIELDS.map((field) => (
      <label key={field.key} className={field.multiline ? "persona-field wide" : "persona-field"}>
        <span>{field.label}</span>
        {field.multiline ? (
          <textarea
            value={draft[field.key] as string}
            onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))}
            onBlur={(event) => saveText(field.key, event.target.value)}
          />
        ) : (
          <input
            value={draft[field.key] as string}
            onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))}
            onBlur={(event) => saveText(field.key, event.target.value)}
          />
        )}
      </label>
    ))}

    <label className="persona-field wide">
      <span>{strings.goals}</span>
      <textarea
        value={draft.goals.join("\n")}
        onChange={(event) => setDraft((value) => ({ ...value, goals: event.target.value.split("\n") }))}
        onBlur={(event) => saveList("goals", event.target.value)}
      />
    </label>
    <label className="persona-field wide">
      <span>{strings.pains}</span>
      <textarea
        value={draft.pains.join("\n")}
        onChange={(event) => setDraft((value) => ({ ...value, pains: event.target.value.split("\n") }))}
        onBlur={(event) => saveList("pains", event.target.value)}
      />
    </label>
  </fieldset>;
}

function usePersonaDraft({ persona, projectId, onDeleted, unavailable = false }: PersonaDetailProps) {
  const queryClient = useQueryClient();
  const customization = useCustomization(projectId);
  const [deleteReview, setDeleteReview] = useState<{ definitionBefore: Persona; affectedCards: { id: string; baseVersion: number }[] }>();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const deleteAdmission = useRef(false);
  const [draft, setDraft] = useState(persona);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseline = useRef(persona);
  const baseVersion = useRef(persona.version);
  useEffect(() => {
    const previous = baseline.current;
    const sameId = previous.id === persona.id;
    const dirty = sameId && Object.keys(previous).some((key) => JSON.stringify(draftRef.current[key as keyof Persona]) !== JSON.stringify(previous[key as keyof Persona]));
    if (!sameId) baseVersion.current = persona.version;
    else if (!dirty) baseVersion.current = Math.max(baseVersion.current, persona.version);
    baseline.current = persona;
    setDraft((value) => value.id === persona.id ? refreshedDraft(value, previous, persona) : persona);
  }, [persona]);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["personas", projectId] });
    queryClient.invalidateQueries({ queryKey: ["customization", projectId] });
    queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
    queryClient.invalidateQueries({ queryKey: ["story-map"] });
    void invalidateCardReports(queryClient);
  };
  return { persona, onDeleted, unavailable, customization, deleteReview, setDeleteReview, confirmUnlink, setConfirmUnlink, deleteAdmission, draft, setDraft, draftRef, baseline, baseVersion, invalidate };
}
