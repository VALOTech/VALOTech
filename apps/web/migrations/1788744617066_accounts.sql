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
  -- Null means the person has never signed in, which is a state an invited
  -- account holds and a stale one earns. It is the record's one behavioural
  -- column, kept because the stale-account problem has no other signal, and it
  -- goes when the row goes. Stored rather than read from a session, because a
  -- sign-out deletes the session and the fact has to survive it. It is absent
  -- from the updated_at trigger's WHEN below, so a sign-in does not restamp
  -- updated_at; that column tracks changes to the account's defining
  -- attributes, not every write the row takes.
  last_sign_in  timestamptz,
  -- The read-tracking objection (LEGAL-GLOBAL-001/T3): when true, deck and report
  -- reads stop being recorded for this account and its existing read rows are
  -- deleted. It is a right a person may exercise, the act is audited, and this is
  -- the flag the record functions check before writing. Like last_sign_in it is a
  -- behavioural column, left out of the updated_at trigger's WHEN below so
  -- exercising the objection does not restamp the account.
  read_tracking_objected boolean NOT NULL DEFAULT false,
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

-- The trigger fires only when one of the account's defining attributes changes:
-- address, name, role or state. So updated_at tracks changes to the account and
-- not every write it receives. A sign-in writes last_sign_in and a rehash
-- writes password_hash; both are writes the row takes on its own behalf, so the
-- WHEN leaves them out and neither restamps updated_at.
CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD.role IS DISTINCT FROM NEW.role
     OR OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION set_updated_at();

-- Down Migration

-- The citext extension stays. It is shared with the migrations that follow
-- this one, and dropping an extension takes every object that depends on it,
-- so a rollback of this one table would reach tables it does not own.
DROP TRIGGER accounts_set_updated_at ON accounts;
DROP TABLE accounts;
DROP FUNCTION set_updated_at();
