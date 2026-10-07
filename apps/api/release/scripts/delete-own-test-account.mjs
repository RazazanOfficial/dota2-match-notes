import pg from "pg";
import { open, stat } from "node:fs/promises";
import { join } from "node:path";

// A one-time, narrowly scoped production test reset. Never accept an account ID from argv.
const steamId = "76561198948460804";
const accountId = "988195076";
const handle = "steam_988195076";
const archiveDirectory = "/var/lib/dota2notes/audit-archive";
const mode = process.argv[2] ?? "--inspect";
if (!["--inspect", "--delete-steam-988195076"].includes(mode)) {
  throw new Error("Use --inspect or --delete-steam-988195076");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const superAdmins = (process.env.SUPER_ADMIN_STEAM_IDS ?? "").split(",").map(value => value.trim());
if (!superAdmins.includes(steamId)) {
  throw new Error("Super Admin SteamID64 is absent from SUPER_ADMIN_STEAM_IDS; no account was deleted");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "dota-notes-one-time-account-reset", statement_timeout: 60_000 });
await client.connect();
let archivePath;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const account = await client.query(
    "SELECT id, steam_id, steam_account_id, handle, is_admin, created_at FROM users WHERE steam_id = $1 FOR UPDATE",
    [steamId],
  );
  if (account.rowCount !== 1 || String(account.rows[0].steam_account_id) !== accountId || account.rows[0].handle !== handle) {
    throw new Error("The exact Steam ID, account ID and handle did not identify one expected user; no account was deleted");
  }
  const id = account.rows[0].id;
  const audit = await client.query("SELECT * FROM admin_audit_logs WHERE actor_user_id = $1 ORDER BY created_at, id FOR UPDATE", [id]);
  const releases = await client.query("SELECT count(*)::int AS count FROM release_notes WHERE author_user_id = $1", [id]);
  const matches = await client.query("SELECT count(*)::int AS count FROM journal_matches WHERE user_id = $1", [id]);
  const summary = { steamId, accountId, handle, isAdminInDatabase: account.rows[0].is_admin, superAdminConfigured: true, adminAuditLogs: audit.rowCount, authoredReleaseNotes: releases.rows[0].count, journalMatches: matches.rows[0].count, auditArchiveRequired: audit.rowCount > 0 };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.authoredReleaseNotes) {
    throw new Error("Published release notes reference this account. Nothing was deleted; review these notes separately");
  }
  if (mode === "--inspect") {
    await client.query("ROLLBACK");
    console.log(`Inspection complete. Nothing was deleted. On deletion, ${summary.adminAuditLogs} admin audit logs will be saved privately in ${archiveDirectory} before this exact user and its cascading data are deleted.`);
  } else {
    if (audit.rowCount) {
      const directory = await stat(archiveDirectory).catch(() => undefined);
      if (!directory?.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0) {
        throw new Error(`Create a private archive directory owned by dota2notes first: sudo install -d -m 0700 -o dota2notes -g dota2notes ${archiveDirectory}. Nothing was deleted`);
      }
      archivePath = join(archiveDirectory, `steam-${accountId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      const file = await open(archivePath, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify({ archivedAt: new Date().toISOString(), steamId, accountId, handle, userId: id, adminAuditLogs: audit.rows }, null, 2) + "\n");
        await file.sync();
      } finally {
        await file.close();
      }
      const removedAudit = await client.query("DELETE FROM admin_audit_logs WHERE actor_user_id = $1 RETURNING id", [id]);
      if (removedAudit.rowCount !== audit.rowCount) throw new Error("Audit log count changed; transaction rolled back");
    }
    const result = await client.query("DELETE FROM users WHERE id = $1 AND steam_id = $2 RETURNING id", [id, steamId]);
    if (result.rowCount !== 1) throw new Error("Delete did not affect exactly one user; transaction rolled back");
    await client.query("COMMIT");
    console.log(`Deleted exactly one account. Related sessions and user-owned data were removed by database cascades. ${audit.rowCount} admin audit logs were archived at ${archivePath ?? "(none)"} before deletion. SUPER_ADMIN_STEAM_IDS was not changed.`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  if (archivePath) console.error(`An archive may have been written at ${archivePath}; database changes were rolled back unless COMMIT itself failed. Check database state before retrying.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
