// @vitest-environment jsdom // REQ FR-20
import { randomUUID } from "node:crypto";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { state, cardId, viewUrl, button, mount } from "@storymapper/web/test-fixtures/card-detail";

describe("FR-20 Card origin evidence", () => {
  it.each(["inference", "unknown"] as const)("renders readable %s origin without evidence", async (origin) => {
    state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, creationOrigin: origin, provenance: origin } : card);
    await mount(`${viewUrl}?card=${cardId}`);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(origin === "inference" ? "Inferred" : "Origin not recorded");
  });

  registerShowsTheDocumentAndLocatorImmediatelyWithoutSelectingA();

  it("links path-like notes as text and unlinks by typed identity, restoring recorded inference", testLinksPathLikeNotesAsTextAndUnlinksByTypedIdentity);

  registerLinksAnExistingStructuredGitHubIssueAndRendersIts();

  it("renders one Issue row and its joined state for paired canonical and sync projections", testRendersOneIssueRowAndItsJoinedStateForPairedCanonical);

  registerRetainsTheMissingHistoricalCreationLabelWhenEvidenceMakes();

  it("distinguishes removing a canonical issue identity from unlinking an evidence attachment", async () => {
    const identityId = randomUUID();
    const sharedId = randomUUID();
    const issue = { kind: "github" as const, cardId, repoFullName: "owner/repository", issueNumber: 42, url: "https://github.com/owner/repository/issues/42" };
    state.snapshot.sourceLinks = [{ ...issue, id: identityId, externalRefId: identityId }, { ...issue, id: randomUUID(), externalRefId: sharedId, issueNumber: 43 }];
    await mount(`${viewUrl}?card=${cardId}`);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Remove issue identity for owner/repository#42"]')!.textContent).toBe("Remove issue identity");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Removes the local issue identity and all Card evidence that references it.");
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Unlink owner/repository#43"]')!.textContent).toBe("Unlink");
  });

  it("offers and links an existing issue from another map in the same Project", async () => {
    const identityId = randomUUID();
    state.otherMapIssues = [{ id: identityId, cardId: randomUUID(), repo: "owner/another-map", issueNumber: 57, url: "https://github.com/owner/another-map/issues/57", syncState: "synced" }];
    await mount(`${viewUrl}?card=${cardId}`);
    await vi.waitFor(() => expect(document.querySelector(`option[value="${identityId}"]`)).not.toBeNull());
    const select = document.querySelector<HTMLOptionElement>(`option[value="${identityId}"]`)!.parentElement as HTMLSelectElement;
    await act(async () => { select.value = identityId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button("Link GitHub issue").click());
    await vi.waitFor(() => expect(state.snapshot.sourceLinks[0]).toMatchObject({ kind: "github", externalRefId: identityId, repoFullName: "owner/another-map", issueNumber: 57 }));
    expect(fetch).toHaveBeenCalledWith(`/api/github/links?storyMapId=${state.otherMapId}`, expect.any(Object));
  });

  it("retains failed note submissions and displays the latest unlink error", testRetainsFailedNoteSubmissionsAndDisplaysTheLatestUnlinkError);

  it("shows a refused GitHub link without losing the selection or adding evidence", testShowsARefusedGitHubLinkWithoutLosingTheSelectionOrAdding);

});

function registerRetainsTheMissingHistoricalCreationLabelWhenEvidenceMakes() {
  it("retains the missing historical creation label when evidence makes provenance linked", async () => {
    state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, creationOrigin: "unknown", provenance: "linked" } : card);
    state.snapshot.sourceLinks = [{ kind: "note", id: randomUUID(), cardId, note: "Historical evidence", createdAt: new Date().toISOString() }];
    await mount(`${viewUrl}?card=${cardId}`);
    const badges = [...document.querySelectorAll('[role="dialog"] .custom-chip')].map((badge) => badge.textContent);
    expect(badges).toContain("Linked");
    expect(badges).toContain("Origin not recorded");
  });
}

function registerLinksAnExistingStructuredGitHubIssueAndRendersIts() {
  it("links an existing structured GitHub issue and renders its canonical identity and URL", async () => {
    const identityId = randomUUID();
    state.snapshot.githubLinks = [{ id: identityId, cardId: state.snapshot.cards[0]!.id, repo: "owner/repository", issueNumber: 42, url: "https://github.com/owner/repository/issues/42", syncState: "synced" }];
    await mount(`${viewUrl}?card=${cardId}`);
    const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Existing GitHub issue"))!.querySelector("select")!;
    await act(async () => { select.value = identityId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button("Link GitHub issue").click());
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"] a[href="https://github.com/owner/repository/issues/42"]')).not.toBeNull());
    expect(state.snapshot.sourceLinks[0]).toMatchObject({ kind: "github", externalRefId: identityId, repoFullName: "owner/repository", issueNumber: 42 });
  });
}

function registerShowsTheDocumentAndLocatorImmediatelyWithoutSelectingA() {
  it("shows the document and locator immediately without selecting a source document", async () => {
    const documentId = randomUUID();
    const chunkId = "a".repeat(64);
    state.snapshot.sourceChunks = [{ id: chunkId, documentId, locator: "lines:1-2", text: "Recorded requirement" }];
    state.snapshot.sourceLinks = [{ kind: "chunk", id: randomUUID(), cardId, chunkId, confidence: null, createdAt: new Date().toISOString() }];
    state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, provenance: "linked" } : card);
    await mount(`${viewUrl}?card=${cardId}`);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Origin document lines:1-2: Recorded requirement");
  });
}

async function testLinksPathLikeNotesAsTextAndUnlinksByTypedIdentity() {
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, creationOrigin: "inference", provenance: "inference" } : card);
  await mount(`${viewUrl}?card=${cardId}`);
  const note = [...document.querySelectorAll("label")].find((label) => label.textContent === "Origin note")!.querySelector("textarea")!;
  expect(button("Link origin note").disabled).toBe(true);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "  /private/research.txt  ");
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Link origin note").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')!.textContent).toContain("/private/research.txt"));
  expect(note.value).toBe("");
  expect(button("Link origin note").disabled).toBe(true);
  expect(state.snapshot.sourceLinks[0]).toMatchObject({ kind: "note", note: "/private/research.txt" });
  const evidenceId = state.snapshot.sourceLinks[0]!.id;
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Unlink /private/research.txt"]')!.click());
  await vi.waitFor(() => expect(state.snapshot.sourceLinks).toEqual([]));
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Inferred");
  expect(fetch).toHaveBeenCalledWith(`/api/cards/${cardId}/source-links`, expect.objectContaining({ method: "DELETE", body: JSON.stringify({ kind: "note", id: evidenceId }) }));
}

async function testRendersOneIssueRowAndItsJoinedStateForPairedCanonical() {
  const refId = randomUUID();
  const card = state.snapshot.cards.find((item) => item.id === cardId)!;
  const url = "https://github.com/owner/repository/issues/42";
  state.snapshot.externalRefs = [{ id: refId, entityType: "card", entityId: cardId, scopeId: card.storyMapId, system: "github", externalId: url, syncedVersion: card.version, createdAt: card.createdAt }];
  state.snapshot.githubLinks = [{ id: refId, cardId, repo: "owner/repository", issueNumber: 42, url, syncState: "conflict" }];
  state.snapshot.remoteWorkItemLinks = [{ id: randomUUID(), externalRefId: refId, connectionId: randomUUID(), provider: "github", cardId, remoteId: "42", remoteNumber: 42, url, syncState: "conflict", labels: [], parentOverrideLocal: false }];
  await mount(`${viewUrl}?card=${cardId}`);
  const section = [...document.querySelectorAll('[role="dialog"] .source-link-section')].find((item) => item.querySelector("h2")?.textContent === "GitHub")!;
  expect(section.querySelectorAll(".source-link-row")).toHaveLength(1);
  expect(section.querySelectorAll(`a[href="${url}"]`)).toHaveLength(1);
  expect(section.querySelector(".source-link-row")?.textContent).toContain("owner/repository#42");
  expect(section.querySelector(".source-link-row")?.textContent).toContain("conflict");
  expect(section.querySelector(".source-link-row span")?.getAttribute("title")).toContain("Resolve the conflict in the GitHub tab");
}

async function testRetainsFailedNoteSubmissionsAndDisplaysTheLatestUnlinkError() {
  const evidence = { kind: "note" as const, id: randomUUID(), cardId, note: "Existing origin", createdAt: new Date().toISOString() };
  state.snapshot.sourceLinks = [evidence];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}/source-links`
    ? Promise.resolve(Response.json({ code: "validation", message: init?.method === "DELETE" ? "Unlink refused" : "Note refused" }, { status: init?.method === "DELETE" ? 403 : 400 })) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const note = [...document.querySelectorAll("label")].find((label) => label.textContent === "Origin note")!.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Retained draft");
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Link origin note").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("Request failed: 400"));
  expect(note.value).toBe("Retained draft");
  expect(button("Link origin note").disabled).toBe(false);
  const unlink = document.querySelector<HTMLButtonElement>('[aria-label="Unlink Existing origin"]')!;
  await act(async () => unlink.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("Request failed: 403"));
  expect(unlink.disabled).toBe(false);
  expect(state.snapshot.sourceLinks).toEqual([evidence]);
  expect(note.value).toBe("Retained draft");
}

async function testShowsARefusedGitHubLinkWithoutLosingTheSelectionOrAdding() {
  const identityId = randomUUID();
  state.snapshot.githubLinks = [{ id: identityId, cardId: state.snapshot.cards[0]!.id, repo: "owner/repository", issueNumber: 42, url: "https://github.com/owner/repository/issues/42", syncState: "synced" }];
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}/source-links`
    ? Promise.resolve(Response.json({ code: "not_found", message: "GitHub Issue not found" }, { status: 404 })) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Existing GitHub issue"))!.querySelector("select")!;
  await act(async () => { select.value = identityId; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Link GitHub issue").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("Request failed: 404"));
  expect(select.value).toBe(identityId);
  expect(button("Link GitHub issue").disabled).toBe(false);
  expect(state.snapshot.sourceLinks).toEqual([]);
}
