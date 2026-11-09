import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";
import type { ImportProjectArchiveResponse } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { api, ProjectArchiveRejectedError } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { reloadProjectArchiveRuntime } from "@storymapper/web/features/project-archive/project-archive-runtime";

export async function downloadProjectArchive(queryClient: QueryClient, projectId: string): Promise<void> {
  await api.downloadProjectArchive(projectId);
  await queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
}

export function ProjectArchivePanel(props: ProjectArchivePanelProps) {
  return renderProjectArchivePanel(useProjectArchivePanelState(props));
}

function useProjectArchivePanelState({ projectId }: ProjectArchivePanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const outcome = useRef<HTMLParagraphElement>(null);
  const [result, setResult] = useState<ImportProjectArchiveResponse | undefined>();
  const importArchive = useMutation({
    mutationFn: (file: File) => api.importProjectArchive(file),
    onSuccess: async (data) => {
      await queryClient.cancelQueries();
      useActiveStoryMapStore.setState({ activeProjectId: data.projectId, activeStoryMapId: undefined, lastActiveProjectId: undefined, lastActiveStoryMapId: undefined });
      await navigate({ to: "/projects/$projectId/story-maps", params: { projectId: data.projectId } });
      await queryClient.resetQueries();
      setResult(data);
    },
    onError: (error) => { if (!(error instanceof ProjectArchiveRejectedError)) reloadProjectArchiveRuntime(); }
  });
  const exportArchive = useMutation({ mutationFn: () => downloadProjectArchive(queryClient, projectId) });
  useEffect(() => {
    if (!importArchive.isPending && (result || importArchive.isError)) outcome.current?.focus();
  }, [result, importArchive.isPending, importArchive.isError]);

  function selectArchive(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setResult(undefined);
      importArchive.mutate(file);
    }
    event.target.value = "";
  }
  return { exportArchive, importArchive, fileInput, selectArchive, outcome, result };
}

function renderProjectArchivePanel({ exportArchive, importArchive, fileInput, selectArchive, outcome, result }: ReturnType<typeof useProjectArchivePanelState>) {
  return (
    <div className="project-archive-panel" id="project-archive">
      <div className="project-archive-actions">
        <button type="button" disabled={exportArchive.isPending || importArchive.isPending} onClick={() => exportArchive.mutate()}>
          <Download size={15} />{exportArchive.isPending ? strings.exportingProject : strings.exportProject}</button>
        <button type="button" className="secondary" disabled={importArchive.isPending || exportArchive.isPending} onClick={() => fileInput.current?.click()}>
          <Upload size={15} />{importArchive.isPending ? strings.importingProject : strings.importProject}</button>
        <input ref={fileInput} type="file" accept=".zip" hidden onChange={selectArchive} />
      </div>
      {exportArchive.isError ? <p className="project-archive-error" role="alert">{exportArchive.error.message}</p> : null}
      {importArchive.isError ? (
        <p ref={outcome} tabIndex={-1} className="project-archive-error" role="alert">{(importArchive.error as Error).message}</p>
      ) : null}
      {result ? (
        <p ref={outcome} tabIndex={-1} className="project-archive-result" role="status">
          {strings.archiveImported(result.localPath, result.manifest.counts.storyMaps, result.manifest.counts.cards)}
        </p>
      ) : null}
    </div>
  );
}

interface ProjectArchivePanelProps { projectId: string }
