import { createHash } from "node:crypto";
import { readdirSync, lstatSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { restorePointSchema, type RestorePoint } from "@storymapper/contracts";

const RESTORE_POINT_NAME = /^([a-f0-9]{64})__(manual|pre-migration|pre-restore|pre-apply)__(\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}_\d{3}Z)__(\d{8})__([a-f0-9]{32})__(\d+)__(release-sha256-[a-f0-9]{64})\.sqlite$/;
const POINTS_PER_CLASS = 10;
const BYTE_CAP = 1024 ** 3;

export function restorePointDatabaseId(databasePath: string): string {
  return createHash("sha256").update(basename(databasePath)).digest("hex");
}

export function discardRestorePointFiles(databasePath: string): void {
  const directory = join(dirname(resolve(databasePath)), "snapshots");
  for (const point of listRestorePointFiles(directory, restorePointDatabaseId(databasePath))) unlinkSync(join(directory, point.fileName));
}

export function listRestorePointFiles(directory: string, databaseId: string): RestorePoint[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return names.flatMap((fileName) => {
    const match = RESTORE_POINT_NAME.exec(fileName);
    if (!match || match[1] !== databaseId) return [];
    const file = lstatSync(join(directory, fileName));
    if (!file.isFile()) return [];
    const createdAt = match[3]!.replace(/T(\d{2})_(\d{2})_(\d{2})_(\d{3})Z$/, "T$1:$2:$3.$4Z");
    const parsed = restorePointSchema.safeParse({ fileName, class: match[2], createdAt, sizeBytes: file.size, schemaVersion: match[7], scope: "local-database" });
    if (!parsed.success || new Date(createdAt).toISOString() !== createdAt || Number(match[6]) !== file.size) return [];
    return [parsed.data];
  }).sort((a, b) => sequence(b) - sequence(a));
}

export function nextRestorePointSequence(points: RestorePoint[]): string {
  const next = Math.max(0, ...points.map(sequence)) + 1;
  if (next > 99_999_999) throw new Error("Restore point publication sequence exhausted.");
  return String(next).padStart(8, "0");
}

function sequence(point: RestorePoint): number {
  return Number(point.fileName.split("__")[3]);
}

export function retainRestorePointFiles(directory: string, databaseId: string): void {
  const points = listRestorePointFiles(directory, databaseId);
  const counts = new Map<string, number>();
  const newest = new Map<string, string>();
  for (const point of points) {
    counts.set(point.class, (counts.get(point.class) ?? 0) + 1);
    if (!newest.has(point.class)) newest.set(point.class, point.fileName);
  }
  let bytes = points.reduce((sum, point) => sum + point.sizeBytes, 0);
  const retained: RestorePoint[] = [];
  for (const point of [...points].reverse()) {
    if (counts.get(point.class)! <= POINTS_PER_CLASS) {
      retained.push(point);
      continue;
    }
    unlinkSync(join(directory, point.fileName));
    counts.set(point.class, counts.get(point.class)! - 1);
    bytes -= point.sizeBytes;
  }
  for (const point of retained) {
    const count = counts.get(point.class)!;
    const protectedPoint = count === 1 || (["pre-migration", "pre-restore"].includes(point.class) && newest.get(point.class) === point.fileName);
    if (protectedPoint || bytes <= BYTE_CAP) continue;
    unlinkSync(join(directory, point.fileName));
    counts.set(point.class, count - 1);
    bytes -= point.sizeBytes;
  }
}
