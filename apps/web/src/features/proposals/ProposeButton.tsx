import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { McpCallRequest } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { proposalStrings as strings } from "@storymapper/web/ui-strings/proposals";

export function ProposeButton({ projectId, call, label, disabled = false }: { projectId: string; call: McpCallRequest; label: string; disabled?: boolean }): ReactElement {
  const queryClient = useQueryClient();
  const propose = useMutation({
    mutationFn: () => api.callMcpTool(call),
    onSuccess: () => Promise.all([["changesets", projectId], ["activity", projectId]].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  });
  return <div className="form-stack">
    <div className="button-row"><button type="button" className="secondary" disabled={disabled || propose.isPending} onClick={() => propose.mutate()}><Sparkles size={16} /> {label}</button></div>
    {propose.error ? <p role="alert">{propose.error.message}</p> : null}
    {propose.data?.changeSet ? <p role="status">{strings.created(propose.data.changeSet.title)} <Link to="/projects/$projectId/audit" params={{ projectId }}>{strings.review}</Link></p> : null}
  </div>;
}
