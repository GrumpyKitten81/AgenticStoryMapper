import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { importGitHubTicketRequestSchema, lookupGitHubTicketRequestSchema, mcpToolInputSchemas, parseGitHubTicketSelector } from "@storymapper/contracts";

const repository = { owner: "Owner", repository: "Repo" };
const request = { storyMapId: randomUUID(), connectionId: randomUUID(), selector: "#17", placement: { level: "story", parentId: randomUUID(), releaseId: null, position: 2 } };

it.each(["17", "#17", "owner/repo#17", "https://github.com/OWNER/Repo/issues/17"])("normalizes the explicit ticket selector %s", (selector) => {
  expect(parseGitHubTicketSelector(selector, repository)).toMatchObject({ repo: "owner/repo", resource: "issues", number: 17, url: "https://github.com/owner/repo/issues/17" });
});

it.each(["0", "#0", "01", "#-1", "1.0", "9007199254740992", "other/repo#17", "https://github.com/owner/repo/pull/17", "https://github.com/owner/repo/milestone/17", "http://github.com/owner/repo/issues/17", "https://example.com/owner/repo/issues/17", "https://user@github.com/owner/repo/issues/17", "https://github.com/owner/repo/issues/17?x=1", "https://github.com/owner/repo/issues/17#x", "https://github.com/owner/repo/issues/17/", "owner/repo#17 extra"])("refuses unsafe or foreign selector %s", (selector) => {
  expect(parseGitHubTicketSelector(selector, repository)).toBeUndefined();
});

it("shares exact strict HTTP/MCP schemas and excludes Notes and provider evidence forgery", () => {
  expect(mcpToolInputSchemas.LookupGitHubTicket).toBe(lookupGitHubTicketRequestSchema);
  expect(mcpToolInputSchemas.ImportGitHubTicket).toBe(importGitHubTicketRequestSchema);
  expect(lookupGitHubTicketRequestSchema.parse(request)).toEqual(request);
  for (const input of [{ ...request, projectId: randomUUID() }, { ...request, placement: { ...request.placement, level: "note" } }, { ...request, placement: { ...request.placement, position: -1 } }]) expect(lookupGitHubTicketRequestSchema.safeParse(input).success).toBe(false);
  const reviewed = { ...request, title: "Reviewed title", description: "Reviewed body", reviewEvidence: { epoch: randomUUID(), scopeHash: "a".repeat(64), remoteHash: "b".repeat(64) } };
  expect(importGitHubTicketRequestSchema.parse(reviewed)).toEqual(reviewed);
  expect(importGitHubTicketRequestSchema.safeParse({ ...reviewed, remote: { title: "Forged" } }).success).toBe(false);
  expect(importGitHubTicketRequestSchema.safeParse({ ...reviewed, reviewEvidence: { ...reviewed.reviewEvidence, remoteHash: "missing" } }).success).toBe(false);
});
