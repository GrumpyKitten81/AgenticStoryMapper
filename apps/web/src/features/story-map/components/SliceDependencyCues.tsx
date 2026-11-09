import type { ReactElement } from "react";
import type { SliceDependencyCue } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function sliceCuesByCard(cues: SliceDependencyCue[]): Map<string, SliceDependencyCue[]> {
  const result = new Map<string, SliceDependencyCue[]>();
  for (const cue of cues) { const group = result.get(cue.cardId) ?? []; group.push(cue); result.set(cue.cardId, group); }
  return result;
}

export function SliceDependencyCues({ cues }: { cues: SliceDependencyCue[] }): ReactElement {
  const order = cues.filter((cue) => cue.blockedOrder).map((cue) => cue.prerequisite.key);
  const open = cues.filter((cue) => cue.open).map((cue) => cue.prerequisite.key);
  return <div className="slice-dependency-cues">
    {order.length ? <p className="slice-order-violation">{strings.blockedOrder(order)}</p> : null}
    {open.length ? <p>{strings.openPrerequisites(open)}</p> : null}
  </div>;
}
