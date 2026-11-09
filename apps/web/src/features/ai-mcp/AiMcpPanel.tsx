import { useChangeSetReview } from "@storymapper/web/features/changesets";
import { ChangeSetReview } from "@storymapper/web/features/changesets";
import { changeSetStrings } from "@storymapper/ui-strings";
import { useState, type ReactElement } from "react";
import { Bot, Check, FileCode2, Scissors, Sparkles } from "lucide-react";
import { type StoredChangeSet, type CreateAiProposalRequest } from "@storymapper/contracts";
import { builtinProposalTemplateSchema } from "@storymapper/contracts";
import { defaultAiFunctionTemplates } from "@storymapper/core";
import { panelStrings } from "@storymapper/ui-strings";
import { useAiMcpPanelState, type AiMcpPanelProps } from "@storymapper/web/features/ai-mcp/useAiMcpPanelState";
import { TemplateEditor } from "@storymapper/web/features/ai-mcp/TemplateEditor";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";
import { AgentSetupPanel } from "@storymapper/web/features/ai-mcp/AgentSetupPanel";

type PanelState = ReturnType<typeof useAiMcpPanelState>;
interface PanelViewProps { state: PanelState }

export function AiMcpPanel(props: AiMcpPanelProps): ReactElement {
  return <AiMcpPanelView state={useAiMcpPanelState(props)} />;
}

function AiMcpPanelView({ state }: PanelViewProps): ReactElement {
  const { tools, templates, message } = state;
  return <section className="panel ai-mcp-panel form-stack">
    <div className="panel-heading-row"><h2>{panelStrings.aiMcp}</h2><Bot size={16} /></div>
    <div className="tool-list">{(tools.data?.tools ?? []).map((tool) => <span className={tool.enabled ? "tool-pill enabled" : "tool-pill"} key={tool.name}>{tool.name}</span>)}</div>
    {message ? <p className="sync-message">{message}</p> : null}
    <ProductContextView state={state} />
    {templates.error ? <p role="alert">{templates.error.message}</p> : null}
    {state.projectId ? <TemplateEditor key={state.projectId} projectId={state.projectId} templates={templates.data?.templates ?? []} /> : null}
    <AiProposalView state={state} />
    <AgentSetupPanel />
    <SourceActionsView state={state} />
    <ChangeSetsView state={state} />
  </section>;
}

function ProductContextView({ state }: PanelViewProps): ReactElement {
  const { contextDraft, setContextDraft, saveContext, projectId } = state;
  return <>
    <div className="product-context-panel form-stack">
      <div className="panel-heading-row">
        <h3>{panelStrings.productContext}</h3>
        <Sparkles size={15} />
      </div>
      <div className="context-grid form-stack">
        <label>{panelStrings.productType}<input value={contextDraft.productType} onChange={(event) => setContextDraft((draft) => ({ ...draft, productType: event.target.value }))} /></label>
        <label>{panelStrings.purpose}<input value={contextDraft.purpose} onChange={(event) => setContextDraft((draft) => ({ ...draft, purpose: event.target.value }))} /></label>
        <label>{panelStrings.targetUsers}<input value={contextDraft.targetUsers} onChange={(event) => setContextDraft((draft) => ({ ...draft, targetUsers: event.target.value }))} /></label>
        <label>{panelStrings.platform}<input value={contextDraft.platform} onChange={(event) => setContextDraft((draft) => ({ ...draft, platform: event.target.value }))} /></label>
        <label>{panelStrings.pricing}<input value={contextDraft.pricing} onChange={(event) => setContextDraft((draft) => ({ ...draft, pricing: event.target.value }))} /></label>
        <label>{panelStrings.compliance}<input value={contextDraft.complianceConstraints} onChange={(event) => setContextDraft((draft) => ({ ...draft, complianceConstraints: event.target.value }))} /></label>
      </div>
      <label>{panelStrings.keyFeatures}<textarea rows={4} value={contextDraft.keyFeatures} onChange={(event) => setContextDraft((draft) => ({ ...draft, keyFeatures: event.target.value }))} /></label>
      <label>{panelStrings.notes}<textarea rows={3} value={contextDraft.notes} onChange={(event) => setContextDraft((draft) => ({ ...draft, notes: event.target.value }))} /></label>
      <label>{panelStrings.glossary}<textarea rows={3} value={contextDraft.glossary} onChange={(event) => setContextDraft((draft) => ({ ...draft, glossary: event.target.value }))} /></label>
      <label>{panelStrings.nonGoals}<textarea rows={3} value={contextDraft.nonGoals} onChange={(event) => setContextDraft((draft) => ({ ...draft, nonGoals: event.target.value }))} /></label>
      <button type="button" onClick={() => saveContext.mutate()} disabled={!projectId || saveContext.isPending}>
        <Check size={16} /> {panelStrings.saveContext}</button>
    </div>
  </>;
}

function ProposalSelectors({ state }: PanelViewProps): ReactElement {
  const { proposalDraft, setProposalDraft, releases } = state;
  return <>
    <label>
      {panelStrings.proposalAction}<select value={proposalDraft.templateId} onChange={(event) => setProposalDraft((draft) => ({ ...draft, templateId: event.target.value as CreateAiProposalRequest["templateId"] }))}>
        {defaultAiFunctionTemplates.filter((template) => (isPersonasEnabled || template.id !== "personas") && builtinProposalTemplateSchema.safeParse(template.id).success).map((template) => (
          <option key={template.id} value={template.id}>{template.name}</option>
        ))}
      </select>
    </label>
    <label>
      {panelStrings.releaseTarget}<select value={proposalDraft.releaseId} onChange={(event) => setProposalDraft((draft) => ({ ...draft, releaseId: event.target.value }))}>
        <option value="">{panelStrings.selectReleaseTarget}</option>
        <option value="new">{panelStrings.newRelease}</option>
        {releases.filter((release) => release.storyMapId === state.storyMapId).map((release) => (
          <option key={release.id} value={release.id}>{release.name}</option>
        ))}
      </select>
    </label>
  </>;
}

function StoryCardPicker({ state }: PanelViewProps): ReactElement {
  const { storyCards, proposalDraft, setProposalDraft } = state;
  return <>
    <div className="card-pick-list">
      {storyCards.slice(0, 10).map((card) => (
        <label key={card.id} className="checkbox-row">
          <input
            type="checkbox"
            checked={proposalDraft.cardIds.includes(card.id)}
            onChange={(event) => setProposalDraft((draft) => ({
              ...draft,
              cardIds: event.target.checked ? [...draft.cardIds, card.id] : draft.cardIds.filter((id) => id !== card.id)
            }))}
          />
          {card.key} {card.title}
        </label>
      ))}
    </div>
  </>;
}

function AiProposalView({ state }: PanelViewProps): ReactElement {
  const { projectId, storyMapId, createProposal } = state;
  return <>
    <div className="mcp-config-panel form-stack">
      <div className="panel-heading-row">
        <h3>{panelStrings.aiProposal}</h3>
        <Sparkles size={15} />
      </div>
      <ProposalSelectors state={state} />
      {state.proposalDraft.templateId !== "release-slice" ? <StoryCardPicker state={state} /> : null}
      <button type="button" onClick={() => createProposal.mutate()} disabled={!projectId || !storyMapId || (!isPersonasEnabled && state.proposalDraft.templateId === "personas") || createProposal.isPending || (state.proposalDraft.templateId === "release-slice" && !state.releaseTarget)}>
        <Sparkles size={16} /> {panelStrings.createProposal}</button>
    </div>
  </>;
}

function SourceActionsView({ state }: PanelViewProps): ReactElement {
  const { projectId, storyMapId, sourceDocumentId, setSourceDocumentId, documents, callTool } = state;
  function proposeFromSource(): void {
    if (!projectId || !storyMapId || !sourceDocumentId) return;
    callTool.mutate({ name: "ProposeMapFromSourceDocument", input: { projectId, storyMapId, sourceDocumentId, mode: "gap-fill" } });
  }
  function proposeBacklogGrooming(): void {
    if (storyMapId) callTool.mutate({ name: "ProposeBacklogGrooming", input: { storyMapId } });
  }
  function proposeReleaseSlice(): void {
    if (storyMapId && state.releaseTarget) callTool.mutate({ name: "ProposeReleaseSlice", input: { storyMapId, releaseTarget: state.releaseTarget } });
  }
  return <>
    <label>
      {panelStrings.sourceDocument}<select value={sourceDocumentId} onChange={(event) => setSourceDocumentId(event.target.value)}>
        <option value="">{panelStrings.selectSource}</option>
        {(documents.data?.documents ?? []).map((document) => (
          <option key={document.id} value={document.id}>
            {document.title}
          </option>
        ))}
      </select>
    </label>

    {callTool.error && (callTool.variables?.input as { storyMapId?: string } | undefined)?.storyMapId === storyMapId ? <p role="alert">{callTool.error.message}</p> : null}
    <div className="button-row">
      <button type="button" onClick={proposeFromSource} disabled={!projectId || !storyMapId || !sourceDocumentId || callTool.isPending}>
        <FileCode2 size={16} /> {panelStrings.sourceMap}</button>
      <button type="button" className="secondary" onClick={proposeBacklogGrooming} disabled={!storyMapId || callTool.isPending}>
        <Sparkles size={16} /> {panelStrings.grooming}</button>
      <button type="button" className="secondary" onClick={proposeReleaseSlice} disabled={!storyMapId || !state.releaseTarget || callTool.isPending}>
        <Scissors size={16} /> {panelStrings.slice}</button>
    </div>
  </>;
}

function ChangeSetsView({ state }: PanelViewProps): ReactElement {
  const { latestChangeSets } = state;
  return <>
    <div className="changeset-list">
      {latestChangeSets.map((changeSet) => (
        <ReviewItem key={changeSet.id} changeSet={changeSet} storyMapId={state.storyMapId} />
      ))}
    </div>

    {latestChangeSets.length === 0 ? <p>{panelStrings.noChangeSetsProposedYet}</p> : null}
  </>;
}

function ReviewItem({ changeSet, storyMapId }: { changeSet: StoredChangeSet; storyMapId: string | undefined }) {
  const [open, setOpen] = useState(true);
  const search = new URLSearchParams(window.location.search);
  search.set("preview", changeSet.id);
  return <article className={`changeset-item ${changeSet.status}`}><h3>{changeSet.title}</h3><div className="button-row"><button type="button" className="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>{changeSetStrings.review}</button>
    {storyMapId ? <a className="button-link secondary" href={`/projects/${changeSet.projectId}/story-maps/${storyMapId}/tree?${search}`}>{changeSetStrings.board}</a> : null}</div>
    {open ? <OpenReview id={changeSet.id} /> : null}</article>;
}
function OpenReview({ id }: { id: string }) { return <ChangeSetReview state={useChangeSetReview(id)} />; }
