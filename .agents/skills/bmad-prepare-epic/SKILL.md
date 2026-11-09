---
name: bmad-prepare-epic
description: 'Prepare an epic for implementation: cross-story consistency doc plus one detail plan per story for bmad-build-auto step 02. Use when the user says "prepare epic", "epic preparation", "detail plans for epic N", or before a bmad-loop wave on a new epic.'
---

Run once per activation:

```bash
uv run --no-cache "{project-root}/_bmad/scripts/render_skill.py" --project-root "{project-root}" --skill "{skill-root}"
```

On success, read and follow the absolute `workflow.md` printed to stdout. On failure, report output and stop.
