import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { appStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { renderProjectArchiveImportButton, renderProjectArchiveImportOutcome, useProjectArchiveImport } from "@storymapper/web/features/project-archive/ProjectArchiveImport";

export async function downloadProjectArchive(queryClient: QueryClient, projectId: string): Promise<void> {
  await api.downloadProjectArchive(projectId);
  await queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
}

export function ProjectArchivePanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const archiveImport = useProjectArchiveImport();
  const exportArchive = useMutation({ mutationFn: () => downloadProjectArchive(queryClient, projectId) });
  return (
    <div className="project-archive-panel" id="project-archive">
      <div className="project-archive-actions">
        <button type="button" disabled={exportArchive.isPending || archiveImport.importArchive.isPending} onClick={() => exportArchive.mutate()}>
          <Download size={15} />{exportArchive.isPending ? strings.exportingProject : strings.exportProject}</button>
        {renderProjectArchiveImportButton(archiveImport, strings.importProject, exportArchive.isPending)}
      </div>
      {exportArchive.isError ? <p className="project-archive-error" role="alert">{exportArchive.error.message}</p> : null}
      {renderProjectArchiveImportOutcome(archiveImport)}
    </div>
  );
}
