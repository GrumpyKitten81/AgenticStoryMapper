import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import type { ImportProjectArchiveResponse } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { api, ProjectArchiveRejectedError } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { reloadProjectArchiveRuntime } from "@storymapper/web/features/project-archive/project-archive-runtime";

export type ProjectArchiveImportState = ReturnType<typeof useProjectArchiveImport>;

export function useProjectArchiveImport() {
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
  return { importArchive, fileInput, selectArchive, outcome, result };
}

export function renderProjectArchiveImportButton({ importArchive, fileInput, selectArchive }: ProjectArchiveImportState, label: string, disabled = false) {
  return <>
    <button type="button" className="secondary" disabled={importArchive.isPending || disabled} onClick={() => fileInput.current?.click()}>
      <Upload size={15} />{importArchive.isPending ? strings.importingProject : label}</button>
    <input ref={fileInput} type="file" accept=".zip" hidden onChange={selectArchive} />
  </>;
}

export function renderProjectArchiveImportOutcome({ importArchive, outcome, result }: ProjectArchiveImportState) {
  if (importArchive.isError) return <p ref={outcome} tabIndex={-1} className="project-archive-error" role="alert">{(importArchive.error as Error).message}</p>;
  return result ? (
    <p ref={outcome} tabIndex={-1} className="project-archive-result" role="status">
      {strings.archiveImported(result.localPath, result.manifest.counts.storyMaps, result.manifest.counts.cards)}
    </p>
  ) : null;
}
