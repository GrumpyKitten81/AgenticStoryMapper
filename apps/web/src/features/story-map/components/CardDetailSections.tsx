import { useState } from "react";
import type { Card, CardSourceLink, CreateCardSourceLinkRequest, StoryMapSnapshot } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function ChipSection<T extends { id: string; name: string; color?: string }>({ title, items, linkedIds, onToggle, disabled, disabledIds }: { disabled?: boolean; disabledIds?: ReadonlySet<string>; title: string; items: T[]; linkedIds: Set<string>; onToggle: (id: string, linked: boolean) => void }) {
  return (
    <section className="source-link-section">
      <h2>{title}</h2>
      {items.length === 0 ? <p>{strings.noConfiguredItems(title)}</p> : null}
      <div className="detail-chip-list">
        {items.map((item) => {
          const linked = linkedIds.has(item.id);
          return <button type="button" disabled={disabled || disabledIds?.has(item.id)} className={linked ? "detail-chip selected" : "detail-chip"} style={{ background: linked ? item.color : undefined }} key={item.id} onClick={() => onToggle(item.id, linked)}>{item.name}</button>;
        })}
      </div>
    </section>
  );
}

export function DetailSourceSections(props: {
  card: Card;
  documents: Array<{ id: string; title: string }>;
  selectedDocumentId: string;
  setSelectedDocumentId: (id: string) => void;
  linkedSourceLinks: StoryMapSnapshot["sourceLinks"];
  selectedChunks: StoryMapSnapshot["sourceChunks"];
  selectedChunkById: Map<string, StoryMapSnapshot["sourceChunks"][number]>;
  githubLinks: StoryMapSnapshot["githubLinks"];
  error: string | undefined;
  pending: boolean;
  createSourceLink: (evidence: CreateCardSourceLinkRequest, onSuccess?: () => void) => void;
  deleteSourceLink: (evidence: Pick<CardSourceLink, "kind" | "id">) => void;
}) {
  return renderDetailSourceSections(useDetailSourceSectionsState(props));
}

function useDetailSourceSectionsState({ card, documents, selectedDocumentId, setSelectedDocumentId, linkedSourceLinks, selectedChunks, selectedChunkById, githubLinks, error, pending, createSourceLink, deleteSourceLink }: {
  card: Card;
  documents: Array<{ id: string; title: string }>;
  selectedDocumentId: string;
  setSelectedDocumentId: (id: string) => void;
  linkedSourceLinks: StoryMapSnapshot["sourceLinks"];
  selectedChunks: StoryMapSnapshot["sourceChunks"];
  selectedChunkById: Map<string, StoryMapSnapshot["sourceChunks"][number]>;
  githubLinks: StoryMapSnapshot["githubLinks"];
  error: string | undefined;
  pending: boolean;
  createSourceLink: (evidence: CreateCardSourceLinkRequest, onSuccess?: () => void) => void;
  deleteSourceLink: (evidence: Pick<CardSourceLink, "kind" | "id">) => void;
}) {
  const [note, setNote] = useState("");
  const [externalRefId, setExternalRefId] = useState("");
  const availableIssues = githubLinks.filter((issue) => issue.issueNumber && !linkedSourceLinks.some((link) => link.kind === "github" && link.repoFullName === issue.repo && link.issueNumber === issue.issueNumber));
  const provenanceLabel = { inference: strings.inferred, unknown: strings.originNotRecorded, manual: strings.manualOrigin, linked: strings.linkedOrigin }[card.provenance];
  const linkNote = () => {
    const submitted = note;
    createSourceLink({ kind: "note", note: submitted }, () => setNote((current) => current === submitted ? "" : current));
  };
  return { provenanceLabel, card, linkedSourceLinks, selectedChunkById, documents, pending, deleteSourceLink, selectedDocumentId, setSelectedDocumentId, selectedChunks, createSourceLink, note, setNote, linkNote, externalRefId, setExternalRefId, availableIssues, error };
}

function renderDetailSourceSections({ provenanceLabel, card, linkedSourceLinks, selectedChunkById, documents, pending, deleteSourceLink, selectedDocumentId, setSelectedDocumentId, selectedChunks, createSourceLink, note, setNote, linkNote, externalRefId, setExternalRefId, availableIssues, error }: ReturnType<typeof useDetailSourceSectionsState>) {
  return (
    <section className="source-link-section">
      <h2>{strings.sources}</h2>
      <span className="custom-chip">{provenanceLabel}</span>
      {card.creationOrigin === "unknown" && card.provenance !== "unknown" ? <span className="custom-chip">{strings.originNotRecorded}</span> : null}
      {linkedSourceLinks.length === 0 ? <p>{strings.noSourceLinksYet}</p> : null}
      {linkedSourceLinks.map((link) => {
        const chunk = link.kind === "chunk" ? selectedChunkById.get(link.chunkId) : undefined;
        const document = chunk ? documents.find((item) => item.id === chunk.documentId) : undefined;
        const label = link.kind === "chunk" ? chunk ? `${document?.title ?? ""} ${strings.chunkPreview(chunk.locator, chunk.text)}`.trim() : strings.sourceChunk(link.chunkId) : link.kind === "github" ? strings.legacyIssueLabel(link.repoFullName, link.issueNumber) : link.note;
        const removesIdentity = link.kind === "github" && link.id === link.externalRefId;
        return <div className="source-link-row" key={link.id}><span>{label}</span>{link.kind === "github" ? <a href={link.url} target="_blank" rel="noreferrer">{strings.open}</a> : null}<button type="button" className={removesIdentity ? "danger" : "secondary"} disabled={pending} aria-label={removesIdentity ? strings.removeIssueIdentityLabel(label) : strings.unlinkOrigin(label)} onClick={() => deleteSourceLink({ kind: link.kind, id: link.id })}>{removesIdentity ? strings.removeIssueIdentity : strings.unlink}</button>{removesIdentity ? <small>{strings.removeIssueIdentityExplanation}</small> : null}</div>;
      })}
      <label>{strings.sourceDocument}<select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}><option value="">{strings.selectDocument}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
      {selectedChunks.length > 0 ? (
        <div className="chunk-picker">
          {selectedChunks.map((chunk) => {
            const linked = linkedSourceLinks.some((link) => link.kind === "chunk" && link.chunkId === chunk.id);
            return <button type="button" className={linked ? "chunk-option linked" : "chunk-option"} key={chunk.id} disabled={linked || pending} onClick={() => createSourceLink({ kind: "chunk", chunkId: chunk.id })}><strong>{chunk.locator}</strong><span>{chunk.text.slice(0, 120)}</span></button>;
          })}
        </div>
      ) : null}
      <label>{strings.originNote}<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button type="button" disabled={!note.trim() || pending} onClick={linkNote}>{strings.linkOriginNote}</button>
      <label>{strings.existingGitHubIssue}<select value={externalRefId} onChange={(event) => setExternalRefId(event.target.value)}><option value="">{strings.selectGitHubIssue}</option>{availableIssues.map((issue) => <option key={issue.id} value={issue.id}>{strings.legacyIssueLabel(issue.repo, issue.issueNumber!)}</option>)}</select></label>
      <button type="button" disabled={!availableIssues.some((issue) => issue.id === externalRefId) || pending} onClick={() => createSourceLink({ kind: "github", externalRefId })}>{strings.linkGitHubIssue}</button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
