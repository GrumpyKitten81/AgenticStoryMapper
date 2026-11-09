import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Card, StoredChangeSet, CreateAiProposalRequest, McpCallRequest, ProductContext, Release } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useAiFunctionTemplates, useChangeSets, useMcpTools, useProductContext, useSourceDocuments } from "@storymapper/web/app/api";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

export interface AiMcpPanelProps { projectId?: string | undefined; storyMapId?: string | undefined; cards: Card[]; releases: Release[] }
interface EditorDeps { projectId?: string | undefined; storyMapId?: string | undefined; queryClient: QueryClient; setMessage: Dispatch<SetStateAction<string>> }
export type AiMcpPanelState = AiMcpPanelProps & ReturnType<typeof usePanelQueries> & ReturnType<typeof useContextEditor> & ReturnType<typeof useProposalEditor> & ReturnType<typeof useDecisionActions> & {
  sourceDocumentId: string; setSourceDocumentId: Dispatch<SetStateAction<string>>; message: string; latestChangeSets: StoredChangeSet[]; storyCards: Card[];
};

export function useAiMcpPanelState(props: AiMcpPanelProps): AiMcpPanelState {
  const queries = usePanelQueries(props.projectId);
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [message, setMessage] = useState("");
  const deps: EditorDeps = { projectId: props.projectId, storyMapId: props.storyMapId, queryClient: queries.queryClient, setMessage };
  const context = useContextEditor(deps);
  const proposal = useProposalEditor(deps, sourceDocumentId, props.releases);
  const actions = useDecisionActions(deps);
  const latestChangeSets = (queries.changeSets.data?.changeSets ?? []).slice().reverse().slice(0, 6);
  const storyCards = visibleCards(props.cards).filter((card) => card.level === "story");
  return { ...props, ...queries, ...context, ...proposal, ...actions, sourceDocumentId, setSourceDocumentId, message, latestChangeSets, storyCards };
}

function usePanelQueries(projectId?: string) {
  const queryClient = useQueryClient();
  const tools = useMcpTools(projectId);
  const changeSets = useChangeSets(projectId);
  const documents = useSourceDocuments(projectId);
  const templates = useAiFunctionTemplates(projectId);
  return { queryClient, tools, changeSets, documents, templates };
}

function contextFields(context?: ProductContext) {
  return {
    productType: context?.productType ?? "", purpose: context?.purpose ?? "", keyFeatures: context?.keyFeatures.join("\n") ?? "",
    targetUsers: context?.targetUsers ?? "", platform: context?.platform ?? "", pricing: context?.pricing ?? "", notes: context?.notes ?? "",
    glossary: context?.glossary ?? "", nonGoals: context?.nonGoals ?? "", complianceConstraints: context?.complianceConstraints ?? ""
  };
}

function useContextDraft(productContext: ReturnType<typeof useProductContext>, scope: string) {
  const [contextDraft, setContextDraft] = useState(() => contextFields(productContext.data?.context));
  const baseline = useRef({ scope, fields: contextDraft });
  const current = useRef(contextDraft);
  current.current = contextDraft;
  useEffect(() => {
    const context = productContext.data?.context;
    if (baseline.current.scope === scope && (!context || JSON.stringify(current.current) !== JSON.stringify(baseline.current.fields))) return;
    const fields = contextFields(context);
    baseline.current = { scope, fields };
    setContextDraft(fields);
  }, [scope, productContext.data?.context]);
  const completeSave = (context: ProductContext, submitted: typeof contextDraft, submittedScope: string) => {
    if (baseline.current.scope !== submittedScope || scope !== submittedScope) return;
    const fields = contextFields(context);
    baseline.current = { scope: submittedScope, fields };
    setContextDraft((draft) => JSON.stringify(draft) === JSON.stringify(submitted) ? fields : draft);
  };
  return { contextDraft, setContextDraft, completeSave };
}

function useContextEditor({ projectId, storyMapId, queryClient, setMessage }: EditorDeps) {
  const productContext = useProductContext(projectId, storyMapId);
  const scope = `${projectId ?? ""}:${storyMapId ?? ""}`;
  const { contextDraft, setContextDraft, completeSave } = useContextDraft(productContext, scope);
  const saveContext = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error(panelStrings.projectIsRequired);
      const submitted = { ...contextDraft };
      const result = await api.upsertProductContext({
        projectId,
        storyMapId: storyMapId ?? null,
        productType: contextDraft.productType,
        purpose: contextDraft.purpose,
        keyFeatures: contextDraft.keyFeatures.split("\n").map((value) => value.trim()).filter(Boolean),
        targetUsers: contextDraft.targetUsers,
        platform: contextDraft.platform,
        pricing: contextDraft.pricing,
        notes: contextDraft.notes,
        glossary: contextDraft.glossary,
        nonGoals: contextDraft.nonGoals,
        complianceConstraints: contextDraft.complianceConstraints
      });
      return { ...result, submitted, scope };
    },
    onSuccess: (result) => {
      completeSave(result.context, result.submitted, result.scope);
      setMessage(panelStrings.productContextSaved);
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["product-context", projectId, storyMapId] });
        void queryClient.invalidateQueries({ queryKey: ["card-reviews", projectId] });
      }
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.productContextSaveFailed)
  });
  return { contextDraft, setContextDraft, saveContext };
}

function useProposalEditor({ projectId, storyMapId, queryClient, setMessage }: EditorDeps, sourceDocumentId: string, releases: Release[]) {
  const [proposalDraft, setProposalDraft] = useState<{
    templateId: CreateAiProposalRequest["templateId"];
    cardIds: string[];
    releaseId: string;
  }>({
    templateId: "acceptance-criteria",
    cardIds: [],
    releaseId: ""
  });
  const releaseTarget = proposalDraft.releaseId === "new" ? { kind: "new" as const }
    : releases.some((release) => release.id === proposalDraft.releaseId && release.storyMapId === storyMapId)
      ? { kind: "existing" as const, releaseId: proposalDraft.releaseId } : undefined;
  const createProposal = useMutation({
    mutationFn: () => {
      if (!projectId || !storyMapId) throw new Error(panelStrings.projectAndStoryMapAreRequired);
      if (!isPersonasEnabled && proposalDraft.templateId === "personas") throw new Error("Persona feature is disabled");
      if (proposalDraft.templateId === "release-slice" && !releaseTarget) throw new Error(panelStrings.selectReleaseTarget);
      const input = {
        projectId, storyMapId,
        sourceDocumentId: sourceDocumentId || undefined
      };
      return proposalDraft.templateId === "release-slice"
        ? api.createAiProposal({ ...input, templateId: "release-slice", releaseTarget: releaseTarget! })
        : api.createAiProposal({ ...input, templateId: proposalDraft.templateId, cardIds: proposalDraft.cardIds.length ? proposalDraft.cardIds : undefined, releaseId: proposalDraft.releaseId !== "new" ? proposalDraft.releaseId || undefined : undefined });
    },
    onSuccess: (result) => {
      setMessage(panelStrings.created(result.changeSet.title));
      invalidateHub(queryClient, projectId, storyMapId);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : panelStrings.proposalFailed)
  });
  return { proposalDraft, setProposalDraft, createProposal, releaseTarget };
}

function useDecisionActions({ projectId, storyMapId, queryClient }: EditorDeps) {
  const callTool = useMutation({
    mutationFn: (input: McpCallRequest) => api.callMcpTool(input),
    onSuccess: () => invalidateHub(queryClient, projectId)
  });
  const approve = useMutation({
    mutationFn: api.approveChangeSet,
    onSuccess: () => invalidateHub(queryClient, projectId)
  });
  const reject = useMutation({
    mutationFn: api.rejectChangeSet,
    onSuccess: () => invalidateHub(queryClient, projectId)
  });
  const apply = useMutation({
    mutationFn: api.applyChangeSet,
    onSuccess: () => invalidateHub(queryClient, projectId, storyMapId)
  });
  return { callTool, approve, reject, apply };
}

function invalidateHub(queryClient: ReturnType<typeof useQueryClient>, projectId?: string, storyMapId?: string): void {
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["changesets", projectId] });
    queryClient.invalidateQueries({ queryKey: ["mcp-tools", projectId] });
    queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
    queryClient.invalidateQueries({ queryKey: ["source-documents", projectId] });
    queryClient.invalidateQueries({ queryKey: ["source-coverage", projectId] });
  }
  if (storyMapId) {
    queryClient.invalidateQueries({ queryKey: ["story-map", storyMapId] });
    queryClient.invalidateQueries({ queryKey: ["backlog-health", storyMapId] });
  }
}
