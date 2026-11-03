import { useSyncExternalStore } from "react";
import { syncStatusFeed } from "../syncStatusFeed";

export function useSyncStatus() {
    return useSyncExternalStore(syncStatusFeed.subscribe, syncStatusFeed.snapshot, syncStatusFeed.snapshot);
}
