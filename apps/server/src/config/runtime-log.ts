import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { domainErrorCodes } from "@storymapper/contracts";
import { redact } from "@storymapper/server/config/failures.mjs";

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const LOG_FILES = 5;
const SAFE_MESSAGES = new Set(["incoming request", "request completed", "request aborted", "Unhandled application error", "Source document import failed before unit of work", "Post-commit publication failed; database changes remain committed.", "Remote binding enabled by STORYMAPPER_ALLOW_REMOTE_HOST=true; only loopback Host authorities are admitted", "Interrupted project restore completed with preserved history and epoch."]);
const SAFE_ERROR_TYPES = new Set(["DomainError", "WorkItemSyncError", "ProjectArchiveError", "ArchiveValidationError", "RestoreValidationError", "ReleasePositionError", "ChangeSetConflictError", "SqliteError", "ZodError", "Error", "TypeError", "RangeError"]);
const SAFE_ERROR_CODES = new Set<string>([...domainErrorCodes, "SQLITE_ERROR", "SQLITE_BUSY", "SQLITE_LOCKED", "SQLITE_READONLY", "SQLITE_IOERR", "SQLITE_CORRUPT", "SQLITE_NOTFOUND", "SQLITE_FULL", "SQLITE_CANTOPEN", "SQLITE_CONSTRAINT", "SQLITE_MISMATCH", "SQLITE_MISUSE", "SQLITE_NOTADB", "SQLITE_CONSTRAINT_TRIGGER", "SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_FOREIGNKEY", "SQLITE_CONSTRAINT_PRIMARYKEY", "SQLITE_CONSTRAINT_CHECK", "SQLITE_CONSTRAINT_NOTNULL"]);

export function createRuntimeLog(directory: string): { write(line: string): void } {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "storymapper.log");
  let bytes = existsSync(path) ? statSync(path).size : 0;
  return { write(line) {
    const record = JSON.parse(line) as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of ["level", "time", "pid", "reqId", "responseTime"]) {
      if (typeof record[key] === "number" || key === "reqId" && typeof record[key] === "string" && /^[a-z0-9-]{1,64}$/i.test(record[key])) safe[key] = record[key];
    }
    if (typeof record.msg === "string") {
      const message = redact(record.msg);
      safe.msg = SAFE_MESSAGES.has(message) || /^Reclaimed dead Project owner PID \d+, process start time \d{4}-\d{2}-\d{2}T[\d:.]+Z\.$/.test(message) || /^Agentic Story Mapper server listening on http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(message) ? message : "Runtime event; private details omitted.";
    }
    if (record.err) safe.error = sanitizedError(record.err);
    const output = `${JSON.stringify(safe)}\n`;
    const length = Buffer.byteLength(output);
    if (bytes + length > MAX_LOG_BYTES) {
      const oldest = `${path}.${LOG_FILES - 1}`;
      if (existsSync(oldest)) unlinkSync(oldest);
      for (let index = LOG_FILES - 2; index >= 0; index--) {
        const source = index ? `${path}.${index}` : path;
        if (existsSync(source)) renameSync(source, `${path}.${index + 1}`);
      }
      bytes = 0;
    }
    appendFileSync(path, output);
    bytes += length;
    process.stdout.write(output);
  } };
}

function sanitizedError(error: unknown): Record<string, string> {
  const safe: Record<string, string> = { message: "Runtime operation failed" };
  if (!error || typeof error !== "object") return safe;
  for (const key of ["type", "name", "code"] as const) {
    const value = key in error ? (error as Record<string, unknown>)[key] : undefined;
    if (typeof value === "string" && (key === "code" ? SAFE_ERROR_CODES : SAFE_ERROR_TYPES).has(value)) safe[key] = value;
  }
  return safe;
}
