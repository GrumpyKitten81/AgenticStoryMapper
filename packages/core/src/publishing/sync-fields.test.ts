import { normalizeRemoteWorkItemTitle, replaceSyncStatusLabels } from "@storymapper/core";
import type { ConnectorConnection } from "@storymapper/contracts";
import { describe, expect, it } from "vitest";

describe("remote sync fields", () => {
  it("normalizes imported key prefixes and keeps a matching local title literal", () => {
    expect(normalizeRemoteWorkItemTitle("EXT-19: Imported title")).toBe("Imported title");
    expect(normalizeRemoteWorkItemTitle("EXT-19: Imported title", "Local edit")).toBe("Imported title");
    expect(normalizeRemoteWorkItemTitle("CUSTOM-7: Local title", "CUSTOM-7: Local title")).toBe("CUSTOM-7: Local title");
  });

  it("replaces only mapped status labels while preserving unrelated status-prefixed metadata", () => {
    const connection = { statusMapping: [{ localStatus: "done", remoteState: "closed", labels: ["finished"] }] } as ConnectorConnection;
    const remote = ["external", "status:todo", "story-map:REMOTE", "finished", "external"];
    const local = ["local-story-map", "status:active", "story-map:LOCAL"];
    expect(replaceSyncStatusLabels(connection, remote, local)).toEqual(["external", "status:todo", "story-map:REMOTE"]);
    expect(remote).toEqual(["external", "status:todo", "story-map:REMOTE", "finished", "external"]);
  });
});
