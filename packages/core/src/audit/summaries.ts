import { toolCallMetadataSchema, type ActivityEvent, type ActivitySummary } from "@storymapper/contracts";
import { summarizeActivitySubject } from "@storymapper/core/audit/subjects";

export function summarizeActivity(event: ActivityEvent): ActivitySummary {
  const { before: _before, after, ...metadata } = event;
  const toolCall = event.action === "tool_call" ? toolCallMetadataSchema.parse(after) : undefined;
  return { ...metadata, scope: event.projectId ? "project" : "runtime", ...(toolCall ? { toolCall } : summarizeActivitySubject(event)) };
}
