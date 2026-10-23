import type { Stats } from "node:fs";

/** NTFS stat mode bits do not represent POSIX group/other permissions. */
export function hasPrivateReplayPermissions(
  info: Pick<Stats, "mode" | "uid">,
  platform: NodeJS.Platform = process.platform,
  owner: number | undefined = process.getuid?.(),
): boolean {
  if (platform === "win32") return true;
  return (info.mode & 0o077) === 0 && (owner === undefined || info.uid === owner);
}
