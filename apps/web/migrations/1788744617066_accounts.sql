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
  -- Three roles, and the third is the narrow one. `prospect` is somebody who
  -- asked for access from the gateway and confirmed the address they gave
  -- (AUTH-005); nobody has vouched for who they are, so the hall admits them to
  -- what it publishes openly and to nothing else. `investor` is somebody an
  -- admin invited by name. An admin promotes the first to the second once the
  -- person has invested, which is an ordinary role change and is audited as one.
  --
  -- The word also appears in investor_type below, and the two are not the same
  -- fact: this column says how far the company has verified who somebody is,
  -- and that one says whether they have invested yet. An admin-invited person
  -- still deciding is role 'investor' and type 'prospect' at once, and both
  -- readings are true of them.
  role          text NOT NULL CHECK (role IN ('prospect', 'investor', 'admin')),
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
  -- The language this person is written to in (AUTH-003/T3). An invitation, a
  -- reset link and every transactional message after them are read by one named
  -- person, and the account is the only place that person's language can live:
  -- there is no session at the moment an invitation is composed, and the browser
  -- that will open the link has not been seen yet.
  --
  -- Nullable, because the design asks for "the invitee's locale if known and
  -- English otherwise" and a default of 'en' would make the two cases
  -- indistinguishable. An admin who knows the person records their language; an
  -- admin who does not leaves it empty and the composer falls back. A column
  -- that could not say "not known" would turn every unanswered question into a
  -- claim about what somebody reads. Like the two above it is left out of the
  -- updated_at trigger's WHEN below only if it is behavioural -- it is not: it is
  -- an attribute of the account an admin sets, so a change to it restamps.
  --
  -- The CHECK lists the twenty the application serves, the same set
  -- apps/web/src/i18n/locales.ts exports and the set apps/web/src/db/db.test.ts
  -- compares this constraint against, so a locale in one and not the other is a
  -- red test rather than a row whose language has no messages.
  locale        text CHECK (locale IS NULL OR locale IN ('en', 'zh', 'zt', 'vi', 'th', 'id', 'ms', 'tl', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'ja', 'tr', 'ko')),
  -- Whether this person has already invested or is still deciding, which is what
  -- the hall's landing orders its blocks by (INV-DEC-02).
  --
  -- Nullable, and null means nobody has said -- which is not 'prospect'. An
  -- account that existed before this column did has not been described by
  -- anybody, and classifying it by default would show the order built to
  -- persuade to somebody who has already paid. The two named values are the two
  -- somebody has actually stated.
  --
  -- It orders a page and never gates one. What a reader may read is decided by
  -- content_grants and content_items.audience alone; a second column able to
  -- withhold a document would be a second access model, and the second one is
  -- the one that goes stale when the rule changes. Whoever adds a clause reading
  -- this column into an access predicate has built that second model.
  --
  -- An attribute an admin sets rather than a behavioural column, so unlike
  -- last_sign_in and read_tracking_objected it is named in the updated_at
  -- trigger's WHEN below and a change to it restamps the account.
  investor_type text CHECK (investor_type IS NULL OR investor_type IN ('current', 'prospect')),
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
     OR OLD.state IS DISTINCT FROM NEW.state
     OR OLD.locale IS DISTINCT FROM NEW.locale
     OR OLD.investor_type IS DISTINCT FROM NEW.investor_type)
  EXECUTE FUNCTION set_updated_at();

-- Down Migration

-- The citext extension stays. It is shared with the migrations that follow
-- this one, and dropping an extension takes every object that depends on it,
-- so a rollback of this one table would reach tables it does not own.
DROP TRIGGER accounts_set_updated_at ON accounts;
DROP TABLE accounts;
DROP FUNCTION set_updated_at();
