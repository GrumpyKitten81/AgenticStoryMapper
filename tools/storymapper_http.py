import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


DEFAULT_URL = os.environ.get("STORYMAPPER_URL", "http://127.0.0.1:4317")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Agentic Story Mapper redirects are refused")


class StoryMapperClient:
    def __init__(self, url: str) -> None:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise ValueError("Agentic Story Mapper URL must be an HTTP loopback origin")
        self.url = url.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(f"{self.url}{path}", data=data, method=method)
        request.add_header("Accept", "application/json")
        if payload is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            body = json.loads(error.read())
            raise RuntimeError(f"Agentic Story Mapper HTTP {error.code}: {body.get('code', 'error')}: {body.get('message', 'Request failed')}") from error
        except urllib.error.URLError as error:
            raise RuntimeError("Agentic Story Mapper server is unavailable; start it before local reads or proposals") from error

    def project_id(self, selected: str | None) -> str:
        projects = self.request("GET", "/api/projects")["projects"]
        matches = [project for project in projects if selected is None or project["id"] == selected]
        if len(matches) != 1:
            raise RuntimeError("Select a unique existing Project with --project-id")
        return matches[0]["id"]

    def story_map(self, name: str, project_id: str | None = None) -> dict[str, Any]:
        query = f"?projectId={urllib.parse.quote(project_id)}" if project_id else ""
        maps = self.request("GET", f"/api/story-maps{query}")["storyMaps"]
        matches = [story_map for story_map in maps if story_map["name"] == name]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one Story Map named {name!r}; found {len(matches)}")
        return self.request("GET", f"/api/story-maps/{matches[0]['id']}")

    def apply(self, change_set_id: str) -> dict[str, Any]:
        identifier = urllib.parse.quote(change_set_id, safe="")
        self.request("POST", f"/api/changesets/{identifier}/approve", {})
        return self.request("POST", f"/api/changesets/{identifier}/apply", {})
