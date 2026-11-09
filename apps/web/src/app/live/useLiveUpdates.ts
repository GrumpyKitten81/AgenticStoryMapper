import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LiveConnectionState } from "@storymapper/web/app/live/live-stream";
import { startLiveUpdateSession } from "@storymapper/web/app/live/live-update-session";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";

export function useLiveUpdates(projectId?: string): { connection: LiveConnectionState; failed: boolean } {
  const client = useQueryClient();
  const announce = useAnnouncementStore((state) => state.announce);
  const [connection, setConnection] = useState<LiveConnectionState>("connecting");
  const [failed, setFailed] = useState(false);
  useEffect(() => startLiveUpdateSession({ client, announce, projectId, setFailed, setConnection }), [announce, client, projectId]);
  return { connection, failed };
}
