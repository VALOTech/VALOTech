---
code: DATA-001
title: Schema and migrations
domain: data
prd_refs: [DATA-001, DATA-R01, DATA-R03, DATA-R05, SEC-R04, CMS-R01, CMS-R03]
depends_on: [INFRA-001]
depended_by: [AUTH-001, AUTH-002, CMS-001, DATA-003, SEC-002]
layers_touched: [infra, data]
cross_cutting_rules: [DATA-R01, DATA-R03, DATA-R05, SEC-R04, CMS-R01, CMS-R03]
status: design-ready
---

# `DATA-001` — Schema and migrations

## 1. Purpose and PRD refs

Everything the investor room stores, and the one way it changes shape. Realizes
`DATA-001` and is the ground `AUTH-001`, `AUTH-002` and the whole content system
stand on; every other feature reads through these tables.

**There is one content model, not three.** A report, an update and a deck differ
in how an investor reaches them and not at all in how they are stored, so they
are one table with a type column rather than three tables with three revision
histories, three locale states, three audience rules and three ways to get the
audience rule wrong. That is `CMS-001` expressed as a schema, and it is the
single most consequential decision in this file.

The whole of it is small — a few thousand rows at the outside — so nothing here
is designed for scale. It is designed for two other things: that a deletion is a
real deletion (`DATA-R03`), and that a privileged write cannot happen without
leaving a record (`SEC-R04`).

## 2. Layer walkthrough

**Down.** A migration file is applied by one command; the schema it produces is
what every repository function queries. No ORM generates the schema: the
migration is the source of truth and the types are written against it, because a
schema inferred from code is a schema nobody can review in one place.

**Up.** A row reaches the reader only through a repository function that takes
the reader's role as an argument. There is no query helper that can be called
without one — the role is a parameter, not a filter added later, so forgetting it
is a compile error rather than a leak (`DATA-R05`).

## 3. Contracts

### Tables

**`accounts`** — one row per person who can sign in.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | generated in the database |
| `email` | `citext` unique not null | the identifier; `citext` because an address is case-insensitive and two rows differing only in case are the same person |
| `name` | `text` not null | shown to admins; the minimum `DATA-R01` allows |
| `role` | `text` not null | `investor` or `admin`, checked by a constraint rather than trusted |
| `password_hash` | `text` | null until an invitation is accepted |
| `state` | `text` not null | `invited`, `active`, `suspended` |
| `created_at`, `updated_at` | `timestamptz` not null | UTC, always |

**`sessions`** — server-side, so a sign-out ends a session rather than asking the
browser to forget it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | the value in the cookie is a hash of this, never this |
| `account_id` | `uuid` FK → accounts | `on delete cascade`: erasing a person ends their sessions |
| `created_at`, `last_seen_at`, `expires_at` | `timestamptz` | |

**`invitations`** — a single-use token with an expiry, consumed atomically.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `account_id` | `uuid` FK → accounts | |
| `token_hash` | `text` unique not null | the token itself is never stored |
| `expires_at` | `timestamptz` not null | |
| `consumed_at` | `timestamptz` | null until used; the `update … where consumed_at is null` is what makes it single-use under concurrency |

**`content_items`** — one row per thing an investor can read.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `type` | `text` not null | `report`, `update`, `deck` — constrained, and the only thing that differs between them at this level |
| `slug` | `text` unique not null | stable in the URL for the life of the item |
| `title` | `text` not null | |
| `kind` | `text` | for `update` only: `announcement`, `achievement`, `progress` |
| `period` | `text` | for `report` only: `2026-Q3`. Unique **per type** among published items, so "the Q3 report" names one document (`RPT-002`) |
| `audience` | `text` not null | `public`, `investor`, `granted` — the value a query filters on, never a template |
| `current_revision_id` | `uuid` FK → content_revisions | null while nothing is published; **this column alone decides what a reader sees** |
| `created_at`, `updated_at` | `timestamptz` not null | |

**`content_revisions`** — the content itself, and every version of it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `item_id` | `uuid` FK → content_items | `on delete cascade` |
| `blocks` | `jsonb` not null | an ordered array of structured blocks, never markup (`CMS-R04`) |
| `author_id` | `uuid` FK → accounts | who wrote it |
| `created_at` | `timestamptz` not null | |
| `published_at` | `timestamptz` | when this revision became the current one; null means it never has been |

A revision is **never updated once it has been published**. An edit creates a new
row, and publishing moves `current_revision_id` — so withdrawing is moving the
pointer back, and what an investor read last month is still on disk to be read
again (`CMS-R01`). Nothing here is a soft delete: the pointer is the state.

**`content_locales`** — the same revision in another language.

| Column | Type | Notes |
|---|---|---|
| `revision_id`, `locale` | `uuid`, `text` | composite PK |
| `blocks` | `jsonb` not null | the translated blocks, same shape as the source |
| `state` | `text` not null | `machine` or `reviewed` — **a `machine` row is never served** (`CMS-R05`) |
| `reviewed_by`, `reviewed_at` | `uuid`, `timestamptz` | null until a person has read it |

The state lives on the row rather than being inferred from `reviewed_at` being
null, because the query that serves a reader must filter on one indexed column
and must not be able to express "probably reviewed".

**`content_grants`** — which account may read an item whose audience is `granted`.

| Column | Type | Notes |
|---|---|---|
| `item_id`, `account_id` | `uuid` | composite PK, both `on delete cascade` |
| `granted_at`, `granted_by` | `timestamptz`, `uuid` | |

**`media`** and **`media_refs`** — images content references.

| `media` | | |
|---|---|---|
| `id` | `uuid` PK | |
| `sha256` | `text` unique not null | the same file uploaded twice is one row |
| `mime`, `byte_size` | `text`, `bigint` | validated on upload against the actual bytes, not the claimed name |
| `bytes` | `bytea` not null | in the database, deliberately — see §6 |
| `uploaded_by`, `created_at` | `uuid`, `timestamptz` | |

| `media_refs` | | |
|---|---|---|
| `media_id`, `item_id` | `uuid` | composite PK |

An image is served only to a reader who may read **some item that references it**
(`CMS-R06`). That is a join, not a guess, and it is why `media_refs` exists
rather than an `audience` column on `media` that would have to be kept in step by
hand.

**`portfolio`** — where each product stands (`INV-003`).

| Column | Type | Notes |
|---|---|---|
| `product` | `text` PK | one of the six, constrained |
| `stage`, `headline` | `text` | the state, and one line about it |
| `updated_at`, `updated_by` | `timestamptz`, `uuid` | |

A state rather than a history: an investor asks where a product is now, and the
answer is one row. The history of how it got there is the update stream.

**`mail_log`** — what left, to whom, when. Written before the send is attempted
and updated with the outcome, so a crash between the two leaves a record of an
attempt rather than no record at all.

**`config`** — key, value, previous value, who changed it, when. The previous
value is a column rather than a history table because the undo has to be one
action, and an operator reaching for it is not in a position to reconstruct one.

**`audit`** — `actor_id`, `action`, `subject`, `before` `jsonb`, `after` `jsonb`,
`at`. Append-only, and enforced: a `BEFORE UPDATE OR DELETE` trigger raises, so
the guarantee lives in the database rather than in the discipline of whoever
writes the next repository function.

### Migrations

Numbered, forward-only, each with a down-migration. Applied by one command, and
that command prints `host:port/database as user` before it connects — a port that
is wrong announces itself instead of arriving disguised as an authentication
error.

### Environment

`DATABASE_URL`, `DB_SSLMODE`. Both in `env.example`, both required.

## 4. Integration

`INFRA-001` is where these migrations are applied and where the round trip that
proves them is run. `AUTH-001` reads `accounts` and writes `password_hash`;
`AUTH-002` reads and writes `sessions`. `CMS-001` is the code shape over
`content_items`, `content_revisions` and `content_locales`; `CMS-006` is the one
place `audience` and `content_grants` are read. `SEC-002` owns the `audit`
trigger. `ADMIN-001`'s erasure deletes an `accounts` row and relies on the
cascades above; the `audit` rows it leaves name the account by id and hold no
personal data, which is what `DATA-R03` means by retaining the trail minimally.

Erasing an account does **not** delete the content they authored. `author_id` is
`on delete set null`, because a published report is the company's document rather
than the author's personal data, and cascading it would delete an investor's
archive to satisfy a staff member's erasure request.

## 5. Cross-cutting compliance

- **`DATA-R01`** — the schema holds a name, an address, a role and a state. There
  is no column for anything else, so there is nothing to collect by accident.
- **`DATA-R03`** — erasure is `delete from accounts`, and every dependent row goes
  with it by cascade. The audit trail keeps ids, actions and timestamps.
- **`DATA-R05`** — no repository function exists that does not take the reader's
  role.
- **`SEC-R04`** — the trigger, not the convention.

## 6. Open questions and trade-offs

- **Row-level security instead of role-taking functions?** RLS would move the
  guarantee into the database, which is where `SEC-R04` put the audit guarantee.
  It is not chosen here because this application has one database user and no
  multi-tenant boundary; the cost of the policy machinery would buy a guarantee
  the function signature already gives. Reopen if a second application ever
  reaches this database.
- **`jsonb` for a revision's blocks.** A relational blocks table would let a
  query reach inside content; `CMS-007`'s search is the one thing that wants to,
  and it wants words rather than structure — a generated `tsvector` column over
  the flattened text serves it without a table per block. The trade is that a
  malformed body is a runtime error rather than a constraint violation, so the
  write path validates the block shape before it stores it, and the validator is
  the one in `CMS-002` rather than a second copy here.
- **Media as `bytea` in the database.** An object store is the conventional
  answer and it is the right one at a volume this product does not have. Bytes in
  the database mean one backup covers everything, one access rule covers
  everything, and there is no second credential and no second failure mode. It
  becomes wrong somewhere around a few hundred megabytes or the first video, and
  that is the signal to file the change rather than a size to guess at now.
- **One content table rather than three.** The cost is a nullable `kind` and a
  nullable `period` — columns that are meaningless for two of the three types.
  The alternative costs three revision histories, three locale-state tables and
  three implementations of the audience rule, and the audience rule is the one
  thing in this schema that must never be implemented twice.

## 7. Task list

- `DATA-001/T1` — Choose and wire the migration tool; one command applies and one rolls back
- `DATA-001/T2` — Accounts table: identity, role, state, created and updated
- `DATA-001/T3` — Sessions table, or the session store the auth library needs
- `DATA-001/T4` — Content items and their revisions, with the published revision named by a pointer
- `DATA-001/T5` — Content grants and the audience constraint
- `DATA-001/T6` — Locale rows carrying a review state a query can filter on
- `DATA-001/T11` — Media and its references, with the audience reached by join
- `DATA-001/T12` — The portfolio state table
- `DATA-001/T7` — Mail log and unsubscribe state
- `DATA-001/T8` — Audit table, append-only, with a database-level guard against update and delete
- `DATA-001/T9` — Configuration table with a recorded prior value
- `DATA-001/T10` — Every migration has a down-migration that has been run
