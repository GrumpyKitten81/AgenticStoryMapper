import { z } from "zod";
import { uuidSchema } from "@storymapper/contracts/schemas/domain";

export const projectArchiveExportQuerySchema = z.object({ projectId: uuidSchema }).strict();
export const projectArchiveCapabilities = z.array(z.object({
  name: z.enum(["project-archive.export", "project-archive.import"]),
  audience: z.literal("human"),
  mcp: z.literal(false)
}).strict()).parse([
  { name: "project-archive.export", audience: "human", mcp: false },
  { name: "project-archive.import", audience: "human", mcp: false }
]);
