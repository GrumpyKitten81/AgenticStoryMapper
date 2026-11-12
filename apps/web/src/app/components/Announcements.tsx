import { useRef, type ReactElement } from "react";
import { X } from "lucide-react";
import { liveUpdateStrings as strings } from "@storymapper/ui-strings";
import { useAnnouncementStore } from "../stores/announcement-store";

export function Announcements(): ReactElement {
  const status = useAnnouncementStore((state) => state.status);
  const alert = useAnnouncementStore((state) => state.alert);
  const statusRevision = useAnnouncementStore((state) => state.statusRevision);
  const alertRevision = useAnnouncementStore((state) => state.alertRevision);
  const announceFeedback = useAnnouncementStore((state) => state.announceFeedback);
  const previousFocus = useRef<HTMLElement | null>(null);
  function dismissStatus() {
    announceFeedback("");
    const target = previousFocus.current;
    if (target?.isConnected && !target.matches(":disabled")) target.focus();
    else document.getElementById("workspace")?.focus();
  }
  return (
    <div className="announcements">
      <div className={`announcement-status${status ? "" : " announcement-status-empty"}`} title={status ? `${status} ${strings.statusHint}` : undefined}>
        <div role="status" aria-live="polite" aria-atomic="true" aria-description={strings.statusHint}><span key={statusRevision}>{status}</span></div>
        {status ? <button type="button" className="secondary icon-button button-compact" aria-label={strings.dismissStatus} title={strings.dismissStatus} onFocus={(event) => { previousFocus.current = event.relatedTarget instanceof HTMLElement && !event.relatedTarget.closest(".announcement-status") ? event.relatedTarget : null; }} onClick={dismissStatus}><X size={14} aria-hidden="true" /></button> : null}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true"><span key={alertRevision}>{alert}</span></div>
    </div>
  );
}
