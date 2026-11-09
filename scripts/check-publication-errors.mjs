const reasons = {
  policy: 'policy-invalid; provide a nonempty valid employer-term policy.',
  'policy-unreadable': 'policy-unreadable; provide a readable policy input.',
  'git-input-unavailable': 'git-input-unavailable; restore readable complete Git input and rescan.',
  'git-timeout': 'git-timeout; resolve the stalled Git operation and rescan.',
  'incomplete-git-scope': 'scope-incomplete; use complete local history without replacements, grafts or sparse state.',
  'invalid-index': 'index-invalid; resolve index conflicts or invalid entries and rescan.',
  'invalid-object': 'object-invalid; restore complete readable Git objects and rescan.',
  'invalid-tree': 'tree-invalid; restore complete readable Git trees and rescan.',
  'invalid-path-encoding': 'scope-path-encoding; use roundtripping UTF-8 publication paths and refs, then rescan.',
  'unreadable-tracked-input': 'input-unsupported; use readable regular publication files and rescan.',
  'unsupported-parent': 'parent-unsupported; remove symlink or non-directory publication parents and rescan.',
  'empty-publication-scope': 'scope-empty; provide publication content and rescan.',
  'candidate-changed-during-scan': 'candidate-changed; finish candidate changes and rescan.',
  'report-missing': 'report-missing; generate an audit report with --scan.',
  'report-invalid': 'report-invalid; regenerate the malformed or structurally inconsistent report with --scan.',
  'report-unsafe': 'report-unsafe; use a regular audit report without symlink parents.',
  'report-unreadable': 'report-unreadable; restore a readable audit report and rescan.',
  'stale-or-invalid-report': 'report-stale; candidate or report contents changed; rescan with --scan.',
  'report-write-failed': 'report-write-failed; restore report destination write access and rescan.'
};

export function publicationFailure(error) {
  return Object.hasOwn(reasons, error?.message) ? reasons[error.message] : 'scan-failed; restore readable publication inputs and rescan.';
}
