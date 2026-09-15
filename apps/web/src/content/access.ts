/**
 * Who may read which content item, as the one SQL predicate every content query
 * composes (`CMS-006`, `CMS-R03`, `CMS-R02`, `SEC-R01`, `DATA-R05`).
 *
 * The reason this is one function rather than a rule everybody follows is the
 * shape of its failure. Everything else in the content system fails visibly: an
 * editor that cannot save, a preview that shows an author the wrong draft, a
 * search that returns nothing. This one fails by rendering a page to somebody
 * who should not have seen it, and nobody learns that it did. So there is one
 * predicate, every read composes it, and `check-content-access.py` refuses SQL
 * naming `content_items` anywhere outside this module.
 *
 * Three properties carry the weight, and each is a defect this shape prevents:
 *
 * **The published check is inside the predicate**, not beside it. A draft is
 * not a low-audience item; it is an item with no audience at all (`CMS-R02`),
 * and a `current_revision_id IS NOT NULL` a caller adds separately is one a
 * caller can forget. It is also the condition on the index the reader's query
 * uses, so the predicate and the index describe the same set.
 *
 * **The grant check is a correlated `EXISTS`, never a join.** A join multiplies
 * the row when an item carries several grants; the duplicate is noticed as a
 * rendering bug and fixed with a `DISTINCT` — which is how filtering comes to
 * happen after the predicate instead of inside it.
 *
 * **The admin branch is `TRUE`**, and it admits unpublished items, which is why
 * the author surfaces are a separate function. `forAuthor` is where an
 * unpublished revision is reachable; `forReader` returns an item joined to its
 * published revision, so a draft has nothing for it to return whichever branch
 * the predicate took.
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';

import type { Actor } from '../auth/gate';
import type { Database } from '../db/types';

/**
 * A `WHERE` fragment over `content_items`, as the callback Kysely composes:
 * `query.where(visibleTo(reader))`.
 *
 * A callback rather than a built expression because the leaves are column
 * references, and a reference is only meaningful against the query that holds
 * the table. The callback form is what lets one predicate be composed into a
 * single-item read, a list, and `CMS-007`'s search without any of them
 * restating a clause.
 */
export type ContentVisibility = (
  eb: ExpressionBuilder<Database, 'content_items'>,
) => Expression<SqlBool>;

/**
 * The predicate that admits exactly the items this reader may see, where
 * `null` is a reader with no session at all.
 *
 * An admin is answered `TRUE`: they may read every audience, and — through
 * `forAuthor` alone — items with no published revision.
 */
/**
 * The role a surface is being read as. `investor` and `public` are the roles a
 * preview offers (`CMS-004/T1`); `admin` is the person doing the previewing.
 */
export type ReadingRole = 'admin' | 'investor' | 'public';

/**
 * The audiences a role is admitted to **before any grant of its own**
 * (`CMS-006`).
 *
 * This is the audience half of `visibleTo` with the published check and the
 * grant left out, and it exists because a preview needs exactly that: it reads a
 * revision nobody has published, for a role that is nobody in particular
 * (`CMS-004/T1`). Naming it here rather than in the preview is the whole point
 * — the audience rule is the one whose failure is invisible (see the note at the
 * top of this file), so there is one of it and `visibleTo` is built from it
 * rather than beside it.
 *
 * An `investor` here is a **generic** investor with no grants, so a `granted`
 * item admits none. That is the honest answer for a preview: a reader who is not
 * named on the grant sees nothing, and an admin previewing as an investor should
 * be told so rather than shown the document.
 */
export function audienceAdmits(role: ReadingRole): ContentVisibility {
  if (role === 'admin') {
    return (eb) => eb.lit(true);
  }

  if (role === 'investor') {
    return (eb) => eb('content_items.audience', 'in', ['public', 'investor']);
  }

  return (eb) => eb('content_items.audience', '=', 'public');
}

export function visibleTo(reader: Actor | null): ContentVisibility {
  if (reader === null) {
    return (eb) =>
      eb.and([audienceAdmits('public')(eb), eb('content_items.current_revision_id', 'is not', null)]);
  }

  if (reader.role === 'admin') {
    return (eb) => eb.lit(true);
  }

  // A prospect (`AUTH-DEC-06`) reads what the company publishes openly, plus
  // anything an admin has named them on. The `investor` audience is the one they
  // do not reach, which is the whole of what the role buys: `audience` defaults
  // to `investor`, so an item nobody thought about is one a prospect cannot see
  // -- the fail-closed direction, and the reason this is a role rather than a
  // habit of choosing the right audience in a form.
  //
  // The grant clause is theirs too, and deliberately: an admin who wants one
  // named person to read one document should not have to promote them to do it.
  if (reader.role === 'prospect') {
    const prospectId = reader.id;

    return (eb) =>
      eb.and([
        eb('content_items.current_revision_id', 'is not', null),
        eb.or([
          audienceAdmits('public')(eb),
          eb.and([
            eb('content_items.audience', '=', 'granted'),
            eb.exists(
              eb
                .selectFrom('content_grants')
                .select((grant) => grant.lit(1).as('one'))
                .whereRef('content_grants.item_id', '=', 'content_items.id')
                .where('content_grants.account_id', '=', prospectId),
            ),
          ]),
        ]),
      ]);
  }

  if (reader.role === 'investor') {
    const accountId = reader.id;

    return (eb) =>
      eb.and([
        eb('content_items.current_revision_id', 'is not', null),
        eb.or([
          audienceAdmits('investor')(eb),
          eb.and([
            eb('content_items.audience', '=', 'granted'),
            eb.exists(
              eb
                .selectFrom('content_grants')
                .select((grant) => grant.lit(1).as('one'))
                .whereRef('content_grants.item_id', '=', 'content_items.id')
                .where('content_grants.account_id', '=', accountId),
            ),
          ]),
        ]),
      ]);
  }

  // A role the vocabulary does not yet name reads nothing, and is refused here
  // rather than inheriting the investor's audience by falling through. Every
  // other role check in the tree is a positive allow-list (`gate.ts`), and this
  // is the one predicate the design calls the most dangerous; the failure it
  // guards against is a board observer or a support agent, added as a third
  // role, silently reading every investor report. When such a role is added
  // `AccountRole` grows and the line below stops type-checking, so the decision
  // of what it may see is forced rather than defaulted.
  reader.role satisfies never;
  return (eb) => eb.lit(false);
}
