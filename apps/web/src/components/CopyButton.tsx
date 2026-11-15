import { useState, type ReactElement, type ReactNode } from "react";
import { copyStrings as strings } from "@storymapper/web/ui-strings/copy";

export function CopyButton({ text, children, className = "secondary", title, ariaLabel, statusClassName }: { text: string; children: ReactNode; className?: string; title?: string; ariaLabel?: string; statusClassName?: string }): ReactElement {
  const [status, setStatus] = useState("");
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(strings.copied);
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
      setStatus(strings.copyFailed);
    }
  }
  return <span className="button-row">
    <button type="button" className={className} title={title} aria-label={ariaLabel} onClick={() => { void copy(); }}>{children}</button>
    <span role="status" className={statusClassName}>{status}</span>
  </span>;
}
