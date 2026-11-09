---
title: 'Hide Sources behind a view flag and document view purposes'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — approved conversation plan">

## Intent

Hide the standalone Sources project view by default behind VITE_FEATURE_VIEW_SOURCES. When disabled, omit its navigation entry and redirect direct URLs to the same Project's Story Maps list. Accept only exact true/false strings. Preserve source data, provenance, backend capabilities and the independent minimum-one-story-map-view invariant.

Document all ten view flags, defaults and view purposes in the English runbook, with build-time configuration and Bash/PowerShell rebuild examples. Update document metadata and changelog. Validate disabled/default/enabled/invalid states and existing navigation. No commit or push requested.

</frozen-after-approval>

## Implementation Notes

- No intent gaps or irreversible operations; small frontend-only change. Graph tools unavailable; verified source directly.
- Reuse apps/web/src/app/feature-flags.ts parsing for Sources separately from storyMapViewPaths. Gate RootLayout navigation and router beforeLoad.
- Vite test env enables all map views; explicitly enable Sources for existing integration scenarios and isolate flag parsing tests.
- Vite uses apps/web as env directory; root .env is runtime configuration, not the documented frontend build configuration.
- Preserve the pre-existing .wolf/memory.md modification. Existing HEAD is 3ad6293eae8a2bde3aab13cc39f062a3ff401815.

- Implemented shared strict boolean parsing, independent Sources flag, sidebar gating and same-Project route guard. Added nine parsing cases and three navigation cases; enabled Sources explicitly in the integration-test environment.
- Runbook v0.4.2 documents ten flags and their purposes, frontend env location, shell examples and rebuild/reload behavior.
- Verification: 31 flag/navigation tests plus seven shell/onboarding tests passed; frontend typecheck, production build, source hygiene and git diff --check passed.
- Existing unrelated size violation remains at story-maps.index.tsx:47 (58 lines). verify.mjs could not capture pnpm version under the sandbox; source hygiene passed when rerun with subprocess permissions. No application changes made for environment limitations.
- Independent review returned no actionable findings; parsing, view defaults, project redirect, tests and documentation checked against source. No commit or push performed.
