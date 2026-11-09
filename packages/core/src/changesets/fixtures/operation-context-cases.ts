import { expect } from "vitest";
import { productContextSchema } from "@storymapper/contracts";
import { resolveOperation } from "@storymapper/core";
import { id, createdAt, operation, update, snapshot, supply } from "@storymapper/core/changesets/fixtures/operation-resolution-fixture";

export function testValidatesProductContextMetadataAgainstActualProjectAndMapOwnership(): void {
  const state = snapshot();
  state.productContexts.push(productContextSchema.parse({ id: id(40), projectId: id(1), storyMapId: id(2), updatedAt: createdAt }));
  const op = operation({ ...update("context", id(5), "Changed"), context: { templateId: "story-writing", productContextId: id(40), storyMapId: id(2) } });
  const original = structuredClone(state);
  expect(resolveOperation(state, op, supply([op])).status).toBe("changed");
  const projectScoped = structuredClone(state);
  projectScoped.productContexts[0]!.storyMapId = null;
  expect(resolveOperation(projectScoped, op, supply([op])).status).toBe("changed");
  const mismatchedMap = structuredClone(state);
  mismatchedMap.storyMaps.push({ ...mismatchedMap.storyMaps[0]!, id: id(41) });
  mismatchedMap.productContexts[0]!.storyMapId = id(41);
  expect(() => resolveOperation(mismatchedMap, op, supply([op]))).toThrow(/another Story Map/);
  for (const product of [undefined, { id: id(40), projectId: id(90), storyMapId: null }, { id: id(40), projectId: id(1), storyMapId: id(90) }]) {
    const invalid = structuredClone(state);
    invalid.productContexts = product ? [productContextSchema.parse({ ...product, updatedAt: createdAt })] : [];
    const before = structuredClone(invalid);
    expect(() => resolveOperation(invalid, op, supply([op]), 2)).toThrow(/Operation context at index 2/);
    expect(invalid).toEqual(before);
  }
  expect(state).toEqual(original);
}
