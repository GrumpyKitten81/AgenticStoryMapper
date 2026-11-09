import type { CardLevel } from "@storymapper/contracts";

export const levelDescriptionTemplates = {
  activity: "## User goal\n\n\n## Scope and boundaries\n\n\n## Observable outcome\n\n",
  step: "## User action\n\n\n## Context in the journey\n\n\n## Observable result\n\n",
  story: "## User need\n\n\n## Small deliverable\n\n\n## Acceptance criteria\n\n- [ ] \n"
} satisfies Record<Exclude<CardLevel, "note">, string>;
