# Runbook — `DATA-003` restore

> Every command below was executed by `make restore-rehearsal` against a real
> PostgreSQL 17.11, in this order. The rehearsal restores into a **throwaway**
> database and is safe to run any day; this runbook is the **production** restore,
> which is not, and is done with the owner present. There is deliberately no
> `make restore-production` — a restore over live data is a decision, not a
> command that can be run by accident.

## What this is

Rebuilding the database from the most recent encrypted backup, after data loss or
a corruption that a fix cannot undo. The backup is a `pg_dump` custom-format
archive, encrypted with `BACKUP_KEY`, in `BACKUP_TARGET`. The dump includes
`media.bytes`, so one archive restores everything.

## How to tell it is needed

Rows or tables that should exist do not, and no migration or code change put them
back — a dropped table, a bad bulk write, a disk that failed. A restore is the
last resort, after a fix has been ruled out, because it discards everything
written since the backup was taken.

## Before touching production — rehearse

`make restore-rehearsal` restores the newest backup into a throwaway database,
checks its schema is the current migration head and its row counts are within
tolerance of live, and prints the time. A green rehearsal is proof the backup is
restorable **before** the live database is touched:

    make restore-rehearsal
    rehearsal: restoring valotech-20260907T091001Z.dump.enc
    rehearsal: 14 tables match, 4 migrations present, row counts within tolerance
    rehearsal: OK in 2.4s

The 2.4s is a small local database over the loopback; a production restore over
the network is the same order, not a different one.

## The production restore

With the owner present, and the application stopped so nothing writes mid-restore.

1. **Stop the application** so no request writes during the restore. `<OPS-001>`.
2. **Fetch the newest backup** from `BACKUP_TARGET` (an `aws s3 cp` in the deploy;
   a file copy locally).
3. **Decrypt it** with the key, which is not stored beside the backups:

       openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_KEY -in <backup>.dump.enc -out restore.dump

4. **Restore**, dropping the existing objects first so the archive is authoritative:

       pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" restore.dump

5. **Verify** before letting anyone in — the same checks the rehearsal makes:
   the table set matches the migration head, and the row counts are what the
   backup's age predicts.

       psql "$DATABASE_URL" -c "select count(*) from pgmigrations"
       psql "$DATABASE_URL" -c "select relname, n_live_tup from pg_stat_user_tables order by relname"

6. **Remove the decrypted dump** — it is plaintext personal data:

       rm restore.dump

7. **Restart the application.** `<OPS-001>`.

## What a restore costs

Everything written since the backup was taken. Backups are daily, so the worst
case is a day of updates — a handful of documents whose authors still have them
(`DATA-003` §6). If that day matters, the answer is a more recent backup, not a
faster restore.
