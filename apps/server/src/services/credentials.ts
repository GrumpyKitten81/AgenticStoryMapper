import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DomainError, workItemProviderSchema, providerRegistration, registeredProvider, type ConnectorConnection, type CredentialStatus, type WorkItemProvider } from "@storymapper/contracts";
import { githubCliEnvironment, type ProviderAuth } from "@storymapper/github";
import { credentialFilePath, readUserGitHubToken } from "@storymapper/server/services/credential-file";

const execFileAsync = promisify(execFile);

interface ResolvedProviderAuth {
  connection: ConnectorConnection;
  auth: ProviderAuth;
}

export function envCredentialStatus(provider: WorkItemProvider, variableName: string): CredentialStatus {
  const configured = Boolean(process.env[variableName]?.trim());
  return { provider, source: "env", configured, variableName, message: configured ? `${variableName} is locally configured.` : `Set ${variableName} in the server environment.` };
}

export async function githubCliToken(): Promise<string | undefined> {
  try {
    const result = await execFileAsync("gh", ["auth", "token", "--hostname", "github.com"], { env: githubCliEnvironment(), timeout: 10000, maxBuffer: 1024 * 1024 });
    if (!result.stdout.trim()) throw new DomainError("validation", "GitHub CLI returned no credential. Check its local github.com configuration.");
    return result.stdout.trim();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const failure = error as { code?: unknown; stderr?: unknown; killed?: boolean; signal?: unknown } | null | undefined;
    if (failure?.code === "ENOENT") return undefined;
    if (failure?.code === 1 && !failure.killed && !failure.signal && typeof failure.stderr === "string" && /^no oauth token found for github\.com\r?\n?$/i.test(failure.stderr.trim())) return undefined;
    throw new DomainError("validation", "Could not read local GitHub CLI credentials. Check gh installation and its github.com configuration.");
  }
}

export async function githubCliCredentialStatus(): Promise<CredentialStatus> {
  try {
    const configured = Boolean(await githubCliToken());
    return { provider: "github", source: "github-cli", configured, message: configured ? "GitHub CLI credentials are locally configured; not remotely verified." : "Configure GitHub CLI with gh auth login in your terminal." };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { provider: "github", source: "github-cli", configured: false, unusable: true, message: error.message };
  }
}

export async function githubCredentialStatuses(): Promise<CredentialStatus[]> {
  const cli = await githubCliCredentialStatus();
  let file: CredentialStatus;
  try {
    const configured = Boolean(await readUserGitHubToken());
    file = { provider: "github", source: "user-file", configured, location: credentialFilePath(), message: configured ? "User credential file is locally configured; not remotely verified." : `Store a GitHub token in ${credentialFilePath()}, use gh auth login, or set GITHUB_TOKEN.` };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    file = { provider: "github", source: "user-file", configured: false, unusable: true, message: error.message };
  }
  let blocked = false;
  return [cli, file, envCredentialStatus("github", "GITHUB_TOKEN")].map((status) => {
    const selected = !blocked && status.configured;
    blocked ||= status.configured || Boolean(status.unusable);
    return { ...status, selected };
  });
}

export async function resolveGitHubAuth(connection: ConnectorConnection): Promise<ResolvedProviderAuth> {
  const cliToken = await githubCliToken();
  if (cliToken) return { connection: { ...connection, authMode: "github-cli" }, auth: { cliToken, source: "github-cli" } };
  const fileToken = await readUserGitHubToken();
  const token = fileToken ?? process.env.GITHUB_TOKEN?.trim();
  if (token) return { connection: { ...connection, authMode: "token" }, auth: { token, source: fileToken ? "user-file" : "env" } };
  throw new DomainError("disabled", `No GitHub credentials are configured. Store a token in ${credentialFilePath()}, run gh auth login in your terminal, or set GITHUB_TOKEN in the server environment.`);
}

interface ProviderCredentials {
  status: () => Promise<CredentialStatus[]>;
  auth: (connection: ConnectorConnection) => Promise<ResolvedProviderAuth>;
}

export const providerCredentials = providerRegistration<ProviderCredentials>(workItemProviderSchema.options, {
  github: Object.freeze({ status: githubCredentialStatuses, auth: resolveGitHubAuth })
} satisfies Record<WorkItemProvider, ProviderCredentials>);

export function providerCredentialStatuses(provider: unknown): Promise<CredentialStatus[]> {
  return registeredProvider(providerCredentials, provider).status();
}

export function resolveProviderAuth(connection: ConnectorConnection): Promise<ResolvedProviderAuth> {
  return registeredProvider(providerCredentials, connection.provider).auth(connection);
}
