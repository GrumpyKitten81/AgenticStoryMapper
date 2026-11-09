import { DomainError } from "@storymapper/contracts";

export function requireEntity<T>(entity: T | undefined, name: string): T {
  if (entity === undefined) throw new DomainError("not_found", `${name} not found.`);
  return entity;
}

export function requirePatch(patch: object): void {
  if (!Object.values(patch).some((value) => value !== undefined)) throw new DomainError("validation", "At least one patch field is required.");
}
