import { roadmapSchema, roadmapTypeSchema, type Roadmap, type UpdateRoadmapRequest } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { ConflictAlert } from "@storymapper/web/features/conflicts";

type Fields = Pick<Roadmap, "name" | "type">;

const fieldsOf = ({ name, type }: Roadmap): Fields => ({ name, type });

export function RoadmapEditor(props: RoadmapEditorProps) {
  return renderRoadmapEditor(useRoadmapEditorState(props));
}

function useRoadmapEditorState({ roadmap, onSaved }: RoadmapEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(fieldsOf(roadmap));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseline = useRef(fieldsOf(roadmap));
  const baseVersion = useRef(roadmap.version);
  useEffect(() => {
    if (JSON.stringify(draftRef.current) !== JSON.stringify(baseline.current)) return;
    baseline.current = fieldsOf(roadmap);
    baseVersion.current = Math.max(baseVersion.current, roadmap.version);
    setDraft(fieldsOf(roadmap));
  }, [roadmap]);
  const update = useMutation({
    scope: { id: `roadmap:${roadmap.id}` },
    meta: { ownsConflict: true },
    mutationFn: (patch: UpdateRoadmapRequest) => api.updateRoadmap(roadmap.id, patch, baseVersion.current),
    onSuccess: (saved, patch) => {
      baseVersion.current = saved.version;
      baseline.current = { ...baseline.current, ...patch } as Fields;
      void queryClient.invalidateQueries({ queryKey: ["roadmap", roadmap.id] });
      onSaved();
    }
  });
  const saveName = () => {
    const name = draft.name.trim();
    if (name && name !== baseline.current.name) update.mutate({ name });
  };
  return { update, roadmap, baseline, baseVersion, setDraft, onSaved, draftRef, draft, saveName };
}

function renderRoadmapEditor({ update, roadmap, baseline, baseVersion, setDraft, onSaved, draftRef, draft, saveName }: ReturnType<typeof useRoadmapEditorState>) {
  return (
    <div className="roadmap-editor form-stack">
      <ConflictAlert
        error={update.error}
        entityId={roadmap.id}
        name={roadmap.name}
        disabled={update.isPending}
        onReload={(conflict) => {
          const current = roadmapSchema.parse(conflict.current);
          baseline.current = fieldsOf(current);
          baseVersion.current = conflict.currentVersion;
          setDraft(fieldsOf(current));
          update.reset();
          onSaved();
        }}
        onKeepMine={(conflict) => {
          baseVersion.current = conflict.currentVersion;
          update.reset();
          update.mutate({ name: draftRef.current.name.trim(), type: draftRef.current.type });
        }}
      />
      {update.error && !isConflictError(update.error) ? <p role="alert">{update.error.message}</p> : null}
      <label>
        {panelStrings.roadmapName}
        <input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} onBlur={saveName} />
      </label>
      <label>
        {panelStrings.roadmapType}
        <select value={draft.type} onChange={(event) => { const type = roadmapTypeSchema.parse(event.target.value); setDraft((value) => ({ ...value, type })); update.mutate({ type }); }}>
          {roadmapTypeSchema.options.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
    </div>
  );
}

interface RoadmapEditorProps { roadmap: Roadmap; onSaved: () => void }
