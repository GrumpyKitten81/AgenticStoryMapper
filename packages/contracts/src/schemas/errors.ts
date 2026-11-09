import type { ConflictEntry } from "@storymapper/contracts/schemas/conflicts";

export const domainErrorCodes = [
  "validation",
  "not_found",
  "conflict",
  "disabled",
  "protected",
  "restoring",
  "internal"
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

const statusByCode: Record<DomainErrorCode, number> = {
  validation: 400,
  not_found: 404,
  conflict: 409,
  disabled: 403,
  protected: 403,
  restoring: 503,
  internal: 500
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown> | undefined;
  readonly conflicts?: ConflictEntry[] | undefined;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>, conflicts?: ConflictEntry[]) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== undefined) this.details = details;
    if (conflicts !== undefined) this.conflicts = conflicts;
  }
}

export interface ErrorResponseBody {
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
  conflicts?: ConflictEntry[];
}

export function toErrorResponse(error: unknown): ErrorResponseBody & { statusCode: number } {
  if (error instanceof DomainError) {
    return {
      statusCode: statusByCode[error.code],
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.conflicts ? { conflicts: error.conflicts } : {})
    };
  }
  const errorId = globalThis.crypto.randomUUID();
  return {
    statusCode: 500,
    code: "internal",
    message: "An internal error occurred.",
    details: { errorId }
  };
}
