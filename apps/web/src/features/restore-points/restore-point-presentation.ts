import type { RestorePoint, RestorePointClass } from "@storymapper/contracts";
import { formatLocalDateTime } from "@storymapper/web/app/format-date-time";

const RESTORE_POINT_CAUSES: Record<RestorePointClass, string> = {
  manual: "Manually created",
  "pre-migration": "Before database migration",
  "pre-restore": "Before restoring",
  "pre-apply": "Before applying changes"
};
const SIZE_UNITS = ["bytes", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export const restorePointPresentation = {
  technicalDetails: "Technical details",
  fileName: "Filename",
  class: "Class",
  schema: "Development schema",
  createdUtc: "Created (UTC)",
  createdLocal: "Created",
  size: "Size",
  requestedPoint: "Requested restore point selected.",
  requestedUnavailable: "The requested restore point is no longer available.",
  requestedLoading: "Looking for the requested restore point...",
  restoreLabel: (point: RestorePoint) => `Restore: ${restorePointLabel(point)}`
} as const;

export function restorePointCause(pointClass: RestorePointClass): string {
  return RESTORE_POINT_CAUSES[pointClass];
}

export function restorePointLabel(point: RestorePoint): string {
  return `${restorePointCause(point.class)} · ${formatLocalDateTime(point.createdAt)}`;
}

export function formatRestorePointSize(sizeBytes: number): string {
  const unit = sizeBytes === 0 ? 0 : Math.min(Math.floor(Math.log(sizeBytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const size = sizeBytes / 1024 ** unit;
  return `${size.toLocaleString("en-US", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${SIZE_UNITS[unit]}`;
}
