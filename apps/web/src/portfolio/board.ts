/**
 * Where each of the six products stands (`INV-003`).
 *
 * The board is six rows and nothing else: a product, one of four stage words, a
 * one-line headline, and when it last moved. **There is no percentage and no
 * traffic light** — `INV-003` §3 is explicit that a number invented to look like
 * measurement is worse than a word that is true, so "the current progress value"
 * a caller asks for here is a stage and a sentence, not a figure.
 *
 * **Always all six, including the ones nobody has written yet.** A product
 * omitted because its row is missing reads as a product that no longer exists,
 * which is a worse answer than an honest default — so an absent row is filled
 * with `building` and a null headline and marked as never having been set. The
 * caller can then show the gap rather than hide it.
 *
 * Read-only. The board is edited at `PUT /admin/portfolio/<product>`
 * (`INV-003/T2`), which audits the previous stage and headline; nothing here
 * writes, so nothing here audits.
 *
 * The shape a standing takes, and the lookup that picks one out of a board, are
 * `standing.ts`: they are pure, and the surfaces that render them are client
 * components that must not reach a module importing the database driver.
 */

import { getDb } from '../db/index';
import { PORTFOLIO_PRODUCTS } from '../db/types';

import { type Standing, UNSET_STAGE } from './standing';

/**
 * The whole board, in `PORTFOLIO_PRODUCTS` order.
 *
 * The order is the constant's rather than the database's, so the six always
 * appear in one sequence whatever order rows were written in — a board whose rows
 * move between readings is a board somebody has to re-scan every time.
 */
export async function standing(): Promise<Standing[]> {
  const rows = await getDb()
    .selectFrom('portfolio')
    .select(['product', 'stage', 'headline', 'updated_at'])
    .execute();

  const byProduct = new Map(rows.map((row) => [row.product, row]));

  return PORTFOLIO_PRODUCTS.map((product) => {
    const row = byProduct.get(product);

    return row === undefined
      ? { product, stage: UNSET_STAGE, headline: null, changedAt: null, set: false }
      : { product, stage: row.stage, headline: row.headline, changedAt: row.updated_at, set: true };
  });
}

