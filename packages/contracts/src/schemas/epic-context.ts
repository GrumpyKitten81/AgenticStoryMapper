import { z } from "zod";
import { parseGitHubLocator } from "@storymapper/contracts/schemas/github-identity";

export const epicContextSchema = z.object({
  title: z.string().trim().min(1, "Epic context title is required."),
  goal: z.string().trim().min(1, "Epic context goal is required."),
  githubIssueUrl: z.string().refine((value) => {
    const locator = parseGitHubLocator(value);
    return locator?.resource === "issues";
  }, "Use a canonical GitHub Issue URL, for example https://github.com/owner/repo/issues/123.").transform((value) => parseGitHubLocator(value)!.url).optional()
}).strict();
export type EpicContext = z.infer<typeof epicContextSchema>;
