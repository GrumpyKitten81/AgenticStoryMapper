const failures = [
  { codes: ['release-command-required'], category: 'command', action: 'Use validate, notes, audit or publish.' },
  { codes: ['tag-event-required', 'invalid-release-tag', 'tag-version-mismatch', 'invalid-root-metadata', 'invalid-release-revision', 'tag-revision-mismatch', 'root-metadata-revision-mismatch'], category: 'candidate', action: 'Restore committed root metadata and the matching v<SemVer> tag at the exact event revision, then retry validation.' },
  { codes: ['full-history-required', 'incomplete-git-scope', 'git-timeout', 'git-input-unavailable', 'invalid-object', 'invalid-tree', 'invalid-index', 'invalid-path-encoding', 'unreadable-tracked-input', 'unsupported-parent', 'empty-publication-scope'], category: 'git-scope', action: 'Use a complete unmodified checkout with all refs and readable authenticated Git objects, then rerun the gates.' },
  { codes: ['release-checks-required', 'release-checks-failed'], category: 'quality-checks', action: 'Require successful Linux quality and dependency audit jobs for this revision.' },
  { codes: ['dependency-audit-blocked'], category: 'dependency-audit', action: 'Resolve high/critical advisories or repair scanner availability/output, then rerun the audit job.' },
  { codes: ['publication-policy-required', 'publication-policy-must-be-external', 'publication-policy-write-failed', 'policy', 'policy-unreadable'], category: 'private-policy', action: 'Provision a valid private PUBLICATION_POLICY and writable temporary storage outside the checkout, then rerun publication.' },
  { codes: ['publication-blocked'], category: 'content-gate', action: 'Resolve the sanitized publication findings and required declarations, then scan the exact candidate again.' },
  { codes: ['candidate-changed-during-scan', 'stale-or-invalid-report', 'report-missing', 'report-invalid', 'report-unsafe', 'report-unreadable', 'report-write-failed'], category: 'publication-evidence', action: 'Keep candidate inputs stable, repair report storage and regenerate the exact publication scan before retrying.' },
  { codes: ['invalid-release-history'], category: 'release-notes', action: 'Repair the selected Git history and regenerate notes in a fresh candidate checkout.' },
  { codes: ['remote-tag-unavailable', 'remote-tag-invalid', 'remote-tag-moved', 'remote-tag-depth-exceeded'], category: 'remote-tag', action: 'Inspect and protect the remote tag, confirm its raw object and commit match the scanned candidate, then rerun all gates.' },
  { codes: ['release-credentials-required'], category: 'credentials', action: 'Use the authorized publishing job with its repository identity and scoped GH_TOKEN.' },
  { codes: ['release-publication-unconfirmed'], category: 'publication-not-confirmed', action: 'Inspect the remote release before retrying; GitHub may have accepted the write.' }
];

export function releaseFailure(error) {
  const known = failures.find(({ codes }) => error instanceof Error && codes.includes(error.message));
  return known ? `release: ${known.category}. Next action: ${known.action}\n`
    : 'release: unexpected failure. Next action: Stop and inspect the workflow and remote release before retrying; raw diagnostics are withheld.\n';
}
