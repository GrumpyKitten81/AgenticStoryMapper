import type { ChangeOperation, SubmitChangeSetInput } from "@storymapper/contracts";

export function submissionOperations(input: SubmitChangeSetInput): ChangeOperation[] {
  return input.operations.map((operation) => ({ ...operation,
    ...(input.context ? { context: { ...input.context, ...operation.context } } : {}),
    ...(operation.sources === undefined && input.sources !== undefined ? { sources: input.sources } : {}),
    ...(operation.rationale === undefined && input.rationale !== undefined ? { rationale: input.rationale } : {})
  }));
}
