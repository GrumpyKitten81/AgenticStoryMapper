import { conflictResponseSchema, type ConflictEntry, type VersionConflictEntry } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";

export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class ConflictError extends Error {
  constructor(message: string, readonly conflicts: ConflictEntry[]) {
    super(message);
    this.name = "ConflictError";
  }
}

export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

export function conflictFor(error: unknown, id: string): VersionConflictEntry | undefined {
  return isConflictError(error) ? error.conflicts.find((entry): entry is VersionConflictEntry => entry.id === id && entry.reason !== "sync" && entry.currentVersion !== undefined) : undefined;
}

export function syncConflictsFor(error: unknown, id?: string): VersionConflictEntry[] {
  return isConflictError(error) ? error.conflicts.filter((entry): entry is VersionConflictEntry => (id === undefined || entry.id === id) && entry.reason === "sync" && entry.currentVersion !== undefined) : [];
}

export async function throwRequestFailure(response: Response): Promise<never> {
  if (response.status === 409) {
    const parsed = conflictResponseSchema.safeParse(await response.json());
    if (parsed.success) throw new ConflictError(parsed.data.message, parsed.data.conflicts);
  }
  throw new Error(strings.requestFailed(response.status));
}
