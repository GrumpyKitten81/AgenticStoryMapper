import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { PersonasPanel } from "@storymapper/web/features/personas/PersonasPanel";

export function PersonasRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const search = useSearch({ strict: false }) as { persona?: string };
  const navigate = useNavigate();
  return (
    <section className="route-panel personas-route">
      <PersonasPanel key={projectId}
        projectId={projectId}
        selectedPersonaId={search.persona}
        onSelect={(personaId) => navigate({ to: ".", search: personaId ? { persona: personaId } : {} })}
      />
    </section>
  );
}
