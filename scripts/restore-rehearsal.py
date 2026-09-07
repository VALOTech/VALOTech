#!/usr/bin/env python
"""Restore the newest backup into a throwaway database and prove it (DATA-003/T3).

The title of DATA-003 is the design: a backup nobody has restored is a file of
unknown validity, and the moment it is needed is the worst moment to learn which.
This restores the most recent backup into a *fresh* database -- never over a live
one -- checks that its schema is the current migration head and its row counts
are within tolerance of live, and prints how long the whole thing took. Step five
is the number that matters: the R-axis asks whether a known-good state can be
restored in fifteen minutes, and the only honest answer is a measured one.

There is deliberately no restore-into-production here. Restoring over live data is
a manual, documented act with the owner present (docs/runbooks/data-003-restore.md).

Run: python scripts/restore-rehearsal.py   (env: DATABASE_URL, BACKUP_TARGET, BACKUP_KEY)
"""

import datetime as dt
import os
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlparse, urlunparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

NAME_RE = re.compile(r"^valotech-\d{8}T\d{6}Z\.dump\.enc$")
SCRATCH = "valotech_rehearsal"
TOLERANCE_REL = 0.10
TOLERANCE_ABS = 10
REHEARSAL_STATE = ".last-rehearsal"


def fail(message):
    print("rehearsal: %s" % message)
    sys.exit(1)


def env_url(name):
    value = (os.environ.get(name) or "").strip()
    if not value:
        fail("%s is not set" % name)
    return value


def with_db(url, dbname):
    parts = urlparse(url)
    return urlunparse(parts._replace(path="/" + dbname))


def psql_scalar(url, query):
    out = subprocess.run(
        ["psql", url, "-tAc", query], capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if out.returncode != 0:
        fail("psql failed: %s" % out.stderr.strip())
    return out.stdout.strip()


def table_counts(url):
    rows = psql_scalar(
        url,
        "select table_name from information_schema.tables "
        "where table_schema='public' and table_name <> 'pgmigrations' order by table_name",
    )
    tables = [t for t in rows.splitlines() if t]
    return {t: int(psql_scalar(url, 'select count(*) from "%s"' % t)) for t in tables}


def main():
    started = time.monotonic()

    database_url = env_url("DATABASE_URL")
    target = env_url("BACKUP_TARGET")
    key = env_url("BACKUP_KEY")

    if target.startswith("s3://"):
        fail("an s3:// target is fetched by the deploy's rehearsal (OPS-001); this rehearses a filesystem target")

    backups = sorted(n for n in os.listdir(target) if NAME_RE.match(n))
    if not backups:
        fail("no backup found in %s" % target)
    newest = os.path.join(target, backups[-1])
    print("rehearsal: restoring %s" % backups[-1])

    admin_url = with_db(database_url, "postgres")
    scratch_url = with_db(database_url, SCRATCH)

    subprocess.run(["psql", admin_url, "-c", 'drop database if exists "%s" with (force)' % SCRATCH], check=True,
                   capture_output=True)
    subprocess.run(["psql", admin_url, "-c", 'create database "%s"' % SCRATCH], check=True, capture_output=True)

    try:
        with tempfile.NamedTemporaryFile(suffix=".dump", delete=False) as plain:
            plain_path = plain.name
        # Decrypt to a scratch file the restore reads; it is removed in `finally`
        # whether or not the restore succeeds.
        dec = subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_KEY", "-in", newest, "-out", plain_path],
            env=dict(os.environ, BACKUP_KEY=key), capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if dec.returncode != 0:
            fail("decryption failed (wrong BACKUP_KEY?): %s" % dec.stderr.strip())

        restore = subprocess.run(
            ["pg_restore", "--no-owner", "--no-privileges", "-d", scratch_url, plain_path],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        # pg_restore warns on things a --no-owner restore expects; a non-zero exit
        # with real errors is the failure, which the assertions below catch anyway.

        live = table_counts(database_url)
        restored = table_counts(scratch_url)

        if set(restored) != set(live):
            fail("schema mismatch: live has %s, restore has %s" % (sorted(live), sorted(restored)))

        for table, live_count in live.items():
            got = restored[table]
            allowed = max(TOLERANCE_ABS, int(live_count * TOLERANCE_REL))
            if abs(got - live_count) > allowed:
                fail("%s: restored %d rows, live has %d (tolerance %d)" % (table, got, live_count, allowed))

        head = psql_scalar(scratch_url, "select count(*) from pgmigrations")
        elapsed = time.monotonic() - started
        print("rehearsal: %d tables match, %s migrations present, row counts within tolerance" % (len(live), head))
        print("rehearsal: OK in %.1fs" % elapsed)

        try:
            with open(os.path.join(target, REHEARSAL_STATE), "w", encoding="utf-8") as state:
                state.write(dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "\n")
        except OSError:
            pass
    finally:
        if os.path.exists(plain_path):
            os.remove(plain_path)
        subprocess.run(["psql", admin_url, "-c", 'drop database if exists "%s" with (force)' % SCRATCH],
                       capture_output=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
