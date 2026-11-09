import type { ReactElement } from "react";
import { conflictStrings } from "@storymapper/ui-strings";

interface ChangeAlertProps {
  message: string;
  disabled?: boolean | undefined;
  onReload: () => void;
  onKeepMine: () => void;
}

export function ChangeAlert({ message, disabled, onReload, onKeepMine }: ChangeAlertProps): ReactElement {
  return (
    <div role="alert" className="conflict-alert">
      <span>{message}</span>
      <button type="button" className="secondary" disabled={disabled} onClick={onReload}>{conflictStrings.reload}</button>
      <button type="button" disabled={disabled} onClick={onKeepMine}>{conflictStrings.keepMine}</button>
    </div>
  );
}
