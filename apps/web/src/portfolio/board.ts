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
 */

import { getDb } from '../db/index';
import { PORTFOLIO_PRODUCTS, type PortfolioProduct, type PortfolioStage } from '../db/types';

/**
 * The stage a product is assumed to be at before anybody has said otherwise.
 *
 * `building` rather than a fifth "unknown" word: the vocabulary is closed at four
 * and adding a fifth to mean "no row" would put a state on the board that is
 * about this system rather than about the product. `set` is what carries the
 * difference instead, so a reader can tell an assumption from a statement.
 */
const UNSET_STAGE: PortfolioStage = 'building';

/** One product's standing, as the board presents it. */
export interface Standing {
  readonly product: PortfolioProduct;
  readonly stage: PortfolioStage;
  /** One line in the authored language, or null when nobody has written one. */
  readonly headline: string | null;
  /** When it last moved, or null when it has never been set. */
  readonly changedAt: Date | null;
  /**
   * Whether anybody has actually said this. False means the row is absent and
   * the stage above is this module's assumption — the distinction a surface needs
   * in order to show a gap as a gap.
   */
  readonly set: boolean;
}

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

/**
 * One product's standing out of a board already read.
 *
 * Takes the board rather than querying, because the surface that wants one
 * product has already read all six: the composer showing the tagged product's
 * standing (`POST-001/T6`) renders from one read, and a second query per
 * product would be six round trips to answer a question one already answered.
 * `RPT-001/T4` will be the second caller and is not built yet, which is why
 * this is written as one caller's helper rather than as a shared one.
 *
 * Null for anything that is not one of the six: `company` is a tag an update may
 * carry (`POST-001/T3`) and is deliberately not a board row, because the board is
 * where products stand and the company is not a product.
 */
export function standingOf(board: readonly Standing[], product: string): Standing | null {
  return board.find((entry) => entry.product === product) ?? null;
}
