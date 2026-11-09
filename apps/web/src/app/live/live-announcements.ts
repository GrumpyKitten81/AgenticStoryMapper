import type { LiveTransaction } from "@storymapper/contracts";
import { liveUpdateStrings as strings } from "@storymapper/ui-strings";

export function createLiveAnnouncements(announce: (message: string) => void): { add: (transactions: LiveTransaction[]) => void; close: () => void } {
  const objects = new Map<string, string>();
  const actors = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastAnnouncement = -Infinity;
  const flush = () => {
    timer = undefined;
    if (!objects.size) return;
    const cardsOnly = [...objects.values()].every((type) => type === "card");
    const actor = actors.size === 1 ? [...actors][0]! : strings.multipleActors;
    announce(strings.changed(objects.size, cardsOnly, actor));
    lastAnnouncement = Date.now();
    objects.clear();
    actors.clear();
  };
  return {
    add: (transactions) => {
      for (const transaction of transactions) {
        const entities = transaction.entities.filter((entity) => entity.entityType !== "activity");
        if (!entities.length) continue;
        actors.add(transaction.actor.actorId);
        for (const entity of entities) objects.set(`${entity.entityType}:${entity.entityId}`, entity.entityType);
      }
      if (!objects.size) return;
      clearTimeout(timer);
      timer = setTimeout(flush, Math.max(1500, lastAnnouncement + 5000 - Date.now()));
    },
    close: () => { clearTimeout(timer); objects.clear(); actors.clear(); }
  };
}
