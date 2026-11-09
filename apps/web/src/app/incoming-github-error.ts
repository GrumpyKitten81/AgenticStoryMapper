import { conflictResponseSchema, syncItemResultSchema, type SyncItemResult } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { ConflictError, RequestError } from "@storymapper/web/app/conflicts";

export class IncomingGitHubError extends RequestError {
  constructor(message: string, status: number, readonly items: SyncItemResult[]) { super(message, status); }
}

export async function throwGitHubFailure(response: Response): Promise<never> {
  let body: unknown;
  try { body = await response.json(); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new RequestError(strings.requestFailed(response.status), response.status);
  }
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    if ("details" in body && body.details && typeof body.details === "object" && "items" in body.details) {
      const items = syncItemResultSchema.array().safeParse(body.details.items);
      if (items.success) throw new IncomingGitHubError(body.message, response.status, items.data);
    }
    const conflict = conflictResponseSchema.safeParse(body);
    if (response.status === 409 && conflict.success) throw new ConflictError(conflict.data.message, conflict.data.conflicts);
    throw new RequestError(body.message, response.status);
  }
  throw new RequestError(strings.requestFailed(response.status), response.status);
}
