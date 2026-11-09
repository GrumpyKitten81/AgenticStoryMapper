import type { ActivityChange, ActivityAffectedCard, ActivityProjectTarget } from "@storymapper/contracts";
import { actions, entities, fieldLabels, displayAuditValue, specialActivityActions, tools, reasons } from "@storymapper/web/ui-strings/activity-history";
import type { ChangeGroup } from "@storymapper/web/features/what-changed/model";

function label(labels: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(labels, key) ? labels[key] : undefined;
}

export function changeDescription(event: ActivityChange, card?: ActivityAffectedCard | ActivityProjectTarget): string {
  if (event.toolCall) return `${label(tools, event.toolCall.toolName) ?? "Agent request"}: ${event.toolCall.rejectionReason ? label(reasons, event.toolCall.rejectionReason) : event.toolCall.outcome === "error" ? "Failed" : "Blocked"}`;
  const action = card?.action ?? event.action;
  const changes = card?.changes ?? event.changes ?? [];
  const descriptions = action.endsWith(".created") || action.endsWith(".deleted") ? [actionDescription(action)] : changes.map((change) => {
    const field = label(fieldLabels, change.field) ?? "Field";
    return change.before === undefined && change.after === undefined ? `${field} changed` : `${field}: ${displayAuditValue(change.before)} → ${displayAuditValue(change.after)}`;
  });
  for (const action of card && "actions" in card ? card.actions ?? [] : []) descriptions.push(actionDescription(action));
  if (descriptions.length) return descriptions.join("; ");
  return actionDescription(action);
}

function actionDescription(action: string): string {
  if (action.startsWith("cardDependency.")) return action.endsWith("deleted") ? "Dependency removed" : "Dependency added";
  if (action.startsWith("card.dependency.")) return action.endsWith("unset") ? "Dependency removed" : "Dependency added";
  const [entity, verb] = action.split(".");
  const childLabels: Record<string, string> = { attachment: "Attachment", cardAttachment: "Attachment", cardPersona: "Persona assignment", cardAnnotation: "Annotation", sourceLink: "Source link", remoteWorkItemLink: "Work item link", githubLink: "GitHub link", externalRef: "External reference", cardDependency: "Dependency" };
  return label(specialActivityActions, action) ?? `${label(childLabels, entity!) ?? label(entities, entity!) ?? "Change"} ${label(actions, verb!) ?? "recorded"}`;
}

export function groupCardLabel(card: ActivityAffectedCard): string {
  return [card.key ?? card.navigation?.key, card.title].filter(Boolean).join(" · ") || "Card name not recorded";
}

export function groupDescription(group: ChangeGroup): string {
  const latest = group.events[0]!;
  const latestEvidence = groupEvidence(latest, group), latestAction = latestEvidence?.action ?? latest.action;
  if (latestAction.endsWith(".created") || latestAction.endsWith(".deleted")) return changeDescription(latest, latestEvidence);
  const fields = new Set(group.events.flatMap((event) => {
    const evidence = groupEvidence(event, group), action = evidence?.action ?? event.action;
    return action.endsWith(".created") || action.endsWith(".deleted") ? [] : (evidence?.changes ?? event.changes ?? []).map((change) => label(fieldLabels, change.field) ?? "Other fields");
  }));
  if (fields.size > 1) return `${[...fields].slice(0, 3).join(", ")}${fields.size > 3 ? ` and ${fields.size - 3} more fields` : ""} changed · ${group.events.length} change${group.events.length === 1 ? "" : "s"}`;
  return changeDescription(latest, groupEvidence(latest, group)).split("; ").slice(0, 2).join("; ");
}

export function groupEvidence(event: ActivityChange, group: ChangeGroup): ActivityAffectedCard | ActivityProjectTarget | undefined {
  return group.card ? event.cards?.find((card) => card.id === group.card!.id) : event.projectTargets?.find((target) => `project:${target.subject.type}:${target.subject.id}` === group.target);
}
