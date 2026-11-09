import { z } from "zod";
import { DomainError } from "@storymapper/contracts/schemas/errors";

export const workItemProviderSchema = z.enum(["github"]);
export type WorkItemProvider = z.infer<typeof workItemProviderSchema>;

export function providerRegistration<T>(ids: readonly string[], handlers: Record<string, T>): Readonly<Record<string, T>> {
  const keys = Object.keys(handlers);
  if (keys.length !== ids.length || ids.some((id) => !Object.hasOwn(handlers, id)) || keys.some((id) => !ids.includes(id))) throw new DomainError("validation", "Provider registration must exactly match the provider enum.");
  return Object.freeze(Object.assign(Object.create(null) as Record<string, T>, handlers));
}

export function registeredProvider<T>(handlers: Readonly<Record<string, T>>, provider: unknown): T {
  if (typeof provider !== "string" || !Object.hasOwn(handlers, provider)) throw new DomainError("validation", "Unknown work-item provider.");
  return handlers[provider]!;
}
