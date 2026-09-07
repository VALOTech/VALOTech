-- Up Migration

-- citext, because an e-mail address is case-insensitive: two rows differing
-- only in case are the same person, and a unique index over plain text would
-- let both exist. gen_random_uuid() needs no extension on PostgreSQL 13 and
-- above, which is why none is created for it here.
--
-- CREATE EXTENSION needs a privilege a managed database's application role may
-- not hold; the operator checklist records that citext must be installable or
-- pre-installed where this deploys (docs/operator-checklist.md#DB-EXTENSIONS).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('investor', 'admin')),
  password_hash text,
  state         text NOT NULL DEFAULT 'invited' CHECK (state IN ('invited', 'active', 'suspended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at is maintained in the database, not by whoever writes the next
-- update: a column that only whoever remembers keeps current is a column that
-- is wrong the first time someone forgets. The function is named for the
-- column so later tables share one trigger definition.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

-- The citext extension stays. It is shared with the migrations that follow
-- this one, and dropping an extension takes every object that depends on it,
-- so a rollback of this one table would reach tables it does not own.
DROP TRIGGER accounts_set_updated_at ON accounts;
DROP TABLE accounts;
DROP FUNCTION set_updated_at();
