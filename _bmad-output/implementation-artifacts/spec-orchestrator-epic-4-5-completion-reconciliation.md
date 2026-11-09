---
title: Reconcile verified Epic4 and Epic5 completion
created: 2026-10-16
version: 1
type: chore
status: done
route: oneshot
review_loop_iteration: 0
context: []
---

Reproducing statement: Investigate why Story4.13 still appears unfinished after several commits; repair real defects if found, otherwise reconcile Epic4/5 orchestration under the user's explicit permission. Preserve existing working changes and evidence. Date:2026-10-16. Version:1.

<frozen-after-approval reason="explicit operator instruction in the current conversation">

## Intent

**Problem:** Accepted external delivery, later blocked redispatches, lost-to-main supplemental evidence and stale epic/story/run bookkeeping disagree, causing completed work to appear unfinished and risking another destructive re-drive.

**Approach:** Independently verify Story4.13 durable field/effect evidence and current roundtrip behavior; reconcile current completion artifacts and only supported, proven-dead Epic4/5 run/board states. The user explicitly authorizes orchestrator intervention for this repair, superseding the earlier no-write restriction for these completion records only. Preserve the existing4.9done working change, all session/preserve refs, raw failures and timing exceptions. Back up bytes before changes, use orchestrator locks/atomic writers, append external-completion provenance and never invent fresh browser execution. No product changes unless a concrete behavior defect is established; no automatic re-drive, reset, push, deferred-work rewrite or Epic6 dispatch.

</frozen-after-approval>

## Implementation Notes

- Starting revision6171c8298ae15eb21540ddcbc508e071df9ed5f9 on main. Existing sprint4.9backlog→done change saved byte-for-byte in /tmp/storymapper-sprint-before-4-13-reconcile.yaml and.patch; not reverted.
- Three independent investigators: archive/effect audit, current acceptance/source reconciliation, installed orchestrator persistence/lifecycle. No concrete product regression found. Historical acceptance98a92fc is ancestor; supplemental586a2b9 is retained on a preserve branch, not ancestor; blocked5ead942 is the later browser-unavailable redispatch.
- Read-only archive audit passes231member/70observation/19screenshot hashes; all initial effects and19refresh effects pass full field/import/link checks. Preserve reproducible audit and current14-test HTTP/SDK roundtrip result before adopting delivery.
- No CLI safely adopts escalated in-place stories:confirm is awaiting-operator only; resolve re-arms and may rollback. Use installed journal.state_lock, engine_liveness, Journal and atomic_write_text with exact evidence/commit identities. Preserve unknown state schema fields through raw JSON rather than a model round-trip; sprintstatus.advance handles story rows only, with its board lock/mapping helper used for epic/retro rows. Recheck dead under each run lock. tmux remnants are plain zsh panes, not running controllers.
- Change4.13 spec/gate current disposition to externally verified completion, retaining the unexecuted fresh attempt as history. Advance4.13/5.5 and epic4/epic5 done;5retrospective done only from6171c82 report. Epic4 retrospective remains optional. Preserve open accepted follow-ups.
- Reconcile only relevant paused task records whose selected scope can be fully proved delivered; preserve all prior sessions/escalations/refs. Preserve ATTENTION byte-for-byte: finished takes precedence in CLI classification and the TUI attention badge counts only paused states. Appended adoption/run-complete events supply explicit supersession. Older attempts remain traceable; no unrelated run changes.
- Applied:11dead Epic4/5 runs,14non-done task instances adopted against exact ancestor commits and current done specs; all run tasks done and finished. Root independently compared backups against every current task/state field and journal prefix; unknown fields, sessions, refs and all non-target states are preserved. Epic3 untouched. Original4.9done change included without rollback. Board4.13/5.5/epic4/epic5/epic5-retrospective done; Epic4retro optional and Epic6backlog retained.
- Initial epic-row advance refused because the installed API resolves story keys only. No epic row changed before the corrected locked atomic mapping update; no dispatch. This is recorded in the reconciliation JSON.
- Verification:14/14current HTTP/SDK roundtrip tests; quick source/Git hygiene and129-capability check; reproducible archive/effect audit including19refresh effects and exact S5 conflict/Restore content comparison except empty productContext id/updatedAt. Root reran final audit and independently verified all11state transitions, task fields, append-only journals, non-target states and unchanged deferred-work hash. No product source changed. Installed CLI lists all11runs finished, with no pause. [Current verification](evidence/story-4-13-current-verification-20261016.json), [offline audit](evidence/story-4-13-independent-audit-20261016.json), [operator reconciliation](evidence/epic-4-5-orchestrator-reconciliation-20261016.json).
- Review scope:one context-free Blind Hunter for this bounded oneshot repair. Additional product architecture/intent/edge-case lenses are skipped because no product behavior changed; source/field and orchestration invariants were independently checked during implementation.

## Final verification

All9proof/record repair findings are patched; R4 was normal finalization timing and is rejected. Parent read the final audit and reconciliation checker, reran both successfully and compared the audit output against the tracked result excluding only its temporary extraction path. Derived Scenario4 denominator134initial+19changed refresh=153; numerator126initial+19refresh=145;121unchanged refresh operations excluded. Current14/14tests and quick129-capability verification pass. No product behavior was changed.

Reconciliation reproduction: `python3 _bmad-output/implementation-artifacts/evidence/epic-4-5-reconciliation-check.py`. [Durable sanitized before/after and actual CLI evidence](evidence/epic-4-5-reconciliation-check-20261016.json) complements local raw backups; it does not claim the full ignored backup can be reconstructed from a clone. The optional retrospective detect-epic helper cannot run because ruamel.yaml is absent; exact failures are retained and actual supported CLI list/status/confirm-list plus explicit board checks establish zero pending Epic4/5stories. No dependency was installed.

ProductContext source inspection (`packages/db/src/repositories/projects-repository.ts:245–278`, unchanged historical behavior) explains the two excluded empty-context fields: absent rows return randomUUID/current timestamp without persistence. Normalized captured snapshots prove matching content, not survival of a persisted ProductContext row. Existing roundtrip equality excludes the entire unpersisted default; this audit excludes only those two fields.

## Changelog

Version1 (2026-10-16): Completed investigation, locked external-delivery adoption,9proof/record review repairs, independent final checks and operator-authorized Epic4/5 closure. Existing data and failures preserved; no product change, new intent gap or irreversible product effect.

## Review Triage Log

One context-free Blind Hunter completed; finding floor10 for180.58kB reviewed content. Every finding is retained below. These are proof/record quality findings, not newly discovered product failures.

| ID | Verdict | Disposition and evidence |
| --- | --- | --- |
| R1 | low, patch | Local ignored backups alone do not provide durable before/after inspection. Add a sanitized tracked before/after run/task record and preservation hashes. Full operational rollback remains local-only; do not export private policy/session logs. |
| R2 | medium, patch | Invariant booleans lacked a repeatable checker. Preserve a read-only reconciliation checker and its actual output for exact scope, unknown fields, sessions, journal prefixes and non-target states. |
| R3 | low, patch | Post-repair machine assertions lacked raw supported CLI output. Capture installed list/status/confirm-list outputs and current board inventory; no dry-run or detect-epic execution is claimed unless actually run. |
| R4 | false, reject | The repair spec was deliberately in-progress during review. Finalize statusdone after triage and verification, as required by the oneshot workflow; it was not handed off as complete with an unfinished spec. |
| R5 | medium, patch | Count-only initial audit did not assert exact selected execution membership/index correspondence. Assert actual selected/result operation IDs and operation/result index alignment, including dependent deselection. |
| R6 | low, patch | Shared alias construction did not assert repeated alias consistency. Assert equal duplicate resolutions; current captured executions are checked rather than assuming later refresh aliases are safe. |
| R7 | medium, patch | Non-Card retention was identity-only. Compare intended persisted fields for retained Releases, SourceLinks and imported document metadata/content hashes; compare initially captured chunks exactly. Unexposed initial chunk content cannot be independently compared and remains an explicit identity-only limitation in the result. |
| R8 | medium, patch | Scenario4 totals were hardcoded output. Derive numerator/denominator and initial/refresh contributions from the audited executions and changed selection. |
| R9 | low, patch | ProductContext comparison did not reject added keys. Require equal context key sets before excluding only id/updatedAt. |
| R10 | low, patch | Manifest audit checked listed hashes without asserting complete coverage/counts. Enforce bundle/observation/screenshot coverage and actual231/70/19 counts. |

No findings are deferred and no deferred-work ledger entry is added. Original accepted product optimization topics remain unchanged.
