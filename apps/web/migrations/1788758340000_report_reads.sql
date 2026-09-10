-- Up Migration

-- One row per account per report: whether an investor has opened a report, and
-- when they first did (RPT-002/T6). It exists for one question an investor has in
-- front of a list of twelve documents -- "have I read this" -- and for no other:
-- it is not reported to an admin and not aggregated. Deleted with the account
-- (DATA-002): account_id cascades, so an erasure takes it out with the person;
-- item_id cascades too, matching content_grants and deck_reads, though a content
-- item is never deleted.
CREATE TABLE report_reads (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_id)
);

-- Down Migration

DROP TABLE report_reads;
