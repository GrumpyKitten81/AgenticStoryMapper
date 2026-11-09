import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useSourceCoverage, useSourceDocumentDetails, useSourceDocuments } from "@storymapper/web/app/api";

interface SourceDocumentsPanelProps {
  projectId?: string | undefined;
}

export function SourceDocumentsPanel(props: SourceDocumentsPanelProps) {
  return renderSourceDocumentsPanel(useSourceDocumentsPanelState(props));
}

function useSourceDocumentsPanelState({ projectId }: SourceDocumentsPanelProps) {
  const queryClient = useQueryClient();
  const documents = useSourceDocuments(projectId);
  const coverage = useSourceCoverage(projectId);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"markdown" | "txt">("markdown");
  const [content, setContent] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const selectedDocument = useSourceDocumentDetails(selectedDocumentId || undefined);
  const importDocument = useMutation({
    mutationFn: api.importSourceDocument,
    onSuccess: (result) => {
      setTitle("");
      setContent("");
      setSelectedDocumentId(result.document.id);
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["card-reviews", projectId] });
        queryClient.invalidateQueries({ queryKey: ["source-documents", projectId] });
        queryClient.invalidateQueries({ queryKey: ["source-coverage", projectId] });
      }
      queryClient.invalidateQueries({ queryKey: ["source-document", result.document.id] });
    }
  });

  function submitImport() {
    if (!projectId || !title.trim() || !content.trim()) return;
    importDocument.mutate({
      projectId,
      title: title.trim(),
      type,
      content
    });
  }

  const documentList = documents.data?.documents ?? [];
  return { coverage, title, setTitle, type, setType, content, setContent, submitImport, projectId, importDocument, documentList, selectedDocumentId, setSelectedDocumentId, selectedDocument };
}

function renderSourceDocumentsPanel(model: ReturnType<typeof useSourceDocumentsPanelState>) {
  const { coverage, title, setTitle, type, setType, content, setContent, submitImport, projectId, importDocument, documentList, selectedDocumentId, setSelectedDocumentId, selectedDocument } = model;
  return (
    <section className="panel form-stack">
      <h2>{panelStrings.sourcesTitle}</h2>
      <div className="coverage-meter">
        <span>{panelStrings.coverage}</span>
        <strong>{Math.round((coverage.data?.coverageRatio ?? 0) * 100)}{panelStrings.percentSymbol}</strong>
      </div>
      <label>
        {panelStrings.title}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={panelStrings.sourceTitlePlaceholder} />
      </label>
      <label>
        {panelStrings.type}<select value={type} onChange={(event) => setType(event.target.value as "markdown" | "txt")}>
          <option value="markdown">{panelStrings.markdown}</option>
          <option value="txt">{panelStrings.plainText}</option>
        </select>
      </label>
      <label>
        {panelStrings.content}<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={panelStrings.requirementSection} />
      </label>
      <div className="button-row">
        <button type="button" onClick={submitImport} disabled={!projectId || importDocument.isPending}>
          {panelStrings.importSource}</button>
      </div>
      {importDocument.data?.status === "unchanged" ? <p role="status">{panelStrings.sourceUnchanged}</p> : null}
      {importDocument.error ? <p role="alert">{importDocument.error.message}</p> : null}
      <div className="source-document-list">
        {documentList.map((document) => (
          <button
            type="button"
            className={selectedDocumentId === document.id ? "source-document selected" : "source-document"}
            key={document.id}
            onClick={() => setSelectedDocumentId(document.id)}
          >
            <span>{document.title}</span>
            <strong>{document.linkedChunkCount}{panelStrings.ratioSeparator}{document.chunkCount}</strong>
          </button>
        ))}
      </div>
      {selectedDocument.data ? (
        renderSourceDocumentDetails(model, selectedDocument.data)
      ) : null}
    </section>
  );
}

function renderSourceDocumentDetails(model: ReturnType<typeof useSourceDocumentsPanelState>, data: NonNullable<ReturnType<typeof useSourceDocumentsPanelState>["selectedDocument"]["data"]>) {
  const { selectedDocument } = model;
  return <div className="source-chunk-list">
    {data.chunks.map((chunk) => {
      const cards = data.linkedCardsByChunkId[chunk.id] ?? [];
      return (
        <article className="source-chunk" key={chunk.id}>
          <strong>{chunk.locator}</strong>
          <p>{chunk.text}</p>
          {cards.length > 0 ? (
            <div className="card-badges">
              {cards.map((card) => (
                <span key={card.id}>{card.key}</span>
              ))}
            </div>
          ) : null}
        </article>
      );
    })}
  </div>;
}
