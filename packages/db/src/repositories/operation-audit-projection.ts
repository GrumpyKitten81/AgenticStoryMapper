import { isDeepStrictEqual } from "node:util";
import type { ResolvedEntityChange, SourcePlanBaseline } from "@storymapper/contracts";

export function operationAuditChanges(changes: readonly ResolvedEntityChange[]): ResolvedEntityChange[] {
  return changes.map((change) => {
    if (change.entity !== "sourcePlanBaseline") return change;
    const entries = changedIds(change.before?.entries ?? [], change.after?.entries ?? [], (entry) => entry.cardId);
    const releases = changedIds(change.before?.releases ?? [], change.after?.releases ?? [], (release) => release.id);
    return { ...change, evidenceScope: "addressedEntries", ...(change.before ? { before: addressedEvidence(change.before, entries, releases) } : {}),
      ...(change.after ? { after: addressedEvidence(change.after, entries, releases) } : {}) };
  });
}

function changedIds<T>(before: readonly T[], after: readonly T[], identity: (entry: T) => string): Set<string> {
  const left = new Map(before.map((entry) => [identity(entry), entry])), right = new Map(after.map((entry) => [identity(entry), entry]));
  return new Set([...new Set([...left.keys(), ...right.keys()])].filter((id) => !isDeepStrictEqual(left.get(id), right.get(id))));
}

function addressedEvidence(baseline: SourcePlanBaseline, entries: ReadonlySet<string>, releases: ReadonlySet<string>): SourcePlanBaseline {
  return { ...baseline, entries: baseline.entries.filter((entry) => entries.has(entry.cardId)), releases: baseline.releases.filter((release) => releases.has(release.id)) };
}
