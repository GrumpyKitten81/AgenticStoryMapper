import type { AiFunctionTemplate } from "@storymapper/contracts";

export const defaultAiFunctionTemplates: Omit<AiFunctionTemplate, "projectId">[] = [
  {
    arguments: [],
    examples: [],
    id: "prd-to-map",
    name: "PRD to Story Map",
    instructions: "Create activities, steps and stories from source chunks. Return a proposed ChangeSet only."
  },
  {
    arguments: [],
    examples: [],
    id: "personas",
    name: "Personas",
    instructions: "Brainstorm local personas from Product Context. Return a proposed ChangeSet only."
  },
  {
    arguments: [],
    examples: [],
    id: "goals-steps-stories",
    name: "Goals, Steps and Stories",
    instructions: "Create goals, journey steps and stories from Product Context and source chunks."
  },
  {
    arguments: [],
    examples: [],
    id: "acceptance-criteria",
    name: "Acceptance Criteria",
    instructions: "Draft concise acceptance criteria for a selected story using linked source chunks."
  },
  {
    arguments: [],
    examples: [],
    id: "release-slice",
    name: "Release Slice",
    instructions: "Suggest an MVP release slice and explain which source requirements it covers."
  },
  {
    arguments: [],
    examples: [],
    id: "backlog-grooming",
    name: "Backlog Grooming",
    instructions: "Find thin stories, missing estimates, missing source links and unclear descriptions. Return a proposed ChangeSet only."
  },
  {
    arguments: [],
    examples: [],
    id: "test-cases",
    name: "Test Cases",
    instructions: "Add concise test cases to selected stories."
  },
  {
    arguments: [],
    examples: [],
    id: "invest",
    name: "INVEST Check",
    instructions: "Add an INVEST check and highlight follow-up risks."
  },
  {
    arguments: [],
    examples: [],
    id: "spidr-split",
    name: "SPIDR Split",
    instructions: "Suggest SPIDR splitting guidance for selected stories."
  },
  {
    arguments: [],
    examples: [],
    id: "effort-estimate",
    name: "Effort Estimate",
    instructions: "Propose initial estimates for unestimated stories."
  },
  {
    arguments: [],
    examples: [],
    id: "gap-analysis",
    name: "Gap Analysis",
    instructions: "Compare product context, source coverage and story map contents. Mark gaps as proposed card updates or new cards."
  },
  {
    arguments: [],
    examples: [],
    id: "story-writing",
    name: "Story Writing",
    instructions: "Rewrite selected stories with user value, acceptance criteria, open questions and constraints. Return a proposed ChangeSet only."
  }
];
