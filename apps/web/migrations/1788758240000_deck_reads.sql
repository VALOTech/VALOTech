-- Up Migration

-- One row per account per version of a deck: which version an investor was
-- shown, and when they first and last opened it (DECK-002/T4). It is what makes
-- "which version was this investor shown, and when" answerable directly rather
-- than inferred from the audit trail plus the publication history, and it is the
-- second and last piece of behavioural data the product keeps (RPT-002's read
-- state is the first). It holds the minimum that answers the question -- which
-- version, first and last opened -- and not how long, how far they scrolled, or
-- which sections. It is deleted with the account (DATA-002): account_id cascades,
-- so an erasure takes a person's reading record out with the person; deck_id
-- cascades too, matching content_grants, though a content item is never deleted.
CREATE TABLE deck_reads (
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deck_id         uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, deck_id, version)
);

-- Down Migration

DROP TABLE deck_reads;
