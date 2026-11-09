import { safetySettingsSchema, projectSchema, restoreProjectRequestSchema, restoreProjectResultSchema, type RestoreProjectResult } from "@storymapper/contracts";
import { restorePointStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";

const RESTORE_RESULT_KEY = "storymapper.restore-result";
const RESTORE_ATTEMPT_KEY = "storymapper.restore-attempt";
export const RESTORE_PROJECT_KEY = ["restore-project"] as const;
export class RestoreAttemptStorageError extends Error {}

export interface RestoreAttempt { projectId: string; fileName: string; epoch: string; eventIds: string[] }
export interface SavedRestoreState { result?: RestoreProjectResult; attempt?: RestoreAttempt; issue?: string }
export type RestoreOutcome = { status: "restored"; result: RestoreProjectResult } | { status: "unchanged" } | { status: "unknown" };

export async function prepareRestoreAttempt(projectId: string, fileName: string): Promise<RestoreAttempt> {
  try {
    const [{ activityEvents }, { settings }] = await Promise.all([api.readRestoreActivity(projectId), api.readSafetySettings(projectId)]);
    const epoch = safetySettingsSchema.shape.epoch.unwrap().parse(settings.epoch);
    const attempt = { projectId, fileName, epoch, eventIds: activityEvents.map((event) => event.id) };
    sessionStorage.setItem(RESTORE_ATTEMPT_KEY, JSON.stringify(attempt));
    sessionStorage.removeItem(RESTORE_RESULT_KEY);
    return attempt;
  } catch (error) {
    if (!(error instanceof Error || error instanceof DOMException)) throw error;
    throw new RestoreAttemptStorageError(error.message);
  }
}

export function clearRestoreAttempt(): void { sessionStorage.removeItem(RESTORE_ATTEMPT_KEY); }

function readSavedValue(key: string): unknown {
  const saved = sessionStorage.getItem(key);
  return saved ? JSON.parse(saved) : undefined;
}

export function readSavedRestoreState(): SavedRestoreState {
  const state: SavedRestoreState = {};
  try {
    const saved = readSavedValue(RESTORE_ATTEMPT_KEY);
    if (saved !== undefined) {
      if (!saved || typeof saved !== "object" || !("projectId" in saved) || !("fileName" in saved) || !("epoch" in saved) || !("eventIds" in saved)) throw new SyntaxError(strings.invalidAttemptRecord);
      const projectId = projectSchema.shape.id.safeParse(saved.projectId);
      const fileName = restoreProjectRequestSchema.shape.fileName.safeParse(saved.fileName);
      const epoch = safetySettingsSchema.shape.epoch.unwrap().safeParse(saved.epoch);
      if (!projectId.success || !fileName.success || !epoch.success || !Array.isArray(saved.eventIds) || !saved.eventIds.every((id) => projectSchema.shape.id.safeParse(id).success)) throw new SyntaxError(strings.invalidAttemptRecord);
      state.attempt = { projectId: projectId.data, fileName: fileName.data, epoch: epoch.data, eventIds: saved.eventIds as string[] };
    }
    const result = readSavedValue(RESTORE_RESULT_KEY);
    if (result !== undefined) {
      const parsed = restoreProjectResultSchema.safeParse(result);
      if (!parsed.success) throw new SyntaxError(parsed.error.message);
      state.result = parsed.data;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof DOMException)) throw error;
    state.issue = error.message;
  }
  return state;
}

export async function reconcileRestoreAttempt(attempt: RestoreAttempt): Promise<RestoreOutcome> {
  const [{ activityEvents }, { projects }] = await Promise.all([api.readRestoreActivity(attempt.projectId), api.readProjects()]);
  const liveProject = projects[0];
  if (!liveProject) throw new Error(strings.noLiveProjectForOutcome);
  const { settings } = await api.readSafetySettings(liveProject.id);
  const epoch = safetySettingsSchema.shape.epoch.unwrap().parse(settings.epoch);
  if (epoch === attempt.epoch) return { status: "unchanged" };
  for (const event of activityEvents.slice().reverse()) {
    if (event.action !== "project.restored" || event.undoneByRestore || attempt.eventIds.includes(event.id)) continue;
    const result = restoreProjectResultSchema.parse(event.after);
    if (result.epoch === epoch && result.restorePoint.fileName === attempt.fileName) return { status: "restored", result };
  }
  return { status: "unknown" };
}

export function saveRestoreResult(result: RestoreProjectResult): void {
  sessionStorage.setItem(RESTORE_RESULT_KEY, JSON.stringify(result));
}

export function readRestoreResult(): RestoreProjectResult | undefined {
  return readSavedRestoreState().result;
}

export function clearRestoreResult(): void {
  sessionStorage.removeItem(RESTORE_RESULT_KEY);
  clearRestoreAttempt();
}

export function reloadRestoredApp(): void {
  window.location.replace("/");
}
