import type { ChangeSetCommandResponse } from "@storymapper/contracts";

export function commandResponse(changeSet: ChangeSetCommandResponse["changeSet"]): ChangeSetCommandResponse {
  return { changeSet, outcome: changeSet.status === "applied" ? "applied" : "proposed", changeSetId: changeSet.id, previewRef: { changeSetId: changeSet.id } };
}
