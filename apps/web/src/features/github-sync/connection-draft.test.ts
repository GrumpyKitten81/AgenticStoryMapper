import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { connectorConnectionSchema } from "@storymapper/contracts";
import { connectionToDraft, createConnectionPayload, createDefaultConnectionDraft, updateConnectionPayload } from "./connection-draft";

it("sends trimmed outbound Issue types without empty entries and keeps them when editing a connection", () => {
  const draft = { ...createDefaultConnectionDraft(), issueTypeMapping: [{ cardType: "task" as const, issueType: " Epic " }, { cardType: "feature" as const, issueType: "  " }, { cardType: "story" as const, issueType: "Task" }] };
  const expected = [{ cardType: "task", issueType: "Epic" }, { cardType: "story", issueType: "Task" }];
  expect(createConnectionPayload(randomUUID(), draft).issueTypeMapping).toEqual(expected);
  expect(updateConnectionPayload(draft).issueTypeMapping).toEqual(expected);
  const connection = connectorConnectionSchema.parse({ id: randomUUID(), projectId: randomUUID(), provider: "github", name: "Draft", authMode: "token", owner: "o", repository: "r", issueTypeMapping: expected, createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" });
  expect(connectionToDraft(connection).issueTypeMapping).toEqual(expected);
});
