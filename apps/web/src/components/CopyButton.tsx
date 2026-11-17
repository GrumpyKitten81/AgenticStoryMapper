import { useState, type ReactElement, type ReactNode } from "react";
import { copyStrings as strings } from "@storymapper/web/ui-strings/copy";

export function CopyButton({ text, children, className = "secondary", title, ariaLabel, statusClassName }: { text: string; children: ReactNode; className?: string; title?: string; ariaLabel?: string; statusClassName?: string }): ReactElement {
  const [status, setStatus] = useState({ message: "", sequence: 0 });
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(({ sequence }) => ({ message: strings.copied, sequence: sequence + 1 }));
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
      setStatus(({ sequence }) => ({ message: strings.copyFailed, sequence: sequence + 1 }));
    }
  }
  return <span className="button-row">
    <button type="button" className={className} title={title} aria-label={ariaLabel} onClick={() => { void copy(); }}>{children}</button>
    <span role="status" className={statusClassName}>{status.message ? <span key={status.sequence}>{status.message}</span> : null}</span>
  </span>;
}
