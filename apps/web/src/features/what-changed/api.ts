import { activityChangesResponseSchema, type ActivityChangesResponse } from "@storymapper/contracts";
import { whatChangedStrings as strings } from "@storymapper/ui-strings";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";

export async function readChanges(projectId: string, signal: AbortSignal, seen?: { epoch: string; throughSeq: number } | null): Promise<ActivityChangesResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let snapshot: ActivityChangesResponse | undefined;
    const events: ActivityChangesResponse["events"] = [];
    let afterSeq = attempt === 0 ? seen?.throughSeq ?? 0 : 0;
    while (true) {
      const query = new URLSearchParams({ projectId, originClientId: getLiveClientId(), afterSeq: String(afterSeq) });
      if (!snapshot && attempt === 0 && seen) query.set("epoch", seen.epoch);
      if (snapshot) { query.set("epoch", snapshot.epoch); query.set("highWater", String(snapshot.highWater)); }
      const response = await fetch(`/api/activity/changes?${query}`, { signal });
      if (!response.ok) throw new Error(strings.readFailed(response.status));
      const page = activityChangesResponseSchema.parse(await response.json());
      if (snapshot && page.epoch !== snapshot.epoch) break;
      snapshot ??= page;
      events.push(...page.events);
      if (page.nextAfterSeq === null) return { ...page, events };
      afterSeq = page.nextAfterSeq;
    }
  }
  throw new Error(strings.kept);
}
