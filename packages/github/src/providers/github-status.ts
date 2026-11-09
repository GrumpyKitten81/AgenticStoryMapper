import { DomainError, githubStatusCatalogSchema, githubStatusEvidenceSchema, type ConnectorConnection, type GitHubStatusCatalog } from "@storymapper/contracts";
import type { RemoteWorkItem } from "@storymapper/github/providers/work-item-provider";

export type StatusGraphQL = <T>(query: string, variables: Record<string, string | number | null>) => Promise<T>;
interface Page<T> { nodes: Array<T | null>; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
interface Field { id: string; name: string; options?: Array<{ id: string; name: string; color?: string }> }
interface Value { optionId?: string | null; name?: string | null; field?: { id: string } }
interface Item { id: string; project: { id: string }; fieldValues: Page<Value> }

function nextCursor<T>(page: Page<T> | undefined): string | null {
  if (!page || !Array.isArray(page.nodes) || page.nodes.some((node) => node === null) || typeof page.pageInfo?.hasNextPage !== "boolean" || page.pageInfo.hasNextPage && !page.pageInfo.endCursor) throw new DomainError("validation", "GitHub returned incomplete Project status evidence.");
  return page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
}

export async function discoverGitHubStatusProjects(graphql: StatusGraphQL, connection: ConnectorConnection): Promise<Array<{ id: string; name: string; fieldId: string }>> {
  const projects: Array<{ id: string; name: string; fieldId: string }> = [];
  let cursor: string | null = null;
  do {
    const response: { repository: { owner: { projectsV2: Page<{ id: string; title: string }> } } } = await graphql(`query($owner:String!,$repo:String!,$cursor:String){repository(owner:$owner,name:$repo){owner{... on Organization{projectsV2(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{id title}}} ... on User{projectsV2(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{id title}}}}}}`, { owner: connection.owner, repo: connection.repository!, cursor });
    cursor = nextCursor(response.repository?.owner?.projectsV2);
    for (const project of response.repository.owner.projectsV2.nodes) {
      const fields = await readProjectFields(graphql, project!.id);
      for (const field of fields.filter((field) => field.options)) projects.push({ id: project!.id, name: `${project!.title} · ${field.name}`, fieldId: field.id });
    }
  } while (cursor);
  return projects;
}

async function readProjectFields(graphql: StatusGraphQL, projectId: string): Promise<Field[]> {
  const fields: Field[] = [];
  let cursor: string | null = null;
  do {
    const response: { node: { fields: Page<Field> } | null } = await graphql(`query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{fields(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{... on ProjectV2Field{id name} ... on ProjectV2IterationField{id name} ... on ProjectV2SingleSelectField{id name options{id name color}}}}}}}`, { id: projectId, cursor });
    if (!response.node) throw new DomainError("validation", "Selected GitHub Project is unavailable. Existing statuses are retained.");
    cursor = nextCursor(response.node.fields);
    fields.push(...response.node.fields.nodes as Field[]);
  } while (cursor);
  return fields;
}

export async function readGitHubStatusCatalog(graphql: StatusGraphQL, connection: ConnectorConnection): Promise<GitHubStatusCatalog> {
  const source = connection.statusSource ?? { kind: "repository" as const };
  if (source.kind === "repository") return { source, options: [{ id: "open", name: "Open", position: 0 }, { id: "closed", name: "Closed", position: 1 }] };
  const field = (await readProjectFields(graphql, source.projectId)).find((field) => field.id === source.fieldId);
  if (!field?.options) throw new DomainError("validation", "Selected GitHub Status field is unavailable. Existing statuses are retained.");
  return githubStatusCatalogSchema.parse({ source, options: field.options.map((option, position) => ({ ...option, position })) });
}

export async function readGitHubStatus(graphql: StatusGraphQL, connection: ConnectorConnection, item: RemoteWorkItem, catalog: GitHubStatusCatalog): Promise<RemoteWorkItem> {
  const source = catalog.source;
  const issueState = item.state.toLowerCase();
  if (issueState !== "open" && issueState !== "closed") throw new DomainError("validation", "GitHub returned incomplete Issue state evidence.");
  if (source.kind === "repository") return { ...item, statusCatalog: catalog, statusEvidence: { source, issueState, membership: "present", optionId: issueState, name: issueState === "closed" ? "Closed" : "Open" } };
  let cursor: string | null = null;
  let selected: Item | undefined;
  do {
    const response: { repository: { issue: { projectItems: Page<Item> } | null } } = await graphql(`query($owner:String!,$repo:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:100,after:$cursor,includeArchived:true){pageInfo{hasNextPage endCursor} nodes{id project{id} fieldValues(first:100){pageInfo{hasNextPage endCursor} nodes{... on ProjectV2ItemFieldSingleSelectValue{optionId name field{... on ProjectV2SingleSelectField{id}}}}}}}}}}}`, { owner: connection.owner, repo: connection.repository!, number: item.remoteNumber ?? Number(item.remoteId), cursor });
    const page = response.repository?.issue?.projectItems;
    cursor = nextCursor(page);
    for (const membership of page!.nodes) if (membership!.project.id === source.projectId) {
      if (selected) throw new DomainError("conflict", "GitHub returned ambiguous Project membership.");
      selected = membership!;
    }
  } while (cursor);
  const values: Value[] = [];
  if (selected) {
    values.push(...selected.fieldValues.nodes.filter((value): value is Value => value !== null));
    cursor = nextCursor(selected.fieldValues);
    while (cursor) {
      const response: { node: { fieldValues: Page<Value> } } = await graphql(`query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2Item{fieldValues(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{... on ProjectV2ItemFieldSingleSelectValue{optionId name field{... on ProjectV2SingleSelectField{id}}}}}}}}`, { id: selected.id, cursor });
      cursor = nextCursor(response.node?.fieldValues);
      values.push(...response.node.fieldValues.nodes as Value[]);
    }
  }
  const status = values.filter((value) => value.field?.id === source.fieldId);
  if (status.length > 1) throw new DomainError("conflict", "GitHub returned ambiguous Project status.");
  return { ...item, statusCatalog: catalog, statusEvidence: githubStatusEvidenceSchema.parse({ source, issueState, membership: selected ? "present" : "missing", optionId: status[0]?.optionId ?? null, name: status[0]?.name ?? null }) };
}
