import { cardDependencyResponseSchema, LIVE_CLIENT_ID_HEADER, type CardDependencyResponse } from "@storymapper/contracts";
import { appStrings } from "@storymapper/ui-strings";
import { throwRequestFailure } from "@storymapper/web/app/conflicts";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";

export async function cardDependencyRequest(path: string, method: "POST" | "DELETE", body?: unknown): Promise<CardDependencyResponse> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", [LIVE_CLIENT_ID_HEADER]: getLiveClientId() },
    body: JSON.stringify(body === undefined ? {} : body)
  });
  if (response.status === 409) await throwRequestFailure(response);
  if (!response.ok) {
    const error: unknown = await response.json();
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") throw new Error(error.message);
    throw new Error(appStrings.requestFailed(response.status));
  }
  return cardDependencyResponseSchema.parse(await response.json());
}
