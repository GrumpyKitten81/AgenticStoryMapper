import type { StoryMapSnapshot } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "@storymapper/web/app/api";
import { Dialog } from "@storymapper/web/components/Dialog";
import { invalidateCardReports } from "@storymapper/web/features/story-map/card-query-invalidation";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function ReleaseDeleteDialog({ releaseId, name, snapshot, onClose, onNotice }: { releaseId: string; name: string; snapshot: StoryMapSnapshot; onClose: () => void; onNotice: (message: string) => void }) {
  const busy = useRef(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.deleteRelease(releaseId, snapshot.releases.find((release) => release.id === releaseId)!.version),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["story-map", snapshot.storyMap.id] }), invalidateCardReports(queryClient)]);
      onNotice(strings.lifecycleDone(strings.deleteRelease(name), name));
      onClose();
    },
    onSettled: () => { busy.current = false; }
  });
  const count = snapshot.cards.filter((card) => card.releaseId === releaseId).length;
  return <Dialog title={strings.deleteRelease(name)} description={strings.confirmDeleteRelease(name, count)} alert onClose={() => { if (!busy.current) onClose(); }}>
    {mutation.error ? <p role="alert">{mutation.error.message}</p> : null}
    {mutation.isPending ? <p role="status">{strings.lifecycleWorking}</p> : null}
    <div className="button-row">
      <button type="button" data-dialog-cancel className="secondary" disabled={mutation.isPending} onClick={onClose}>{strings.cancel}</button>
      <button type="button" className="danger" disabled={mutation.isPending} onClick={() => { if (busy.current) return; busy.current = true; mutation.mutate(); }}>{strings.deletePermanent}</button>
    </div>
  </Dialog>;
}
