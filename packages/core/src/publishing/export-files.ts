import type { ActivityEvent, SafetySettings, Project, StoryMapExportFormat, StoryMapSnapshot, TextExportFile } from "@storymapper/contracts";
import { buildStoryMapCsv, buildStoryMapMarkdown, buildAuditMarkdown, summarizeActivity } from "@storymapper/core";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildStoryMapExport(snapshot: StoryMapSnapshot, format: StoryMapExportFormat, exportedAt: string): TextExportFile {
  const baseName = `${slugify(snapshot.storyMap.name)}-story-map`;
  if (format === "json") return { fileName: `${baseName}.json`, contentType: "application/json; charset=utf-8", content: JSON.stringify({ exportedAt, formatVersion: 1, snapshot }, null, 2) };
  if (format === "csv") return { fileName: `${baseName}.csv`, contentType: "text/csv; charset=utf-8", content: buildStoryMapCsv(snapshot) };
  return { fileName: `${baseName}.md`, contentType: "text/markdown; charset=utf-8", content: buildStoryMapMarkdown(snapshot, exportedAt) };
}

export function buildAuditExport(project: Project, settings: SafetySettings, events: ActivityEvent[], format: "json" | "markdown", exportedAt: string): TextExportFile {
  const baseName = `${slugify(project.name)}-audit`;
  if (format === "json") return { fileName: `${baseName}.json`, contentType: "application/json; charset=utf-8", content: JSON.stringify({ exportedAt, project: { id: project.id, name: project.name }, settings, events: events.map(summarizeActivity) }, null, 2) };
  return { fileName: `${baseName}.md`, contentType: "text/markdown; charset=utf-8", content: buildAuditMarkdown(project, settings, events, exportedAt) };
}
