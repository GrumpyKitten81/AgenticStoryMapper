import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectorConnectionSchema, type RemoteIssuePayload } from "@storymapper/contracts";
import { GitHubProvider } from "@storymapper/github";

const fixture = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: fixture.exec }) };
});

const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId: randomUUID(), provider: "github", name: "Push transport", authMode: "token", owner: "fixture-owner", repository: "fixture-repo", createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" });
const issue = { number: 7, html_url: "https://github.com/fixture-owner/fixture-repo/issues/7", title: "Title", body: "Body", labels: [], state: "closed", type: { name: "Task" }, milestone: null };
let token: string;
let fetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  token = randomUUID().replaceAll("-", "");
  fetch = vi.fn(async () => { throw new Error("Unexpected external request in push fixture"); });
  vi.stubGlobal("fetch", fetch);
  fixture.exec.mockRejectedValue(new Error("Unexpected CLI command in push fixture"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

it.each(["token", "github-cli"] as const)("sends one exact %s Issue mutation including native type, state and explicit empty labels/Milestone", async (authMode) => {
  fetch.mockResolvedValue(Response.json(issue));
  fixture.exec.mockResolvedValue({ stdout: JSON.stringify(issue) });
  const payload: RemoteIssuePayload = { remoteId: "7", title: "Title", body: "Body", labels: [], issueType: "Task", remoteState: "closed", milestoneNumber: null };
  const result = await new GitHubProvider().writeRemoteIssue({ ...connection, authMode }, authMode === "token" ? { token } : { cliToken: token }, payload);
  expect(result).toMatchObject({ remoteId: "7", state: "closed", issueType: "Task" });
  if (authMode === "token") {
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/fixture-owner/fixture-repo/issues/7");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", headers: { authorization: `token ${token}` } });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ title: "Title", body: "Body", labels: [], type: "Task", milestone: null, state: "closed" });
    expect(fixture.exec).not.toHaveBeenCalled();
  } else {
    expect(fixture.exec).toHaveBeenCalledOnce();
    const [command, args, options] = fixture.exec.mock.calls[0]!;
    expect(command).toBe("gh");
    expect(args).toEqual(["api", "--method", "PATCH", "repos/fixture-owner/fixture-repo/issues/7", "-f", "title=Title", "-f", "body=Body", "-f", "labels[]", "-f", "type=Task", "-F", "milestone=null", "-f", "state=closed"]);
    expect(options.env.GH_TOKEN === token).toBe(true);
    expect(options.env.GH_HOST).toBe("github.com");
    expect(fetch).not.toHaveBeenCalled();
  }
});

it.each(["token", "github-cli"] as const)("reports %s uncertain response failures without retrying or leaking selected credentials", async (authMode) => {
  fetch.mockRejectedValue(new TypeError(token));
  fixture.exec.mockRejectedValue(Object.assign(new Error(token), { stderr: token }));
  const request = new GitHubProvider().writeMilestone({ ...connection, authMode }, authMode === "token" ? { token } : { cliToken: token }, { title: "Release", description: "Goal", dueOn: null, state: "open" });
  await expect(request).rejects.toThrow(/^GitHub request failed/);
  try { await request; } catch (error) { expect(String(error)).not.toContain(token); }
  expect(authMode === "token" ? fetch : fixture.exec).toHaveBeenCalledOnce();
});

const repositoryPath = "repos/fixture-owner/fixture-repo";

it("reads capability evidence and complete marker lookups through the token transport with explicit pagination", async () => {
  const milestone = { number: 3, html_url: "https://github.com/fixture-owner/fixture-repo/milestone/3", title: "Release", description: "<!-- marker -->", due_on: null, state: "open" };
  const labels = Array.from({ length: 100 }, (_, index) => ({ name: `label-${String(index).padStart(3, "0")}` }));
  fetch.mockImplementation(async (url: string) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname.endsWith("/issue-types")) return Response.json([{ name: "Task" }, { name: "Off", is_enabled: false }]);
    if (pathname.endsWith("/labels")) return Response.json(searchParams.get("page") === "1" ? labels : [{ name: "extra" }]);
    if (pathname.endsWith("/milestones")) return Response.json([milestone]);
    if (pathname.endsWith("/issues")) return Response.json([{ ...issue, body: "<!-- storymapper:footer:start -->\n<!-- marker -->\n<!-- storymapper:footer:end -->" }]);
    return Response.json({ permissions: { push: true } });
  });
  const provider = new GitHubProvider();
  const inputs = await provider.readPushInputs(connection, { token });
  expect(inputs).toMatchObject({ writable: true, issueTypes: ["Task"], milestones: [{ remoteNumber: 3 }] });
  expect(inputs.labels).toHaveLength(101);
  expect(fetch.mock.calls.map(([url]) => url)).toContain(`https://api.github.com/${repositoryPath}/labels?per_page=100&page=2`);
  const matches = await provider.findRemoteItemsByMarker(connection, { token }, "issue", "marker");
  expect(matches).toMatchObject({ complete: true, matches: [{ remoteId: "7" }] });
});

it("reads capability evidence through the CLI transport as GET requests", async () => {
  fixture.exec.mockResolvedValue({ stdout: JSON.stringify([]) });
  await new GitHubProvider().findRemoteItemsByMarker({ ...connection, authMode: "github-cli" }, { cliToken: token }, "milestone", "marker");
  expect(fixture.exec.mock.calls[0]![1]).toEqual(["api", "--method", "GET", `${repositoryPath}/milestones?state=all&per_page=100&page=1`]);
});

it("replaces the capped GraphQL label read with the complete REST label listing", async () => {
  const detail = { number: 7, title: "Title", body: "Body", state: "OPEN", url: issue.html_url, labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: "first" }] } };
  fetch.mockImplementation(async (url: string) => new URL(url).pathname.endsWith("/graphql") ? Response.json({ data: { repository: { issue: detail } } }) : Response.json([{ name: "first" }, { name: "second" }]));
  const read = await new GitHubProvider().getRemoteItem(connection, { token }, "7");
  expect(read).toMatchObject({ status: "found", item: { labels: ["first", "second"] } });
});

it.each(["token", "github-cli"] as const)("reads complete %s Issue details with iteration, Milestone dates and paginated labels", async (authMode) => {
  const detail = { number: 7, title: "Title", body: "Authored body", state: "OPEN", url: issue.html_url, issueType: { name: "Task" }, labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: "capped" }] }, milestone: { number: 3, title: "Release", dueOn: "2026-11-01T00:00:00Z", description: "Authored milestone goal", state: "CLOSED" }, assignees: { nodes: [{ login: "assigned" }, { login: "second" }] }, parent: { number: 2 }, projectItems: { nodes: [{ fieldValueByName: { title: "Sprint A", startDate: "2026-10-19", duration: 14 } }] } };
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` }));
  const labelsFor = (path: string) => path.includes("page=2") ? [{ name: "last-label" }] : firstPage;
  fetch.mockImplementation(async (url: string) => new URL(url).pathname.endsWith("/graphql") ? Response.json({ data: { repository: { issue: detail } } }) : Response.json(labelsFor(url)));
  fixture.exec.mockImplementation(async (_command: string, args: string[]) => ({ stdout: JSON.stringify(args[1] === "graphql" ? { data: { repository: { issue: detail } } } : labelsFor(args[3]!)) }));
  const configured = { ...connection, authMode, iterationFieldName: "Team iteration" };
  const result = await new GitHubProvider().getRemoteItem(configured, authMode === "token" ? { token } : { cliToken: token }, "7");
  expect(result).toMatchObject({ status: "found", item: { remoteId: "7", remoteNumber: 7, title: "Title", body: "Authored body", state: "open", url: issue.html_url, issueType: "Task", milestoneNumber: 3, milestone: "Release", milestoneDueOn: "2026-11-01T00:00:00Z", milestoneDescription: "Authored milestone goal", milestoneState: "closed", assignee: "assigned", parentNumber: 2, iteration: { title: "Sprint A", startDate: "2026-10-19", duration: 14 }, labels: [...firstPage.map((row) => row.name), "last-label"] } });
  let query: string;
  if (authMode === "token") {
    expect(fetch).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    query = body.query;
    expect(body.variables).toEqual({ owner: "fixture-owner", repo: "fixture-repo", number: 7, iterationField: "Team iteration" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://api.github.com/graphql", `https://api.github.com/${repositoryPath}/issues/7/labels?per_page=100&page=1`, `https://api.github.com/${repositoryPath}/issues/7/labels?per_page=100&page=2`]);
    expect(fixture.exec).not.toHaveBeenCalled();
  } else {
    expect(fixture.exec).toHaveBeenCalledTimes(3);
    const [command, args, options] = fixture.exec.mock.calls[0]!;
    expect(command).toBe("gh");
    query = args[3].slice("query=".length);
    expect(args).toEqual(["api", "graphql", "-f", `query=${query}`, "-f", "owner=fixture-owner", "-f", "repo=fixture-repo", "-F", "number=7", "-f", "iterationField=Team iteration"]);
    expect(options.env.GH_TOKEN === token).toBe(true);
    expect(options.env.GH_HOST).toBe("github.com");
    expect(fixture.exec.mock.calls.slice(1).map((call) => call[1])).toEqual([1, 2].map((page) => ["api", "--method", "GET", `${repositoryPath}/issues/7/labels?per_page=100&page=${page}`]));
    expect(fetch).not.toHaveBeenCalled();
  }
  expect(query).toContain("$iterationField: String!");
  expect(query).toContain("milestone { number title dueOn description state }");
  expect(query).toContain("projectItems(first: 5, includeArchived: false)");
  expect(query).toContain("fieldValueByName(name: $iterationField)");
  expect(query).toContain("... on ProjectV2ItemFieldIterationValue { title startDate duration }");
});

it.each(["token", "github-cli"] as const)("distinguishes unavailable %s Issues from partial, refused and failed detail projections", async (authMode) => {
  const configured = { ...connection, authMode };
  const auth = authMode === "token" ? { token } : { cliToken: token };
  const provider = new GitHubProvider();
  const request = () => provider.getRemoteItem(configured, auth, "7");
  const respond = (data: object | null, errors?: object[]) => {
    fetch.mockResolvedValue(Response.json({ data, ...(errors ? { errors } : {}) }));
    fixture.exec.mockResolvedValue({ stdout: JSON.stringify({ data, ...(errors ? { errors } : {}) }) });
  };
  respond({ repository: { issue: null } });
  await expect(request()).resolves.toEqual({ status: "unavailable" });
  respond({ repository: { issue: null } }, [{ type: "NOT_FOUND", path: ["repository", "issue"], message: "Missing Issue" }]);
  await expect(request()).resolves.toEqual({ status: "unavailable" });
  for (const errors of [
    [{ type: "FORBIDDEN", path: ["repository", "issue"], message: "Refused" }],
    [{ type: "NOT_FOUND", path: ["repository", "issue"], message: "Missing Issue" }, { type: "FORBIDDEN", path: ["repository", "issue", "projectItems"], message: "Partial iteration" }],
    [{ type: "NOT_FOUND", path: ["repository"], message: "Missing repository" }]
  ]) {
    respond({ repository: { issue: null } }, errors);
    await expect(request()).rejects.toThrow("GitHub request failed");
  }
  fetch.mockResolvedValue(Response.json({ message: "Credentials refused" }, { status: 401 }));
  fixture.exec.mockRejectedValue(Object.assign(new Error("Credentials refused"), { stderr: "gh: Bad credentials (HTTP 401)" }));
  await expect(request()).rejects.toThrow(/^GitHub /);
  fetch.mockRejectedValue(new TypeError("Network unavailable"));
  fixture.exec.mockRejectedValue(new Error("Network unavailable"));
  await expect(request()).rejects.toThrow("GitHub request failed");
  expect(authMode === "token" ? fixture.exec : fetch).not.toHaveBeenCalled();
});

it("classifies CLI GraphQL subprocess failures using all structured errors before diagnostic text", async () => {
  const configured = { ...connection, authMode: "github-cli" as const };
  const errors = [{ type: "NOT_FOUND", path: ["repository", "issue"], message: "Missing Issue" }];
  fixture.exec.mockRejectedValue({ stdout: JSON.stringify({ data: { repository: { issue: null } }, errors }), stderr: "gh: Could not resolve to an Issue with the number of 7." });
  await expect(new GitHubProvider().getRemoteItem(configured, { cliToken: token }, "7")).resolves.toEqual({ status: "unavailable" });
  fixture.exec.mockRejectedValue({ stdout: JSON.stringify({ data: { repository: { issue: null } }, errors: [...errors, { type: "FORBIDDEN", path: ["repository", "issue", "projectItems"], message: "Partial iteration" }] }), stderr: "GraphQL: Could not resolve to an Issue with the number of 7. (repository.issue)" });
  await expect(new GitHubProvider().getRemoteItem(configured, { cliToken: token }, "7")).rejects.toThrow("GitHub request failed");
  expect(fixture.exec).toHaveBeenCalledTimes(2);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["token", "github-cli"] as const)("refuses truncated %s iteration evidence at both detail and search boundaries", async (authMode) => {
  const detail = { number: 7, title: "Title", body: "Body", state: "OPEN", url: issue.html_url, projectItems: { pageInfo: { hasNextPage: true }, nodes: Array.from({ length: 5 }, () => ({ fieldValueByName: null })) } };
  for (const surface of ["detail", "search"] as const) {
    const data = surface === "detail" ? { repository: { issue: detail } } : { search: { nodes: [detail], pageInfo: { hasNextPage: false, endCursor: null } } };
    fetch.mockResolvedValue(Response.json({ data }));
    fixture.exec.mockResolvedValue({ stdout: JSON.stringify({ data }) });
    const provider = new GitHubProvider();
    const configured = { ...connection, authMode, releaseSource: "iteration" as const };
    const auth = authMode === "token" ? { token } : { cliToken: token };
    await expect(surface === "detail" ? provider.getRemoteItem(configured, auth, "7") : provider.listRemoteItems(configured, auth)).rejects.toThrow("GitHub request failed");
  }
  const calls = authMode === "token" ? fetch.mock.calls : fixture.exec.mock.calls;
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    const query = authMode === "token" ? JSON.parse(call[1].body).query : call[1][3];
    expect(query.replace(/\s+/gu, " ")).toContain("projectItems(first: 5, includeArchived: false) { pageInfo { hasNextPage }");
  }
  expect(authMode === "token" ? fixture.exec : fetch).not.toHaveBeenCalled();
});

it.each(["milestone", "none"] as const)("keeps %s detail/search reads available when unused iteration evidence is truncated", async (releaseSource) => {
  const detail = { number: 7, title: "Title", body: "Body", state: "OPEN", url: issue.html_url, labels: { pageInfo: { hasNextPage: false }, nodes: [] }, milestone: { number: 3, title: "Release", dueOn: "2026-11-01T00:00:00Z", description: "", state: "OPEN" }, projectItems: { pageInfo: { hasNextPage: true }, nodes: [] } };
  for (const authMode of ["token", "github-cli"] as const) for (const surface of ["detail", "search"] as const) {
    const data = surface === "detail" ? { repository: { issue: detail } } : { search: { nodes: [detail], pageInfo: { hasNextPage: false, endCursor: null } } };
    fetch.mockImplementation(async (url: string) => Response.json(new URL(url).pathname.endsWith("/graphql") ? { data } : []));
    fixture.exec.mockImplementation(async (_command: string, args: string[]) => ({ stdout: JSON.stringify(args[1] === "graphql" ? { data } : []) }));
    const provider = new GitHubProvider();
    const configured = { ...connection, authMode, releaseSource };
    const auth = authMode === "token" ? { token } : { cliToken: token };
    if (surface === "detail") await expect(provider.getRemoteItem(configured, auth, "7")).resolves.toMatchObject({ status: "found", item: { milestone: "Release", milestoneDueOn: "2026-11-01T00:00:00Z" } });
    else await expect(provider.listRemoteItems(configured, auth)).resolves.toMatchObject([{ milestone: "Release", milestoneDueOn: "2026-11-01T00:00:00Z" }]);
  }
});

it.each(["token", "github-cli"] as const)("completes %s bulk labels beyond50 and rejects failed continuation", async (authMode) => {
  const detail = { ...issue, url: issue.html_url, labels: { pageInfo: { hasNextPage: true }, nodes: Array.from({ length: 50 }, (_, index) => ({ name: `label-${index}` })) } };
  const data = { search: { nodes: [detail], pageInfo: { hasNextPage: false, endCursor: null } } };
  const first = Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` }));
  const response = (path: string) => path.includes("page=2") ? [{ name: "done" }, { name: "managed-annotation" }] : first;
  fetch.mockImplementation(async (url: string) => Response.json(new URL(url).pathname.endsWith("/graphql") ? { data } : response(url)));
  fixture.exec.mockImplementation(async (_command: string, args: string[]) => ({ stdout: JSON.stringify(args[1] === "graphql" ? { data } : response(args[3]!)) }));
  const provider = new GitHubProvider();
  const configured = { ...connection, authMode };
  const auth = authMode === "token" ? { token } : { cliToken: token };
  await expect(provider.listRemoteItems(configured, auth)).resolves.toMatchObject([{ labels: [...first.map((row) => row.name), "done", "managed-annotation"] }]);
  fetch.mockImplementation(async (url: string) => {
    if (url.includes("page=2")) throw new TypeError("Incomplete label evidence");
    return Response.json(new URL(url).pathname.endsWith("/graphql") ? { data } : first);
  });
  fixture.exec.mockImplementation(async (_command: string, args: string[]) => {
    if (args[3]?.includes("page=2")) throw new Error("Incomplete label evidence");
    return { stdout: JSON.stringify(args[1] === "graphql" ? { data } : first) };
  });
  await expect(provider.listRemoteItems(configured, auth)).rejects.toThrow("GitHub request failed");
  expect(authMode === "token" ? fixture.exec : fetch).not.toHaveBeenCalled();
});

it.each(["token", "github-cli"] as const)("refuses ambiguous %s iteration tuples in either order and accepts identical evidence", async (authMode) => {
  const first = { title: "Sprint A", startDate: "2026-10-19", duration: 14 };
  const second = { ...first, duration: 7 };
  const configured = { ...connection, authMode, releaseSource: "iteration" as const };
  const auth = authMode === "token" ? { token } : { cliToken: token };
  for (const surface of ["detail", "search"] as const) for (const tuples of [[first, second], [second, first], [first, first]]) {
    const detail = { ...issue, url: issue.html_url, labels: { pageInfo: { hasNextPage: false }, nodes: [] }, projectItems: { pageInfo: { hasNextPage: false }, nodes: tuples.map((fieldValueByName) => ({ fieldValueByName })) } };
    const data = surface === "detail" ? { repository: { issue: detail } } : { search: { nodes: [detail], pageInfo: { hasNextPage: false, endCursor: null } } };
    fetch.mockImplementation(async (url: string) => Response.json(new URL(url).pathname.endsWith("/graphql") ? { data } : []));
    fixture.exec.mockImplementation(async (_command: string, args: string[]) => ({ stdout: JSON.stringify(args[1] === "graphql" ? { data } : []) }));
    const provider = new GitHubProvider();
    const request = surface === "detail" ? provider.getRemoteItem(configured, auth, "7") : provider.listRemoteItems(configured, auth);
    if (tuples[0] === tuples[1]) {
      const result = await request;
      expect(surface === "detail" ? result : { status: "found", item: (result as unknown[])[0] }).toMatchObject({ status: "found", item: { iteration: first } });
    } else await expect(request).rejects.toThrow("ambiguous Issue iteration evidence");
  }
  expect(authMode === "token" ? fixture.exec : fetch).not.toHaveBeenCalled();
});

it.each(["token", "github-cli"] as const)("keeps %s complete labels per Issue/search cursor and hydrates only a truncated Issue", async (authMode) => {
  const small = (number: number) => ({ ...issue, number, url: `https://github.com/fixture-owner/fixture-repo/issues/${number}`, labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: `small-${number}` }] } });
  const truncated = { ...small(8), labels: { pageInfo: { hasNextPage: true }, nodes: [{ name: "capped-8" }] } };
  const cursors: Array<string | null> = [];
  const page = (cursor: string | null) => {
    cursors.push(cursor);
    return { search: { nodes: cursor ? [small(9)] : [small(7), truncated], pageInfo: { hasNextPage: !cursor, endCursor: cursor ? null : "next-page" } } };
  };
  fetch.mockImplementation(async (url: string, options: { body: string }) => {
    if (url.endsWith("/graphql")) return Response.json({ data: page(JSON.parse(options.body).variables.cursor) });
    if (url.includes("/issues/8/labels?")) return Response.json([{ name: "complete-8" }]);
    throw new Error("Unexpected label hydration");
  });
  fixture.exec.mockImplementation(async (_command: string, args: string[]) => {
    if (args[1] === "graphql") return { stdout: JSON.stringify({ data: page(args.find((value) => value.startsWith("cursor="))?.slice(7) ?? null) }) };
    if (args[3]?.includes("/issues/8/labels?")) return { stdout: JSON.stringify([{ name: "complete-8" }]) };
    throw new Error("Unexpected label hydration");
  });
  const configured = { ...connection, authMode };
  const auth = authMode === "token" ? { token } : { cliToken: token };
  expect(await new GitHubProvider().listRemoteItems(configured, auth)).toMatchObject([{ remoteId: "7", labels: ["small-7"] }, { remoteId: "8", labels: ["complete-8"] }, { remoteId: "9", labels: ["small-9"] }]);
  expect(cursors).toEqual([null, "next-page"]);
  const calls = authMode === "token" ? fetch.mock.calls : fixture.exec.mock.calls;
  expect(calls).toHaveLength(3);
  const query = authMode === "token" ? JSON.parse(calls[0]![1].body).query : calls[0]![1][3];
  expect(query).toContain("labels(first: 50) { pageInfo { hasNextPage } nodes { name } }");
  const incomplete = { ...small(7), labels: { nodes: [{ name: "unproven" }] } };
  fetch.mockResolvedValue(Response.json({ data: { search: { nodes: [incomplete], pageInfo: { hasNextPage: false, endCursor: null } } } }));
  fixture.exec.mockResolvedValue({ stdout: JSON.stringify({ data: { search: { nodes: [incomplete], pageInfo: { hasNextPage: false, endCursor: null } } } }) });
  await expect(new GitHubProvider().listRemoteItems(configured, auth)).rejects.toThrow("GitHub request failed");
  expect(authMode === "token" ? fixture.exec : fetch).not.toHaveBeenCalled();
});

it.each(["token", "github-cli"] as const)("preserves missing %s Milestone fields separately from explicit empty/open evidence", async (authMode) => {
  for (const metadata of [{}, { description: null, state: "OPEN" }]) {
    const detail = { ...issue, url: issue.html_url, labels: { nodes: [] }, milestone: { number: 3, title: "Release", dueOn: null, ...metadata } };
    fetch.mockImplementation(async (url: string) => Response.json(url.endsWith("/graphql") ? { data: { repository: { issue: detail } } } : []));
    fixture.exec.mockImplementation(async (_command: string, args: string[]) => ({ stdout: JSON.stringify(args[1] === "graphql" ? { data: { repository: { issue: detail } } } : []) }));
    const result = await new GitHubProvider().getRemoteItem({ ...connection, authMode }, authMode === "token" ? { token } : { cliToken: token }, "7");
    expect(result).toMatchObject({ status: "found", item: { milestoneDescription: "description" in metadata ? "" : undefined, milestoneState: "state" in metadata ? "open" : undefined } });
  }
});
