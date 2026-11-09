# ChangeSet atomicity for files and remote effects

- Status: accepted
- Date: 2026-10-10
- Deciders: maintainer

Reproducing statement: Record the user-approved Epic 4 boundary between atomic SQLite ChangeSet application and prepared files/remote effects. Version: 1. Changelog: Initial decision; supplements architecture AD-3 and AD-4.

## Context and Problem Statement

Source import and attachment operations can involve files; GitHub workflows involve remote effects. SQLite rollback cannot undo either. Epic 3 remediation explicitly excluded these paths from its stronger atomic mutation/audit guarantee. Epic 4 must describe their actual behavior before routing Agent writes through ChangeSets.

## Decision Drivers

- Keep local domain data, versions, history, operation Activity and successful mutation audit consistent.
- Never report a filesystem or remote effect as rolled back by SQLite.
- Preserve human-confirmed GitHub Dry Runs and the existing AD-3 external-effect lifecycle.

## Considered Options

1. Prepare and validate files before the local transaction; report retained effects explicitly.
2. Exclude file operations from Agent ChangeSets.

## Decision Outcome

Chosen option: “Prepare files before the local transaction”, explicitly approved by the maintainer in this chat on 2026-10-10.

Preparation failure changes no local domain data. The applying SQLite transaction commits domain rows, versions/history, operation Activity and successful mutation audit together. Database or audit failure leaves no visible document/attachment links; retained prepared-file effects are recorded explicitly. Core resolution performs no file I/O.

Remote effects remain outside the atomic SQLite operation array and follow AD-3 planned/per-item outcome recording. GitHub import/pull applies its local domain half through the executor. GitHub push retains its separate human-confirmed Dry Run; restore does not undo remote systems.

### Consequences

- Local rollback guarantees are testable, including forced audit-insert failure.
- Failure responses must distinguish uncommitted local state from retained prepared-file or completed remote effects.
- This decision authorizes no new cleanup daemon, retry mechanism or external service.
