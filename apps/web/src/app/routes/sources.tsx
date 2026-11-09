import { useParams } from "@tanstack/react-router";
import { SourceDocumentsPanel } from "../../features/source-documents/SourceDocumentsPanel";

export function SourcesRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  return (
    <section className="route-panel">
      <SourceDocumentsPanel projectId={projectId} />
    </section>
  );
}
