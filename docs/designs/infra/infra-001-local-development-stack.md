---
code: INFRA-001
title: Local development stack
domain: infra
prd_refs: [INFRA-001, SEC-R05, DATA-R06]
depends_on: []
depended_by: [CRED-001, DATA-001]
layers_touched: [infra]
cross_cutting_rules: [SEC-R05, DATA-R06]
status: design-ready
---

# `INFRA-001` — Local development stack

## 1. Purpose and PRD refs

One command brings up everything the application needs, and one command tears it
down without leaving a database running on a port nobody remembers. Realizes
`INFRA-001`.

It comes first because nothing above it can be built or tested without it. A
schema that has never been applied is a document; a migration whose rollback has
never run is a promise. Both become real the moment there is somewhere to run
them, and that is all this design is for.

It also settles the two questions that otherwise get answered differently by
each person who sets the project up: which versions, and which ports.

## 2. Layer walkthrough

**Down.** `docker-compose.yml` declares PostgreSQL. `.nvmrc` pins Node.
`env.example` declares every variable the application reads, with a value that
works locally and no value that works anywhere else. The `Makefile` is the
interface to all three, so nobody has to remember the flags.

**Up.** Nothing. This layer has no reader; its whole output is that the layers
above it can run.

## 3. Contracts

### Versions, pinned

| Thing | Version | Why pinned |
|---|---|---|
| Node | 24 (`.nvmrc`) | The Next.js version the application targets; a mismatch surfaces as a build that works on one machine |
| PostgreSQL | 17 | `citext`, `gen_random_uuid()` and `jsonb` behaviour the schema relies on |

A pin is a fact about what has been tested, not a preference. Changing one is a
decision that belongs in the register.

### Ports

| Service | Port | Why this one |
|---|---|---|
| PostgreSQL | **5434** | Not 5432. Several VALO repositories run their own database on this machine at once, and the default port makes two projects fight over one socket — the failure looks like a migration applied to the wrong database, which is discovered later and elsewhere |
| The application | **3100** | The row this repository claimed in `docs/ECOSYSTEM.md`. Not Next.js's default 3000, which VALO Ads holds |
| The static gateway | **3101** | `make serve`. Adjacent to the claimed row so it reads as ours, and deliberately not 8123 — that is VALO Ads' ClickHouse, and a browser pointed at it would get an answer from the wrong thing rather than a refusal |

### Environment

`env.example` is the catalogue. Every variable the application reads appears
there with a comment saying what it is for and what happens when it is absent.
A variable the application reads and this file does not name is a defect, because
the first person to discover it will discover it as a crash.

| Variable | Local value | Absent means |
|---|---|---|
| `DATABASE_URL` | `postgres://valotech:valotech@127.0.0.1:5434/valotech` | The application does not start. This is deliberate: a database-less start would serve empty pages that look like a working site |
| `SESSION_SECRET` | a development value, clearly marked | The application does not start |
| `APP_ORIGIN` | `http://127.0.0.1:3100` | The application does not start; cookies and links need to know their own origin |
| `PORT` | `3100` | Optional; the application listens on the claimed row. A value here that disagrees with `APP_ORIGIN` produces links that reach nothing |
| `SMTP_*` | unset | Mail degrades and the system stays up (`SEC-R05`) — `CRED-001` owns this |

**No secret is committed.** `env.example` carries shapes and development values;
`.env` is ignored. `gitleaks` runs in CI against the tree.

### Commands

| Command | What it does |
|---|---|
| `make infra-up` | PostgreSQL on 5434, with a named volume |
| `make infra-down` | Stops it, keeps the data |
| `make infra-reset` | Stops it and deletes the data — the only destructive one, and it says so |
| `make migrate` | Applies every pending migration |
| `make migrate-down` | Rolls back the last one |
| `make migrate-roundtrip` | Applies, rolls back, applies again, against a throwaway database |

`migrate-roundtrip` exists because `DATA-R06` requires a *tested* down-migration,
and the only way to test one is to run it. A rollback that has never been
executed is not a rollback, and the moment it is needed is the worst moment to
discover that.

## 4. Integration

**`DATA-001`** applies its migrations against this stack, and its round-trip
proof runs here. **`CRED-001`** reads the variables this design declares.
Everything else depends on those two and therefore on this, transitively.

## 5. Cross-cutting compliance

- **`DATA-R06`** — `make migrate-roundtrip` is what makes a down-migration
  tested rather than written, and it is the reason that target exists.
- **`SEC-R05`** — no secret in the repository; a missing optional credential
  degrades its feature rather than stopping the system. The two required
  variables are the exception and they fail loudly at startup, which is the
  safe direction: a system that starts without a database and serves empty
  pages is worse than one that refuses to start.

## 6. Open questions and trade-offs

- **No Redis, no queue, no object store.** The application has one small
  database and no background work. Each of those would be a service to run, a
  variable to set and a failure mode to handle, in exchange for nothing this
  product does. `CMS-003` stores media in the database as bytes for the same
  reason — a few dozen images do not need an object store, and adding one is a
  decision to file when the count makes it true rather than now.
- **PostgreSQL in Docker, the application on the host.** The application is
  edited constantly and the database is not, so the one that benefits from a
  container is the one that gets it. Running both in Docker would make the
  edit-to-reload loop slower for no gain.

## 7. Task list

- `INFRA-001/T1` — PostgreSQL 17 on 5434 under docker-compose, with a named volume and a health check
- `INFRA-001/T2` — `env.example` names every variable the application reads, with what its absence means
- `INFRA-001/T3` — Make targets for up, down, reset, and the three migration commands
- `INFRA-001/T4` — `make migrate-roundtrip` applies, rolls back and re-applies against a throwaway database
- `INFRA-001/T5` — A first-run path that works from a fresh clone with no prior state
