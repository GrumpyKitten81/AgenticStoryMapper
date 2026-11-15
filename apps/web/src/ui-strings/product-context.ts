export const productContextStrings = {
  open: "Agent context",
  title: "Agent context for this map",
  help: "Agents read this with GetProductContext before proposing changes, and Card readiness reviews use it. Your Agent can also fill it through UpsertProductContext.",
  sections: "Agent context sections",
  overview: "Overview",
  workingRules: "Working rules",
  workingRulesHelp: "Advisory guidance for agents and contributors on this map. For example: Do not modify existing Epics. These rules do not change approvals or GitHub confirmation.",
  workingRulesExample: "Example: Do not modify existing Epics. Link decisions to source evidence.",
  copyMap: "Copy Story Map name and ID",
  purpose: "Purpose", keyFeatures: "Key features (one per line)", targetUsers: "Target users", nonGoals: "Non-goals",
  more: "More context",
  productType: "Product type", platform: "Platform", pricing: "Pricing", complianceConstraints: "Compliance", glossary: "Glossary", notes: "Notes",
  save: "Save context", close: "Close",
  saved: "Agent context saved.",
  saveFailed: "Agent context save failed."
} as const;
