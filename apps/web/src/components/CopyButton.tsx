import { useState, type ReactElement, type ReactNode } from "react";
import { copyStrings as strings } from "@storymapper/web/ui-strings/copy";

export function CopyButton({ text, children, className = "secondary" }: { text: string; children: ReactNode; className?: string }): ReactElement {
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
    <button type="button" className={className} onClick={() => { void copy(); }}>{children}</button>
    <span role="status">{status}</span>
  </span>;
}
