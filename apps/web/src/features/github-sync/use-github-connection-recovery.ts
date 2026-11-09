import type { ConnectorConnection } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { githubConnectStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

export interface ConnectionRecoveryOrigin { projectId: string; noticeScope: string; target: Pick<ConnectorConnection, "owner" | "repository" | "name"> }
interface RecoveryNotice { origin: ConnectionRecoveryOrigin; message: string; cause: string; blocked: boolean; connectionId?: string | undefined }

export function useGitHubConnectionRecovery(noticeScope: string) {
  const client = useQueryClient();
  const scopeRef = useRef(noticeScope); scopeRef.current = noticeScope;
  const [notices, setNotices] = useState<Record<string, RecoveryNotice>>({});
  const noticesRef = useRef(notices); noticesRef.current = notices;
  const generations = useRef(new Map<string, number>());
  const mutation = useMutation({
    mutationFn: async ({ origin, review }: { origin: ConnectionRecoveryOrigin; review: boolean }) => {
      const live = useLiveInteractionStore.getState();
      if (live.restorePending) return { skipped: true as const };
      const generation = (generations.current.get(origin.projectId) ?? 0) + 1;
      generations.current.set(origin.projectId, generation);
      const [connections, safety, credentials] = await Promise.all([api.readConnectorConnections(origin.projectId), api.readSafetySettings(origin.projectId), api.readCredentialStatus()]);
      return { skipped: false as const, origin, review, live, generation, connections, safety, credentials };
    },
    onSuccess: (result) => {
      if (result.skipped) return;
      const current = useLiveInteractionStore.getState();
      if (result.live.epoch !== current.epoch || result.live.restoreRevision !== current.restoreRevision || current.restorePending || result.generation !== generations.current.get(result.origin.projectId)) return;
      client.setQueryData(["connector-connections", result.origin.projectId], result.connections);
      client.setQueryData(["safety-settings", result.origin.projectId], result.safety);
      client.setQueryData(["credential-status"], result.credentials);
      void client.invalidateQueries({ queryKey: ["getting-started", result.origin.projectId] });
      void client.invalidateQueries({ queryKey: ["activity"] });
      const matches = result.connections.connections.filter((connection) => connection.owner === result.origin.target.owner && connection.repository === result.origin.target.repository && connection.name === result.origin.target.name);
      const matching = matches.length === 1 ? matches[0] : undefined;
      const names = result.connections.connections.map((connection) => `${connection.name} (${connection.owner}/${connection.repository ?? ""})`).join(", ") || strings.noSaved;
      setNotices((previous) => ({ ...previous, [result.origin.noticeScope]: { origin: result.origin, message: `${previous[result.origin.noticeScope]?.cause ?? ""} ${matches.length > 1 ? strings.ambiguousSaved : strings.recovered(names)}`, cause: previous[result.origin.noticeScope]?.cause ?? "", blocked: !result.review || matches.length > 1, connectionId: matching?.id } }));
    },
    onError: (_error, { origin }) => { setNotices((previous) => ({ ...previous, [origin.noticeScope]: { origin, cause: previous[origin.noticeScope]?.cause ?? strings.uncertain, message: `${previous[origin.noticeScope]?.cause ?? strings.uncertain} ${strings.recoveryFailed}`, blocked: true } })); }
  });
  const recover = (origin: ConnectionRecoveryOrigin, message: string) => {
    setNotices((previous) => ({ ...previous, [origin.noticeScope]: { origin, message, cause: message, blocked: true } }));
    mutation.mutate({ origin, review: false });
  };
  const review = () => { const notice = noticesRef.current[scopeRef.current]; if (notice) mutation.mutate({ origin: notice.origin, review: true }); };
  const notice = notices[noticeScope];
  return { notice, recover, review, pending: mutation.isPending };
}
