import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { RestoreProjectResult } from "@storymapper/contracts";
import { restorePointStrings as strings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import { clearRestoreResult, readSavedRestoreState, reconcileRestoreAttempt, type RestoreAttempt } from "@storymapper/web/features/restore-points/restore-result";
import { RestorePointDetails } from "@storymapper/web/features/restore-points/RestorePointDetails";
import { restorePointLabel } from "@storymapper/web/features/restore-points/restore-point-presentation";

export function RestoreResultDialog() {
  const result = useRestoreResultDialogState();
  if (result === null || !("dismiss" in result)) return result;
  return renderRestoreResultDialog(result);
}

function useRestoreResultDialogState() {
  const { result, setResult, attempt, setAttempt, issue, setIssue, unchanged, setUnchanged, check } = useRestoreResultState();
  function dismiss() {
    try { clearRestoreResult(); }
    catch (error) {
      if (!(error instanceof DOMException)) throw error;
      setIssue(strings.savedDataIssue(error.message));
      return;
    }
    setResult(undefined);
    setAttempt(undefined);
    setIssue("");
    setUnchanged(false);
  }
  if (!result && !attempt && !issue) return null;
  if (unchanged) return <Dialog title={strings.unchangedTitle} description={strings.unchangedDescription} onClose={dismiss}>
    <button type="button" onClick={dismiss}>{strings.continueEditing}</button>
  </Dialog>;
  if (!result) return <Dialog title={attempt ? strings.outcomeUnknownTitle : strings.savedDataIssueTitle} {...(attempt ? { description: strings.outcomeUnknown } : {})} dismissible={!attempt} initialFocus={attempt ? "container" : "heading"} onClose={dismiss}>
    {issue ? <p>{issue}</p> : null}
    {attempt ? <button type="button" disabled={check.isPending} onClick={() => check.mutate(attempt)}>{check.isPending ? strings.checkingOutcome : strings.checkOutcome}</button> : <button type="button" onClick={dismiss}>{strings.done}</button>}
  </Dialog>;
  return { dismiss, issue, result };
}

function renderRestoreResultDialog({ dismiss, issue, result }: Exclude<ReturnType<typeof useRestoreResultDialogState>, import("react").ReactElement | null>) {
  return <Dialog className="discovery-dialog restore-result-dialog" title={strings.restoredTitle} description={strings.restoredDescription} onClose={dismiss}>
    {issue ? <p>{issue}</p> : null}
    <dl>
      <dt>{strings.restoredPoint}</dt><dd>{restorePointLabel(result.restorePoint)}<RestorePointDetails point={result.restorePoint} /></dd>
      <dt>{strings.preRestorePoint}</dt><dd>{restorePointLabel(result.preRestorePoint)}<RestorePointDetails point={result.preRestorePoint} /></dd>
    </dl>
    <p>{strings.undoneCounts(result.undoneActivityEvents, result.undoneChangeSets)}</p>
    <p>{strings.attachmentsRetained}</p>
    <h3>{strings.githubLinks}</h3>
    <p>{strings.githubUnchanged}</p>
    {result.githubLinks.length ? <ul>{result.githubLinks.map((link, index) => <li key={`${link.kind}-${link.url}-${index}`}><a href={link.url} target="_blank" rel="noreferrer">{link.url}</a></li>)}</ul> : <p>{strings.noGithubLinks}</p>}
    <button type="button" onClick={dismiss}>{strings.done}</button>
  </Dialog>;
}

function useRestoreResultState() {
  const [result, setResult] = useState<RestoreProjectResult>();
  const [attempt, setAttempt] = useState<RestoreAttempt>();
  const [issue, setIssue] = useState("");
  const [unchanged, setUnchanged] = useState(false);
  const announce = useAnnouncementStore((state) => state.announce);
  const check = useMutation({
    mutationFn: reconcileRestoreAttempt,
    onSuccess: (recovered) => {
      setUnchanged(recovered.status === "unchanged");
      if (recovered.status === "restored") { setResult(recovered.result); setIssue(""); }
      else if (recovered.status === "unchanged") setIssue("");
      else setIssue(strings.outcomeUnknown);
    },
    onError: (error) => setIssue(strings.outcomeCheckFailed(error.message))
  });
  useEffect(() => {
    const saved = readSavedRestoreState();
    setResult(saved.result);
    setAttempt(saved.attempt);
    if (saved.issue) setIssue(strings.savedDataIssue(saved.issue));
  }, []);
  useEffect(() => {
    if (attempt && !result) check.mutate(attempt);
  }, [attempt]);
  useEffect(() => {
    if (result || unchanged) announce("", "alert");
    if (result) announce(strings.restoredTitle, "status");
    else if (unchanged) announce(strings.unchangedTitle, "status");
  }, [result, unchanged, announce]);
  useEffect(() => { if (issue) announce(issue, "alert"); }, [issue, announce]);
  return { result, setResult, attempt, setAttempt, issue, setIssue, unchanged, setUnchanged, check };
}
