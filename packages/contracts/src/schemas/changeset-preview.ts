import { z } from "zod";
import type { StoredChangeSet, StoryMapSnapshot } from "@storymapper/contracts/schemas/domain";
import type { ConflictEntry } from "@storymapper/contracts/schemas/conflicts";
import type { OperationDescription } from "@storymapper/contracts/schemas/operation-resolution";

export const changeSetPresentationStatusSchema = z.enum(["proposed", "approved", "applied", "rejected", "discarded", "stale", "conflict"]);
export type ChangeSetPresentationStatus = z.infer<typeof changeSetPresentationStatusSchema>;
export const changeSetPreviewQuerySchema = z.object({ selectedOperationIds: z.string().transform((value, context) => {
  try { return JSON.parse(value) as unknown; }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; context.addIssue({ code: "custom", message: "Selection must be a JSON array." }); return z.NEVER; }
}).pipe(z.array(z.string().trim().min(1)).refine((ids) => new Set(ids).size === ids.length, "Duplicate selected operation ID.")).optional() }).strict();
export interface ChangeSetPreviewOperation extends Omit<OperationDescription, "status"> {
  status: OperationDescription["status"] | "excluded" | "conflict" | "stale";
  operation: unknown;
  cause?: string;
}
export interface ChangeSetPreviewMarker {
  entity: string;
  entityId: string;
  kind: "added" | "changed" | "moved" | "removed";
  operationIds: string[];
}
export interface ChangeSetPreviewBoard { snapshot: StoryMapSnapshot; markers: ChangeSetPreviewMarker[]; }
export interface ChangeSetPreviewResponse {
  changeSet: StoredChangeSet;
  presentationStatus: ChangeSetPresentationStatus;
  closed: boolean;
  explanation?: string;
  selectedOperationIds: string[];
  operations: ChangeSetPreviewOperation[];
  conflicts: ConflictEntry[];
  boards: ChangeSetPreviewBoard[];
  canApprove: boolean;
  canApply: boolean;
}
export function changeSetPresentationStatus(changeSet: Pick<StoredChangeSet, "status" | "undoneByRestore" | "operationsSchemaVersion">): ChangeSetPresentationStatus {
  return changeSet.undoneByRestore ? "discarded" : changeSet.status;
}
