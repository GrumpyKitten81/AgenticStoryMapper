import { realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const WEB_BUILD_DIRECTORY = fileURLToPath(new URL("../../../web/dist", import.meta.url));

function isWithinDirectory(directory: string, path: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function availableRealPath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "ENAMETOOLONG")) return undefined;
    throw error;
  }
}

export function validateWebBuild(directory = WEB_BUILD_DIRECTORY): string {
  const root = availableRealPath(directory);
  const index = availableRealPath(resolve(directory, "index.html"));
  if (!root || !index || !isWithinDirectory(root, index) || !statSync(index, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Web build is missing. Run corepack pnpm --filter @storymapper/web build before starting the server.");
  }
  return root;
}

export async function registerWebApp(server: FastifyInstance, directory: string): Promise<void> {
  await server.register(fastifyStatic, {
    root: directory,
    serve: false,
    dotfiles: "deny",
    allowedPath: (path, root) => {
      const resolvedPath = availableRealPath(resolve(root, path));
      return resolvedPath !== undefined && isWithinDirectory(directory, resolvedPath);
    }
  });
  const serve = async (request: FastifyRequest<{ Params: { "*"?: string } }>, reply: FastifyReply): Promise<FastifyReply | void> => {
    const path = `/${request.params["*"] ?? ""}`;
    if (path.includes("\0")) return reply.code(400).send({ error: "Bad Request", message: "Malformed URL", statusCode: 400 });
    const segments = path.split("/");
    if (segments[1] === "api" || segments[1] === "health" || path.includes("\\") || segments.some((segment) => segment.startsWith("."))) {
      return reply.callNotFound();
    }
    const file = extname(path) || segments[1] === "assets" ? path.slice(1) : "index.html";
    return reply.sendFile(file);
  };
  server.get("/", serve);
  server.get("/*", serve);
}
