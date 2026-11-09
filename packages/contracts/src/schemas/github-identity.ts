import { z } from "zod";

export interface GitHubLocator { owner: string; repository: string; resource: "issues" | "milestone"; number: number; url: string; repo: string }

export function parseGitHubLocator(value: string): GitHubLocator | undefined {
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]+)\/(issues|milestone)\/([1-9][0-9]*)$/.exec(value);
  if (!match || match[2] === "." || match[2] === "..") return undefined;
  const number = Number(match[4]);
  if (!Number.isSafeInteger(number)) return undefined;
  const owner = match[1]!.toLowerCase(), repository = match[2]!.toLowerCase();
  const resource = match[3] as GitHubLocator["resource"];
  return { owner, repository, resource, number, repo: `${owner}/${repository}`, url: `https://github.com/${owner}/${repository}/${resource}/${number}` };
}

export const githubLocatorSchema = z.string().refine((value) => parseGitHubLocator(value) !== undefined, "A canonical HTTPS GitHub Issue or Milestone URL is required.").transform((value) => parseGitHubLocator(value)!.url);

export function parseGitHubTicketSelector(value: string, repository: { owner: string; repository?: string | undefined }): GitHubLocator | undefined {
  if (!repository.repository) return undefined;
  const selector = value.trim();
  const short = /^([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)#([1-9][0-9]*)$/.exec(selector);
  const bare = /^#?([1-9][0-9]*)$/.exec(selector);
  const locator = parseGitHubLocator(short ? `https://github.com/${short[1]}/${short[2]}/issues/${short[3]}` : bare ? `https://github.com/${repository.owner}/${repository.repository}/issues/${bare[1]}` : selector);
  return locator?.resource === "issues" && locator.repo === `${repository.owner}/${repository.repository}`.toLowerCase() ? locator : undefined;
}
