import type { ReactElement } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { useAiFunctionTemplates } from "@storymapper/web/app/api";
import { TemplateEditor } from "@storymapper/web/features/customization/TemplateEditor";

export function AgentPromptTemplates({ projectId }: { projectId: string }): ReactElement {
  const templates = useAiFunctionTemplates(projectId);
  return <details className="disclosure">
    <summary>{panelStrings.functionTemplates}</summary>
    {templates.error ? <p role="alert">{templates.error.message}</p> : null}
    <TemplateEditor projectId={projectId} templates={templates.data?.templates ?? []} />
  </details>;
}
