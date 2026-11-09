# Epic story detail plans (dev consumption)

Binding rules for **bmad-build-auto** when Agentic Story Mapper epic preparation has run.

## When this applies

Epic story path in step 01: `{epic_num}` and `{story_num}` are known (sprint-status key or spec filename).

## Artifacts

| File | Role |
| --- | --- |
| `{{.implementation_artifacts}}/epic-{N}-preparation.md` | Cross-story design contract for epic N (interfaces, shared types, sequencing, invariants). |
| `{{.implementation_artifacts}}/story-plan-{epic}-{story}-*.md` | Per-story detail plan (exactly one id-prefix match per story). |

`epic-{N}-context.md` (auto-compiled) stays the distilled planning-doc summary. **Preparation** and **story-plan** are the implementation-wave contracts produced by `bmad-prepare-epic` and take precedence over re-deriving the same decisions in step 02.

## Step 01 (epic story path)

After loading epic context (and previous-story continuity), also:

1. Load `epic-{epic_num}-preparation.md` when present.
2. Resolve `story-plan-{epic_num}-{story_num}-*.md`: zero matches → continue without a detail plan; one match → load as detail plan; more than one → HALT `blocked`, blocking condition `ambiguous story plan file match`.

## Step 02 (Plan)

When a detail plan and/or epic preparation doc was loaded:

- Treat their **Design decisions**, **Task sequence**, **Cross-story constraints**, and **Acceptance outline** as binding input to the runnable spec.
- Use step-02 investigation to **validate and refine** into the Code Map (paths, symbols, reuse, read-only zones)—not to silently choose a different architecture.
- If investigation and the detail plan irreconcilably conflict, HALT `blocked`, blocking condition `detail plan conflict`, with evidence from both sides.
- If you must deviate with good reason, record it in **Spec Change Log** (what changed, why, impact on other stories).

## Dirty-tree allowlist (step 01)

These paths are expected workflow output and must not alone trigger `dirty working tree`:

- `{{.implementation_artifacts}}/story-plan-*.md`
- `{{.implementation_artifacts}}/epic-*-preparation.md`
