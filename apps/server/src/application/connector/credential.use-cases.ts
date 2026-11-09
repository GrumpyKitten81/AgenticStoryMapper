import { DomainError, storeGitHubCredentialRequestSchema, type ActorContext, type CapabilityDescriptor, type StoreGitHubCredentialRequest, type StoreGitHubCredentialResponse } from "@storymapper/contracts";
import { requireHumanActor } from "@storymapper/server/application/actors";
import { writeUserGitHubToken } from "@storymapper/server/services/credential-file";

export const storeGitHubCredentialDescriptor: CapabilityDescriptor = { name: "storeGitHubCredential", kind: "human-only" };

export async function storeGitHubCredential(actor: ActorContext, input: StoreGitHubCredentialRequest): Promise<StoreGitHubCredentialResponse> {
  requireHumanActor(actor);
  const parsed = storeGitHubCredentialRequestSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("validation", "A nonempty GitHub token without whitespace is required.");
  return writeUserGitHubToken(parsed.data);
}
