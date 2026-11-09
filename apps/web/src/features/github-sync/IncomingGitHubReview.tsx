import { IncomingGitHubResults } from "@storymapper/web/features/github-sync/IncomingGitHubResults";
import { useEffect, useRef } from "react";
import type { IncomingGitHubCommandResponse, StoredChangeSet } from "@storymapper/contracts";
import { ChangeSetReview } from "@storymapper/web/features/changesets";
import { useChangeSetReview } from "@storymapper/web/features/changesets";
import { incomingGitHubStrings as strings } from "@storymapper/web/ui-strings/incoming-github";

interface IncomingGitHubReviewProps {
  command: IncomingGitHubCommandResponse;
  mutationKey?: readonly unknown[] | undefined;
  isCurrent: () => boolean;
  onApplied?: ((changeSet: StoredChangeSet) => void) | undefined;
  onPrepareOutgoing?: (() => void) | undefined;
  onPendingChange?: ((pending: boolean) => void) | undefined;
}

export function IncomingGitHubReview({ command, mutationKey, isCurrent, onPrepareOutgoing, onPendingChange, onApplied }: IncomingGitHubReviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [command.changeSetId]);
  const state = useChangeSetReview(command.changeSetId, mutationKey);
  const notified = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (notified.current !== command.changeSetId && state.decide.variables === "apply" && state.preview.data?.changeSet.status === "applied") {
      notified.current = command.changeSetId;
      onApplied?.(state.preview.data.changeSet);
    }
  }, [command.changeSetId, state.preview.data?.changeSet.status, state.decide.variables, onApplied]);
  const pending = state.decide.isPending;
  useEffect(() => { onPendingChange?.(pending); return () => onPendingChange?.(false); }, [pending, onPendingChange]);
  const current = isCurrent();
  const guardedState = {
    ...state,
    canApprove: current && state.canApprove,
    canApply: current && state.canApply,
    selectionAvailable: current && state.selectionAvailable,
    decideAction: (action: "approve" | "apply" | "reject") => { if (isCurrent()) state.decideAction(action); }
  };
  return <section aria-label={strings.title} data-live-suspended-draft={current && (!state.preview.data?.closed || pending) ? "" : undefined}>
    <h3 ref={heading} tabIndex={-1}>{strings.title}</h3>
    <p>{strings.review}</p>
    <IncomingGitHubResults items={command.items} />
    <ChangeSetReview state={guardedState} />
    {onPrepareOutgoing && state.preview.data?.changeSet.status === "applied" ? <button type="button" disabled={state.writePending || !current} onClick={() => { if (isCurrent()) onPrepareOutgoing(); }}>{strings.outgoing}</button> : null}
  </section>;
}
