import { writeFileSync } from "node:fs";
import { buildServer } from "[REDACTED_HOME]/Projects/StoryMapper/apps/server/src/server.ts";
import { recordedFiles } from "[REDACTED_HOME]/Projects/StoryMapper/apps/server/src/fixtures/bmad-round-trip/composer.ts";
import { splitMarkdownIntoChunks } from "[REDACTED_HOME]/Projects/StoryMapper/packages/importers/src/index.ts";

const base = "http://127.0.0.1:44357";
const server = await buildServer();
await server.listen({ host: "127.0.0.1", port: 44357 });
async function request(path: string, body?: unknown) {
  const response = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}
const project = await request("/api/projects", { name: "Synthetic remediation acceptance" });
const map = await request("/api/story-maps", { projectId: project.id, name: "Remediation fixture" });
const source = recordedFiles("initial")[0]!;
const locator = splitMarkdownIntoChunks(source.content)[0]!.locator;
const operations = [
  { operationId: "__proto__", op: "import", entity: "sourceDocument", after: { projectId: project.id, title: source.name, type: "markdown", fileHash: source.hash, inlineContent: source.content } },
  { operationId: "constructor", op: "create", entity: "card", entityId: "excluded-local", after: { storyMapId: map.id, title: "Excluded activity", level: "activity" } },
  { operationId: "toString", op: "update", entity: "card", entityId: "excluded-local", after: { description: "Dependent edit must be excluded" } },
  { operationId: "source-link", op: "link", entity: "sourceLink", entityId: "excluded-source-link", after: { cardId: "excluded-local", kind: "chunk", chunk: { kind: "import", operationId: "__proto__", locator } } },
  { operationId: "keep", op: "create", entity: "card", entityId: "kept-local", after: { storyMapId: map.id, title: "Accepted activity", level: "activity" } }
];
const proposal = await request("/api/mcp/call", { name: "SubmitChangeSet", input: { projectId: project.id, title: "Epic4 remediation acceptance", operations, apply: false } });
const state = { base, project, map, proposal, operationCount: operations.length, databasePath: process.env.STORYMAPPER_DB_PATH };
writeFileSync("/tmp/epic4-remediation-browser-state.json", JSON.stringify(state, null, 2));
console.log(JSON.stringify({ ready: true, base, projectId: project.id, mapId: map.id, proposalId: proposal.changeSetId, outcome: proposal.outcome }));
process.on("SIGTERM", async () => { await server.close(); process.exit(0); });
