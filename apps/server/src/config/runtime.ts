const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "4317";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface RuntimeConfig {
  host: string;
  port: number;
  allowRemoteHost: boolean;
}

export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const host = env.HOST?.trim() || DEFAULT_HOST;
  const port = parsePort(env.PORT ?? DEFAULT_PORT);
  const allowRemoteHost = env.STORYMAPPER_ALLOW_REMOTE_HOST === "true";

  if (!allowRemoteHost && !isLoopbackHost(host)) {
    throw new Error("Non-loopback HOST requires STORYMAPPER_ALLOW_REMOTE_HOST=true.");
  }

  return {
    host,
    port,
    allowRemoteHost
  };
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

function parsePort(rawPort: string): number {
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("PORT must be a number between 1 and 65535.");
  }

  const port = Number.parseInt(rawPort, 10);
  if (port < 1 || port > 65535) {
    throw new Error("PORT must be a number between 1 and 65535.");
  }

  return port;
}
