export const capabilityOperationMembers = {
  setCardDependency: ["set:cardDependency"], deleteCardDependency: ["unset:cardDependency"],
  archiveCard: ["archive:card"], bulkUpdateCards: ["bulk:card"],
  createAnnotation: ["create:annotation"], createCard: ["create:card"], createCardAttachment: ["create:attachment"], createCardSourceLink: ["link:sourceLink"],
  createGitHubLink: ["create:githubExternalRef"], createPersona: ["create:persona"], createRelease: ["create:release"],
  createRoadmap: ["create:roadmap"], createRoadmapCard: ["create:roadmapCard"], createRoadmapColumn: ["create:roadmapColumn"], createRoadmapReference: ["create:roadmapReference"], createRoadmapSwimlane: ["create:roadmapSwimlane"],
  createStoryMap: ["create:storyMap"], createStoryTemplate: ["create:storyTemplate"], createWorkflowStatus: ["create:workflowStatus"],
  deleteAnnotation: ["delete:annotation"], deleteCard: ["delete:card"], deleteCards: ["delete:card"], deleteCardAnnotation: ["unset:cardAnnotation"], deleteCardAttachment: ["delete:attachment"], deleteCardPersona: ["unset:cardPersona"], deleteCardSourceLink: ["unlink:sourceLink"],
  deleteGitHubLink: ["delete:githubExternalRef"], deletePersona: ["delete:persona"], deleteRelease: ["delete:release"], deleteStoryMap: ["delete:storyMap"], deleteStoryTemplate: ["delete:storyTemplate"], deleteWorkflowStatus: ["delete:workflowStatus"],
  importGitHubTicket: ["create:card", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:annotation", "set:cardAnnotation"],
  importSourceDocument: ["import:sourceDocument"], importWorkItems: ["create:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:annotation", "set:cardAnnotation"],
  moveCard: ["move:card"], parkCard: ["park:card"], unparkCard: ["unpark:card"],
  proposeGitHubBoard: ["create:githubBoardImport"], proposeStoryMapCopy: ["create:storyMapCopy"],
  confirmRemotePushPlan: ["create:githubExternalRef", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"], resumeRemotePushPlan: ["create:githubExternalRef", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"],
  pushWorkItems: ["create:syncRun"], pullStoryMapWorkItems: ["update:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:syncConflict"], resolveSyncConflict: ["update:card", "create:release", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"], syncWorkItems: ["update:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:syncConflict"],
  setCardAnnotation: ["set:cardAnnotation"], setCardPersona: ["set:cardPersona"],
  setExternalRef: ["set:externalRef"], setCardExternalRef: ["set:externalRef"], setPersonaExternalRef: ["set:externalRef"], setReleaseExternalRef: ["set:externalRef"],
  updateAnnotation: ["update:annotation"], updateCard: ["update:card"], updateDeliveryStatus: ["update:card"], updateGitHubLink: ["update:githubExternalRef"], updatePersona: ["update:persona"], updateRelease: ["update:release"], updateRoadmap: ["update:roadmap"], updateStoryMap: ["update:storyMap"], updateStoryTemplate: ["update:storyTemplate"], updateWorkflowStatus: ["update:workflowStatus"], upsertProductContext: ["set:productContext"]
};

const EXCEPTIONS = {
  "immutable-card-review-metadata": ["commandCardReview"],
  "human-only-administration": ["listGitHubStatusProjects","connectGitHubConnection", "verifyGitHubConnection", "storeGitHubCredential", "capturePlanState", "createProject", "createAiTemplate", "updateAiTemplate", "deleteAiTemplate", "createConnectorConnection", "updateConnectorConnection", "deleteConnectorConnection", "validateConnectorConnection", "updateSafetySettings"],
  "changeset-lifecycle": ["submitChangeSet", "applyChangeSet", "approveChangeSet", "rejectChangeSet", "createAiProposal", "proposeBacklogGrooming", "proposeMapFromSourceDocument", "proposeReleaseSlice", "proposeGitHubBoard", "proposeStoryMapCopy"],
  "restore-archive-lifecycle": ["createRestorePoint", "exportProjectArchive", "getProjectArchiveCapabilities", "getRestorePointCapabilities", "importProjectArchive", "listRestorePoints", "readRestoreActivity", "restoreProject"],
  "audit-checklist-bookkeeping": ["createGitHubIssueDryRun", "dismissGettingStarted", "exportAudit", "exportStoryMap", "getGettingStarted", "recordVisualExport"],
  "confirmed-remote-write": ["confirmRemotePushPlan", "resumeRemotePushPlan"],
  "sync-baseline-run-conflict-bookkeeping": ["confirmRemotePushPlan", "resumeRemotePushPlan", "planWorkItems", "pushWorkItems", "importWorkItems", "importGitHubTicket", "pullStoryMapWorkItems", "syncWorkItems", "resolveSyncConflict"]
};

export const excludedOperationFamilies = { view_settings: "planned-only-outside-exposed-write-catalog", ai_function_templates: "human-only-administration" };

export function classifyCapabilityOperations(capabilities) {
  return capabilities.filter((capability) => capability.kind !== "read" || Object.values(EXCEPTIONS).some((names) => names.includes(capability.name))).map(({ name }) => {
    const operations = capabilityOperationMembers[name] ?? [];
    const exceptions = Object.entries(EXCEPTIONS).filter(([, names]) => names.includes(name)).map(([classification]) => classification);
    if (!operations.length && !exceptions.length) throw new Error(`Unclassified write capability: ${name}`);
    return { name, operations, exceptions };
  });
}
