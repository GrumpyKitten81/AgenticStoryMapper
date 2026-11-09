import type { VersionConflictEntry } from "@storymapper/contracts";
import type { ReactElement } from "react";
import { conflictFor, syncConflictsFor, isConflictError } from "@storymapper/web/app/conflicts";
import { SyncConflictNotice } from "@storymapper/web/features/github-sync";
import { ChangeAlert } from "@storymapper/web/features/conflicts/ChangeAlert";
import { conflictStrings } from "@storymapper/ui-strings";

interface ConflictAlertProps {
  error: unknown;
  entityId: string;
  name: string;
  disabled?: boolean;
  includeDependentSync?: boolean;
  onReload: (conflict: VersionConflictEntry) => void;
  onKeepMine: (conflict: VersionConflictEntry) => void;
}

export function ConflictAlert({ error, entityId, name, disabled, includeDependentSync, onReload, onKeepMine }: ConflictAlertProps): ReactElement | null {
  const conflict = conflictFor(error, entityId);
  const sync = syncConflictsFor(error, includeDependentSync ? undefined : entityId);
  if (!conflict && sync.length === 0) return isConflictError(error) ? <p role="alert">{error.message}</p> : null;
  return <>{conflict ? <ChangeAlert message={conflictStrings.changed(name)} disabled={disabled} onReload={() => onReload(conflict)} onKeepMine={() => onKeepMine(conflict)} /> : null}
    {sync.map((entry, index) => <div role="alert" key={entry.syncConflictId ?? index}><SyncConflictNotice current={entry.current} /></div>)}</>;
}
