import { MutationCache, type QueryClient } from "@tanstack/react-query";
import { conflictStrings } from "@storymapper/ui-strings";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";

const ENTITY_NAMES = { card: "Card", release: "Release", persona: "Persona", roadmap: "Roadmap", storyMap: "Story map", sourceDocument: "Source document", project: "Project", connection: "Connection" } as const;

export function createConflictMutationCache(getClient: () => QueryClient): MutationCache {
  return new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!isConflictError(error) || mutation.options.meta?.ownsConflict) return;
      const client = getClient();
      void client.invalidateQueries();
      useAnnouncementStore.getState().announce(conflictStrings.refreshed(ENTITY_NAMES[error.conflicts[0]!.entity]), "alert");
    }
  });
}
