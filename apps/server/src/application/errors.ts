import { OperationResolutionError } from "@storymapper/core";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { DomainError, toErrorResponse } from "@storymapper/contracts";

export function asDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof OperationResolutionError) return new DomainError(error.code, error.message, { operationId: error.operationId, index: error.index });
  if (error instanceof ZodError) return new DomainError("validation", "Request validation failed.", { issues: error.issues });
  const response = toErrorResponse(error);
  return new DomainError("internal", response.message, response.details);
}

export function replyWithError(reply: FastifyReply, error: unknown, log?: FastifyBaseLogger): unknown {
  const domainError = error instanceof DomainError ? error : asDomainError(error);
  if (!(error instanceof DomainError) && domainError.code === "internal") {
    log?.error({ err: error, errorId: domainError.details?.errorId }, "Unhandled application error");
  }
  const response = toErrorResponse(domainError);
  return reply.code(response.statusCode).send({
    code: response.code,
    message: response.message,
    ...(response.details ? { details: response.details } : {}),
    ...(response.conflicts ? { conflicts: response.conflicts } : {})
  });
}
