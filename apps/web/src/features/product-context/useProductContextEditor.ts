import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductContext } from "@storymapper/contracts";
import { api, useProductContext } from "@storymapper/web/app/api";
import { productContextStrings as strings } from "@storymapper/web/ui-strings/product-context";

export type ProductContextDraft = ReturnType<typeof contextFields>;

function contextFields(context?: ProductContext) {
  return {
    productType: context?.productType ?? "", purpose: context?.purpose ?? "", workingRules: context?.workingRules ?? "", keyFeatures: context?.keyFeatures.join("\n") ?? "",
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
  const completeSave = (context: ProductContext, submitted: ProductContextDraft, submittedScope: string) => {
    if (baseline.current.scope !== submittedScope || scope !== submittedScope) return;
    const fields = contextFields(context);
    baseline.current = { scope: submittedScope, fields };
    setContextDraft((draft) => JSON.stringify(draft) === JSON.stringify(submitted) ? fields : draft);
  };
  return { contextDraft, setContextDraft, completeSave };
}

export function useProductContextEditor(projectId: string, storyMapId: string) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const productContext = useProductContext(projectId, storyMapId);
  const scope = `${projectId}:${storyMapId}`;
  const { contextDraft, setContextDraft, completeSave } = useContextDraft(productContext, scope);
  const saveContext = useMutation({
    mutationFn: async () => {
      const submitted = { ...contextDraft };
      const result = await api.upsertProductContext({ projectId, storyMapId, ...submitted, keyFeatures: submitted.keyFeatures.split("\n").map((value) => value.trim()).filter(Boolean) });
      return { ...result, submitted, scope };
    },
    onSuccess: (result) => {
      completeSave(result.context, result.submitted, result.scope);
      setMessage(strings.saved);
      void queryClient.invalidateQueries({ queryKey: ["product-context", projectId, storyMapId] });
      void queryClient.invalidateQueries({ queryKey: ["card-reviews", projectId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : strings.saveFailed)
  });
  return { contextDraft, setContextDraft, saveContext, message };
}
