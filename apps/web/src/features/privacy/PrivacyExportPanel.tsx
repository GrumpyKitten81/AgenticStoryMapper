import { Download, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useCredentialStatus } from "../../app/api";

interface PrivacyExportPanelProps {
  projectId: string | undefined;
  storyMapId: string | undefined;
}

export function PrivacyExportPanel({ projectId, storyMapId }: PrivacyExportPanelProps) {
  const queryClient = useQueryClient();
  const credentialStatus = useCredentialStatus();
  const exportArtifact = useMutation({
    mutationFn: (download: () => Promise<void>) => download(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] })
  });

  return (
    <section className="panel privacy-panel">
      <div className="panel-title-row">
        <h2>{panelStrings.exportAndAudit}</h2>
        <ShieldCheck size={18} />
      </div>

      <div className="connector-list">
        {(credentialStatus.data?.credentials ?? []).map((credential) => (
          <div className="connector-toggle" key={`${credential.provider}-${credential.source}`}>
            <span>
              <strong>{credential.provider} {credential.source}</strong>
              <small>{credential.message}</small>
            </span>
            <ShieldCheck size={16} />
          </div>
        ))}
      </div>

      <div className="button-row">
        <button type="button" className="secondary" disabled={!storyMapId || exportArtifact.isPending} onClick={() => storyMapId && exportArtifact.mutate(() => api.downloadStoryMapExport(storyMapId, "json"))}>
          <Download size={15} />{panelStrings.mapJSON}</button>
        <button type="button" className="secondary" disabled={!storyMapId || exportArtifact.isPending} onClick={() => storyMapId && exportArtifact.mutate(() => api.downloadStoryMapExport(storyMapId, "markdown"))}>
          <Download size={15} />{panelStrings.mapMD}</button>
        <button type="button" className="secondary" disabled={!storyMapId || exportArtifact.isPending} onClick={() => storyMapId && exportArtifact.mutate(() => api.downloadStoryMapExport(storyMapId, "csv"))}>
          <Download size={15} />{panelStrings.mapCSV}</button>
        <button type="button" className="secondary" disabled={!projectId || exportArtifact.isPending} onClick={() => projectId && exportArtifact.mutate(() => api.downloadAuditExport(projectId, "markdown"))}>
          <Download size={15} />{panelStrings.auditMD}</button>
        <button type="button" className="secondary" disabled={!projectId || exportArtifact.isPending} onClick={() => projectId && exportArtifact.mutate(() => api.downloadAuditExport(projectId, "json"))}>
          <Download size={15} />{panelStrings.auditJSON}</button>
      </div>
      {exportArtifact.isError ? <p role="alert">{exportArtifact.error.message}</p> : null}
    </section>
  );
}
