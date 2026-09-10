// Delete what each retention window says is past its keeping (`DATA-002/T4`,
// `DATA-R10`). The windows are the design's §3 table: an expired session and a
// consumed or expired invitation are spent credentials with nothing left to
// learn from them, and a mail-log row is kept two years to answer a question
// about a past campaign and no longer.
//
// `audit` is deliberately absent. It is append-only (`DATA-R09`) — a DELETE on
// it is refused by a trigger — and its seven-year window is a floor satisfied by
// never deleting, not a deletion this performs. The revision archive is absent
// for the opposite reason: it is kept forever, because the archive is the point
// (`CMS-R01`).
//
// This is the deletion; the schedule that runs it is `OPS-001`'s, the way the
// backup is `backup.py` and its cron is the deploy's. It is safe to run by hand
// on any day, because it removes only rows already past a window, and it is
// exported so a test can prove exactly that against a real database.
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// The one window measured against a fixed age rather than a moment the row
// already carries: a session and an invitation each record when they lapse, and
// a mail-log row is kept for this long after it was written. Passed as a
// parameter, not interpolated, so the window is data and never part of the SQL.
const MAIL_LOG_RETENTION = '2 years';

/**
 * Delete every row past its retention window, and report how many of each went.
 * Takes a connected client so a test can hand it one against a throwaway state
 * and read the counts back.
 */
export async function sweep(client) {
  const sessions = await client.query('DELETE FROM sessions WHERE expires_at < now()');
  const invitations = await client.query(
    'DELETE FROM invitations WHERE consumed_at IS NOT NULL OR expires_at < now()',
  );
  const mail = await client.query('DELETE FROM mail_log WHERE at < now() - ($1)::interval', [
    MAIL_LOG_RETENTION,
  ]);

  return {
    sessions: sessions.rowCount,
    invitations: invitations.rowCount,
    mail_log: mail.rowCount,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    console.error('retention-sweep: DATABASE_URL is not set');
    process.exit(1);
  }

  // The target is printed before connecting so a wrong database announces itself
  // rather than arriving disguised as a row count, the way `make migrate` does.
  const parsed = new URL(url);
  console.log(`retention-sweep: ${parsed.host}${parsed.pathname} as ${parsed.username}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const deleted = await sweep(client);
    console.log(
      `retention-sweep: ${deleted.sessions} expired session(s), ` +
        `${deleted.invitations} spent invitation(s), ` +
        `${deleted.mail_log} mail-log row(s) past two years`,
    );
  } finally {
    await client.end();
  }
}

// Run only when invoked directly (`node scripts/retention-sweep.mjs`), never when
// a test imports `sweep`. pathToFileURL makes the comparison hold on Windows,
// where argv[1] is a backslash path and import.meta.url is a file URL.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
