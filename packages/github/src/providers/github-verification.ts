import type { ConnectionVerificationFailure, RepositoryCapabilities } from "@storymapper/contracts";

const WRITE_LIMITATION = "Repository permission evidence does not verify future Issue, Milestone or issue-type writes; those capabilities must be checked before confirming a push.";
const NETWORK_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"]);

export function repositoryCapabilities(permissions?: { push?: boolean; maintain?: boolean; admin?: boolean }): RepositoryCapabilities {
  const write = permissions && [permissions.push, permissions.maintain, permissions.admin].some((permission) => permission === true)
    ? "available" : permissions?.push === false ? "unavailable" : "unknown";
  return { read: true, write, limitation: WRITE_LIMITATION };
}

export function verificationFailure(error: unknown): ConnectionVerificationFailure {
  const failure = error && typeof error === "object" ? error as { status?: unknown; stderr?: unknown; code?: unknown; message?: unknown; cause?: { code?: unknown }; response?: { headers?: Record<string, unknown>; data?: { message?: unknown } } } : {};
  const stderr = typeof failure.stderr === "string" ? failure.stderr : "";
  const status = typeof failure.status === "number" ? failure.status : Number(stderr.match(/\bHTTP[\s:]+(\d{3})\b/)?.[1]);
  const headers = failure.response?.headers;
  const rateLimited = status === 429 || status === 403 && (headers?.["x-ratelimit-remaining"] === "0" || headers?.["retry-after"] !== undefined || /rate limit/i.test(`${stderr} ${failure.response?.data?.message ?? ""}`));
  if (rateLimited) return { kind: "rate-limit", message: "GitHub rate limit reached.", nextAction: "Wait for the rate limit to reset, then Verify again." };
  if (status === 401) return { kind: "credentials", message: "GitHub rejected the selected credentials.", nextAction: "Replace the token or sign in with gh auth login in your terminal, then Verify again." };
  if (status === 403 || status === 404) return { kind: "repository", message: "The repository is unavailable or the selected credentials lack access.", nextAction: "Check the owner, repository and selected credential permissions, then Verify again." };
  const code = failure.code ?? failure.cause?.code;
  if (typeof code === "string" && NETWORK_CODES.has(code) || error instanceof TypeError || failure.cause instanceof TypeError || /error connecting to|dial tcp|TLS handshake timeout|network is unreachable|i\/o timeout/i.test(stderr)) {
    return { kind: "network", message: "GitHub could not be reached.", nextAction: "Check your network connection, then Verify again." };
  }
  return { kind: "provider", message: "GitHub request failed.", nextAction: "Check the selected credentials, repository access and GitHub availability, then Verify again." };
}
