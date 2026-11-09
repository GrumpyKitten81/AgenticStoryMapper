import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { parseGitHubTicketSelector, type Card, type ConnectorConnection, type IncomingGitHubCommandResponse, type RemoteWorkItemLink } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { IncomingGitHubReview } from "@storymapper/web/features/github-sync/IncomingGitHubReview";
import { githubStatusStrings as strings } from "@storymapper/web/ui-strings/github-status";

export function GitHubCardBinding({ card, connections, links, disabled }: { card: Card; connections: ConnectorConnection[]; links: RemoteWorkItemLink[]; disabled: boolean }) {
  const query = useQueryClient();
  const [connectionId, setConnectionId] = useState("");
  const [selector, setSelector] = useState("");
  const [review, setReview] = useState<{ scope: string; command: IncomingGitHubCommandResponse }>();
  const scope = JSON.stringify([card.id, card.version, connectionId, selector]);
  const current = useRef(scope);
  current.current = scope;
  const refresh = async () => { await Promise.all([query.invalidateQueries({ queryKey: ["card-reviews"] }), query.invalidateQueries({ queryKey: ["story-map", card.storyMapId] }), query.invalidateQueries({ queryKey: ["connector-connections"] }), query.invalidateQueries({ queryKey: ["work-item-sync-health", card.storyMapId] })]); };
  const binding = useMutation({ mutationKey: ["card-owned-write", card.id], mutationFn: async () => {
    const connection = connections.find((connection) => connection.id === connectionId);
    const locator = connection && parseGitHubTicketSelector(selector, connection);
    if (!connection || !locator) throw new Error("Choose a connection and enter an Issue URL or positive number.");
    return { scope, command: await api.bindGitHubCard({ cardId: card.id, connectionId, repo: locator.repo, url: locator.url, issueNumber: locator.number, apply: false }) };
  }, onSuccess: (result) => { if (result.scope === current.current) setReview(result); } });
  const detach = useMutation({ mutationKey: ["card-owned-write", card.id], mutationFn: (linkId: string) => api.deleteGitHubLink(linkId), onSuccess: refresh });
  if (links.length) return <div className="form-stack">{links.map((link) => <button key={link.id} type="button" className="secondary" disabled={disabled || detach.isPending} onClick={() => detach.mutate(link.externalRefId)}>{strings.detach}</button>)}{detach.error ? <p role="alert">{detach.error.message}</p> : null}</div>;
  return <details><summary>{strings.bind}</summary><div className="form-stack">
    <label>{strings.connection}<select disabled={disabled || binding.isPending} value={connectionId} onChange={(event) => setConnectionId(event.target.value)}><option value="">{strings.connection}</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
    <label>{strings.selector}<input disabled={disabled || binding.isPending} value={selector} onChange={(event) => setSelector(event.target.value)} /></label>
    <button type="button" className="secondary" disabled={disabled || binding.isPending || !connectionId || !selector.trim()} onClick={() => binding.mutate()}>{strings.previewBinding}</button>
    {binding.error ? <p role="alert">{binding.error.message}</p> : null}
    {review ? <IncomingGitHubReview command={review.command} mutationKey={["card-owned-write", card.id]} isCurrent={() => !disabled && review.scope === current.current} onApplied={() => { void refresh(); }} /> : null}
  </div></details>;
}
