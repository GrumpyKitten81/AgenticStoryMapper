import argparse
import json
from storymapper_http import DEFAULT_URL, StoryMapperClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Propose a complete Story Map copy through the running server")
    parser.add_argument("source_name", nargs="?")
    parser.add_argument("target_name", nargs="?")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--project-id")
    parser.add_argument("--apply-change-set", help="Approve and atomically apply a previously reviewed ChangeSet")
    args = parser.parse_args()
    client = StoryMapperClient(args.url)
    if args.apply_change_set:
        if args.source_name or args.target_name:
            parser.error("Application is separate from proposing a copy")
        result = client.apply(args.apply_change_set)
    else:
        if not args.source_name or not args.target_name:
            parser.error("source_name and target_name are required for a proposal")
        snapshot = client.story_map(args.source_name, args.project_id)
        result = client.request("POST", "/api/tool-proposals/copy-story-map", {
            "sourceStoryMapId": snapshot["storyMap"]["id"], "targetName": args.target_name,
        })
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
