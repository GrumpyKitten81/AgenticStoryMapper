import { z } from "zod";
import { DomainError } from "@storymapper/contracts/schemas/errors";
import { parseGitHubLocator } from "@storymapper/contracts/schemas/github-identity";
import { workItemProviderSchema, type WorkItemProvider } from "@storymapper/contracts/schemas/work-item-provider";

export const workItemUrlSchema = z.string().refine((value) => value === value.trim() && URL.canParse(value)).refine((value) => { if (!URL.canParse(value)) return false; const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }).transform((value) => parseGitHubLocator(value)?.url ?? value);

export const workItemIdentitySchema = z.object({
  owner: z.string().min(1), repository: z.string().min(1), resource: z.enum(["issues", "milestone"]),
  remoteId: z.string().min(1), number: z.number().int().positive().refine(Number.isSafeInteger),
  url: workItemUrlSchema
}).strict();
export type WorkItemIdentity = z.infer<typeof workItemIdentitySchema>;
export interface WorkItemLocator extends WorkItemIdentity { provider: WorkItemProvider; repo: string }

export function isWorkItemProvider(provider: unknown): provider is WorkItemProvider { return workItemProviderSchema.safeParse(provider).success; }

export function canonicalWorkItemId(provider: WorkItemProvider, value: WorkItemIdentity): string {
  const identity = workItemIdentitySchema.parse({ owner: value.owner, repository: value.repository, resource: value.resource, remoteId: value.remoteId, number: value.number, url: value.url });
  if (provider === "github") {
    const locator = parseGitHubLocator(identity.url);
    if (!locator || locator.owner !== identity.owner || locator.repository !== identity.repository || locator.resource !== identity.resource || locator.number !== identity.number || identity.remoteId !== String(locator.number)) throw new DomainError("validation", "GitHub identity disagrees with its canonical locator.");
    return locator.url;
  }
  if (!isWorkItemProvider(provider)) throw new DomainError("validation", "Unknown work-item provider.");
  return JSON.stringify(identity);
}

export function parseWorkItemLocator(provider: string, externalId: string): WorkItemLocator | undefined {
  if (!isWorkItemProvider(provider)) return undefined;
  if (provider === "github") {
    const locator = parseGitHubLocator(externalId);
    return locator && { ...locator, provider, remoteId: String(locator.number) };
  }
  const identity = parseNormalizedWorkItemId(externalId);
  return identity && { ...identity, provider, repo: `${identity.owner}/${identity.repository}` };
}

export function parseNormalizedWorkItemId(externalId: string): WorkItemIdentity | undefined {
  let value: unknown;
  try { value = JSON.parse(externalId); } catch (error) { if (!(error instanceof SyntaxError)) throw error; return undefined; }
  const parsed = workItemIdentitySchema.safeParse(value);
  return parsed.success && JSON.stringify(parsed.data) === externalId ? parsed.data : undefined;
}

export const canonicalMilestoneIdSchema = z.string().refine((value) => (parseGitHubLocator(value) ?? parseNormalizedWorkItemId(value))?.resource === "milestone", "A canonical provider Milestone identity is required.").transform((value) => parseGitHubLocator(value)?.url ?? value);

export function workItemScopeMatches(identity: WorkItemLocator, connection: { provider: string; owner: string; repository?: string | undefined }): boolean {
  const owner = connection.provider === "github" ? connection.owner.toLowerCase() : connection.owner;
  const repository = connection.provider === "github" ? connection.repository?.toLowerCase() : connection.repository;
  return identity.provider === connection.provider && identity.owner === owner && (!repository || identity.repository === repository);
}

export function remoteWorkItemIdentity(connection: { provider: WorkItemProvider; owner: string; repository?: string | undefined }, item: { remoteId: string; remoteNumber?: number | undefined; url: string; identity?: WorkItemIdentity | undefined }, resource: WorkItemIdentity["resource"] = "issues"): WorkItemLocator {
  const identity = connection.provider === "github" ? parseWorkItemLocator(connection.provider, item.url) : item.identity && parseWorkItemLocator(connection.provider, canonicalWorkItemId(connection.provider, item.identity));
  if (!identity || identity.resource !== resource || connection.provider !== "github" && identity.url !== item.url || identity.remoteId !== item.remoteId || item.remoteNumber !== undefined && identity.number !== item.remoteNumber || !workItemScopeMatches(identity, connection)) throw new DomainError("validation", "Remote identity does not match the selected connection, kind and item.");
  return identity;
}
