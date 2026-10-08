import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export interface ReplaySettings {
    dotaPath: string | null;
    replayPath: string | null;
}
export interface ReplayFile {
    matchId: string;
    path: string;
    sizeBytes: number;
    modifiedSeconds: number;
}
export interface ReplayProgress {
    matchId: string;
    bytes: number;
}
export const validReplayId = (id: string) => /^[1-9]\d{7,11}$/.test(id);
export const playCommand = (id: string) => `playdemo replays/${id}`;
export class NativeReplayError extends Error {
    constructor(public readonly code: string) { super(code); this.name = "NativeReplayError"; }
}
async function nativeCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    try { return await invoke<T>(command, args); }
    catch (error) {
        const code = typeof error === "string" && /^[a-z][a-z_]+$/.test(error) ? error : "replay_local_failed";
        throw new NativeReplayError(code);
    }
}
export const replayNative = {
    available: isTauri,
    settings: () => nativeCall<ReplaySettings>("replay_settings"),
    chooseFolder: () => nativeCall<ReplaySettings | null>("choose_dota_folder"),
    files: () => nativeCall<ReplayFile[]>("list_replays"),
    download: (matchId: string, authToken?: string, apiOrigin?: string) => {
        if (!validReplayId(matchId))
            return Promise.reject(new NativeReplayError("invalid_match_id"));
        return nativeCall<ReplayFile>("download_replay", { matchId, authToken, apiOrigin });
    },
    launchDota: () => nativeCall<void>("launch_dota"),
    progress: (callback: (progress: ReplayProgress) => void) => listen<ReplayProgress>("replay-progress", e => callback(e.payload)),
};
