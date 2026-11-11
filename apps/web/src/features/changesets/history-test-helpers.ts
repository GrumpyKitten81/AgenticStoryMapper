import { act } from "react";

export async function openAll(host: HTMLElement): Promise<void> {
  for (const button of host.querySelectorAll<HTMLButtonElement>(".changeset-history-entry > .activity-event-heading button")) await act(async () => button.click());
}
