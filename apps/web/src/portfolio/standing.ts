/**
 * What one product's standing is, and how to pick it out of a board already
 * read (`INV-003`, `POST-001/T6`).
 *
 * Apart from the read in `board.ts` because the surfaces that render a standing
 * are client components, and a client component that imports the read imports
 * the database driver with it — the module graph does not stop at the function
 * a file actually uses. The type and the lookup are pure, so they live where
 * both sides can reach them; the query stays on the server side of that line.
 *
 * **There is no percentage and no traffic light.** `INV-003` §3 is explicit that
 * a number invented to look like measurement is worse than a word that is true,
 * so a product's standing is a stage and a sentence.
 */

import type { PortfolioProduct, PortfolioStage } from '../db/types';

/**
 * The stage a product is assumed to be at before anybody has said otherwise.
 *
 * `building` rather than a fifth "unknown" word: the vocabulary is closed at four
 * and adding a fifth to mean "no row" would put a state on the board that is
 * about this system rather than about the product. `set` is what carries the
 * difference instead, so a reader can tell an assumption from a statement.
 */
export const UNSET_STAGE: PortfolioStage = 'building';

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
 * One product's standing out of a board already read.
 *
 * Takes the board rather than querying, because the surface that wants one
 * product has already read all six: the composer showing the tagged product's
 * standing (`POST-001/T6`) renders from one read, and a second query per
 * product would be six round trips to answer a question one already answered.
 *
 * Null for anything that is not one of the six: `company` is a tag an update may
 * carry (`POST-001/T3`) and is deliberately not a board row, because the board is
 * where products stand and the company is not a product.
 */
export function standingOf(board: readonly Standing[], product: string): Standing | null {
  return board.find((entry) => entry.product === product) ?? null;
}
