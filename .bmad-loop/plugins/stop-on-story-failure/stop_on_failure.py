import json
import os
from pathlib import Path

from bmad_loop.model import Phase
from bmad_loop.journal import load_state
from bmad_loop.runs import request_graceful_stop

run_dir = Path(os.environ["BMAD_LOOP_RUN_DIR"])
state = load_state(run_dir)
failed = [task.story_key for task in state.tasks.values() if task.phase == Phase.DEFERRED]
if failed:
    reason = "Failed or skipped story requires resolution: " + ", ".join(failed)
    if os.environ["BMAD_LOOP_STAGE"] == "post_story":
        request_graceful_stop(run_dir)
        print(reason)
    else:
        print(json.dumps({"veto": {"action": "pause", "reason": reason}}))
