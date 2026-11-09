import { DomainError, type ConflictEntry } from "@storymapper/contracts";

export class ReleasePositionError extends DomainError {
  constructor(message: string) {
    super("validation", message);
  }
}

export class ChangeSetConflictError extends DomainError {
  readonly changeSetId: string;

  constructor(changeSetId: string, conflicts: ConflictEntry[]) {
    const keys = conflicts.map(({ current, id }) => (current as { key?: string } | null)?.key ?? id);
    super("conflict", `ChangeSet ${changeSetId} conflicts with newer changes on ${keys.join(", ")}.`, { changeSetId, keys }, conflicts);
    this.changeSetId = changeSetId;
  }
}
