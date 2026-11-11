export const proposalStrings = {
  sourceMap: "Propose map from this document",
  sourceMapNeedsMap: "Open a Story Map first to propose map content from this document.",
  grooming: "Propose backlog grooming",
  releaseSlice: "Propose next release slice",
  created: (title: string): string => `ChangeSet proposed: ${title}. Review it before approval.`,
  review: "Review in Activity"
} as const;
