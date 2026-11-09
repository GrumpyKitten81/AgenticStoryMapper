import { api } from "../../../app/api";
import { exportStoryMapView } from "./story-map-view-export";

export async function exportStoryMapViewAndRecord(options: Parameters<typeof exportStoryMapView>[0] & { projectId: string }): Promise<void> {
  await exportStoryMapView(options);
  await api.recordGettingStartedExport(options.projectId, options.format);
}
