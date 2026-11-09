---
title: 'Repair Epic 8 A1/A2 publication scanner decisions'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
---

Reproducing statement: Repair the three scanner errors in Epic 8 retrospective A1/A2, review and verify the changes, commit them and then update acceptance. Preserve orchestrator-owned sprint status. Date: 2026-10-22. Version: 1.

<frozen-after-approval reason="user-authorized A1/A2 remediation">

## Intent

**Problem:** Historical Git scanning loses full paths, misses deleted copied skills and falsely rejects the allowed local-projects placeholder. Content inspection misses personal Windows home paths serialized in JSON strings.

**Approach:** Classify historical leaf paths in their actual root context and inspect valid decoded JSON strings alongside unchanged raw-content checks. Given deleted copied skills or actual nested user data, scans must block; given only the allowed placeholder or harmless nested example directories, they must clear. Given private JSON-escaped or Unicode-escaped paths in current, index or historical content, scans must block without leaking matched values. Existing encoding, archive, symlink, submodule and object-authentication protections must remain effective.

Review, verify and commit the bounded scanner correction, then update the retrospective with fresh evidence. Keep unmet native/hosted/release criteria visible. Never write, stage, revert or restore sprint-status.yaml; preserve deferred work and loop state. No public push, release or history rewrite.

</frozen-after-approval>

## Implementation Notes

- Starting revision: `ec7348dc4524918c68d26b3d47e1035d012d6a46`. Prior uncommitted retrospective and OpenWolf changes are this session's retained work; preserved before continuing, not treated as an unrelated dirty-tree blocker.
- Small reversible change, no unresolved user-visible intent decisions or irreversible external action. One-shot route; story key unset because this is retrospective remediation, not a reopened sprint story.
- Source map: `scripts/check-publication-git.mjs` owns authenticated object inventory and tree classification; `scripts/check-publication-content.mjs` owns shared raw/decoded classification; `scripts/check-publication.test.mjs` supplies existing synthetic policy and disposable Git fixtures. Preserve their report binding and raw checks. Graph tools unavailable; independent read-only investigation checked primary source.
- Traverse commit roots, direct tree refs and tree-targeting tags, including shared trees at distinct prefixes. Do not misclassify each subtree as a repository root. Retain one count/fingerprint record per object and strict decoding of every reachable tree name.
- Add meaningful full-scanner and encoding regressions using the existing synthetic fixture inputs. Baseline failures must demonstrate each defect before production changes. Verification uses Node 24 and retained raw logs; publication clearance remains a separate final-candidate requirement.

## Changelog

- 2026-10-22 v1: Record user-authorized bounded remediation and preservation rules before implementation.

- Review exposed malformed-token hiding, quadratic token retry, compact-DAG expansion and expensive deep prefixes. Corrections consume malformed spans once and fail closed at100,000 contexts,32MiB cumulative context-key bytes or4096 bytes per assembled historical path. The individual path guard runs before classification; no test deadline was raised.
- One JSON string layer is decoded alongside raw checks. Arbitrary repeated serialization remains outside this bounded change and requires manual privacy review. Empty trees contain no user payload; private directory names still enter classification.

## Review Triage Log

- R1: high; patch. Malformed JSON token hides following private path. Confirmed with three malformed-prefix examples; complete-span consumption fixes detection and new regressions pass.
- R2: medium; patch. Escaped-quote extraction retries quadratically. Independent128KiB case decreased from6314ms to0.89ms; complete-span extraction and bounded child regression pass.
- R3: medium; patch. Compact Git DAG expands exponentially. Authenticated18-tree1132-byte fixture demonstrates context expansion;100000-context and32MiB cumulative-key bounds fail closed with scope-incomplete.
- R4: false; reject. Empty sensitive directory tree no longer flagged as user data. A directory-only tree has no user payload. A1 requires file-aware classification to permit the documented placeholder. Explicit empty-tree control passes; directory-name privacy is still checked. Actual nested user data remains blocked.
- R5: low; reject. Double-serialized JSON is decoded once. Real bounded limitation, pre-existing beyond ordinary JSON string scope; no affected retained user artifact demonstrated. Arbitrary recursive serialization is an unrequested extension. Document raw plus one JSON string layer, preserve manual privacy prerequisite.
- R6: low; patch. Contextual traversal lacks SHA256 case. Added deleted copied-skill cases for both skill roots in SHA1 and SHA256; existing canonical-object authentication cases remain.
- R7: low; patch. Decoded non-path categories lack assertions. Added Unicode-escaped synthetic PEM signature and employer-boundary positive/negative assertions.
- R8: low; patch. Encoded path tests lack integration routing. Added gzip index and UTF16BE deleted-history cases with exact object/path locations, sanitized reports and independent recomputation.
- R9: low; patch. Nested historical symlink/submodule coverage absent. Added deleted nested mode120000/160000 history case proving findings and incomplete-content refusal.
- R10: medium; patch. Deep individual prefixes evade cumulative budget until excessive work. Independent deep-chain case exceeded10000ms. Added4096-byte assembled-path guard before classifiers, retained context/cumulative bounds; independent resource rerun passes all3 cases without raising timeout.

Independent follow-up found no remaining demonstrated resource-fix defect; all three bounded resource regressions pass. No new deferred-work entry is required; the single-layer decoding limit is explicit rather than a new complete-privacy guarantee.

## Verification

- Final Node24 root script suite:235 tests,233 passed,2 inherited native invalid-byte filename skips,0 failures. Source hashes and HEAD match the pre-gate snapshot.
- `node scripts/verify.mjs`: passes, including accessibility tests, source hygiene, capability parity, typecheck and build. Boundary/size/hygiene/license checks also pass. Build retains its existing large-chunk advisory.
- Ten review findings triaged; malformed-token/performance and deep-prefix issues repaired. Independent follow-up passes all three resource regressions. No new deferred items.
- Complete sanitized logs and original/sanitized/compressed hash chains: `evidence/epic-8-a1-a2/manifest.json`. Earlier sandbox failures, failed pre-guard deep test and candidate-changed audit refusal remain retained; none is presented as final acceptance.
- Orchestrator-owned sprint/deferred working and index bytes, run state and journal match the initial fingerprints. No public push or release. Exact final publication clearance and native/hosted criteria remain outside this remediation.
