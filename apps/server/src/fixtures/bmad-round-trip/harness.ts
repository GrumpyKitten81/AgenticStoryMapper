import { agentProtected } from "@storymapper/core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { changeSetCommandResponseSchema, sourceDocumentDetailsSchema, storyMapSnapshotSchema, type LiveTransaction } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { composePublication, composeRecordedFiles, recordedFiles, type RecordedFile, type Recording, type SourceRecording } from "@storymapper/server/fixtures/bmad-round-trip/composer";

import { approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

import { requestedEvidenceIds } from "@storymapper/server/fixtures/bmad-round-trip/ownership";

export const human = { actorType: "human", actorId: "round-trip-fixture" } as const;
export async function roundTripFixture(protectedProject = false) {
  const runtime = await createRoundTripRuntime(protectedProject);
  const { directory, path, handle, repository, unitOfWork, live, rows, server, base, client, transport } = runtime;
  const ownedEvidenceIds = new Set<string>();
  let publicationFiles: RecordedFile[] = [];
  let requestedEvidence: ReturnType<typeof composePublication> = [];
  const immutableDocuments = new Map<string, SourceRecording>();
  const call = createFixtureCall(base, client);
  const read = createSourceReader(call, rows, immutableDocuments);
  async function publication(surface: string, recording: Recording, apply = true, files = recordedFiles(recording)) {
    const { snapshot, documents } = await read(surface);
    const operations = composeRecordedFiles(rows.project.id, snapshot, files, documents, ownedEvidenceIds);
    publicationFiles = files;
    requestedEvidence = operations;
    const result = await call(surface, { projectId: rows.project.id, title: `Synthetic ${recording}`, operations, ...(apply ? {} : { apply: false }) });
    if (result.outcome === "proposed" && apply && !agentProtected(repository.getSafetySettings(rows.project.id))) {
      approveChangeSet({ repository, unitOfWork }, human, result.changeSetId);
      const applied = await call(surface, { changeSetId: result.changeSetId, approvalToken: "recorded" }, "ApplyChangeSet");
      return { result: { ...result, outcome: "applied", changeSet: applied.changeSet }, operations };
    }
    return { result, operations };
  }
  async function rememberSources(surface: string, _recording: Recording): Promise<void> {
    const { snapshot, documents } = await read(surface);
    for (const id of requestedEvidenceIds(snapshot, documents, publicationFiles, requestedEvidence)) ownedEvidenceIds.add(id);
  }

  async function reviewedApply(id: string) {
    for (const action of ["approve", "apply"]) {
      const response = await fetch(`${base}/api/changesets/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.text();
      if (!response.ok) throw new Error(`${action} failed: ${body}`);
    }
  }
  async function close(): Promise<void> { await transport.terminateSession(); await client.close(); await server.close(); if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); }
  live.length = 0;
  return { directory, path, handle, repository, unitOfWork, server, client, base, transport, live, call, read, publication, rememberSources, reviewedApply, close, ...rows };
}
export type RoundTripFixture = Awaited<ReturnType<typeof roundTripFixture>>;
export function publicationResult(result: unknown) { return changeSetCommandResponseSchema.parse(result); }

async function createRoundTripRuntime(protectedProject: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-bmad-round-trip-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const live: LiveTransaction[] = [];
  unitOfWork.subscribe((event) => live.push(event));
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Synthetic acceptance" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Synthetic map" });
    const otherMap = repository.createStoryMap({ projectId: project.id, name: "Other map" });
    repository.createWorkflowStatus({ projectId: project.id, name: "Review", group: "active", color: "blue" });
    repository.createWorkflowStatus({ projectId: project.id, name: "Verified", group: "done", color: "green" });
    repository.updateSafetySettings(project.id, { agentMode: protectedProject ? "propose" : "apply" });
    return { project, map, otherMap };
  });
  const server = Fastify();
  await server.register(createRoutes, { repository, unitOfWork, databasePath: path });
  registerMcpHttp(server, repository, unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "round-trip-sdk-host", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  return { directory, path, handle, repository, unitOfWork, live, rows, server, base, client, transport };
}

function createFixtureCall(base: string, client: Client) {
  async function call(surface: string, input: unknown, name = "SubmitChangeSet") {
    if (surface === "http") {
      const response = await fetch(`${base}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) });
      return response.json();
    }
    const result = await client.callTool({ name, arguments: input as Record<string, unknown> });
    return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
  }
  return call;
}

function createSourceReader(call: ReturnType<typeof createFixtureCall>, rows: Awaited<ReturnType<typeof createRoundTripRuntime>>["rows"], immutableDocuments: Map<string, SourceRecording>) {
  async function read(surface: string) {
    const snapshot = storyMapSnapshotSchema.parse((await call(surface, { storyMapId: rows.map.id }, "GetStoryMapSnapshot")).data);
    const listed = (await call(surface, { projectId: rows.project.id }, "ListSourceDocuments")).data.documents as Array<{ id: string }>;
    const documents: SourceRecording[] = [];
    for (const document of listed) {
      if (!immutableDocuments.has(document.id)) {
        const { document: source, chunks } = sourceDocumentDetailsSchema.parse((await call(surface, { documentId: document.id }, "GetSourceDocument")).data);
        immutableDocuments.set(document.id, { document: source, chunks });
      }
      documents.push(immutableDocuments.get(document.id)!);
    }
    return { snapshot, documents };
  }
  return read;
}
