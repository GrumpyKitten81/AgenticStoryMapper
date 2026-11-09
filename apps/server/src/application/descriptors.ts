import { getCardReviewsDescriptor, commandCardReviewDescriptor } from "@storymapper/server/application/card/card-review.use-cases";
import { getRemotePushPlanDescriptor, confirmRemotePushPlanDescriptor, resumeRemotePushPlanDescriptor } from "@storymapper/server/application/sync/remote-push.use-cases";
import { storeGitHubCredentialDescriptor } from "@storymapper/server/application/connector/credential.use-cases";
import { connectGitHubConnectionDescriptor, verifyGitHubConnectionDescriptor } from "@storymapper/server/application/connector/github-connect.use-cases";
import { getPlanDriftReportDescriptor, listPlanDriftSystemsDescriptor } from "@storymapper/server/application/report/plan-drift.use-cases";
import { capturePlanStateDescriptor, listPlanStatesDescriptor, getPlanStateDescriptor, comparePlanStatesDescriptor, getSlicesReportDescriptor } from "@storymapper/server/application/report/plan-state.use-cases";
import { setCardDependencyDescriptor, deleteCardDependencyDescriptor } from "@storymapper/server/application/card/card-dependencies.use-cases";
import { updateDeliveryStatusDescriptor } from "@storymapper/server/application/card/delivery-status.use-cases";
import { previewChangeSetDescriptor } from "@storymapper/server/application/changeset/preview-changeset.use-cases";
import type { CapabilityDescriptor } from "@storymapper/contracts";
import { submitChangeSetDescriptor } from "@storymapper/server/application/changeset/submit-changeset.use-cases";
import { proposeGitHubBoardDescriptor, proposeStoryMapCopyDescriptor } from "@storymapper/server/application/changeset/tool-proposals.use-cases";
import { createAiProposalDescriptor, listAiTemplatesDescriptor, createAiTemplateDescriptor, updateAiTemplateDescriptor, deleteAiTemplateDescriptor } from "@storymapper/server/application/ai/ai.use-cases";
import { createCardAttachmentDescriptor, createCardSourceLinkDescriptor, deleteCardAnnotationDescriptor, deleteCardAttachmentDescriptor, deleteCardPersonaDescriptor, deleteCardSourceLinkDescriptor, getCardHistoryDescriptor, listCardAttachmentsDescriptor, parkCardDescriptor, setCardAnnotationDescriptor, setCardPersonaDescriptor, unparkCardDescriptor } from "@storymapper/server/application/card/card-children.use-cases";
import { listGitHubStatusProjectsDescriptor, createConnectorConnectionDescriptor, deleteConnectorConnectionDescriptor, listConnectorConnectionsDescriptor, updateConnectorConnectionDescriptor, validateConnectorConnectionDescriptor } from "@storymapper/server/application/connector/connector.use-cases";
import { createAnnotationDescriptor, createStoryTemplateDescriptor, createWorkflowStatusDescriptor, deleteAnnotationDescriptor, deleteStoryTemplateDescriptor, deleteWorkflowStatusDescriptor, getCustomizationDescriptor, getSafetySettingsDescriptor, listActivityChangesDescriptor, listActivityDescriptor, updateAnnotationDescriptor, updateSafetySettingsDescriptor, updateStoryTemplateDescriptor, updateWorkflowStatusDescriptor } from "@storymapper/server/application/customization/customization.use-cases";
import { exportAuditDescriptor, exportProjectArchiveDescriptor, exportStoryMapDescriptor, getProjectArchiveCapabilitiesDescriptor, importProjectArchiveDescriptor } from "@storymapper/server/application/export/export.use-cases";
import { createGitHubIssueDryRunDescriptor, createGitHubLinkDescriptor, deleteGitHubLinkDescriptor, getGitHubSyncHealthDescriptor, listGitHubLinksDescriptor, updateGitHubLinkDescriptor } from "@storymapper/server/application/github-link/github-link.use-cases";
import { createProjectDescriptor, dismissGettingStartedDescriptor, getGettingStartedDescriptor, getProductContextDescriptor, listProjectsDescriptor, recordVisualExportDescriptor, upsertProductContextDescriptor } from "@storymapper/server/application/project/project.use-cases";
import { getBacklogHealthReportDescriptor, getReleaseSummaryReportDescriptor, getReleaseTimelineReportDescriptor, getSourceCoverageReportDescriptor } from "@storymapper/server/application/report/report.use-cases";
import { setCardExternalRefDescriptor, setExternalRefDescriptor, setPersonaExternalRefDescriptor, setReleaseExternalRefDescriptor } from "@storymapper/server/application/external-ref/external-ref.use-cases";
import { createRestorePointDescriptor, getRestorePointCapabilitiesDescriptor, listRestorePointsDescriptor, readRestoreActivityDescriptor, restoreProjectDescriptor } from "@storymapper/server/application/restore/restore.use-cases";
import { createRoadmapCardDescriptor, createRoadmapColumnDescriptor, createRoadmapDescriptor, createRoadmapReferenceDescriptor, createRoadmapSwimlaneDescriptor, getRoadmapDetailsDescriptor, listRoadmapsDescriptor, updateRoadmapDescriptor } from "@storymapper/server/application/roadmap/roadmap.use-cases";
import { resolveSyncConflictDescriptor } from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { lookupGitHubTicketDescriptor, importGitHubTicketDescriptor, getWorkItemSyncHealthDescriptor, importWorkItemsDescriptor, planWorkItemsDescriptor, pullStoryMapWorkItemsDescriptor, pushWorkItemsDescriptor, syncWorkItemsDescriptor } from "@storymapper/server/application/sync/sync.use-cases";
import {
  applyChangeSetDescriptor,
  approveChangeSetDescriptor,
  listChangeSetsDescriptor,
  proposeBacklogGroomingDescriptor,
  proposeMapFromSourceDocumentDescriptor,
  proposeReleaseSliceDescriptor,
  rejectChangeSetDescriptor
} from "@storymapper/server/application/changeset/changeset.use-cases";
import {
  archiveCardDescriptor,
  bulkUpdateCardsDescriptor,
  createCardDescriptor,
  deleteCardDescriptor,
  deleteCardsDescriptor,
  getCardDetailsDescriptor,
  listCardsDescriptor,
  moveCardDescriptor,
  updateCardDescriptor
} from "@storymapper/server/application/card/card.use-cases";
import {
  createPersonaDescriptor,
  deletePersonaDescriptor,
  listPersonasDescriptor,
  updatePersonaDescriptor
} from "@storymapper/server/application/persona/persona.use-cases";
import {
  createReleaseDescriptor,
  deleteReleaseDescriptor,
  getReleaseDetailsDescriptor,
  getReleaseNotesDescriptor,
  updateReleaseDescriptor
} from "@storymapper/server/application/release/release.use-cases";
import {
  getSourceDocumentDescriptor,
  importSourceDocumentDescriptor,
  listSourceDocumentsDescriptor
} from "@storymapper/server/application/source-document/source-document.use-cases";
import {
  createStoryMapDescriptor,
  deleteStoryMapDescriptor,
  getStoryMapDataDescriptor,
  getStoryMapSnapshotDescriptor,
  listStoryMapsDescriptor,
  updateStoryMapDescriptor
} from "@storymapper/server/application/story-map/story-map.use-cases";

export const applicationCapabilityDescriptors: CapabilityDescriptor[] = [
  getCardReviewsDescriptor, commandCardReviewDescriptor,
  getRemotePushPlanDescriptor, confirmRemotePushPlanDescriptor, resumeRemotePushPlanDescriptor,
  connectGitHubConnectionDescriptor,
  verifyGitHubConnectionDescriptor,
  storeGitHubCredentialDescriptor,
  getPlanDriftReportDescriptor, listPlanDriftSystemsDescriptor,
  capturePlanStateDescriptor, listPlanStatesDescriptor, getPlanStateDescriptor, comparePlanStatesDescriptor, getSlicesReportDescriptor,
  updateDeliveryStatusDescriptor,
  previewChangeSetDescriptor,
  submitChangeSetDescriptor,
  setExternalRefDescriptor,
  setCardExternalRefDescriptor,
  setReleaseExternalRefDescriptor,
  setPersonaExternalRefDescriptor,
  proposeGitHubBoardDescriptor,
  proposeStoryMapCopyDescriptor,
  createAiProposalDescriptor,
  listAiTemplatesDescriptor,
  createAiTemplateDescriptor,
  updateAiTemplateDescriptor,
  deleteAiTemplateDescriptor,
  createCardAttachmentDescriptor,
  createCardSourceLinkDescriptor,
  deleteCardAnnotationDescriptor,
  deleteCardAttachmentDescriptor,
  deleteCardPersonaDescriptor,
  deleteCardSourceLinkDescriptor,
  getCardHistoryDescriptor,
  listCardAttachmentsDescriptor,
  parkCardDescriptor,
  setCardAnnotationDescriptor,
  setCardPersonaDescriptor,
  setCardDependencyDescriptor,
  deleteCardDependencyDescriptor,
  unparkCardDescriptor,
  createConnectorConnectionDescriptor,
  deleteConnectorConnectionDescriptor,
  listGitHubStatusProjectsDescriptor,
  listConnectorConnectionsDescriptor,
  updateConnectorConnectionDescriptor,
  validateConnectorConnectionDescriptor,
  createAnnotationDescriptor,
  createStoryTemplateDescriptor,
  createWorkflowStatusDescriptor,
  deleteAnnotationDescriptor,
  deleteStoryTemplateDescriptor,
  deleteWorkflowStatusDescriptor,
  getCustomizationDescriptor,
  getSafetySettingsDescriptor,
  listActivityChangesDescriptor, listActivityDescriptor,
  updateAnnotationDescriptor,
  updateSafetySettingsDescriptor,
  updateStoryTemplateDescriptor,
  updateWorkflowStatusDescriptor,
  exportAuditDescriptor,
  exportProjectArchiveDescriptor,
  exportStoryMapDescriptor,
  getProjectArchiveCapabilitiesDescriptor,
  importProjectArchiveDescriptor,
  createGitHubIssueDryRunDescriptor,
  createGitHubLinkDescriptor,
  deleteGitHubLinkDescriptor,
  getGitHubSyncHealthDescriptor,
  listGitHubLinksDescriptor,
  updateGitHubLinkDescriptor,
  createProjectDescriptor,
  dismissGettingStartedDescriptor,
  getGettingStartedDescriptor,
  getProductContextDescriptor,
  listProjectsDescriptor,
  recordVisualExportDescriptor,
  upsertProductContextDescriptor,
  getBacklogHealthReportDescriptor,
  getReleaseSummaryReportDescriptor,
  getReleaseTimelineReportDescriptor,
  getSourceCoverageReportDescriptor,
  createRestorePointDescriptor,
  getRestorePointCapabilitiesDescriptor,
  listRestorePointsDescriptor,
  readRestoreActivityDescriptor,
  restoreProjectDescriptor,
  createRoadmapCardDescriptor,
  createRoadmapColumnDescriptor,
  createRoadmapDescriptor,
  createRoadmapReferenceDescriptor,
  createRoadmapSwimlaneDescriptor,
  getRoadmapDetailsDescriptor,
  listRoadmapsDescriptor,
  updateRoadmapDescriptor,
  resolveSyncConflictDescriptor,
  getWorkItemSyncHealthDescriptor,
  lookupGitHubTicketDescriptor, importGitHubTicketDescriptor,
  importWorkItemsDescriptor,
  planWorkItemsDescriptor,
  pullStoryMapWorkItemsDescriptor,
  pushWorkItemsDescriptor,
  syncWorkItemsDescriptor,
  listStoryMapsDescriptor,
  getStoryMapSnapshotDescriptor,
  getStoryMapDataDescriptor,
  createStoryMapDescriptor,
  updateStoryMapDescriptor,
  deleteStoryMapDescriptor,
  listCardsDescriptor,
  getCardDetailsDescriptor,
  createCardDescriptor,
  updateCardDescriptor,
  bulkUpdateCardsDescriptor,
  moveCardDescriptor,
  archiveCardDescriptor,
  deleteCardDescriptor,
  deleteCardsDescriptor,
  getReleaseDetailsDescriptor,
  getReleaseNotesDescriptor,
  createReleaseDescriptor,
  updateReleaseDescriptor,
  deleteReleaseDescriptor,
  listPersonasDescriptor,
  createPersonaDescriptor,
  updatePersonaDescriptor,
  deletePersonaDescriptor,
  importSourceDocumentDescriptor,
  listSourceDocumentsDescriptor,
  getSourceDocumentDescriptor,
  listChangeSetsDescriptor,
  approveChangeSetDescriptor,
  rejectChangeSetDescriptor,
  applyChangeSetDescriptor,
  proposeMapFromSourceDocumentDescriptor,
  proposeBacklogGroomingDescriptor,
  proposeReleaseSliceDescriptor
];
