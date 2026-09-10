-- Up Migration

-- One table for reports, updates and decks: they differ in how a reader
-- reaches them and not at all in how they are stored, so three tables would be
-- three revision histories, three locale states and three implementations of
-- the audience rule, which is the one thing in this schema that must never be
-- written twice.
--
-- kind and period are nullable columns because each belongs to one type: kind
-- to an update, period to a report. Two table-level checks bind them to that
-- type -- kind is null unless the item is an update, and a report always has a
-- period -- so the vocabulary is not the only thing the database enforces. The
-- period check is what lets RPT-002's "one published report per period" hold in
-- the database rather than in a convention: a null period is not distinct from
-- another null in a unique index, so a report without one would defeat it.
CREATE TABLE content_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('report', 'update', 'deck')),
  slug                text UNIQUE NOT NULL,
  title               text NOT NULL,
  kind                text CHECK (kind IS NULL OR kind IN ('announcement', 'achievement', 'progress')),
  period              text,
  audience            text NOT NULL DEFAULT 'investor' CHECK (audience IN ('public', 'investor', 'granted')),
  current_revision_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_items_kind_for_update CHECK (type = 'update' OR kind IS NULL),
  CONSTRAINT content_items_period_for_report CHECK (type <> 'report' OR period IS NOT NULL)
);

CREATE TRIGGER content_items_set_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every reader's query narrows content_items by audience among published
-- items, so the published check is the index's own condition rather than a
-- column inside it: a draft is not a low-audience row, it is a row no reader
-- query ever selects.
CREATE INDEX content_items_audience_published_idx
  ON content_items (audience)
  WHERE current_revision_id IS NOT NULL;

-- The searchable text of a block array, flattened to one string: headings,
-- paragraph and quote text, list items, captions and alternative text. It names
-- the text-bearing fields rather than every string, so a media id or a mark
-- type never enters the index (CMS-007). It is IMMUTABLE because the generated
-- column below calls it, and returns text rather than a tsvector because the
-- configuration that tokenises it -- 'simple', not a per-language stemmer for a
-- corpus in twenty languages -- is the index's choice, made at the call site.
CREATE FUNCTION blocks_text(blocks jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT string_agg(piece, ' ')
  FROM jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) AS block
  CROSS JOIN LATERAL (
    SELECT block->>'text'
    UNION ALL SELECT block->>'caption'
    UNION ALL SELECT block->>'alt'
    UNION ALL SELECT string_agg(item, ' ')
              FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(block->'items') = 'array' THEN block->'items' ELSE '[]'::jsonb END
              ) AS item
  ) AS pieces(piece)
  WHERE piece IS NOT NULL AND piece <> '';
$$;

-- A revision is never updated once it has been published: an edit writes a new
-- row and publishing moves content_items.current_revision_id, so withdrawing is
-- moving the pointer back and what an investor read last month is still here to
-- be read again. That is CMS-R01, and the trigger below makes it the database's
-- rule rather than the next repository function's discipline.
--
-- author_id survives the author. Erasing an account nulls it rather than
-- cascading, because a published report is the company's document and
-- cascading it would delete an investor's archive to satisfy a staff member's
-- erasure request.
CREATE TABLE content_revisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  blocks       jsonb NOT NULL,
  author_id    uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  search       tsvector GENERATED ALWAYS AS (to_tsvector('simple', blocks_text(blocks))) STORED
);

-- Once published_at is set, the content is frozen: an edit to a published
-- revision must create a new revision, not rewrite the one an investor already
-- read. The guard raises only when the body or the item changes on an
-- already-published row, so publishing (which sets published_at on a draft) and
-- re-publishing after a withdraw (which touches only published_at) both pass.
CREATE FUNCTION refuse_published_revision_edit() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL
     AND (NEW.blocks IS DISTINCT FROM OLD.blocks
          OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    RAISE EXCEPTION
      'content_revisions % is published; its content is immutable (CMS-R01)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_revisions_immutable_once_published
  BEFORE UPDATE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION refuse_published_revision_edit();

-- The revision history of one item, and the cascade that runs when an item is
-- deleted, both reach rows by item_id, which the referencing side of the
-- foreign key does not index on its own.
CREATE INDEX content_revisions_item_id_idx ON content_revisions (item_id);

-- The full-text index CMS-007's search probes: GIN over the generated tsvector,
-- so it is maintained by the database from the column it cannot drift from.
CREATE INDEX content_revisions_search_idx ON content_revisions USING gin (search);

-- The other half of the circular reference, with no ON DELETE: a published
-- revision cannot be deleted out from under the item that points at it. The
-- only way to stop showing a revision is to withdraw (move the pointer, a
-- CMS-004 UPDATE) and then, if it must go, delete it -- which is the correct
-- order. Deleting the item itself still cascades cleanly, because its own row,
-- pointer and all, goes with it.
ALTER TABLE content_items
  ADD CONSTRAINT content_items_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES content_revisions(id);

-- The review state is a column rather than an inference from reviewed_at being
-- null, because the query that serves a reader must filter on one column and
-- must not be able to express "probably reviewed". A machine row is never
-- served, and a reviewed row must carry the time it was reviewed -- the check
-- keys on reviewed_at, not reviewed_by, because reviewed_by is nulled when the
-- reviewer is erased and a check on it would then refuse the erasure.
--
-- The primary key on (revision_id, locale) is also the index the serving query
-- uses to reach a revision's locales, which is why there is no second index on
-- revision_id alone.
CREATE TABLE content_locales (
  revision_id uuid NOT NULL REFERENCES content_revisions(id) ON DELETE CASCADE,
  locale      text NOT NULL,
  blocks      jsonb NOT NULL,
  state       text NOT NULL CHECK (state IN ('machine', 'reviewed')),
  reviewed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  PRIMARY KEY (revision_id, locale),
  CONSTRAINT content_locales_reviewed_has_time CHECK (state = 'machine' OR reviewed_at IS NOT NULL)
);

-- Which account may read an item whose audience is 'granted'. The primary key
-- makes a grant idempotent and is the index the access predicate's subquery
-- probes, by (item_id, account_id), in that order.
--
-- granted_by is set null on erasure and account_id cascades: the first records
-- an act an admin performed on the company's behalf, the second is a fact about
-- the person being erased.
CREATE TABLE content_grants (
  item_id    uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  PRIMARY KEY (item_id, account_id)
);

-- Down Migration

-- set_updated_at() stays: it is created by the accounts migration and shared
-- with every table that carries an updated_at, so dropping it here would break
-- a table this migration does not own. refuse_published_revision_edit() and
-- blocks_text() are this migration's own and go with it -- blocks_text after
-- content_revisions, whose generated column holds a dependency the drop would
-- otherwise refuse.
--
-- The circular constraint has to go before content_revisions does. It is
-- content_items that holds it, so PostgreSQL refuses to drop the table it
-- points at while it stands, and the refusal reads as an unrelated dependency
-- error.
DROP TABLE content_grants;
DROP TABLE content_locales;
ALTER TABLE content_items DROP CONSTRAINT content_items_current_revision_fk;
DROP TRIGGER content_revisions_immutable_once_published ON content_revisions;
DROP FUNCTION refuse_published_revision_edit();
DROP TABLE content_revisions;
DROP FUNCTION blocks_text(jsonb);
DROP TRIGGER content_items_set_updated_at ON content_items;
DROP TABLE content_items;
