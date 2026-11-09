import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Octokit } from "@octokit/rest";
import { connectorConnectionSchema, DomainError, type ConnectorConnection, type SyncPlanItem, type RemoteIssuePayload, type RemoteMilestone, type RemoteMilestonePayload, type RemotePushEvidence } from "@storymapper/contracts";
import { githubCliEnvironment } from "../auth/github-cli-environment";
import type { CreatedRemoteWorkItem, ProviderAuth, RemoteItemRead, RemoteWorkItem, ValidateConnectionResult, WorkItemProvider } from "./work-item-provider";
import { repositoryCapabilities, verificationFailure } from "./github-verification";
import { completeGitHubList, findGitHubMarkerMatches, readGitHubPushInputs, writeGitHubIssue, writeGitHubMilestone, type GitHubApiRequest } from "./github-remote-push";

import { readGitHubStatus, readGitHubStatusCatalog, discoverGitHubStatusProjects, type StatusGraphQL } from "@storymapper/github/providers/github-status";

const execFileAsync = promisify(execFile);
const GITHUB_REPOSITORY = connectorConnectionSchema.pick({ owner: true, repository: true }).required();
const SANITIZED_PROVIDER_ERRORS = new WeakSet<DomainError>();

export class GitHubProvider implements WorkItemProvider {
  async validateConnection(connection: ConnectorConnection, auth: ProviderAuth): Promise<ValidateConnectionResult> {
    assertGitHubRepository(connection);
    return this.validateConnectionRequest(connection, auth);
  }

  async listRemoteItems(connection: ConnectorConnection, auth: ProviderAuth, query?: string): Promise<RemoteWorkItem[]> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => this.listRemoteItemsRequest(connection, auth, query));
  }

  async createOrUpdateRemoteItem(connection: ConnectorConnection, auth: ProviderAuth, item: SyncPlanItem): Promise<CreatedRemoteWorkItem> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => this.createOrUpdateRemoteItemRequest(connection, auth, item));
  }

  async getRemoteItem(connection: ConnectorConnection, auth: ProviderAuth, remoteId: string): Promise<RemoteItemRead> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => this.getRemoteItemRequest(connection, auth, remoteId));
  }

  private async validateConnectionRequest(connection: ConnectorConnection, auth: ProviderAuth): Promise<ValidateConnectionResult> {
    if (connection.authMode === "github-cli" ? !auth.cliToken : !auth.token) {
      const failure = { kind: "credentials" as const, message: "Selected GitHub credentials are unavailable.", nextAction: "Enter a token or run gh auth login in your terminal, then Recheck and Verify again." };
      return { ok: false, message: `${failure.message} ${failure.nextAction}`, failure };
    }
    try {
      if (connection.authMode === "github-cli") {
        const result = await runGh(["api", `repos/${repoSlug(connection)}`], auth);
        const repo = JSON.parse(result.stdout) as { permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } };
        return { ok: true, message: "GitHub CLI connection validated.", details: { repository: repoSlug(connection) }, capabilities: repositoryCapabilities(repo.permissions) };
      }
      const octokit = createOctokit(auth);
      const repo = await octokit.repos.get({ owner: connection.owner, repo: requiredRepo(connection) });
      return { ok: true, message: "GitHub token connection validated.", details: { fullName: repo.data.full_name, url: repo.data.html_url }, capabilities: repositoryCapabilities(repo.data.permissions) };
    } catch (error) {
      const failure = verificationFailure(error);
      return { ok: false, message: `${failure.message} ${failure.nextAction}`, failure };
    }
  }

  private async listRemoteItemsRequest(connection: ConnectorConnection, auth: ProviderAuth, query?: string): Promise<RemoteWorkItem[]> {
    const searchQuery = [`repo:${repoSlug(connection)}`, "is:issue", query?.trim() ?? ""].join(" ").trim();
    const items: RemoteWorkItem[] = [];
    let cursor: string | null = null;
    do {
      const data = await this.runIssueSearchQuery(connection, auth, searchQuery, cursor);
      if (data.search.pageInfo.hasNextPage && !data.search.pageInfo.endCursor) throw new Error("GitHub returned an incomplete Issue search page.");
      const nodes = data.search.nodes.filter((node): node is GraphQlIssue => Boolean(node && "number" in node));
      for (const node of nodes) {
        const item = fromGraphQlIssue(node, connection.releaseSource === "iteration");
        if (typeof node.labels?.pageInfo?.hasNextPage !== "boolean") throw new Error("GitHub returned incomplete Issue label evidence.");
        if (node.labels.pageInfo.hasNextPage) {
          const labels = await completeGitHubList<{ name: string }>(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}/issues/${node.number}/labels`);
          item.labels = labels.map((label) => label.name);
        }
        items.push(item);
      }
      cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
    } while (cursor);
    const catalog = await readGitHubStatusCatalog(this.statusGraphQL(connection, auth), connection);
    const result: RemoteWorkItem[] = [];
    for (const item of items) result.push(await readGitHubStatus(this.statusGraphQL(connection, auth), connection, item, catalog));
    return result;
  }

  private async runIssueSearchQuery(
    connection: ConnectorConnection,
    auth: ProviderAuth,
    searchQuery: string,
    cursor: string | null
  ): Promise<IssueSearchResult> {
    if (connection.authMode === "github-cli") {
      const args = [
        "api", "graphql",
        "-f", `query=${issueSearchGraphQl}`,
        "-f", `searchQuery=${searchQuery}`,
        "-f", `iterationField=${connection.iterationFieldName}`,
        ...(cursor ? ["-f", `cursor=${cursor}`] : [])
      ];
      const result = await runGh(args, auth);
      const parsed = JSON.parse(result.stdout) as { data: IssueSearchResult; errors?: unknown[] };
      if (parsed.errors?.length) throw new Error("GitHub returned an incomplete Issue search.");
      return parsed.data;
    }
    const octokit = createOctokit(auth);
    return octokit.graphql<IssueSearchResult>(issueSearchGraphQl, { searchQuery, cursor, iterationField: connection.iterationFieldName });
  }

  private async createOrUpdateRemoteItemRequest(connection: ConnectorConnection, auth: ProviderAuth, item: SyncPlanItem): Promise<CreatedRemoteWorkItem> {
    if (!item.githubIssueType) throw new DomainError("validation", "Configure a verified native Issue type before reviewing the push.");
    if (item.milestone) throw new DomainError("validation", "Milestone assignment requires an explicit reviewed Milestone identity.");
    return this.writeRemoteIssue(connection, auth, { title: item.title, body: item.body, labels: item.labels, issueType: item.githubIssueType, remoteState: normalizeGitHubState(item.remoteState ?? "open"), milestoneNumber: null, ...(item.remoteId ? { remoteId: item.remoteId } : {}), ...(item.parentIssueNumber ? { parentIssueNumber: item.parentIssueNumber } : {}) });
  }

  async readPushInputs(connection: ConnectorConnection, auth: ProviderAuth): Promise<RemotePushEvidence> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => readGitHubPushInputs(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}`));
  }

  async findRemoteItemsByMarker(connection: ConnectorConnection, auth: ProviderAuth, kind: "issue" | "milestone", marker: string): Promise<{ complete: true; matches: Array<RemoteWorkItem | RemoteMilestone> }> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => findGitHubMarkerMatches(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}`, kind, marker));
  }

  async writeRemoteIssue(connection: ConnectorConnection, auth: ProviderAuth, payload: RemoteIssuePayload): Promise<RemoteWorkItem> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => writeGitHubIssue(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}`, payload));
  }

  async writeMilestone(connection: ConnectorConnection, auth: ProviderAuth, payload: RemoteMilestonePayload): Promise<RemoteMilestone> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => writeGitHubMilestone(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}`, payload));
  }

  private apiRequest(connection: ConnectorConnection, auth: ProviderAuth): GitHubApiRequest {
    return async <T>(method: "GET" | "POST" | "PATCH", path: string, payload?: Record<string, unknown>): Promise<T> => {
      if (connection.authMode !== "github-cli") return (await createOctokit(auth).request(`${method} /${path}`, payload)).data as T;
      const args = ["api", "--method", method, path];
      for (const [key, value] of Object.entries(payload ?? {})) {
        if (Array.isArray(value)) {
          if (value.length === 0) args.push("-f", `${key}[]`);
          else for (const entry of value) args.push("-f", `${key}[]=${String(entry)}`);
        } else if (value === null || typeof value === "number" || typeof value === "boolean") args.push("-F", `${key}=${String(value)}`);
        else args.push("-f", `${key}=${String(value)}`);
      }
      return JSON.parse((await runGh(args, auth)).stdout) as T;
    };
  }

  async listStatusProjects(connection: ConnectorConnection, auth: ProviderAuth): Promise<Array<{ id: string; name: string; fieldId: string }>> {
    assertGitHubRepository(connection);
    return sanitizedRequest(() => discoverGitHubStatusProjects(this.statusGraphQL(connection, auth), connection));
  }

  private statusGraphQL(connection: ConnectorConnection, auth: ProviderAuth): StatusGraphQL {
    return async <T>(query: string, variables: Record<string, string | number | null>): Promise<T> => {
      if (connection.authMode !== "github-cli") return createOctokit(auth).graphql<T>(query, variables);
      const args = ["api", "graphql", "-f", `query=${query}`];
      for (const [key, value] of Object.entries(variables)) if (value !== null) args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
      const response = JSON.parse((await runGh(args, auth)).stdout) as { data?: T; errors?: unknown[] };
      if (response.errors?.length || !response.data) throw new DomainError("validation", "GitHub returned incomplete Project status evidence.");
      return response.data;
    };
  }

  private async getRemoteItemRequest(connection: ConnectorConnection, auth: ProviderAuth, remoteId: string): Promise<RemoteItemRead> {
    const data = await this.runIssueDetailQuery(connection, auth, Number(remoteId)).catch(undefinedWhenIssueMissing);
    const issue = data?.repository?.issue;
    if (!issue) return { status: "unavailable" };
    const item = fromGraphQlIssue(issue, connection.releaseSource === "iteration");
    const labels = await completeGitHubList<{ name: string }>(this.apiRequest(connection, auth), `repos/${repoSlug(connection)}/issues/${issue.number}/labels`);
    item.labels = labels.map((label) => label.name);
    const catalog = await readGitHubStatusCatalog(this.statusGraphQL(connection, auth), connection);
    return { status: "found", item: await readGitHubStatus(this.statusGraphQL(connection, auth), connection, item, catalog) };
  }

  private async runIssueDetailQuery(connection: ConnectorConnection, auth: ProviderAuth, number: number): Promise<IssueDetailResult> {
    const variables = { owner: connection.owner, repo: requiredRepo(connection), number, iterationField: connection.iterationFieldName };
    if (connection.authMode !== "github-cli") return createOctokit(auth).graphql<IssueDetailResult>(issueDetailGraphQl, variables);
    const result = await runGh(["api", "graphql", "-f", `query=${issueDetailGraphQl}`, "-f", `owner=${variables.owner}`, "-f", `repo=${variables.repo}`, "-F", `number=${variables.number}`, "-f", `iterationField=${variables.iterationField}`], auth);
    const parsed = JSON.parse(result.stdout) as { data: IssueDetailResult; errors?: unknown[] };
    if (parsed.errors?.length) throw Object.assign(new Error("GitHub returned an incomplete Issue detail."), { errors: parsed.errors });
    if (!parsed.data || !("repository" in parsed.data)) throw new Error("GitHub returned incomplete Issue detail data.");
    return parsed.data;
  }
}

function requireFoundItem(result: RemoteItemRead): CreatedRemoteWorkItem {
  if (result.status === "unavailable") throw new DomainError("not_found", "GitHub Issue is unavailable; its identity is retained.");
  return result.item;
}

function undefinedWhenIssueMissing(error: unknown): undefined {
  if (error && typeof error === "object" && "status" in error && error.status === 404) return undefined;
  const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
  const stdout = error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
  const cliErrors: unknown = stdout ? (JSON.parse(stdout) as { errors?: unknown }).errors : undefined;
  const graphQlErrors = error && typeof error === "object" && "errors" in error && Array.isArray(error.errors) ? error.errors as { type?: string; path?: string[] }[] : Array.isArray(cliErrors) ? cliErrors as { type?: string; path?: string[] }[] : [];
  if (graphQlErrors.length ? graphQlErrors.every((failure) => failure.type === "NOT_FOUND" && failure.path?.join(".") === "repository.issue") : /^(?:GraphQL: |gh: )Could not resolve to an Issue[^\n]*\(repository\.issue\)\.?$/iu.test(stderr.trim())) return undefined;
  throw error;
}

async function sanitizedRequest<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); }
  catch (error) {
    if (error instanceof DomainError && (SANITIZED_PROVIDER_ERRORS.has(error) || error.code === "conflict")) throw error;
    const sanitized = new DomainError("validation", githubFailureMessage(error));
    SANITIZED_PROVIDER_ERRORS.add(sanitized);
    throw sanitized;
  }
}

function assertGitHubRepository(connection: ConnectorConnection): void {
  if (!GITHUB_REPOSITORY.safeParse(connection).success) throw new DomainError("validation", "GitHub owner and repository must be plain names without a hostname or path.");
}

function githubFailureMessage(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 401) return "GitHub rejected the selected credentials. Check that credential source and try again.";
  if (status === 403 || status === 429) return "GitHub refused the request. Check repository permissions and rate limits.";
  if (status === 404) return "GitHub repository or item is unavailable. Check the repository and selected credential access.";
  return "GitHub request failed. Check the selected credentials, repository access and network connection.";
}

const issueSearchGraphQl = `
query($searchQuery: String!, $cursor: String, $iterationField: String!) {
  search(query: $searchQuery, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number
        title
        body
        state
        url
        issueType { name }
        labels(first: 50) { pageInfo { hasNextPage } nodes { name } }
        milestone { number title dueOn description state }
        assignees(first: 5) { nodes { login } }
        parent { number }
        projectItems(first: 5, includeArchived: false) {
          pageInfo { hasNextPage }
          nodes {
            fieldValueByName(name: $iterationField) {
              ... on ProjectV2ItemFieldIterationValue { title startDate duration }
            }
          }
        }
      }
    }
  }
}`;

const issueDetailGraphQl = `
query($owner: String!, $repo: String!, $number: Int!, $iterationField: String!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      number
      title
      body
      state
      url
      issueType { name }
      labels(first: 50) { pageInfo { hasNextPage } nodes { name } }
      milestone { number title dueOn description state }
      assignees(first: 5) { nodes { login } }
      parent { number }
      projectItems(first: 5, includeArchived: false) {
        pageInfo { hasNextPage }
        nodes {
          fieldValueByName(name: $iterationField) {
            ... on ProjectV2ItemFieldIterationValue { title startDate duration }
          }
        }
      }
    }
  }
}`;

interface GraphQlIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  issueType?: { name: string } | null;
  labels?: { pageInfo?: { hasNextPage: boolean }; nodes: Array<{ name: string } | null> } | null;
  milestone?: { number?: number; title: string; dueOn: string | null; description?: string | null; state?: string } | null;
  assignees?: { nodes: Array<{ login: string } | null> } | null;
  parent?: { number: number } | null;
  projectItems?: { pageInfo?: { hasNextPage: boolean }; nodes: Array<{ fieldValueByName?: { title?: string; startDate?: string; duration?: number } | null } | null> } | null;
}

interface IssueSearchResult {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<GraphQlIssue | Record<string, never> | null>;
  };
}

interface IssueDetailResult {
  repository: {
    issue: GraphQlIssue | null;
  } | null;
}

function fromGraphQlIssue(issue: GraphQlIssue, requireCompleteIteration: boolean): RemoteWorkItem {
  if (requireCompleteIteration && issue.projectItems?.pageInfo?.hasNextPage) throw new Error("GitHub returned incomplete Issue iteration evidence.");
  const iterations = issue.projectItems?.nodes.map((node) => node?.fieldValueByName).filter((value) => value?.title) ?? [];
  const tuples = new Set(iterations.map((value) => JSON.stringify({ title: value!.title, startDate: value!.startDate, duration: value!.duration })));
  if (requireCompleteIteration && tuples.size > 1) throw new DomainError("conflict", "GitHub returned ambiguous Issue iteration evidence.");
  const iterationValue = iterations[0];
  return {
    remoteId: String(issue.number),
    remoteNumber: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    state: issue.state.toLowerCase(),
    labels: issue.labels?.nodes?.map((label) => label?.name).filter((name): name is string => Boolean(name)) ?? [],
    url: issue.url,
    milestone: issue.milestone?.title,
    milestoneNumber: issue.milestone?.number,
    milestoneDueOn: issue.milestone?.dueOn ?? undefined,
    milestoneDescription: issue.milestone?.description === null ? "" : issue.milestone?.description,
    milestoneState: issue.milestone?.state?.toLowerCase(),
    assignee: issue.assignees?.nodes?.find((node) => node?.login)?.login,
    issueType: issue.issueType?.name,
    parentNumber: issue.parent?.number,
    iteration: iterationValue?.title
      ? { title: iterationValue.title, startDate: iterationValue.startDate, duration: iterationValue.duration }
      : undefined
  };
}

function createOctokit(auth: ProviderAuth): Octokit {
  const token = auth.token;
  if (!token) {
    throw new Error("Resolved GitHub token credentials are required.");
  }
  return new Octokit({ auth: token });
}

function repoSlug(connection: ConnectorConnection): string {
  return `${connection.owner}/${requiredRepo(connection)}`;
}

function requiredRepo(connection: ConnectorConnection): string {
  if (!connection.repository) {
    throw new Error("GitHub repository is required.");
  }
  return connection.repository;
}

async function runGh(args: string[], auth: ProviderAuth) {
  if (!auth.cliToken) throw new DomainError("validation", "Resolved GitHub CLI credentials are required.");
  return execFileAsync("gh", args, { env: githubCliEnvironment(process.env, auth.cliToken), timeout: 30000, maxBuffer: 1024 * 1024 });
}

function normalizeGitHubState(state: string): "open" | "closed" {
  return state.toLowerCase() === "closed" || state.toLowerCase() === "done" ? "closed" : "open";
}
