import { expect, it, vi } from "vitest";
import { connectorConnectionSchema, providerRegistration, registeredProvider, workItemProviderSchema } from "@storymapper/contracts";
import { createWorkItemProvider, workItemProviderFactories } from "@storymapper/github";
import { providerCredentials, providerCredentialStatuses, resolveProviderAuth } from "@storymapper/server/services/credentials";

it("ships exactly the contracts enum in both complete immutable registrations", () => {
  expect(workItemProviderSchema.options).toEqual(["github"]);
  for (const registration of [workItemProviderFactories, providerCredentials]) {
    expect(Object.keys(registration)).toEqual(workItemProviderSchema.options);
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.getPrototypeOf(registration)).toBeNull();
  }
  expect(createWorkItemProvider("github")).toBeDefined();
  expect(providerCredentials.github).toMatchObject({ status: expect.any(Function), auth: expect.any(Function) });
});

it.each([undefined, null, 1, {}, [], "", "missing", "toString", "constructor", "__proto__"])("refuses malformed, inherited or unknown runtime provider %j before any handler", (provider) => {
  const handler = vi.fn();
  const registry = providerRegistration(["github"], { github: handler });
  expect(() => registeredProvider(registry, provider)).toThrow(expect.objectContaining({ code: "validation", message: "Unknown work-item provider." }));
  expect(() => createWorkItemProvider(provider)).toThrow(expect.objectContaining({ code: "validation" }));
  expect(() => providerCredentialStatuses(provider)).toThrow(expect.objectContaining({ code: "validation" }));
  const connection = { provider } as unknown as ReturnType<typeof connectorConnectionSchema.parse>;
  expect(() => resolveProviderAuth(connection)).toThrow(expect.objectContaining({ code: "validation" }));
  expect(handler).not.toHaveBeenCalled();
});

it("rejects missing, inherited and foreign registrations for either production or extended enum", () => {
  const handler = vi.fn();
  for (const ids of [["github"], ["github", "extension-fixture"]]) {
    for (const handlers of [{}, { foreign: handler }, Object.create({ github: handler }) as Record<string, typeof handler>]) {
      expect(() => providerRegistration(ids, handlers)).toThrow(expect.objectContaining({ code: "validation" }));
    }
  }
  expect(() => providerRegistration(["github", "extension-fixture"], { github: handler })).toThrow(expect.objectContaining({ code: "validation" }));
  expect(() => providerRegistration(["github"], { github: handler, foreign: handler })).toThrow(expect.objectContaining({ code: "validation" }));
  const extension = providerRegistration(["github", "extension-fixture"], { github: handler, "extension-fixture": handler });
  expect(Object.keys(extension)).toEqual(["github", "extension-fixture"]);
  expect(registeredProvider(extension, "extension-fixture")).toBe(handler);
  expect(handler).not.toHaveBeenCalled();
});
