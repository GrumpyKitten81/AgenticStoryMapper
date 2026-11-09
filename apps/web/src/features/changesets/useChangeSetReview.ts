import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, useChangeSetPreview } from "@storymapper/web/app/api";
import { RequestError } from "@storymapper/web/app/conflicts";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";
import { changeSetStrings as strings } from "@storymapper/ui-strings";

export function useChangeSetReview(id?: string, mutationKey?: readonly unknown[]) {
  const { matchingMutations, sharedWritePending, revision, reviewedRevision, setReviewedRevision, setSelection, selectionIntent, selectionPending, decisionPending, refreshPending, selectionChanged, setSelectionChanged, approvedSelection, setApprovedSelection, message, setMessage, preview, fresh, selected, fingerprint, decide } = useReviewDecisionMutation(id, mutationKey);
  function select(operationId: string, checked: boolean): void {
    if (sharedWritePending() || reviewedRevision !== revision || preview.error || preview.data?.closed || preview.data?.presentationStatus === "stale" || decide.isPending || decisionPending.current) return;
    const next = new Set(selectionIntent.current ?? selected);
    if (next.has(operationId) === checked) return;
    if (checked) next.add(operationId); else next.delete(operationId);
    selectionIntent.current = [...next];
    selectionPending.current = true;
    setSelection(selectionIntent.current);
    setSelectionChanged(true);
    setApprovedSelection(undefined);
    setMessage("");
  }
  function refresh(): void {
    if (sharedWritePending() || refreshPending.current || preview.isFetching || decide.isPending || decisionPending.current) return;
    refreshPending.current = true;
    setReviewedRevision(revision); setApprovedSelection(undefined); setSelectionChanged(true);
    if (reviewedRevision === revision) void preview.refetch();
  }
  const writePending = decide.isPending || Boolean(mutationKey && matchingMutations > 0);
  const selectionAvailable = reviewedRevision === revision && !preview.error && Boolean(preview.data) && !preview.data?.closed && preview.data?.presentationStatus !== "stale" && !writePending;
  const personasBlocked = !isPersonasEnabled && Boolean(preview.data?.operations.some((operation) => selected.includes(operation.operationId) && isPersonaOperation(operation.operation)));
  const canApprove = !personasBlocked && fresh && !writePending && Boolean(preview.data?.canApprove);
  const canApply = !personasBlocked && fresh && !writePending && Boolean(preview.data?.canApply) && (!selectionChanged || approvedSelection === fingerprint);
  function decideAction(action: "approve" | "apply" | "reject"): void {
    if (sharedWritePending() || decisionPending.current || decide.isPending || selectionPending.current || refreshPending.current || reviewedRevision !== useLiveInteractionStore.getState().reviewRevision || !fresh || preview.data?.closed || preview.data?.presentationStatus === "stale") return;
    if ((action === "approve" && !canApprove) || (action === "apply" && !canApply) || (action !== "reject" && selected.length === 0)) return;
    decisionPending.current = true;
    decide.mutate(action);
  }
  return { preview, selected, select, refresh, fresh, message, decide, decideAction, canApprove, canApply, personasBlocked, selectionAvailable, writePending };
}
export type ChangeSetReviewState = ReturnType<typeof useChangeSetReview>;

function useReviewSelectionState(id?: string, mutationKey?: readonly unknown[]) {
  const client = useQueryClient();
  const matchingMutations = useIsMutating(mutationKey ? { mutationKey, exact: true } : { predicate: () => false });
  const sharedWritePending = () => Boolean(mutationKey && client.isMutating({ mutationKey, exact: true }));
  const invalidateHealth = () => Promise.all(["card-reviews", "work-item-sync-health", "github-sync-health", "backlog-health"].map((key) => client.invalidateQueries({ queryKey: [key] })));
  const revision = useLiveInteractionStore((state) => state.reviewRevision);
  const [reviewedRevision, setReviewedRevision] = useState(revision);
  const [selection, setSelection] = useState<string[]>();
  const selectionIntent = useRef<string[] | undefined>(undefined);
  const selectionPending = useRef(false);
  const decisionPending = useRef(false);
  const refreshPending = useRef(false);
  const [selectionChanged, setSelectionChanged] = useState(false);
  const [approvedSelection, setApprovedSelection] = useState<string>();
  const [message, setMessage] = useState("");
  useEffect(() => { setSelection(undefined); selectionIntent.current = undefined; selectionPending.current = false; setSelectionChanged(false); setApprovedSelection(undefined); setReviewedRevision(revision); setMessage(""); }, [id]);
  const preview = useChangeSetPreview(id, selection, reviewedRevision);
  const fresh = reviewedRevision === revision && !preview.isFetching && !preview.isPlaceholderData && !preview.error;
  const selected = preview.isPlaceholderData ? selection ?? [] : preview.data?.selectedOperationIds ?? [];
  useLayoutEffect(() => {
    if (fresh && preview.data) { selectionIntent.current = selected; selectionPending.current = false; }
  }, [fresh, preview.data, selected]);
  useLayoutEffect(() => { if (!preview.isFetching) refreshPending.current = false; }, [preview.isFetching]);
  const fingerprint = JSON.stringify(selected);
  return { client, matchingMutations, sharedWritePending, invalidateHealth, revision, reviewedRevision, setReviewedRevision, setSelection, selectionIntent, selectionPending, decisionPending, refreshPending, selectionChanged, setSelectionChanged, approvedSelection, setApprovedSelection, message, setMessage, preview, fresh, selected, fingerprint };
}

function useReviewDecisionMutation(id?: string, mutationKey?: readonly unknown[]) {
  const { client, matchingMutations, sharedWritePending, invalidateHealth, revision, reviewedRevision, setReviewedRevision, setSelection, selectionIntent, selectionPending, decisionPending, refreshPending, selectionChanged, setSelectionChanged, approvedSelection, setApprovedSelection, message, setMessage, preview, fresh, selected, fingerprint } = useReviewSelectionState(id, mutationKey);
  const decide = useMutation({
    ...(mutationKey ? { mutationKey } : {}),
    mutationFn: async (action: "approve" | "apply" | "reject") => {
      if (!id || !fresh || selectionPending.current || refreshPending.current || reviewedRevision !== useLiveInteractionStore.getState().reviewRevision) throw new Error(strings.refreshRequired);
      if (action !== "reject" && !isPersonasEnabled && preview.data?.operations.some((operation) => selected.includes(operation.operationId) && isPersonaOperation(operation.operation))) throw new Error("Persona feature is disabled");
      if (action === "approve") return api.approveSelectedChangeSet(id, selected);
      if (action === "apply") return api.applySelectedChangeSet(id, selected);
      return api.rejectChangeSet(id);
    },
    onSuccess: async (_, action) => {
      if (action === "approve") setApprovedSelection(fingerprint);
      setMessage("");
      await Promise.all([client.invalidateQueries({ queryKey: ["changesets"] }), client.invalidateQueries({ queryKey: ["activity"] }), client.invalidateQueries({ queryKey: ["story-map"] }), client.invalidateQueries({ queryKey: ["plan-drift"] }), client.invalidateQueries({ queryKey: ["plan-drift-systems"] }), ...(action === "apply" ? [invalidateHealth()] : []), preview.refetch()]);
    },
    onError: async (error, action) => {
      if (action !== "apply") { setMessage(error.message); return; }
      setApprovedSelection(undefined);
      setSelectionChanged(true);
      const refused = error instanceof RequestError && error.status >= 400 && error.status < 500 && error.status !== 408;
      setMessage(refused ? strings.applyFailed(error.message) : strings.applyUnknown(error.message));
      const current = await preview.refetch();
      if (!current.error && current.data?.changeSet.status === "applied") { setMessage(strings.applyConfirmed); await invalidateHealth(); }
    },
    onSettled: () => { decisionPending.current = false; }
  });
  return { matchingMutations, sharedWritePending, revision, reviewedRevision, setReviewedRevision, setSelection, selectionIntent, selectionPending, decisionPending, refreshPending, selectionChanged, setSelectionChanged, approvedSelection, setApprovedSelection, message, setMessage, preview, fresh, selected, fingerprint, decide };
}

function isPersonaOperation(operation: unknown): boolean {
  return typeof operation === "object" && operation !== null && "entity" in operation && (operation.entity === "persona" || operation.entity === "cardPersona");
}
