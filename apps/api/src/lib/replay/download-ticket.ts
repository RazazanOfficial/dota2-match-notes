import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getClient } from "../storage/client";
import { REPLAY_MAX_BYTES, validReplayKey } from "./archive-storage";
const LIFETIME_SECONDS = 900;
export async function createReplayDownloadTicket(matchId: number, archive: { key: string; bytes: number; sha256: string }) {
  const filename = archive.key.split("/").at(-1) || "";
  if (!Number.isSafeInteger(matchId) || matchId <= 0 || !validReplayKey(archive.key) ||
      !new RegExp(`^${matchId}(?:_[1-9][0-9]*)?\\.dem(?:\\.bz2)?$`).test(filename) ||
      !Number.isSafeInteger(archive.bytes) || archive.bytes <= 8 || archive.bytes > REPLAY_MAX_BYTES || !/^[a-f0-9]{64}$/.test(archive.sha256)) throw new Error("Invalid replay archive descriptor");
  const { client, config } = getClient();
  if (new URL(config.endpoint).protocol !== "https:") throw new Error("Download storage must use HTTPS");
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: archive.key }), { expiresIn: LIFETIME_SECONDS });
  return { url, bytes: archive.bytes, sha256: archive.sha256, expiresAt: new Date(Date.now() + LIFETIME_SECONDS * 1000).toISOString() };
}
