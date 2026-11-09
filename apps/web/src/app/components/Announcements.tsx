import type { ReactElement } from "react";
import { useAnnouncementStore } from "../stores/announcement-store";

export function Announcements(): ReactElement {
  const status = useAnnouncementStore((state) => state.status);
  const alert = useAnnouncementStore((state) => state.alert);
  const revision = useAnnouncementStore((state) => state.revision);
  return (
    <div className="announcements">
      <div role="status" aria-live="polite" aria-atomic="true"><span key={revision}>{status}</span></div>
      <div role="alert" aria-live="assertive" aria-atomic="true"><span key={revision}>{alert}</span></div>
    </div>
  );
}
