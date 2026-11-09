import type { Annotation, StoryTemplate, WorkflowStatus } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { panelStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { Dialog } from "@storymapper/web/components/Dialog";
import { affectedCustomizationCards, invalidateCustomization, loadCustomizationReview, type CustomizationData } from "@storymapper/web/features/customization/customization-impact";

export interface CustomizationSelection {
  kind: "status" | "annotation" | "template";
  item?: WorkflowStatus | Annotation | StoryTemplate;
}

export function CustomizationEditor(props: CustomizationEditorProps) {
  return renderCustomizationEditor(useCustomizationEditorState(props));
}

function useCustomizationEditorState(props: CustomizationEditorProps) {
  const context = useCustomizationDraft(props);
  const { projectId, storyMapId, kind, item, admission, draft, setDraft, confirmUnlink, setConfirmUnlink, setReplacementId, reviewData, setReviewData, evidence, setEvidence, replacement, setReplacementBefore, write } = context;
  const refreshReview = useMutation({
    mutationFn: async () => {
      if (!item || kind === "template") return;
      const fresh = await loadCustomizationReview(projectId, storyMapId, item as WorkflowStatus | Annotation, kind);
      const current = (kind === "status" ? fresh.workflowStatuses : fresh.annotations).find((entry) => entry.id === item.id);
      if (!current) throw new Error(strings.unavailableCustomization);
      setEvidence({ definitionBefore: current, affectedCards: affectedCustomizationCards(fresh, current, kind) });
      setReviewData(fresh);
      setConfirmUnlink(false); setReplacementId(""); setReplacementBefore(undefined);
      write.reset();
    }
  });
  const submit = (remove: boolean) => { if (!admission.current) { admission.current = true; write.mutate(remove); } };
  const change = (key: keyof typeof draft, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));
  const pending = write.isPending || refreshReview.isPending;
  const valid = draft.name.trim() && (draft.position === "" || Number.isInteger(Number(draft.position)) && Number(draft.position) >= 0) && (draft.defaultEstimate === "" || Number.isFinite(Number(draft.defaultEstimate)));
  const count = evidence?.affectedCards.length ?? 0;
  const affectedMaps = new Set(reviewData.usageCards.filter((card) => evidence?.affectedCards.some((entry) => entry.id === card.id)).map((card) => card.storyMapId));
  const replacements = reviewData.workflowStatuses.filter((status) => status.id !== item?.id && (!status.storyMapId || [...affectedMaps].every((mapId) => mapId === status.storyMapId)));
  const canDelete = kind === "status" ? !count || Boolean(replacement && replacements.some((status) => status.id === replacement.id)) : kind !== "annotation" || !count || confirmUnlink;
  return { ...context, pending, valid, submit, change, count, refreshReview, replacements, canDelete };
}

function renderCustomizationEditor({ item, kind, pending, onClose, unavailable, valid, submit, review, draft, change, evidence, count, write, refreshReview, setReview, replacementId, setReplacementId, setReplacementBefore, reviewData, replacements, confirmUnlink, setConfirmUnlink, canDelete }: ReturnType<typeof useCustomizationEditorState>) {
  return <Dialog title={item ? strings.editItem(item.name) : strings.newItem(kind === "status" ? strings.status : kind === "annotation" ? strings.annotation : strings.template)} dismissible={!pending} onClose={onClose}>
    <form className="customization-editor" onSubmit={(event) => { event.preventDefault(); if (!pending && !unavailable && valid) submit(false); }}>
      <fieldset disabled={unavailable || pending || review}>
        <label>{strings.name}<input required value={draft.name} onChange={(event) => change("name", event.target.value)} /></label>
        <label>{strings.position}<input type="number" min="0" step="1" value={draft.position} onChange={(event) => change("position", event.target.value)} /></label>
        {kind !== "template" ? <label>{strings.color}<input value={draft.color} onChange={(event) => change("color", event.target.value)} /></label> : null}
        {kind === "status" ? <label>{strings.group}<select value={draft.group} onChange={(event) => change("group", event.target.value)}>{["todo", "active", "done"].map((group) => <option key={group}>{group}</option>)}</select></label> : null}
        {kind === "annotation" ? <label>{strings.icon}<input value={draft.icon} onChange={(event) => change("icon", event.target.value)} /></label> : null}
        {kind === "template" ? <>
          <label>{strings.descriptionTemplate}<textarea value={draft.descriptionTemplate} onChange={(event) => change("descriptionTemplate", event.target.value)} /></label>
          <label>{strings.defaultStatus}<input required value={draft.defaultStatus} onChange={(event) => change("defaultStatus", event.target.value)} /></label>
          <label>{strings.defaultEstimate}<input type="number" step="any" value={draft.defaultEstimate} onChange={(event) => change("defaultEstimate", event.target.value)} /></label>
        </> : null}
      </fieldset>
      {item && kind === "status" ? <div className="customization-editor-note"><p>{strings.reviewedStatusName(evidence!.definitionBefore.name)}</p><p>{strings.affectedCards(count)}</p></div> : null}
      {unavailable ? <p role="alert">{strings.unavailableScope}</p> : null}
      {write.error || refreshReview.error ? <p role="alert">{(refreshReview.error ?? write.error)?.message}</p> : null}
      {(write.error || refreshReview.error) && item && kind !== "template" ? <button type="button" className="secondary" disabled={unavailable || pending} onClick={() => refreshReview.mutate()}>{strings.reviewAgain}</button> : null}
      {review ? <>
        <h3>{strings.reviewDelete(item!.name)}</h3><p>{strings.affectedCards(count)}</p>
        {kind === "status" ? <label>{strings.replacementStatus}<select disabled={unavailable || pending} value={replacementId} onChange={(event) => { setReplacementId(event.target.value); setReplacementBefore(reviewData.workflowStatuses.find((status) => status.id === event.target.value)); }}><option value="">{strings.replacementStatus}</option>{replacements.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label> : null}
        {kind === "annotation" && count ? <label className="checkbox-row"><input type="checkbox" disabled={unavailable || pending} checked={confirmUnlink} onChange={(event) => setConfirmUnlink(event.target.checked)} />{strings.confirmUnlink}</label> : null}
      </> : null}
      <div className="customization-editor-actions">
        {!review && item ? <button type="button" className="danger" disabled={unavailable || pending} onClick={() => { setReview(true); if (kind !== "template") refreshReview.mutate(); }}>{strings.delete}</button> : null}
        <button type="button" className="secondary" disabled={pending} onClick={() => review ? setReview(false) : onClose()}>{strings.cancel}</button>
        {review ? <button type="button" className="danger" disabled={unavailable || pending || !canDelete || Boolean(refreshReview.error)} onClick={() => submit(true)}>{strings.confirmDelete}</button> : <button type="submit" disabled={unavailable || pending || !valid || Boolean(refreshReview.error)}>{strings.save}</button>}
      </div>
    </form>
  </Dialog>;
}

function useCustomizationDraft({ projectId, storyMapId, selection, data, onClose, unavailable = false }: CustomizationEditorProps) {
  const { kind, item } = selection;
  const client = useQueryClient();
  const admission = useRef(false);
  const [draft, setDraft] = useState({ name: item?.name ?? "", position: item ? String(item.position) : "", color: item && "color" in item ? item.color ?? "" : "#eef2ff", group: item && "group" in item ? item.group : "todo", icon: item && "icon" in item ? item.icon : "tag", descriptionTemplate: item && "descriptionTemplate" in item ? item.descriptionTemplate : strings.storyTemplateDraft, defaultStatus: item && "defaultStatus" in item ? item.defaultStatus : "todo", defaultEstimate: item && "defaultEstimate" in item && item.defaultEstimate !== null ? String(item.defaultEstimate) : "" });
  const [review, setReview] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [reviewData, setReviewData] = useState(data);
  const [evidence, setEvidence] = useState(() => item && kind !== "template" ? { definitionBefore: item, affectedCards: affectedCustomizationCards(data, item as WorkflowStatus | Annotation, kind) } : undefined);
  const replacement = reviewData.workflowStatuses.find((status) => status.id === replacementId);
  const [replacementBefore, setReplacementBefore] = useState<WorkflowStatus>();
  const write = useMutation({
    meta: { ownsConflict: true }, mutationFn: async (remove: boolean) => {
      if (remove && item) {
        if (kind === "status") return api.deleteWorkflowStatus(item.id, { definitionBefore: evidence!.definitionBefore as WorkflowStatus, affectedCards: evidence!.affectedCards, ...(replacementBefore ? { replacementBefore } : {}) });
        if (kind === "annotation") return api.deleteAnnotation(item.id, { definitionBefore: evidence!.definitionBefore as Annotation, affectedCards: evidence!.affectedCards, confirmUnlink });
        return api.deleteStoryTemplate(item.id);
      }
      const common = { name: draft.name.trim(), ...(draft.position === "" ? {} : { position: Number(draft.position) }) };
      const scope = { projectId, ...(storyMapId ? { storyMapId } : {}) };
      if (kind === "status") {
        const input = { ...common, group: draft.group as WorkflowStatus["group"], color: draft.color };
        return item ? api.updateWorkflowStatus(item.id, { ...input, ...(input.name === evidence!.definitionBefore.name ? {} : { definitionBefore: evidence!.definitionBefore as WorkflowStatus, affectedCards: evidence!.affectedCards }) }) : api.createWorkflowStatus({ ...scope, ...input });
      }
      if (kind === "annotation") {
        const input = { ...common, color: draft.color, icon: draft.icon };
        return item ? api.updateAnnotation(item.id, input) : api.createAnnotation({ ...scope, ...input });
      }
      const input = { ...common, descriptionTemplate: draft.descriptionTemplate, defaultStatus: draft.defaultStatus, defaultEstimate: draft.defaultEstimate === "" ? null : Number(draft.defaultEstimate) };
      return item ? api.updateStoryTemplate(item.id, input) : api.createStoryTemplate({ ...scope, ...input });
    }, onSuccess: async () => { await invalidateCustomization(client); onClose(); }, onSettled: () => { admission.current = false; }
  });
  return { projectId, storyMapId, onClose, unavailable, kind, item, admission, draft, setDraft, review, setReview, confirmUnlink, setConfirmUnlink, replacementId, setReplacementId, reviewData, setReviewData, evidence, setEvidence, replacement, setReplacementBefore, write };
}

interface CustomizationEditorProps {
  projectId: string; storyMapId: string | undefined; selection: CustomizationSelection; data: CustomizationData; onClose: () => void; unavailable?: boolean;
}
