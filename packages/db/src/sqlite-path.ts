import { resolve } from "node:path";

// DESIGN SQLite requires extended Windows paths for long restore-point filenames.
export function resolveSqlitePath(filePath: string): string {
  const absolute = resolve(filePath);
  if (process.platform === "win32" && !absolute.startsWith("\\\\?\\")) {
    return `\\\\?\\${absolute}`;
  }
  return absolute;
}
