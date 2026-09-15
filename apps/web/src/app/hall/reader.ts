/**
 * Which blocks the hall's landing is composed from, where that turns on whether
 * the reader has invested or is still deciding (`INV-DEC-02`, `AUTH-005/T4`).
 *
 * **The type is read here and never through the gate, on purpose.** `Actor` is an
 * id and a role and nothing else, which is what makes it impossible for a content
 * read to compose a predicate over this column: `visibleTo` is handed an `Actor`,
 * so a clause reading the type would first have to widen the auth boundary, which
 * is a deliberate act rather than a line in a query. Putting the type on the
 * `Actor` would trade that guarantee, for every read in the tree, for one saved
 * round trip on one page.
 *
 * `INV-DEC-02` is both the rule this serves and the rule it must not break: the
 * type never gates access, which stays entirely with the grant and the audience
 * through `CMS-006`, and the type decides only the order and weight of the blocks
 * on the landing. So what is decided here is which blocks are built, never which
 * documents any of them may contain — and the board is the one surface `CMS-006`
 * does not already answer for, because `portfolio` carries no audience and
 * `standing()` takes no reader.
 */

import { getDb } from '../../db/index';
import { standing } from '../../portfolio/board';
import type { Standing } from '../../portfolio/standing';

/**
 * The board for this reader, or `null` for a reader who is not shown one.
 *
 * `null` rather than an empty array, because an empty board is a real state the
 * landing has words for — six products nobody has written a row for — and a
 * reader who is not shown the block at all must not be told that. The two are
 * different facts and the page renders them differently.
 *
 * Only `prospect` is withheld from. A reader nobody has classified is not one:
 * the column is nullable and null means nobody has said, so an account created
 * before the column existed, or invited by an admin who did not classify them,
 * keeps the board the hall has always shown them.
 */
export async function progressBoardFor(accountId: string): Promise<Standing[] | null> {
  const row = await getDb()
    .selectFrom('accounts')
    .select('investor_type')
    .where('id', '=', accountId)
    .executeTakeFirst();

  if (row?.investor_type === 'prospect') {
    return null;
  }

  return standing();
}
