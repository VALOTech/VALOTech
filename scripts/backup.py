#!/usr/bin/env python
"""Take one encrypted database backup, and prune old ones (DATA-003/T1, T2).

A backup nobody has restored is a file of unknown validity; `restore-rehearsal`
is the other half and the one that matters. This half is deliberately boring:
`pg_dump` in the custom format, encrypted before it leaves the host with a key
that is not stored beside the backups, written to BACKUP_TARGET.

Absent BACKUP_TARGET or BACKUP_KEY, no backup is taken and this says so and exits
zero -- a disabled feature that fails loudly is worse than one that degrades
(CRED-001, SEC-R05). The filename carries a UTC timestamp and nothing about the
contents (DATA-R02).

Retention is grandfather-father-son: the newest in each of the last seven days,
the last four ISO weeks, and the last twelve months are kept; everything else is
pruned. Small enough that the cost is nothing, long enough that a corruption
found a month later is still recoverable.

Run: python scripts/backup.py   (env: DATABASE_URL, BACKUP_TARGET, BACKUP_KEY)
"""

import datetime as dt
import os
import re
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PREFIX = "valotech-"
SUFFIX = ".dump.enc"
STAMP = "%Y%m%dT%H%M%SZ"
NAME_RE = re.compile(r"^valotech-(\d{8}T\d{6}Z)\.dump\.enc$")


def fail(message):
    print("backup: %s" % message)
    sys.exit(1)


def parse_stamp(name):
    match = NAME_RE.match(name)
    if match is None:
        return None
    try:
        return dt.datetime.strptime(match.group(1), STAMP).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def keep_set(names, now):
    """The names to keep: the newest in each recent day, week and month.

    A backup can fill more than one slot and is kept once; the union is what
    bounds the count at roughly seven plus four plus twelve.
    """
    dated = sorted(
        ((parse_stamp(n), n) for n in names if parse_stamp(n) is not None),
        reverse=True,
    )
    keep = set()
    for horizon, key in (
        (7, lambda d: d.date()),
        (4, lambda d: d.isocalendar()[:2]),
        (12, lambda d: (d.year, d.month)),
    ):
        seen = {}
        for when, name in dated:
            bucket = key(when)
            if bucket not in seen:
                seen[bucket] = name
        for name in list(seen.values())[:horizon]:
            keep.add(name)
    return keep


def main():
    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    target = (os.environ.get("BACKUP_TARGET") or "").strip()
    key = os.environ.get("BACKUP_KEY") or ""

    if not database_url:
        fail("DATABASE_URL is not set")
    if not target:
        print("backup: BACKUP_TARGET is not set; no backup is taken")
        return 0
    if not key.strip():
        print("backup: BACKUP_KEY is not set; a backup would be unencrypted, so none is taken")
        return 0

    # An s3:// target is the deploy's (OPS-001), reached with the AWS CLI; the
    # mechanism here is the filesystem one the rehearsal exercises locally.
    if target.startswith("s3://"):
        print("backup: an s3:// target is written by the deploy (OPS-001); this path takes a filesystem target")
        return 0

    os.makedirs(target, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)
    out = os.path.join(target, PREFIX + now.strftime(STAMP) + SUFFIX)

    # pg_dump -> openssl, so the plaintext dump never touches the disk: the pipe
    # carries it from one process to the other and only the ciphertext is
    # written. A failure in either collapses the pipe and the file is removed.
    dump = subprocess.Popen(
        ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", database_url],
        stdout=subprocess.PIPE,
    )
    enc_env = dict(os.environ, BACKUP_KEY=key)
    with open(out, "wb") as handle:
        enc = subprocess.Popen(
            ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", "env:BACKUP_KEY"],
            stdin=dump.stdout,
            stdout=handle,
            env=enc_env,
        )
        dump.stdout.close()
        enc_rc = enc.wait()
    dump_rc = dump.wait()

    if dump_rc != 0 or enc_rc != 0:
        if os.path.exists(out):
            os.remove(out)
        fail("pg_dump exited %d, openssl exited %d; no backup written" % (dump_rc, enc_rc))

    size = os.path.getsize(out)
    print("backup: wrote %s (%d bytes, encrypted)" % (os.path.basename(out), size))

    names = [n for n in os.listdir(target) if NAME_RE.match(n)]
    keep = keep_set(names, now)
    pruned = 0
    for name in names:
        if name not in keep:
            os.remove(os.path.join(target, name))
            pruned += 1
    print("backup: %d kept, %d pruned (7 daily, 4 weekly, 12 monthly)" % (len(keep), pruned))
    return 0


if __name__ == "__main__":
    sys.exit(main())
