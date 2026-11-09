import type { Persona } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { appStrings as strings, panelStrings } from "@storymapper/ui-strings";
import { api, usePersonas, useStoryMaps } from "@storymapper/web/app/api";
import { PersonaDetail } from "@storymapper/web/features/personas/PersonaDetail";

interface PersonasPanelProps {
  projectId: string;
  selectedPersonaId: string | undefined;
  onSelect: (personaId: string | undefined) => void;
}

export function PersonasPanel(props: PersonasPanelProps) {
  return renderPersonasPanel(usePersonasPanelState(props));
}

function usePersonasPanelState({ projectId, selectedPersonaId, onSelect }: PersonasPanelProps) {
  const queryClient = useQueryClient();
  const personas = usePersonas(projectId);
  const externalRefsByPersonaId = useMemo(() => (personas.data?.externalRefs ?? []).reduce<Record<string, string[]>>((refs, ref) => {
    refs[ref.entityId] = [...(refs[ref.entityId] ?? []), panelStrings.externalRef(ref.system, ref.externalId)];
    return refs;
  }, {}), [personas.data?.externalRefs]);
  const storyMaps = useStoryMaps(projectId);
  const [createScope, setCreateScope] = useState("project");
  const unavailable = createScope !== "project" && !storyMaps.data?.storyMaps.some((map) => map.id === createScope && map.projectId === projectId);
  const [filterScope, setFilterScope] = useState("all");
  const mapName = (storyMapId: string | null) =>
    storyMapId ? storyMaps.data?.storyMaps.find((map) => map.id === storyMapId)?.name ?? strings.storyMap : strings.projectWide;

  const create = useMutation({
    mutationFn: () => {
      if (unavailable) throw new Error(panelStrings.unavailableScope);
      return api.createPersona({
        projectId,
        storyMapId: createScope === "project" ? undefined : createScope,
        name: strings.newPersona,
        role: strings.userRole
      });
    },
    onSuccess: (persona) => {
      queryClient.invalidateQueries({ queryKey: ["personas", projectId] });
      queryClient.invalidateQueries({ queryKey: ["customization", projectId] });
      onSelect(persona.id);
    }
  });

  const items = (personas.data?.personas ?? []).filter((persona) => {
    if (filterScope === "all") return true;
    if (filterScope === "project") return persona.storyMapId === null;
    return persona.storyMapId === filterScope;
  });
  const selected = items.find((persona) => persona.id === selectedPersonaId)
    ?? (personas.data?.personas ?? []).find((persona) => persona.id === selectedPersonaId);
  return { items, createScope, setCreateScope, unavailable, storyMaps, create, filterScope, setFilterScope, personas, selectedPersonaId, onSelect, mapName, externalRefsByPersonaId, selected, projectId };
}

function renderPersonasPanel(model: ReturnType<typeof usePersonasPanelState>) {
  const { items, createScope, setCreateScope, unavailable, storyMaps, create, filterScope, setFilterScope, personas, selectedPersonaId, onSelect, mapName, externalRefsByPersonaId, selected, projectId } = model;
  return (
    <section className="personas-workspace">
      <aside className="personas-list-pane">
        <div className="personas-list-header">
          <h2><UserRound size={18} />{strings.personas}</h2>
          <span>{items.length}</span>
        </div>
        <div className="personas-create-row">
          <select aria-label={panelStrings.personaCreateScope} value={createScope} onChange={(event) => setCreateScope(event.target.value)}>
            <option value="project">{strings.projectWide}</option>
            {unavailable ? <option value={createScope}>{panelStrings.unavailableScope}</option> : null}
            {(storyMaps.data?.storyMaps ?? []).map((map) => (
              <option key={map.id} value={map.id}>{map.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => create.mutate()} disabled={unavailable || create.isPending || storyMaps.isPending || Boolean(storyMaps.error)}>
            <Plus size={15} />{strings.new}</button>
        </div>
        {unavailable ? <p role="alert">{panelStrings.unavailableScope}</p> : null}
        <div className="personas-filter-row">
          <select aria-label={panelStrings.personaFilterScope} value={filterScope} onChange={(event) => setFilterScope(event.target.value)}>
            <option value="all">{strings.allPersonas}</option>
            <option value="project">{strings.projectWideOnly}</option>
            {(storyMaps.data?.storyMaps ?? []).map((map) => (
              <option key={map.id} value={map.id}>{map.name}</option>
            ))}
          </select>
        </div>
        {personas.error || storyMaps.error || create.error ? <p role="alert">{(personas.error ?? storyMaps.error ?? create.error)?.message}</p> : null}
        {renderPersonaList(model)}
      </aside>
      <div className="personas-detail-pane">
        {selected ? (
          <PersonaDetail key={selected.id} persona={selected} projectId={projectId} unavailable={Boolean(selected.storyMapId && !storyMaps.data?.storyMaps.some((map) => map.id === selected.storyMapId))} onDeleted={() => onSelect(undefined)} />
        ) : (
          <div className="empty-state">{strings.selectPersona}</div>
        )}
      </div>
    </section>
  );
}

function renderPersonaList(model: ReturnType<typeof usePersonasPanelState>) {
  const { items, selectedPersonaId, onSelect, mapName, externalRefsByPersonaId } = model;
  return <div className="personas-tiles">
    {items.map((persona: Persona) => (
      <button
        type="button"
        key={persona.id}
        className={`persona-tile${persona.id === selectedPersonaId ? " active" : ""}`}
        onClick={() => onSelect(persona.id)}
      >
        <span className="persona-avatar">{(persona.avatar || persona.name || strings.unknownAvatar).slice(0, 2)}</span>
        <span className="persona-tile-text">
          <strong>{persona.name}</strong>
          <small>{strings.personaSummary(persona.role, mapName(persona.storyMapId))}</small>
          {(externalRefsByPersonaId[persona.id] ?? []).map((externalRef) => <small className="external-ref-badge" key={externalRef}>{externalRef}</small>)}
        </span>
      </button>
    ))}
    {items.length === 0 ? <p className="personas-empty">{strings.noPersonas}</p> : null}
  </div>;
}
