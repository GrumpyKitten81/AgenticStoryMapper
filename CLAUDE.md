# OpenWolf

This project uses OpenWolf for context management. The always-on rules live in `.claude/rules/openwolf.md`; the hooks handle bookkeeping (anatomy index, memory log, read tracking) automatically.

For the full operating protocol (session handoff, memory discipline, bug logging), load the `openwolf` skill, or read `.wolf/OPENWOLF.md`. Regenerate the session handoff with `/handoff`.


@AGENTS.md

<!-- rtk-instructions v2 -->
# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.
<!-- /rtk-instructions -->