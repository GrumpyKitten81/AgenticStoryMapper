import type { FastifyInstance } from "fastify";

const JSON_MEDIA = /^application\/json(?:[ \t]*;|[ \t]*$)/i;
const LOOPBACK_AUTHORITY = /^(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]+)$/i;

function loopbackHostAuthority(hostHeader: string | undefined, port: number): boolean {
  return hostHeader?.match(LOOPBACK_AUTHORITY)?.[1] === String(port);
}

function allowedOrigins(port: number, development: boolean): ReadonlySet<string> {
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`
  ]);
  if (development) {
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:5173");
  }
  return origins;
}

export function installRequestSecurity(server: FastifyInstance, port: number, development: boolean): void {
  server.addHook("onRequest", async (request, reply) => {
    const address = server.server.address();
    const listeningPort = address && typeof address !== "string" ? address.port : port;
    if (!loopbackHostAuthority(request.headers.host, listeningPort)) {
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: "Forbidden host." });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins(listeningPort, development).has(origin)) {
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: "Forbidden origin." });
    }
    const method = request.method.toUpperCase();
    if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") return;
    const pathname = request.url.split("?")[0] ?? request.url;
    if (method === "DELETE" && pathname === "/mcp") return;
    if (method === "POST" && pathname === "/api/projects/import") return;
    const contentType = request.headers["content-type"];
    if (!contentType || !JSON_MEDIA.test(contentType)) {
      return reply.code(415).send({
        statusCode: 415,
        error: "Unsupported Media Type",
        message: "Mutating requests must use application/json."
      });
    }
  });
}
