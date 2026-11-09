import type { RemotePushEffect, RemotePushItemExecution } from "@storymapper/contracts";

const actions = { create: "Create", update: "Update" } satisfies Record<RemotePushEffect["action"], string>;
const kinds = { issue: "Issue", milestone: "Milestone" } satisfies Record<RemotePushEffect["kind"], string>;

export const remotePushStrings = {
  title: "GitHub Dry Run",
  savedPlanId: "Saved Dry Run plan id",
  readPlan: "Load saved Dry Run",
  confirm: "Confirm exact Dry Run",
  cancel: "Cancel Dry Run",
  resume: "Resume and reconcile this plan",
  result: "Remote effect results",
  issueType: "Native Issue type",
  dependencies: "Dependencies",
  addLabels: "Add labels",
  removeLabels: "Remove labels",
  exclusions: "Excluded Cards",
  blockers: "Resolve before preparing a new Dry Run",
  outboundMapping: "Outbound native Issue types",
  mappingHint: "Enter repository Issue type names for each explicit Card type. Existing connections require explicit remapping. Dry Run verifies availability and permissions.",
  reviewRequired: "Review every effect before confirming this plan.",
  open: "Open remote item",
  completed: "All reviewed remote effects completed.",
  interrupted: "Execution stopped. Earlier remote effects remain applied; explicitly resume to reconcile unfinished effects.",
  scopeChanged: "The scope or database changed. Prepare a new Dry Run.",
  effectTitle: (action: RemotePushEffect["action"], kind: RemotePushEffect["kind"], title: string): string => `${actions[action]} ${kinds[kind]}: ${title}`,
  detail: (label: string, value: string): string => `${label}: ${value}`,
  listDetail: (label: string, values: string[]): string => `${label}: ${values.join(", ")}`,
  remoteStates: { open: "Open", closed: "Closed" },
  executionStates: {
    not_attempted: "Not attempted",
    intent: "Intent recorded",
    remote_succeeded: "Remote write succeeded; local update pending",
    local_failed: "Remote write succeeded; local update failed",
    succeeded: "Succeeded",
    failed: "Failed",
    uncertain: "Outcome uncertain"
  } satisfies Record<RemotePushItemExecution["state"], string>
} as const;
