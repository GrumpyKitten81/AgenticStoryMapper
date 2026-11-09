import { z } from "zod";

export const builtinProposalTemplateSchema = z.enum([
  "prd-to-map", "personas", "goals-steps-stories", "story-writing", "acceptance-criteria", "test-cases",
  "invest", "spidr-split", "effort-estimate", "gap-analysis", "release-slice"
]);
