import { useEffect, useId, useRef, useState } from "react";
import { cardSchema } from "@storymapper/contracts";
import { conflictFor } from "@storymapper/web/app/conflicts";
import { ChangeAlert } from "@storymapper/web/features/conflicts";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { conflictStrings, storyMapStrings as strings } from "@storymapper/ui-strings";

interface PlanningNumberFieldProps {
  name: string;
  cardId: string;
  field: "businessValue" | "effort";
  value: number | undefined;
  version: number;
  disabled: boolean;
  onCommit: (value: number, baseVersion: number) => void | Promise<unknown>;
}

export function PlanningNumberField(props: PlanningNumberFieldProps) {
  return renderPlanningNumberField(usePlanningNumberFieldState(props));
}

function usePlanningNumberFieldState({ name, cardId, field, value, version, disabled, onCommit }: PlanningNumberFieldProps) {
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const baseRevision = useRef(useLiveInteractionStore.getState().restoreRevision);
  const [saveError, setSaveError] = useState<Error | undefined>(undefined);
  const conflict = conflictFor(saveError, cardId);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const errorId = useId();
  const [dirty, setDirty] = useState(false);
  const baseVersion = useRef(version);
  const submitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (baseRevision.current === useLiveInteractionStore.getState().restoreRevision && !inFlight.current && submitted.current !== undefined && Number(submitted.current) === value) setDirty(false);
    if (!dirty) setDraft(String(value ?? ""));
  }, [value, saving]);
  function commit(reviewedVersion?: number) {
    if (disabled || restorePending || inFlight.current || (conflict && reviewedVersion === undefined)) return;
    if (!draft.trim() && value === undefined) { setError(""); setDirty(false); return; }
    const number = Number(draft);
    const invalid = !draft.trim() ? strings.cardNumberCannotClear(name) : !Number.isFinite(number) ? strings.invalidCardNumber(name) : !Number.isInteger(number) ? strings.integerCardNumber(name) : number < 0 ? strings.nonnegativeCardNumber(name) : "";
    setError(invalid);
    if (invalid || submitted.current === draft) return;
    if (number === value) { setDirty(false); return; }
    if (baseRevision.current !== useLiveInteractionStore.getState().restoreRevision) {
      setError(conflictStrings.changed(name));
      return;
    }
    if (reviewedVersion !== undefined) baseVersion.current = reviewedVersion;
    setSaveError(undefined);
    submitted.current = draft;
    inFlight.current = true;
    setSaving(true);
    void Promise.resolve(onCommit(number, reviewedVersion ?? baseVersion.current)).then(() => {
      inFlight.current = false;
      setSaving(false);
    }, (error: unknown) => {
      submitted.current = undefined;
      inFlight.current = false;
      setSaving(false);
      if (!(error instanceof Error)) throw error;
      setSaveError(error);
    });
  }
  return { dirty, saving, name, disabled, restorePending, value, draft, error, saveError, errorId, inFlight, baseRevision, baseVersion, version, setError, setSaveError, setDirty, submitted, setDraft, commit, conflict, field };
}

function renderPlanningNumberField({ dirty, saving, name, disabled, restorePending, value, draft, error, saveError, errorId, inFlight, baseRevision, baseVersion, version, setError, setSaveError, setDirty, submitted, setDraft, commit, conflict, field }: ReturnType<typeof usePlanningNumberFieldState>) {
  return <div data-live-suspended-draft={dirty || saving || undefined}><label>{name}<input disabled={disabled || restorePending || saving} inputMode="numeric" value={draft} aria-invalid={Boolean(error || saveError)} aria-describedby={error || saveError ? errorId : undefined}
    onChange={(event) => { if (disabled || restorePending || inFlight.current) return; if (!dirty || baseRevision.current !== useLiveInteractionStore.getState().restoreRevision) { baseVersion.current = baseRevision.current !== useLiveInteractionStore.getState().restoreRevision ? version : Math.max(version, baseVersion.current); baseRevision.current = useLiveInteractionStore.getState().restoreRevision; setError(""); setSaveError(undefined); } setDirty(true); submitted.current = undefined; setDraft(event.target.value); }}
    onBlur={() => commit()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(); } }}
    onClick={(event) => event.stopPropagation()} /></label>
    {conflict ? <span id={errorId}><ChangeAlert message={conflictStrings.changed(name)} disabled={disabled || restorePending || saving}
      onReload={() => { const restored = baseRevision.current !== useLiveInteractionStore.getState().restoreRevision; setDraft(String((restored ? value : cardSchema.parse(conflict.current)[field]) ?? "")); baseVersion.current = restored ? version : conflict.currentVersion; baseRevision.current = useLiveInteractionStore.getState().restoreRevision; submitted.current = undefined; setDirty(false); setError(""); setSaveError(undefined); }}
      onKeepMine={() => commit(conflict.currentVersion)} /></span> : error || saveError ? <span role="alert" id={errorId}>{error || saveError?.message}</span> : null}
  </div>;
}
