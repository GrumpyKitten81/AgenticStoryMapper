import { expect, it } from "vitest";
import { remoteWorkItemIdentity, workItemScopeMatches, type WorkItemLocator } from "@storymapper/contracts/schemas/work-item-identity";

it("normalizes GitHub scope case and rejects a supplied number inconsistent with its locator", () => {
  const connection = { provider: "github" as const, owner: "Org", repository: "Repo" };
  const remote = { remoteId: "7", remoteNumber: 7, url: "https://github.com/ORG/REPO/issues/7" };
  expect(remoteWorkItemIdentity(connection, remote)).toMatchObject({ owner: "org", repository: "repo", number: 7 });
  expect(() => remoteWorkItemIdentity(connection, { ...remote, remoteNumber: 8 })).toThrow(expect.objectContaining({ code: "validation" }));
});

it("compares alternate normalized scopes exactly", () => {
  const identity: WorkItemLocator = { provider: "alternate" as WorkItemLocator["provider"], owner: "Org", repository: "Repo", resource: "issues", remoteId: "issue-7", number: 7, url: "https://work-items.example.test/Org/Repo/issues/7", repo: "Org/Repo" };
  expect(workItemScopeMatches(identity, { provider: "alternate", owner: "Org", repository: "Repo" })).toBe(true);
  expect(workItemScopeMatches(identity, { provider: "alternate", owner: "org", repository: "Repo" })).toBe(false);
  expect(workItemScopeMatches(identity, { provider: "alternate", owner: "Org", repository: "repo" })).toBe(false);
});
