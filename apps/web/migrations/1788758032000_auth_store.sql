-- Up Migration

-- The cookie carries a random token and this table stores only its hash, so a
-- database dump is not a set of live sessions. id is the internal identifier
-- and never leaves the server: a cookie carrying it would make every read of
-- this table a set of credentials, which is the property the hash exists to
-- deny (AUTH-002).
--
-- expires_at carries no default. The lifetime is SESSION_TTL_SECONDS, which is
-- configuration and changes without a migration; a default here would be a
-- second lifetime, in force whenever the first was not passed and wrong the
-- moment the two disagree.
--
-- last_seen_at is written on each request. That is a write per request, which
-- a room with a handful of readers can afford and a larger product could not;
-- the expiry slides because an investor timed out mid-read costs more than the
-- write does.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash   text UNIQUE NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

-- A privilege change -- role changed, password changed, account suspended --
-- deletes every session the account has, and the erasure cascade reaches the
-- same rows the same way: by account_id, which the referencing side of the
-- foreign key does not index on its own. The lookup a request makes needs no
-- index of its own, because token_hash's UNIQUE constraint is one.
CREATE INDEX sessions_account_id_idx ON sessions (account_id);

-- One mechanism for an invitation and a password reset. They differ in who
-- starts them and in how long the token lives -- seven days for an invitation
-- that will sit in an inbox over a weekend, an hour for a reset asked for by
-- somebody at their keyboard -- and in nothing else, so two tables would be two
-- consumption rules and two chances to get single-use wrong. The lifetime is
-- the caller's, which is why expires_at has no default here either.
--
-- The token is never stored, only its hash, so a database read gives an
-- attacker nothing to present.
--
-- consumed_at is null until the token is used, and the UPDATE that sets it is
-- the check rather than something that follows one: consuming by token_hash
-- where consumed_at IS NULL and expires_at > now() settles single-use in one
-- statement, where a read and then a write would let two simultaneous posts
-- both pass the read and the second set a password the first person did not
-- choose (AUTH-003).
CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  text UNIQUE NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);

-- Issuing an invitation or a reset invalidates every outstanding one for that
-- account, and the erasure cascade reaches the same rows the same way -- by
-- account_id, which the referencing side of the foreign key does not index on
-- its own.
CREATE INDEX invitations_account_id_idx ON invitations (account_id);

-- Down Migration

-- Neither table references the other, and neither owns a trigger or a function
-- that a migration outliving this one shares, so there is no order to keep and
-- nothing to leave behind. Dropping a table drops its indexes.
DROP TABLE invitations;
DROP TABLE sessions;
