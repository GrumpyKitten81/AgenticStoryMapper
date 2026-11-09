import { describe, expect, it, vi } from "vitest";
import { connectorConnectionSchema } from "@storymapper/contracts";
import { discoverGitHubStatusProjects, readGitHubStatus, readGitHubStatusCatalog, type StatusGraphQL } from "@storymapper/github/providers/github-status";

const source = { kind: "project" as const, projectId: "selected-project", projectName: "Delivery", fieldId: "status" };
const connection = connectorConnectionSchema.parse({ id: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", provider: "github", name: "GitHub", authMode: "token", owner: "owner", repository: "repo", statusSource: source, createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z" });
const page = <T>(nodes: T[], next: string | null = null) => ({ nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } });
const catalog = { source, options: [{ id: "review", name: "In Review", position: 0, color: "BLUE" }] };
const issue = { remoteId: "1", remoteNumber: 1, title: "Issue", body: "", state: "closed", labels: [], url: "https://github.com/owner/repo/issues/1" };

describe("complete GitHub Project status reads", () => {
  it("discovers owner Projects and Status fields across every page", async () => {
    const request = vi.fn().mockResolvedValueOnce({ repository: { owner: { projectsV2: page([{ id: "first", title: "First" }], "project-page") } } }).mockResolvedValueOnce({ node: { fields: page([{ id: "title", name: "Title" }], "field-page") } }).mockResolvedValueOnce({ node: { fields: page([{ id: "status", name: "Status", options: [] }]) } }).mockResolvedValueOnce({ repository: { owner: { projectsV2: page([{ id: "second", title: "Second" }]) } } }).mockResolvedValueOnce({ node: { fields: page([{ id: "other-status", name: "Status", options: [] }]) } });
    expect(await discoverGitHubStatusProjects(request as StatusGraphQL, connection)).toEqual([{ id: "first", name: "First · Status", fieldId: "status" }, { id: "second", name: "Second · Status", fieldId: "other-status" }]);
    expect(request.mock.calls[0]![0]).toContain("... on User");
    expect(request.mock.calls[0]![0]).toContain("... on Organization");
    expect(request.mock.calls[2]![1]).toMatchObject({ cursor: "field-page" });
    expect(request.mock.calls[3]![1]).toMatchObject({ cursor: "project-page" });
  });

  it("loads arbitrary names, ordering and colors from the selected stable field", async () => {
    const request = vi.fn().mockResolvedValue({ node: { fields: page([{ id: "unselected", name: "Status", options: [{ id: "same-name", name: "In Review" }] }, { id: "status", name: "Renamed Status", options: [{ id: "review", name: "In Review", color: "BLUE" }, { id: "archive", name: "Archived", color: "GRAY" }] }]) } });
    expect(await readGitHubStatusCatalog(request as StatusGraphQL, connection)).toMatchObject({ options: [{ id: "review", position: 0, color: "BLUE" }, { id: "archive", name: "Archived", position: 1 }] });
  });

  it("offers renamed and distinct single-select fields by explicit Project and field identity", async () => {
    const request = vi.fn().mockResolvedValueOnce({ repository: { owner: { projectsV2: page([{ id: "first", title: "Delivery" }]) } } }).mockResolvedValueOnce({ node: { fields: page([{ id: "text", name: "Text" }, { id: "workflow", name: "Delivery stage", options: [] }, { id: "priority", name: "Priority", options: [] }]) } });
    expect(await discoverGitHubStatusProjects(request as StatusGraphQL, connection)).toEqual([{ id: "first", name: "Delivery · Delivery stage", fieldId: "workflow" }, { id: "first", name: "Delivery · Priority", fieldId: "priority" }]);
  });

  it("paginates memberships and values while keeping Issue closure separate", async () => {
    const request = vi.fn().mockResolvedValueOnce({ repository: { issue: { projectItems: page([{ id: "unselected-item", project: { id: "other" }, fieldValues: page([]) }], "membership-page") } } }).mockResolvedValueOnce({ repository: { issue: { projectItems: page([{ id: "selected-item", project: { id: source.projectId }, fieldValues: page([{}], "value-page") }]) } } }).mockResolvedValueOnce({ node: { fieldValues: page([{ field: { id: "status" }, optionId: "review", name: "In Review" }]) } });
    expect(await readGitHubStatus(request as StatusGraphQL, connection, issue, catalog)).toMatchObject({ state: "closed", statusEvidence: { issueState: "closed", membership: "present", optionId: "review", name: "In Review" } });
    expect(request.mock.calls[1]![1]).toMatchObject({ cursor: "membership-page" });
    expect(request.mock.calls[2]![1]).toMatchObject({ cursor: "value-page", id: "selected-item" });
  });

  it.each([false, true])("distinguishes an unset status from missing membership=%s", async (missing) => {
    const request = vi.fn().mockResolvedValue({ repository: { issue: { projectItems: page(missing ? [] : [{ id: "selected-item", project: { id: source.projectId }, fieldValues: page([]) }]) } } });
    expect(await readGitHubStatus(request as StatusGraphQL, connection, issue, catalog)).toMatchObject({ statusEvidence: { membership: missing ? "missing" : "present", optionId: null, name: null } });
  });

  it("refuses permission failures, missing fields and incomplete pages", async () => {
    const permission = vi.fn().mockRejectedValue(new Error("Project permission denied"));
    await expect(readGitHubStatusCatalog(permission as StatusGraphQL, connection)).rejects.toThrow("permission denied");
    const absent = vi.fn().mockResolvedValue({ node: { fields: page([]) } });
    await expect(readGitHubStatusCatalog(absent as StatusGraphQL, connection)).rejects.toThrow(/unavailable/);
    const partial = vi.fn().mockResolvedValue({ repository: { issue: { projectItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } } });
    await expect(readGitHubStatus(partial as StatusGraphQL, connection, issue, catalog)).rejects.toThrow(/incomplete/);
  });
});
