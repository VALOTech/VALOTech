-- Up Migration

-- At most one outstanding invitation per account, as a schema property rather
-- than as a rule the application is trusted to keep. `issueToken` deletes the
-- outstanding row and inserts a new one under a row lock, so in the application
-- this index is never the thing that refuses a write. It exists for the write
-- that reaches the insert without that lock -- a second issue path added later,
-- a direct write -- which the design's "an account never holds two live tokens"
-- forbids: such a write is refused by the database here instead of quietly
-- leaving two links that each set a password for one account.
--
-- Partial on `consumed_at IS NULL`, because the invariant is about *outstanding*
-- tokens. A consumed row records that a token was used and is kept; any number
-- of those may coexist with the one live token and with each other.
CREATE UNIQUE INDEX invitations_one_outstanding_per_account
  ON invitations (account_id)
  WHERE consumed_at IS NULL;

-- Down Migration

DROP INDEX invitations_one_outstanding_per_account;
