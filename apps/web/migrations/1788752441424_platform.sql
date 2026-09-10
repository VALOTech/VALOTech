-- Up Migration

-- The audit is the one table here that has to outlive the accounts it names,
-- which is why actor_id is a bare uuid and not a foreign key. A reference would
-- force a choice between two wrong answers the moment a person is erased:
-- cascade, and the record of what they did leaves with them; restrict, and the
-- erasure cannot complete at all. The id stays, so the row says what happened
-- and no longer says who -- which is what retaining a trail minimally means
-- (DATA-R03).
--
-- id is an identity bigint rather than a uuid because the only order this table
-- is ever read in is the order things happened, and a monotonic key gives that
-- without trusting a clock. GENERATED ALWAYS refuses a caller-supplied id, so a
-- compromised application holding INSERT cannot forge the order or poison the
-- sequence into aborting a later legitimate write.
--
-- before and after carry the fields that changed, never the whole row. A row
-- snapshot would put an e-mail address, and later a password hash, into a table
-- kept for seven years that outlives the account -- which is exactly how an
-- erasure that succeeds everywhere else fails here (DATA-R02).
--
-- The action vocabulary is closed and enforced in the database, so a privileged
-- write that audits nothing cannot ship quietly: a new action is a migration,
-- and a migration is read. The list stays on one line with the column it
-- constrains, because a column's type, nullability and constraint are read from
-- that column's own line, and a wrapped list reads as a column of its own.
CREATE TABLE audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  action       text NOT NULL CHECK (action IN ('account.create', 'account.suspend', 'account.delete', 'account.role_change', 'account.reinstate', 'grant.add', 'grant.remove', 'content.publish', 'content.withdraw', 'content.audience_change', 'media.delete', 'config.change', 'mail.send', 'mail.unsubscribe', 'session.invalidate_all', 'portfolio.change')),
  subject_type text,
  subject_id   uuid,
  before       jsonb,
  after        jsonb
);

-- Append-only, in the database rather than in the discipline of whoever writes
-- the next repository function (SEC-R04): a convention is the thing the
-- incident report is written about. OLD is the row under either statement, so
-- the message names the operation that was refused and the row it was aimed at.
--
-- The application's database role additionally holding no UPDATE or DELETE
-- privilege on this table is a grant made where the database is deployed, and
-- not this migration's to make. The two are deliberately independent: the
-- trigger catches a mistake, the grant catches a compromised application, and
-- neither failing takes the other with it. The operator checklist records the
-- revoke that must run where this deploys (docs/operator-checklist.md#AUDIT-GRANT).
CREATE FUNCTION raise_append_only() RETURNS trigger AS $$
BEGIN
  -- TRUNCATE is statement-level: OLD is unbound, and it is the one mutation a
  -- BEFORE UPDATE OR DELETE trigger never sees, so "append-only" is only true
  -- with the second trigger below.
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'audit is append-only; TRUNCATE is refused (SEC-R04)';
  END IF;
  RAISE EXCEPTION 'audit is append-only; % on row % is refused (SEC-R04)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_is_append_only
  BEFORE UPDATE OR DELETE ON audit
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();

CREATE TRIGGER audit_no_truncate
  BEFORE TRUNCATE ON audit
  FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- at is the database's clock, not the caller's: SEC-002 makes the timestamp
-- database-generated and never supplied, so an application holding INSERT but
-- no UPDATE cannot backdate a row to hide when it acted -- the one forgery that
-- grant leaves open. DEFAULT now() fills an omitted value; this forces it even
-- when one is passed.
CREATE FUNCTION audit_force_now() RETURNS trigger AS $$
BEGIN
  NEW.at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_at_is_db_time
  BEFORE INSERT ON audit
  FOR EACH ROW EXECUTE FUNCTION audit_force_now();

-- previous_value is a column and not a history table because the undo has to be
-- one action, and an operator reaching for it at a bad moment is not in a
-- position to reconstruct one from a log. The history this column does not keep
-- is the audit trail, which records every change with both values.
--
-- The table ships empty. Each key's default lives in code beside the key's own
-- declaration, so a database with no rows here produces a working application
-- rather than a missing one, and a row appears only when somebody changes
-- something.
CREATE TABLE config (
  key            text PRIMARY KEY,
  value          text NOT NULL,
  previous_value text,
  changed_by     uuid REFERENCES accounts(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

-- The recipient is an account id and never an address: the address lives on the
-- account and is deleted with it, and a log holding a copy would keep a
-- person's contact details for two years after they asked to be forgotten. The
-- row cascades with the account for the same reason (DATA-R03).
--
-- state has no 'delivered' value, and its absence is the point. SMTP answers
-- once, at hand-off; whatever happens after that arrives as a message in a
-- mailbox this system does not read. 'accepted' is the strongest true statement
-- available, and a column that could say 'delivered' would be a column that
-- lies. 'queued' exists because the row is written before the attempt is made,
-- so a crash between the write and the hand-off leaves a record of an attempt
-- rather than no record at all.
CREATE TABLE mail_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject    text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('transactional', 'bulk')),
  state      text NOT NULL CHECK (state IN ('queued', 'accepted', 'failed')),
  queue_id   text,
  error      text
);

-- The log is read one recipient at a time, and the cascade that runs when an
-- account is erased reaches these rows the same way -- by account_id, which the
-- referencing side of the foreign key does not index on its own.
CREATE INDEX mail_log_account_id_idx ON mail_log (account_id);

-- The preference is the row's existence: one row per account that has opted
-- out, none for an account that has not. There is no 'subscribed' state to
-- forget to write and none to get wrong. This is the only suppression list --
-- the carrier keeps none -- so the disagreement between two lists that lets an
-- unsubscribed person hear from us again cannot occur.
--
-- Two things write a row, so source names which. A one-click link carries a
-- token that identifies the account without authenticating it and does nothing
-- else; an admin who finds a bounce notice sets a manual stop-sending and gives
-- the reason (MAIL-002). The two checks bind each source to the column it owns:
-- a link has its token, an admin its reason, and neither carries the other's.
CREATE TABLE unsubscribes (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL DEFAULT now(),
  source     text NOT NULL CHECK (source IN ('link', 'admin')),
  token      text,
  reason     text,
  CONSTRAINT unsubscribes_link_has_token CHECK (source <> 'link' OR token IS NOT NULL),
  CONSTRAINT unsubscribes_admin_has_reason CHECK (source <> 'admin' OR reason IS NOT NULL)
);

-- Bytes in the database, deliberately: at this volume one backup covers
-- everything, one access rule covers everything, and there is no second
-- credential and no second failure mode. It becomes the wrong answer somewhere
-- around a few hundred megabytes or the first video.
--
-- sha256 is unique, so the same file uploaded twice is one row rather than two
-- copies of the same bytes. byte_size is stored rather than measured from the
-- column beside it, because reading the length of a bytea reads the bytes, and
-- a listing should not have to.
--
-- uploaded_by is set null on erasure rather than cascading: the file belongs to
-- the documents that reference it, and erasing a staff account must not pull an
-- image out of a report an investor has already read.
CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256      text UNIQUE NOT NULL,
  mime        text NOT NULL,
  byte_size   bigint NOT NULL,
  bytes       bytea NOT NULL,
  uploaded_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- What ties a file to the item that uses it, and the only thing an access check
-- reads: a file is served to a reader who may read some item that references
-- it (CMS-R06). That is a join, and it is why this table exists rather than an
-- audience column on media that would have to be kept in step by hand.
--
-- The composite key is also the index that check probes, by media_id first.
-- Both sides cascade, because a reference to a file that is gone, or to an item
-- that is gone, is not a fact about anything.
CREATE TABLE media_refs (
  media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  item_id  uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, item_id)
);

-- Which files an item uses, and the cascade that runs when an item is deleted,
-- both reach rows by item_id -- the trailing column of the key, which the key
-- does not serve.
CREATE INDEX media_refs_item_id_idx ON media_refs (item_id);

-- Six rows, forever: where each product stands right now. A state and not a
-- history -- the history is the update stream, and an investor asked to
-- reconstruct the first from the second is being asked to do the company's
-- work.
--
-- product is constrained rather than free text, so a seventh product is a
-- migration and a conversation rather than an admin typing a name. stage is
-- four words, and 'paused' is the one nobody wants to write, which is exactly
-- why it has to exist: a board that cannot say a product is paused says nothing
-- when one is.
--
-- The 140-character cap lives in the database because the limit is the point of
-- the field. It forces the sentence to be the point, and the nuance it
-- displaces belongs in a report, where a reader with time already is.
CREATE TABLE portfolio (
  product    text PRIMARY KEY CHECK (product IN ('valo-ads', 'valo-pocket', 'shimmra', 'amavo', 'farola', 'verdiq')),
  stage      text NOT NULL CHECK (stage IN ('building', 'in private use', 'in market', 'paused')),
  headline   text CHECK (headline IS NULL OR length(headline) <= 140),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL
);

-- updated_at is the board's credibility (INV-003): a stage or headline change
-- restamps it, but an erasure nulling updated_by must not, or erasing one staff
-- account silently re-dates every product they last touched. The WHEN keeps the
-- restamp to a real content change, so the SET NULL cascade passes it by.
CREATE TRIGGER portfolio_set_updated_at
  BEFORE UPDATE ON portfolio
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.headline IS DISTINCT FROM NEW.headline)
  EXECUTE FUNCTION set_updated_at();

-- Down Migration

-- set_updated_at() stays: it is the accounts migration's, and is shared by
-- every table carrying an updated_at, so dropping it here would reach tables
-- this migration does not own. raise_append_only() and audit_force_now() are
-- this migration's own and go with it, each after the triggers that depend on
-- it. The indexes need no line of their own -- dropping a table drops them.
DROP TRIGGER portfolio_set_updated_at ON portfolio;
DROP TABLE portfolio;
DROP TABLE media_refs;
DROP TABLE media;
DROP TABLE unsubscribes;
DROP TABLE mail_log;
DROP TABLE config;
DROP TRIGGER audit_at_is_db_time ON audit;
DROP FUNCTION audit_force_now();
DROP TRIGGER audit_no_truncate ON audit;
DROP TRIGGER audit_is_append_only ON audit;
DROP FUNCTION raise_append_only();
DROP TABLE audit;
