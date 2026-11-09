import { useMutationState } from "@tanstack/react-query";
import { restorePointStrings as strings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";
import { RESTORE_PROJECT_KEY, RestoreAttemptStorageError } from "@storymapper/web/features/restore-points/restore-result";
import { RestoreRejectedError } from "@storymapper/web/app/api";

export function RestoreProgressDialog() {
  const statuses = useMutationState({ filters: { mutationKey: RESTORE_PROJECT_KEY }, select: (mutation) => mutation.state });
  const latest = statuses.at(-1);
  const unknown = latest?.status === "error" && !(latest.error instanceof RestoreRejectedError || latest.error instanceof RestoreAttemptStorageError);
  if (latest?.status !== "pending" && latest?.status !== "success" && !unknown) return null;
  return <Dialog title={unknown ? strings.outcomeUnknownTitle : strings.restoringTitle} description={unknown ? strings.outcomeUnknown : strings.restoringDescription} dismissible={false} initialFocus="container" onClose={() => undefined} />;
}
