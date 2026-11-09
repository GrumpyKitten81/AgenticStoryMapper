import type { ActivitySummary } from "@storymapper/contracts";
import { auditStrings as strings, restorePointStrings } from "@storymapper/ui-strings";
import { entities, actions, tools, reasons, fieldLabels, activityHistoryCopy as copy, displayAuditValue, specialActivityActions } from "@storymapper/web/ui-strings/activity-history";
import { formatLocalDateTime } from "@storymapper/web/app/format-date-time";


function ownLabel(labels: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(labels, key) ? labels[key] : undefined;
}

function title(event: ActivitySummary): string {
  if (event.toolCall) return ownLabel(tools, event.toolCall.toolName) ?? copy.toolExecution;
  if (ownLabel(specialActivityActions, event.action)) return ownLabel(specialActivityActions, event.action)!;
  const [entity, action] = event.action.split(".");
  return ownLabel(entities, entity!) && ownLabel(actions, action!) ? `${ownLabel(entities, entity!)} ${ownLabel(actions, action!)}` : copy.unknownAction;
}

export function ActivityEntry({ event }: { event: ActivitySummary }) {
  const call = event.toolCall;
  const subject = event.subject;
  const changes = event.changes ?? [];
  return <li className="activity-event" data-outcome={call?.outcome}>
    <header className="activity-event-heading"><strong>{title(event)}</strong><time dateTime={event.createdAt}>{formatLocalDateTime(event.createdAt)}</time></header>
    <div className="activity-event-meta"><span>{copy.actor(strings.actors[event.actorType], event.actor)}</span><span>{call ? strings.outcomes[call.outcome] : copy.recorded}</span><span>{event.scope === "runtime" ? strings.runtime : strings.project}</span></div>
    {subject ? <p>{copy.subject(subject.key, subject.name)}</p> : event.affectedEntityId && !call ? <p>{copy.nameNotRecorded}</p> : null}
    {call?.affectedEntityIds.length ? <p>{copy.objectCount(call.affectedEntityIds.length)}</p> : null}
    {changes.slice(0, 3).map((change) => <p key={change.field}>{copy.change(ownLabel(fieldLabels, change.field) ?? change.field, displayAuditValue(change.before), displayAuditValue(change.after))}</p>)}
    {changes.length > 3 ? <details><summary>{copy.moreChanges(changes.length - 3)}</summary>{changes.slice(3).map((change) => <p key={change.field}>{copy.change(ownLabel(fieldLabels, change.field) ?? change.field, displayAuditValue(change.before), displayAuditValue(change.after))}</p>)}</details> : null}
    {call?.rejectionReason ? <p>{reasons[call.rejectionReason]}</p> : null}
    {event.undoneByRestore ? <p className="activity-undone">{restorePointStrings.undone}</p> : null}
    <ActivityTechnicalDetails event={event} />
  </li>;
}

function ActivityTechnicalDetails({ event }: { event: ActivitySummary }) {
  const call = event.toolCall;
  const objects = [...new Set([...(event.affectedEntityId ? [`${event.affectedEntityType ?? ""}:${event.affectedEntityId}`] : []), ...(call?.affectedEntityIds ?? [])])];
  return <details className="audit-technical-details"><summary>{copy.technical}</summary>
    <p>{copy.event(event.id)}</p><p>{copy.action(event.action)}</p><p>{strings.actor(strings.actors[event.actorType], event.actor)}</p><p>{copy.utc(event.createdAt)}</p>
    {call ? <p>{copy.tool(call.toolName)}</p> : null}
    {event.mcpSessionId ? <p>{strings.session(event.mcpSessionId)}</p> : null}
    {objects.length ? <p>{strings.affected(objects)}</p> : null}
    {call ? <><p>{strings.inputHash(call.inputHash)}</p><p>{strings.outputHash(call.outputHash)}</p></> : null}
    {call?.rejectionReason ? <p>{copy.reason(call.rejectionReason)}</p> : null}
    {call?.errorId ? <p>{strings.errorId(call.errorId)}</p> : null}
  </details>;
}
