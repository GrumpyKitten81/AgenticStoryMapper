import { randomUUID } from "node:crypto";
import { connectorConnectionSchema, connectGitHubConnectionRequestSchema, DomainError, verifyGitHubConnectionRequestSchema, type ActorContext, type CapabilityDescriptor, type ConnectGitHubConnectionRequest, type ConnectGitHubConnectionResponse, type ConnectorConnection, type GitHubConnectionCandidate, type VerifyGitHubConnectionRequest, type VerifyGitHubConnectionResponse } from "@storymapper/contracts";
import { CommittedUnitOfWorkError } from "@storymapper/db";
import { createWorkItemProvider, type ProviderAuth } from "@storymapper/github";
import { requireHumanActor } from "@storymapper/server/application/actors";
import { admitCredentialFinalization, assertVerificationScope, connectionScope, consumeProof, fingerprint, finishConnectionAction, retainProof, startVerification, type ConnectionProof } from "@storymapper/server/application/connector/connection-proof";
import { storeGitHubCredential } from "@storymapper/server/application/connector/credential.use-cases";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { githubCliToken, githubCredentialStatuses, resolveProviderAuth } from "@storymapper/server/services/credentials";

export const verifyGitHubConnectionDescriptor: CapabilityDescriptor = { name: "verifyGitHubConnection", kind: "human-only", route: "POST /api/connectors/github/verify" };
export const connectGitHubConnectionDescriptor: CapabilityDescriptor = { name: "connectGitHubConnection", kind: "human-only", route: "POST /api/connectors/github/connect" };

function candidateConnection(candidate: GitHubConnectionCandidate): ConnectorConnection {
  const now = new Date().toISOString();
  return connectorConnectionSchema.parse({ ...candidate.configuration, id: candidate.connectionId ?? randomUUID(), createdAt: now, updatedAt: now });
}

function validateHumanInput<T>(actor: ActorContext, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, input: unknown): T {
  requireHumanActor(actor);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("validation", "Explicit human consent and a valid GitHub connection candidate are required.");
  return parsed.data;
}

async function candidateAuth(candidate: GitHubConnectionCandidate): Promise<ProviderAuth> {
  if (candidate.credential.method === "token") return { token: candidate.credential.token, source: "user-file" };
  const cliToken = await githubCliToken();
  if (!cliToken) throw new DomainError("validation", "Run gh auth login in your own terminal, then Recheck and Verify GitHub CLI.");
  return { cliToken, source: "github-cli" };
}

export async function verifyGitHubConnection(deps: ApplicationDeps, actor: ActorContext, input: VerifyGitHubConnectionRequest): Promise<VerifyGitHubConnectionResponse> {
  const { candidate } = validateHumanInput(actor, verifyGitHubConnectionRequestSchema, input);
  const projectId = candidate.configuration.projectId;
  const scope = connectionScope(deps, actor, candidate);
  const id = startVerification(deps, projectId);
  const captured = { id, scope, database: deps.unitOfWork.handle.current };
  try {
    const auth = await candidateAuth(candidate);
    assertVerificationScope(deps, actor, candidate, captured);
    const result = await createWorkItemProvider("github").validateConnection(candidateConnection(candidate), auth);
    assertVerificationScope(deps, actor, candidate, captured);
    if (!result.ok) return { ok: false, failure: result.failure ?? { kind: "provider", message: "GitHub could not verify this repository.", nextAction: "Check credentials, repository access and network, then Verify again." } };
    const cli = await githubCliToken();
    assertVerificationScope(deps, actor, candidate, captured);
    if (candidate.credential.method === "github-cli" && cli !== auth.cliToken) throw new DomainError("conflict", "GitHub CLI credentials changed. Verify again.");
    if (!result.capabilities) throw new DomainError("validation", "Repository verification did not provide capability evidence.");
    const capabilities = result.capabilities;
    const operationalSource = cli ? "github-cli" : "user-file";
    retainProof(deps, projectId, { ...captured, candidateHash: fingerprint(candidate), credentialHash: fingerprint(auth.cliToken ?? auth.token), operationalSource, operationalCredentialHash: fingerprint(cli ?? auth.token), capabilities });
    const githubEnabled = deps.repository.getSafetySettings(projectId).github;
    return { ok: true, verificationId: id, verifiedSource: candidate.credential.method === "token" ? "candidate-token" : "github-cli", operationalSource, capabilities, githubEnabled, message: githubEnabled ? "Connection verified. Confirm Connect to save this connection." : "Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub." };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { ok: false, failure: { kind: error.code === "conflict" ? "stale" : "credentials", message: error.code === "conflict" ? "Connection verification became stale." : "The selected credentials are not locally available.", nextAction: error.code === "conflict" ? "Verify the unchanged connection again." : candidate.credential.method === "github-cli" ? "Run gh auth login in your own terminal, then Recheck and Verify." : "Check local GitHub CLI configuration and Verify the candidate again." } };
  } finally { finishConnectionAction(deps, projectId); }
}

async function finalOperationalAuth(candidate: GitHubConnectionCandidate): Promise<ProviderAuth> {
  try { return (await resolveProviderAuth(candidateConnection(candidate))).auth; }
  catch (error) {
    if (!(error instanceof DomainError)) throw error;
    throw new DomainError("conflict", "Operational GitHub credentials changed or are unavailable. Verify again.");
  }
}

function commitConnection(deps: ApplicationDeps, actor: ActorContext, candidate: GitHubConnectionCandidate, proof: ConnectionProof) {
  return deps.unitOfWork.run(actor, ({ repository }) => {
    assertVerificationScope(deps, actor, candidate, proof);
    const connection = candidate.connectionId ? repository.updateConnectorConnection(candidate.connectionId, candidate.configuration) : repository.createConnectorConnection(candidate.configuration);
    if (!connection) throw new DomainError("conflict", "The connection is no longer available.");
    const settings = repository.getSafetySettings(connection.projectId);
    const enabled = settings.github ? settings : repository.updateSafetySettings(connection.projectId, { github: true });
    return { connection: repository.publicConnectorConnection(connection), connections: repository.listConnectorConnections(connection.projectId).map((item) => repository.publicConnectorConnection(item)), settings: enabled };
  });
}

export async function connectGitHubConnection(deps: ApplicationDeps, actor: ActorContext, input: ConnectGitHubConnectionRequest): Promise<ConnectGitHubConnectionResponse> {
  const { candidate, verificationId } = validateHumanInput(actor, connectGitHubConnectionRequestSchema, input);
  const proof = consumeProof(deps, actor, candidate, verificationId);
  let credentialStored = false;
  let releaseCredentialFinalization: (() => void) | undefined;
  try {
    if (candidate.credential.method === "token") releaseCredentialFinalization = admitCredentialFinalization();
    const auth = await candidateAuth(candidate);
    assertVerificationScope(deps, actor, candidate, proof);
    if (fingerprint(auth.cliToken ?? auth.token) !== proof.credentialHash) throw new DomainError("conflict", "The selected credentials changed. Verify again.");
    if (candidate.credential.method === "token") {
      await storeGitHubCredential(actor, { token: candidate.credential.token });
      credentialStored = true;
      assertVerificationScope(deps, actor, candidate, proof);
    }
    const statuses = await githubCredentialStatuses();
    assertVerificationScope(deps, actor, candidate, proof);
    const operational = await finalOperationalAuth(candidate);
    assertVerificationScope(deps, actor, candidate, proof);
    if (operational.source !== proof.operationalSource || fingerprint(operational.cliToken ?? operational.token) !== proof.operationalCredentialHash) throw new DomainError("conflict", "Operational GitHub credentials changed. Verify again.");
    const credentials = statuses.map((status) => {
      const selected = status.source === operational.source;
      return selected ? { ...status, selected, configured: true, unusable: false, message: "These selected credentials are locally configured for normal operations." } : { ...status, selected };
    });
    try {
      return { ok: true, ...commitConnection(deps, actor, candidate, proof), credentials, credentialStored, publicationWarning: false };
    } catch (error) {
      if (error instanceof CommittedUnitOfWorkError) return { ok: true, ...error.result as ReturnType<typeof commitConnection>, credentials, credentialStored, publicationWarning: true };
      return { ok: false, failure: { kind: "database", message: credentialStored ? "The credential was stored, but the connection and GitHub switch were not changed." : "The connection and GitHub switch were not changed.", nextAction: "Check local database availability, then Verify again before Connect." }, credentialStored, databaseCommitted: false };
    }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { ok: false, failure: { kind: error.code === "conflict" ? "stale" : "storage", message: credentialStored ? "The credential was stored, but connection confirmation became stale. The database was not changed." : "Connection confirmation failed. The connection and GitHub switch were not changed.", nextAction: "Check local credentials and permissions, then Verify again before Connect." }, credentialStored, databaseCommitted: false };
  } finally { releaseCredentialFinalization?.(); finishConnectionAction(deps, candidate.configuration.projectId); }
}
