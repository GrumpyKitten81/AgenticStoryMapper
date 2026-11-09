import type { RemoteItemRead, RemoteWorkItem } from "@storymapper/github";

export function remoteReadFixture(item: RemoteWorkItem | undefined): RemoteItemRead {
  return item ? { status: "found", item } : { status: "unavailable" };
}
