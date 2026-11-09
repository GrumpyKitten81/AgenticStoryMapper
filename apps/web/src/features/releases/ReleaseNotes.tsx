import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";

export function ReleaseNotes({ storyMapId, releaseId }: { storyMapId: string; releaseId: string }) {
  const [requested, setRequested] = useState(false);
  const notes = useQuery({
    queryKey: ["release-notes", storyMapId, releaseId],
    queryFn: ({ signal }) => api.getReleaseNotes(storyMapId, releaseId, signal),
    enabled: requested,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  return <div className="form-stack">
    <button type="button" disabled={notes.isFetching} onClick={() => { if (requested) void notes.refetch(); else setRequested(true); }}>{panelStrings.generateReleaseNotes}</button>
    {requested && notes.isFetching ? <p role="status">{panelStrings.releaseNotesLoading}</p> : null}
    {requested && notes.error ? <p role="alert">{notes.error.message}</p> : null}
    {requested && !notes.error && notes.data ? <label>{panelStrings.releaseNotes}<textarea readOnly rows={12} value={notes.data.markdown} /></label> : null}
  </div>;
}
