import type { OperationSnapshot } from "@storymapper/contracts";
import type { ResolverKey } from "@storymapper/core/changesets/operation-registry";
import { CHANGE_COLLECTIONS } from "@storymapper/core/changesets/remaining-owners";

export type ChangeCollection = typeof CHANGE_COLLECTIONS[keyof typeof CHANGE_COLLECTIONS];
const CARD_RELATIONS = ["cards", "cardPersonas", "cardAnnotations"] as const;
const GITHUB_EVIDENCE = ["syncConflicts", "externalRefs", "sourceLinks", "cards", "releases", "remoteWorkItemLinks"] as const;
const DELETE_CARD = [...GITHUB_EVIDENCE, "cardDependencies", "cardPersonas", "cardAnnotations", "attachments", "remoteWorkItemLinks", "externalRefs"] as const;
const COPY_MAP = ["storyMaps", "cards", "releases", "personas", "workflowStatuses", "annotations", "storyTemplates", "productContexts", "roadmaps", "cardPersonas", "cardAnnotations", "sourceLinks", "attachments", "cardDependencies", "roadmapColumns", "roadmapSwimlanes", "roadmapCards", "roadmapReferences"] as const;

const RESOLVER_WRITES = {
  "acknowledge:sourcePlan": [],
  "import:sourceDocument": ["sourceDocuments", "sourceChunks"],
  "set:remoteWorkItemLink": ["remoteWorkItemLinks", "connections", "cards", "syncConflicts"], "create:syncRun": ["syncRuns"], "create:syncConflict": ["syncConflicts"], "resolve:syncConflict": ["syncConflicts"],
  "create:roadmap": ["roadmaps", "roadmapColumns", "roadmapSwimlanes"], "update:roadmap": ["roadmaps"],
  "create:roadmapColumn": ["roadmaps", "roadmapColumns"], "create:roadmapSwimlane": ["roadmaps", "roadmapSwimlanes"],
  "create:roadmapCard": ["roadmaps", "roadmapCards"], "create:roadmapReference": ["roadmaps", "roadmapReferences"],
  "create:annotation": ["annotations"], "update:annotation": ["annotations"], "delete:annotation": ["annotations", "cardAnnotations", "cards"],
  "create:workflowStatus": ["workflowStatuses"], "update:workflowStatus": ["workflowStatuses", "cards"], "delete:workflowStatus": ["workflowStatuses", "cards"],
  "create:storyTemplate": ["storyTemplates"], "update:storyTemplate": ["storyTemplates"], "delete:storyTemplate": ["storyTemplates"],
  "set:productContext": ["productContexts", "storyMaps"], "create:attachment": ["attachments", "cards"], "delete:attachment": ["attachments", "cards"],
  "park:card": ["cards"], "unpark:card": ["cards"], "archive:card": ["cards"], "unarchive:card": ["cards"], "bulk:card": CARD_RELATIONS,
  "delete:card": DELETE_CARD, "delete:persona": ["personas", "cardPersonas", "cards", "externalRefs"],
  "delete:release": ["releases", "cards", "sourceLinks", "remoteWorkItemLinks", "externalRefs"], "delete:storyMap": ["storyMaps"],
  "set:cardDependency": ["cardDependencies", "cards"], "unset:cardDependency": ["cardDependencies", "cards"],
  "set:cardPersona": ["cardPersonas", "cards"], "unset:cardPersona": ["cardPersonas", "cards"],
  "set:cardAnnotation": ["cardAnnotations", "cards"], "unset:cardAnnotation": ["cardAnnotations", "cards"],
  "create:githubExternalRef": GITHUB_EVIDENCE, "update:githubExternalRef": GITHUB_EVIDENCE, "delete:githubExternalRef": GITHUB_EVIDENCE,
  "set:externalRef": [], "delete:externalRef": [],
  "create:storyMapCopy": COPY_MAP,
  "create:githubBoardImport": [...DELETE_CARD, "storyMaps", "connections"],
  "create:storyMap": ["storyMaps"], "update:storyMap": ["storyMaps"],
  "create:card": ["cards"], "update:card": ["cards"], "move:card": ["cards", "remoteWorkItemLinks"],
  "create:release": ["releases"], "update:release": ["releases"],
  "create:persona": ["personas"], "update:persona": ["personas"],
  "link:sourceLink": ["sourceLinks", "cards"], "unlink:sourceLink": GITHUB_EVIDENCE,
  "upsert:card": ["cards"], "upsert:release": ["releases"], "upsert:persona": ["personas"]
} as const satisfies Record<ResolverKey, readonly ChangeCollection[]>;

const WRITE_COLLECTIONS = new Map<ResolverKey, ReadonlySet<ChangeCollection>>((Object.keys(RESOLVER_WRITES) as ResolverKey[]).map((key) =>
  [key, new Set<ChangeCollection>([...RESOLVER_WRITES[key], "externalRefs", "sourcePlanBaselines"])]));

export function resolverWriteCollections(key: ResolverKey): ReadonlySet<ChangeCollection> {
  return WRITE_COLLECTIONS.get(key)!;
}

export function copyWritableCollections(state: OperationSnapshot, collections: ReadonlySet<ChangeCollection>): OperationSnapshot {
  const before = { ...state };
  for (const collection of collections) {
    if (collection === "cards") before.cards = state.cards.map((card) => ({ ...card }));
    else (before[collection] as unknown) = structuredClone(state[collection]);
  }
  return before;
}
