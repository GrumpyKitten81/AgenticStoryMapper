import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { changeOperationSchema, type ChangeOperation, type SourceDocumentDetails, type StoryMapSnapshot } from "@storymapper/contracts";
import { splitMarkdownIntoChunks } from "@storymapper/importers";

export type SourceRecording = Pick<SourceDocumentDetails, "document" | "chunks">;
export type Recording = "initial" | "refresh" | "renumber" | "evidence";
export interface RecordedFile { name: string; type: "markdown" | "txt"; content: string; hash: string }
export function recordedFiles(recording: Recording): RecordedFile[] {
  const stories = readdirSync(new URL(`./${recording}/stories/`, import.meta.url)).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((name) => `stories/${name}`);
  return ["epics.md", ...stories, "sprint.txt"].map((name) => {
    const content = readFileSync(new URL(`./${recording}/${name}`, import.meta.url), "utf8");
    return { name, type: name.endsWith(".md") ? "markdown" : "txt", content, hash: createHash("sha256").update(content).digest("hex") };
  });
}

export function composePublication(projectId: string, snapshot: StoryMapSnapshot, recording: Recording, documents: SourceRecording[], ownedEvidenceIds: ReadonlySet<string>): ChangeOperation[] {
  return composeRecordedFiles(projectId, snapshot, recordedFiles(recording), documents, ownedEvidenceIds);
}
export function composeRecordedFiles(projectId: string, snapshot: StoryMapSnapshot, files: RecordedFile[], documents: SourceRecording[], ownedEvidenceIds: ReadonlySet<string>): ChangeOperation[] {
  const operations: ChangeOperation[] = files.map((file, index) => changeOperationSchema.parse({ operationId: `import-${index}`, op: "import", entity: "sourceDocument", entityId: `source-local-${index}`, after: { projectId, title: file.name, type: file.type, inlineContent: file.content, fileHash: file.hash } }));
  const storyReleases = composeSlices(operations, snapshot, files.at(-1)!.content);
  const owned = new Set<string>();
  for (const publication of recordedPublications(files)) {
    const { kind, id, title, description, fileIndex, locators } = publication;
    const ids = kind === "Epic" ? [`epic-${id}`, `step-${id}`] : [`story-${id}`];
    for (const externalId of ids) {
      if (owned.has(externalId)) throw new Error(`Duplicate explicit publication ID ${externalId}.`);
      owned.add(externalId);
      const level = externalId.startsWith("epic-") ? "activity" : externalId.startsWith("step-") ? "step" : "story";
      publishCard(operations, snapshot, { externalId, title, description, level, parentId: level === "activity" ? null : level === "step" ? `local-epic-${id}` : `local-step-${id.split(".")[0]}`, ...(level === "story" ? { releaseId: storyReleases.get(id) ?? null } : {}) });
      replaceEvidence(operations, snapshot, documents, ownedEvidenceIds, externalId, fileIndex, locators, files[fileIndex]!.hash);
    }
  }
  for (const ref of snapshot.externalRefs.filter((ref) => ref.entityType === "card" && ref.system === "bmad" && ref.scopeId === snapshot.storyMap.id && !owned.has(ref.externalId))) {
    const card = snapshot.cards.find((card) => card.id === ref.entityId)!;
    if (!card.archived) operations.push(changeOperationSchema.parse({ operationId: `archive-${ref.externalId}`, op: "archive", entity: "card", entityId: card.id, selector: selector(snapshot, ref.externalId), baseVersion: ref.syncedVersion, after: {} }));
  }
  return operations;
}
export function recordedPublications(files: RecordedFile[]) {
  return files.slice(0, -1).flatMap((file, fileIndex) => {
    const content = file.content.replace(/\r\n?/g, "\n");
    const headings = rootHeadings(content);
    const chunks = splitMarkdownIntoChunks(content);
    return headings.flatMap((heading, index) => {
      const publication = heading.title.match(/^(Epic|Story) (\d+(?:\.\d+)?): (.+)$/);
      if (!publication) return [];
      const [, kind, id, title] = publication;
      const description = content.slice(heading.end, headings[index + 1]?.start).trim();
      const locatorHeading = heading.title;
      const locators = chunks.filter((chunk) => chunk.heading === locatorHeading || chunk.heading?.startsWith(`${locatorHeading} > `)).map((chunk) => chunk.locator);
      if (!description || !locators.length) throw new Error(`Publication ${id} has no source content.`);
      return { kind: kind!, id: id!, title: title!, description, fileIndex, locators };
    });
  });
}
function rootHeadings(content: string): Array<{ title: string; start: number; end: number }> {
  const headings: Array<{ title: string; start: number; end: number }> = [];
  let fence: { marker: string; length: number } | undefined;
  let start = 0;
  for (const line of content.split("\n")) {
    const end = start + line.length;
    const fenceLine = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (fenceLine && fenceLine[1]![0] === fence.marker && fenceLine[1]!.length >= fence.length && !fenceLine[2]!.trim()) fence = undefined;
    } else if (fenceLine) {
      fence = { marker: fenceLine[1]![0]!, length: fenceLine[1]!.length };
    } else {
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      if (heading?.[1] === "#") headings.push({ title: heading[2]!.trim(), start, end });
    }
    start = end + 1;
  }
  return headings;
}
function composeSlices(operations: ChangeOperation[], snapshot: StoryMapSnapshot, content: string): Map<string, string> {
  const memberships = new Map<string, string>();
  const releases = new Set<string>();
  for (const [index, line] of content.trim().split("\n").entries()) {
    const [id, name, stories] = line.split("|");
    if (!id || !name || stories === undefined || releases.has(id)) throw new Error("Slice identities must be explicit and unique.");
    releases.add(id);
    const externalId = `release-${id}`;
    operations.push(changeOperationSchema.parse({ operationId: `publish-${externalId}`, op: "upsert", entity: "release", entityId: `local-${externalId}`, selector: selector(snapshot, externalId), after: { storyMapId: snapshot.storyMap.id, name, position: index } }));
    for (const story of stories ? stories.split(",") : []) {
      if (memberships.has(story)) throw new Error(`Duplicate slice membership for Story ${story}.`);
      memberships.set(story, `local-${externalId}`);
    }
  }
  return memberships;
}

function selector(snapshot: StoryMapSnapshot, externalId: string) { return { kind: "externalRef", scopeId: snapshot.storyMap.id, system: "bmad", externalId }; }
interface PublicationCard { externalId: string; title: string; description: string; level: "activity" | "step" | "story"; parentId: string | null; releaseId?: string | null }
function publishCard(operations: ChangeOperation[], snapshot: StoryMapSnapshot, input: PublicationCard): void {
  const { externalId, ...after } = input;
  operations.push(changeOperationSchema.parse({ operationId: `publish-${externalId}`, op: "upsert", entity: "card", entityId: `local-${externalId}`, selector: selector(snapshot, externalId), after: { storyMapId: snapshot.storyMap.id, ...after } }));
}
function replaceEvidence(operations: ChangeOperation[], snapshot: StoryMapSnapshot, documents: SourceRecording[], ownedEvidenceIds: ReadonlySet<string>, externalId: string, fileIndex: number, locators: string[], hash: string): void {
  const cardId = snapshot.externalRefs.find((ref) => ref.scopeId === snapshot.storyMap.id && ref.entityType === "card" && ref.system === "bmad" && ref.externalId === externalId)?.entityId;
  for (const link of snapshot.sourceLinks.filter((link) => link.cardId === cardId && link.kind === "chunk")) {
    if (link.kind !== "chunk") continue;
    const document = documents.find((doc) => doc.chunks.some((chunk) => chunk.id === link.chunkId));
    if (document && ownedEvidenceIds.has(link.id) && document.document.fileHash !== hash) operations.push(changeOperationSchema.parse({ operationId: `unlink-${externalId}-${link.id}`, entityId: link.id, op: "unlink", entity: "sourceLink", after: { cardId: `local-${externalId}`, kind: "chunk", id: link.id } }));
  }
  for (const [index, locator] of locators.entries()) operations.push(changeOperationSchema.parse({ operationId: `link-${externalId}-${index}`, op: "link", entity: "sourceLink", entityId: `evidence-local-${externalId}-${index}`, after: { kind: "chunk", cardId: `local-${externalId}`, chunk: { kind: "import", operationId: `import-${fileIndex}`, locator } } }));
}
