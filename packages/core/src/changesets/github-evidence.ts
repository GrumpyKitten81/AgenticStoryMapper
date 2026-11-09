import type { CardSourceLink, OperationSnapshot } from "@storymapper/contracts";

export function projectSourceLinks(state: Pick<OperationSnapshot, "sourceLinks" | "githubLinks">): CardSourceLink[] {
  const identities = new Map(state.githubLinks.map((identity) => [identity.id, identity]));
  const canonical: CardSourceLink[] = state.githubLinks.filter((identity) => identity.cardId && identity.issueNumber !== undefined).map((identity) => ({ kind: "github", ...(identity.provider ? { provider: identity.provider } : {}), id: identity.id, cardId: identity.cardId!, externalRefId: identity.id, repoFullName: identity.repo, issueNumber: identity.issueNumber!, url: identity.url }));
  return [...state.sourceLinks.filter((link) => link.kind !== "github"), ...canonical,
    ...state.sourceLinks.filter((link) => link.kind === "github" && link.id !== link.externalRefId && identities.get(link.externalRefId)?.cardId !== link.cardId)];
}
