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
export const replayNative = {
    available: isTauri,
    settings: () => invoke<ReplaySettings>("replay_settings"),
    chooseFolder: () => invoke<ReplaySettings | null>("choose_dota_folder"),
    files: () => invoke<ReplayFile[]>("list_replays"),
    download: (matchId: string, authToken?: string, apiOrigin?: string) => {
        if (!validReplayId(matchId))
            return Promise.reject(new Error("Invalid match ID"));
        return invoke<ReplayFile>("download_replay", { matchId, authToken, apiOrigin });
    },
    progress: (callback: (progress: ReplayProgress) => void) => listen<ReplayProgress>("replay-progress", e => callback(e.payload)),
};
