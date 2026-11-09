import { workItemProviderSchema, providerRegistration, registeredProvider, type WorkItemProvider as WorkItemProviderId } from "@storymapper/contracts";
import type { WorkItemProvider } from "./work-item-provider";
import { GitHubProvider } from "./github-provider";

export const workItemProviderFactories = providerRegistration<() => WorkItemProvider>(workItemProviderSchema.options, { github: () => new GitHubProvider() } satisfies Record<WorkItemProviderId, () => WorkItemProvider>);

export function createWorkItemProvider(provider: unknown): WorkItemProvider {
  return registeredProvider(workItemProviderFactories, provider)();
}

export * from "./work-item-provider";
export * from "./github-provider";

export * from "./normalized-identity";
