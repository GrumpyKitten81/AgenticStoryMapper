import { createHash } from "node:crypto";
import { DomainError } from "@storymapper/contracts";
import type { Card, CardHistorySnapshot, CardLevel, ConnectorConnection } from "@storymapper/contracts";
import { labelsForSyncStatus as labelsForStatus, stateForSyncStatus as stateForStatus, stripGitHubMilestoneMarker } from "@storymapper/core";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export { labelsForStatus, stateForStatus };

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export interface ImportRemoteWorkItem {
  remoteId: string;
  remoteNumber?: number | undefined;
  title: string;
  body: string;
  url: string;
  state: string;
  labels: string[];
  milestone?: string | undefined;
  milestoneDueOn?: string | undefined;
  milestoneDescription?: string | undefined;
  milestoneState?: string | undefined;
  assignee?: string | undefined;
  issueType?: string | undefined;
  parentNumber?: number | undefined;
  iteration?: { title: string; startDate?: string | undefined; duration?: number | undefined } | undefined;
}

export function detectImportLevel(connection: ConnectorConnection, item: ImportRemoteWorkItem): CardLevel {
  const candidates = [item.issueType, ...item.labels]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  for (const entry of connection.typeMapping) {
    if (candidates.includes(entry.match.toLowerCase())) return entry.level;
  }
  return "story";
}

export function importReleaseSource(
  connection: ConnectorConnection,
  item: ImportRemoteWorkItem
): { name: string; goal: string; released: boolean; startDate?: string | undefined; releaseDate?: string | undefined } | undefined {
  if (connection.releaseSource === "milestone" && item.milestone) {
    if (typeof item.milestoneDescription !== "string" || !["open", "closed"].includes(item.milestoneState ?? "")) throw new DomainError("validation", "Remote Milestone description/state evidence is incomplete.");
    return { name: item.milestone, goal: stripGitHubMilestoneMarker(item.milestoneDescription), released: item.milestoneState === "closed", releaseDate: item.milestoneDueOn?.slice(0, 10) };
  }
  if (connection.releaseSource === "iteration" && item.iteration) {
    const startDate = item.iteration.startDate?.slice(0, 10);
    return {
      name: item.iteration.title,
      goal: "",
      released: false,
      startDate,
      releaseDate: startDate && item.iteration.duration ? addDays(startDate, item.iteration.duration) : undefined
    };
  }
  return undefined;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function remoteStateToLocalStatus(connection: ConnectorConnection, state: string, labels: string[]): string {
  const labelMatch = connection.statusMapping.find((entry) => entry.labels.some((label) => labels.includes(label)));
  if (labelMatch) return labelMatch.localStatus;
  const stateMatches = connection.statusMapping.filter((entry) => entry.remoteState.toLowerCase() === state.toLowerCase());
  if (stateMatches.length === 1) return stateMatches[0]!.localStatus;
  return state.toLowerCase() === "closed" || state.toLowerCase() === "done" ? "done" : "todo";
}

export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainError("validation", "ChangeSet operation payload must be an object.");
  }
  return value as Record<string, unknown>;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError("validation", `ChangeSet field ${field} must be a non-empty string.`);
  }
  return value;
}

export function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new DomainError("validation", "ChangeSet field must be a string.");
  }
  return value;
}

export function asOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new DomainError("validation", "ChangeSet field must be a string array.");
  }
  return value;
}

export function asOptionalStringOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new DomainError("validation", "ChangeSet field must be a string or null.");
  }
  return value;
}

export function changedCardFields(before: Card | CardHistorySnapshot, after: Card | CardHistorySnapshot): string[] {
  const fields: Array<keyof Card> = [
    "provenance",
    "cardType",
    "title",
    "description",
    "status",
    "parked",
    "priority",
    "businessValue",
    "effort",
    "estimate",
    "color",
    "assignee",
    "releaseId",
    "parentId",
    "position"
  ];
  return fields.filter((field) => (before[field] ?? null) !== (after[field] ?? null));
}

export function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError("validation", "ChangeSet field must be a finite number.");
  }
  return value;
}

export function asCardLevel(value: unknown): CardLevel {
  if (value === "activity" || value === "step" || value === "story" || value === "note") {
    return value;
  }
  throw new DomainError("validation", "ChangeSet card.level must be activity, step, story or note.");
}

export function resolveId(value: string, idMap: Map<string, string>): string {
  return idMap.get(value) ?? value;
}

export function resolveOptionalId(value: unknown, idMap: Map<string, string>): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return resolveId(asString(value, "id reference"), idMap);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function daysBetween(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) / 86_400_000));
}
