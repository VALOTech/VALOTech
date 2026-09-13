/**
 * How the portfolio's two closed vocabularies read to a person.
 *
 * Both are stored as database enums, and both reach a screen in more than one
 * place — the new-item form, the update composer, and the report editor's
 * standing panel all name the same six products, and the last two name the same
 * four stages. Kept in one module because a label is a decision about what the
 * company calls its own products, and two copies of that decision drift the day
 * one of them is corrected: a product renamed in the composer and not in the
 * form is one product wearing two names on two screens of one console.
 *
 * Both maps are keyed by their union rather than by `string`, so a seventh
 * product or a fifth stage stops the build here rather than reaching a screen as
 * a raw token like `valo-ads`.
 *
 * These are the admin console's words and not a reader's: the console is
 * authored in English (`I18N-R01` governs what an investor is shown, and no
 * investor is shown this). A product's name is a proper noun and is the same in
 * every locale regardless.
 */

import type { ContentProductTag, PortfolioStage } from '../db/types';

/**
 * The six products and the company, as they are written.
 *
 * Keyed by `ContentProductTag` rather than `PortfolioProduct` because the wider
 * set is the one a surface asks for: an update may be tagged `company`, which is
 * not a board row (`POST-001/T3`). A caller holding only the six indexes this
 * with them and is right by construction, the other way round would not be.
 */
export const PRODUCT_LABEL: Readonly<Record<ContentProductTag, string>> = {
  'valo-ads': 'VALO Ads',
  'valo-pocket': 'VALO Pocket',
  shimmra: 'Shimmra',
  amavo: 'Amavo',
  farola: 'Farola',
  verdiq: 'Verdiq',
  company: 'The company',
};

/**
 * The four stage words (`INV-003` §3).
 *
 * Capitalisation is the only difference from the stored value, and that is the
 * point of having the map at all: the stored words are already the vocabulary a
 * reader sees, so there is no translation happening here and none should start.
 * A stage whose label said something the database does not hold would be a
 * second vocabulary nobody agreed to.
 */
export const STAGE_LABEL: Readonly<Record<PortfolioStage, string>> = {
  building: 'Building',
  'in private use': 'In private use',
  'in market': 'In market',
  paused: 'Paused',
};
