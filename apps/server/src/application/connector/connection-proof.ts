import { createHash, randomUUID } from "node:crypto";
import { DomainError, type ActorContext, type CredentialSource, type GitHubConnectionCandidate, type RepositoryCapabilities } from "@storymapper/contracts";
import type { DatabaseHandle } from "@storymapper/db";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export interface ConnectionProof {
  id: string;
  candidateHash: string;
  credentialHash: string;
  operationalSource: CredentialSource;
  operationalCredentialHash: string;
  scope: string;
  database: DatabaseHandle["current"];
  capabilities: RepositoryCapabilities;
}

const proofs = new WeakMap<DatabaseHandle, Map<string, ConnectionProof | string>>();
const pending = new WeakMap<DatabaseHandle, Set<string>>();
let credentialFinalizationPending = false;

export function admitCredentialFinalization(): () => void {
  if (credentialFinalizationPending) throw new DomainError("conflict", "Another GitHub credential confirmation is pending. Verify again after it finishes.");
  credentialFinalizationPending = true;
  return () => { credentialFinalizationPending = false; };
}

function admit(deps: ApplicationDeps, projectId: string): void {
  let projects = pending.get(deps.unitOfWork.handle);
  if (!projects) { projects = new Set(); pending.set(deps.unitOfWork.handle, projects); }
  if (projects.has(projectId)) throw new DomainError("conflict", "A GitHub connection action is already pending for this Project.");
  projects.add(projectId);
}

export function finishConnectionAction(deps: ApplicationDeps, projectId: string): void {
  pending.get(deps.unitOfWork.handle)?.delete(projectId);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function projectProofs(deps: ApplicationDeps): Map<string, ConnectionProof | string> {
  const handle = deps.unitOfWork.handle;
  let entries = proofs.get(handle);
  if (!entries) { entries = new Map(); proofs.set(handle, entries); }
  return entries;
}

export function connectionScope(deps: ApplicationDeps, actor: ActorContext, candidate: GitHubConnectionCandidate): string {
  const handle = deps.unitOfWork.handle;
  if (handle.restoring || handle.stopping || handle.unavailableReason) throw new DomainError("conflict", "Connection verification is stale. Verify again after the Project is available.");
  const settings = deps.repository.getSafetySettings(candidate.configuration.projectId);
  const connection = candidate.connectionId ? deps.repository.getConnectorConnection(candidate.connectionId) : undefined;
  if (candidate.connectionId && (!connection || connection.projectId !== candidate.configuration.projectId)) throw new DomainError("conflict", "The connection does not belong to this Project. Verify again.");
  return fingerprint({ actor, settings, connection });
}

export function startVerification(deps: ApplicationDeps, projectId: string): string {
  admit(deps, projectId);
  const id = randomUUID();
  projectProofs(deps).set(projectId, id);
  return id;
}

export function assertVerificationScope(deps: ApplicationDeps, actor: ActorContext, candidate: GitHubConnectionCandidate, proof: Pick<ConnectionProof, "id" | "database" | "scope">): void {
  const current = projectProofs(deps).get(candidate.configuration.projectId);
  if (current !== proof.id && (typeof current !== "object" || current?.id !== proof.id) || deps.unitOfWork.handle.current !== proof.database || connectionScope(deps, actor, candidate) !== proof.scope) {
    throw new DomainError("conflict", "Connection verification is stale. Verify the unchanged connection again.");
  }
}

export function retainProof(deps: ApplicationDeps, projectId: string, proof: ConnectionProof): void {
  projectProofs(deps).set(projectId, proof);
}

export function consumeProof(deps: ApplicationDeps, actor: ActorContext, candidate: GitHubConnectionCandidate, id: string): ConnectionProof {
  const entries = projectProofs(deps);
  const proof = entries.get(candidate.configuration.projectId);
  if (!proof || typeof proof === "string" || proof.id !== id || proof.candidateHash !== fingerprint(candidate)) throw new DomainError("conflict", "Connection verification is missing, changed or already used. Verify again.");
  assertVerificationScope(deps, actor, candidate, proof);
  admit(deps, candidate.configuration.projectId);
  entries.set(candidate.configuration.projectId, proof.id);
  return proof;
}
