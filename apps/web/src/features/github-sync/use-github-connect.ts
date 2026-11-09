import { gitHubConnectionCandidateSchema } from "@storymapper/contracts";
import type { GitHubConnectionCandidate, VerifyGitHubConnectionResponse, SafetySettings } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { githubConnectStrings as strings } from "@storymapper/ui-strings";
import { api, useSafetySettings } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { createConnectionPayload, type ConnectionDraft } from "@storymapper/web/features/github-sync/connection-draft";
import { useGitHubConnectionRecovery, type ConnectionRecoveryOrigin } from "@storymapper/web/features/github-sync/use-github-connection-recovery";
import type { GitHubConnectDialogProps } from "@storymapper/web/features/github-sync/GitHubConnectDialog";

type Proof = Extract<VerifyGitHubConnectionResponse, { ok: true }>;
type Operation = "verify" | "connect" | "recheck";
interface Intent extends ConnectionRecoveryOrigin { kind: Operation; revision: number; scope: string; epoch: string | undefined; restoreRevision: number; settings: string; connection: string; proof?: Proof | undefined }
interface FlowProps extends GitHubConnectDialogProps { draft: ConnectionDraft; token: string; consent: boolean }

export function useGitHubConnect(input: FlowProps) {
  const { props, safety, noticeScope, recovery, epoch, restoreRevision, proof, setProof, proofRef, proofIntent, error, setError, cliStatus, pending, setPending, revision, inputPending, busy, candidateRef, scope, settingsSnapshot, connectionSnapshot, invalidate, mutation, candidateReady, canVerify } = useGitHubConnectMutation(input);
  const admit = (kind: Operation) => {
    if (kind === "verify" && recovery.notice?.blocked) { recovery.review(); return; }
    if (kind === "verify" && safety.isError) { void safety.refetch(); return; }
    const live = useLiveInteractionStore.getState();
    if (!props.open || inputPending.current || busy.current || live.restorePending || recovery.pending || recovery.notice?.blocked || kind !== "recheck" && !candidateReady) return;
    if (epoch !== live.epoch || restoreRevision !== live.restoreRevision) { invalidate(); setError(strings.stale); return; }
    if (kind === "connect" && (!proofRef.current || !proofIntent.current || proofIntent.current.epoch !== live.epoch || proofIntent.current.restoreRevision !== live.restoreRevision || proofIntent.current.settings !== settingsSnapshot() || proofIntent.current.connection !== connectionSnapshot() || proofIntent.current.scope !== scope)) { invalidate(); setError(strings.stale); return; }
    const candidate: GitHubConnectionCandidate = { configuration: { ...createConnectionPayload(props.projectId, props.draft), repository: props.draft.repository.trim() }, ...((props.connection?.id ?? recovery.notice?.connectionId) ? { connectionId: props.connection?.id ?? recovery.notice?.connectionId } : {}), credential: props.draft.authMode === "token" ? { method: "token", token: props.token } : { method: "github-cli" } };
    if (kind !== "recheck" && !gitHubConnectionCandidateSchema.safeParse(candidate).success) { setError(strings.malformed); return; }
    const intent: Intent = { projectId: props.projectId, noticeScope, target: { owner: candidate.configuration.owner, repository: candidate.configuration.repository, name: candidate.configuration.name }, kind, scope, revision: revision.current, epoch: live.epoch, restoreRevision: live.restoreRevision, settings: settingsSnapshot(), connection: connectionSnapshot(), proof: proofRef.current ?? undefined };
    busy.current = intent; candidateRef.current = candidate; setPending(kind); setError("");
    proofRef.current = null; setProof(null);
    mutation.mutate(intent);
  };
  return { proof, error: safety.isError ? strings.safetyUnavailable : error, recoveryNotice: recovery.notice?.message, recoveryBlocked: recovery.notice?.blocked, safetyError: safety.isError, pending: recovery.pending ? "recover" as const : pending, cliStatus, canVerify, invalidate: () => { inputPending.current = true; invalidate(); }, verify: () => admit("verify"), connect: () => admit("connect"), recheck: () => admit("recheck") };
}

function useGitHubConnectState(props: FlowProps) {
  const client = useQueryClient();
  const safety = useSafetySettings(props.projectId);
  const noticeScope = `${props.projectId}:${props.connection?.id ?? ""}`;
  const recovery = useGitHubConnectionRecovery(noticeScope);
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const restoreRevision = useLiveInteractionStore((state) => state.restoreRevision);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const [proof, setProof] = useState<Proof | null>(null);
  const proofRef = useRef<Proof | null>(null);
  const proofIntent = useRef<Intent | null>(null);
  const [error, setError] = useState("");
  const [cliStatus, setCliStatus] = useState("");
  const [pending, setPending] = useState<Operation | null>(null);
  const revision = useRef(0);
  const inputPending = useRef(false);
  useLayoutEffect(() => { inputPending.current = false; });
  const busy = useRef<Intent | null>(null);
  const candidateRef = useRef<GitHubConnectionCandidate | null>(null);
  const scope = `${props.open}:${props.projectId}:${props.connection?.id ?? ""}:${props.connection?.updatedAt ?? ""}`;
  const currentScope = useRef(scope);
  if (currentScope.current !== scope) { currentScope.current = scope; revision.current++; proofRef.current = null; busy.current = null; }
  const settingsSnapshot = () => JSON.stringify(client.getQueryData<{ settings: SafetySettings }>(["safety-settings", props.projectId]));
  const connectionId = props.connection?.id ?? recovery.notice?.connectionId;
  const connectionSnapshot = () => JSON.stringify(connectionId ? client.getQueryData<{ connections: FlowProps["connection"][] }>(["connector-connections", props.projectId])?.connections.find((connection) => connection?.id === connectionId) : null);
  const invalidate = () => { revision.current++; proofRef.current = null; busy.current = null; candidateRef.current = null; setProof(null); setPending(null); };
  useEffect(() => { if (recovery.notice?.blocked) invalidate(); }, [recovery.notice]);
  useEffect(() => { setError(""); setCliStatus(""); }, [noticeScope]);
  useEffect(() => { invalidate(); }, [scope, epoch, restoreRevision, restorePending, safety.data, connectionId]);
  useEffect(() => () => { revision.current++; busy.current = null; }, []);
  const current = (intent: Intent) => {
    const live = useLiveInteractionStore.getState();
    return busy.current === intent && intent.revision === revision.current && intent.scope === currentScope.current && intent.epoch === live.epoch && intent.restoreRevision === live.restoreRevision && !live.restorePending && intent.settings === settingsSnapshot() && intent.connection === connectionSnapshot();
  };
  return { props, client, safety, noticeScope, recovery, epoch, restoreRevision, restorePending, proof, setProof, proofRef, proofIntent, error, setError, cliStatus, setCliStatus, pending, setPending, revision, inputPending, busy, candidateRef, scope, settingsSnapshot, connectionSnapshot, invalidate, current };
}

function useGitHubConnectMutation(input: FlowProps) {
  const context = useGitHubConnectState(input);
  const { props, client, safety, recovery, restorePending, setProof, proofRef, proofIntent, setError, setCliStatus, setPending, busy, candidateRef, current } = context;
  const mutation = useMutation({
    mutationFn: async (intent: Intent) => {
      if (!current(intent)) return { kind: "stale" as const };
      const candidate = candidateRef.current!;
      if (intent.kind === "recheck") return { kind: "recheck" as const, value: await api.readCredentialStatus() };
      if (intent.kind === "verify") return { kind: "verify" as const, value: await api.verifyGitHubConnection({ candidate, consent: true }) };
      return { kind: "connect" as const, value: await api.connectGitHubConnection({ candidate, verificationId: intent.proof!.verificationId, confirm: true }) };
    },
    onSuccess: (result, intent) => {
      if (result.kind === "stale") return;
      if (!current(intent)) {
        if (result.kind === "connect" && (result.value.ok || result.value.credentialStored)) recovery.recover(intent, result.value.ok ? strings.lateCommitted : strings.lateStored);
        return;
      }
      if (result.kind === "recheck") { setCliStatus(result.value.credentials.filter((status) => status.source === "github-cli").map((status) => status.message).join(" ")); return; }
      if (!result.value.ok) {
        const stored = result.kind === "connect" && "credentialStored" in result.value && result.value.credentialStored;
        if (stored) void client.invalidateQueries({ queryKey: ["credential-status"] });
        setError(`${result.value.failure.message} ${result.value.failure.nextAction}${stored ? ` ${strings.storedAfterFailure}` : ""}`); return;
      }
      if (result.kind === "verify") { proofRef.current = result.value; proofIntent.current = intent; setProof(result.value); return; }
      client.setQueryData(["connector-connections", props.projectId], { connections: result.value.connections });
      client.setQueryData(["safety-settings", props.projectId], { settings: result.value.settings });
      client.setQueryData(["credential-status"], { credentials: result.value.credentials });
      void client.invalidateQueries({ queryKey: ["getting-started", props.projectId] });
      void client.invalidateQueries({ queryKey: ["activity"] });
      setError(result.value.publicationWarning ? strings.publicationWarning : "");
      if (!result.value.publicationWarning) { props.onConnected?.(result.value.connection); props.onClose(); }
    },
    onError: (_error, intent) => { if (intent.kind === "connect") recovery.recover(intent, strings.uncertain); else if (current(intent)) setError(strings.requestFailed); },
    onSettled: (_result, _error, intent) => { if (busy.current === intent) { busy.current = null; candidateRef.current = null; setPending(null); } }
  });
  const candidateReady = props.consent && !!props.draft.owner.trim() && !!props.draft.repository.trim() && (props.draft.authMode !== "token" || !!props.token.trim()) && !!safety.data && !safety.isError && !restorePending;
  const canVerify = recovery.notice?.blocked || safety.isError || candidateReady;
  return { ...context, mutation, candidateReady, canVerify };
}
