/**
 * What an item's title and its address are derived from, when nobody is asked
 * (`CMS-006` §6, `POST-001/T1`, `POST-001/T4`).
 *
 * One module because two surfaces derive one now: the new-item form offers a
 * slug filled in from the title and lets the author edit it, and the update
 * composer derives one silently and never asks — a required address field before
 * any writing is the same thing a required title field is, which is where a short
 * update goes to die. Two spellings of "a title, lower-cased and hyphenated"
 * would drift, and the value is what a reader sees in a URL for ever.
 *
 * **Nothing here touches the database, and that is load-bearing rather than
 * incidental.** Both rules run in a browser — the address forming under the
 * title as it is typed, the title forming from the first line as it is written —
 * so a client component imports this, and a server import here would pull the
 * database driver into that bundle. Which slugs are taken is the one question
 * only a query can answer, so the caller asks it and hands the answer in, which
 * is also what makes the choice testable without one.
 */

/**
 * The longest an address may be. Not a database limit — the column is `text` —
 * but a bound on what a person is asked to read, copy or type. A title longer
 * than this is cut at a word boundary rather than mid-word, because a URL ending
 * in half a word reads as a mistake.
 */
const MAX_SLUG_LENGTH = 60;

/**
 * A title, as an address: lower-case, hyphenated, nothing a URL would escape.
 *
 * Two steps carry a non-ASCII letter through, and they answer different halves
 * of the problem. `NFKD` splits a **precomposed** letter into a base and a
 * combining mark, and the mark is then removed — `résumé` becomes `resume`,
 * where the decomposition alone would give `re-sume` and neither step would give
 * `r-sum`. But a letter that is not precomposed does not decompose at all:
 * `ß ø ł đ æ œ þ` each have a single code point under `NFKD`, so the strip below
 * would turn them into separators and break `Straße` into `stra-e` and `Đà Nẵng`
 * into `a-nang`. `TRANSLITERATED` carries exactly those, before the
 * normalisation, so both classes come through as words.
 *
 * What is left over is honest rather than hidden: a script this rule has no
 * transliteration for answers with the empty string, and the caller decides what
 * an item with no address in its title is called.
 * Anything else that is not a letter or a digit becomes a separator, so a title
 * written in a script this rule cannot transliterate answers with the empty
 * string. That is not a failure and is why the answer is allowed to be empty:
 * the caller decides what to do with a title that has no address in it, and
 * silently inventing one here would hide the case from the only code that can
 * judge it.
 */
/**
 * The Latin letters `NFKD` leaves whole, with what they are written as instead.
 *
 * Every one of these is a single code point before and after normalisation — it
 * is a letter in its own right rather than a base with an accent on it — so the
 * decomposition below cannot help and the strip would delete it. `đ` earns its
 * place twice over: it is the one of these that this company's own market writes
 * daily, and `Đà Nẵng` becoming `a-nang` is an address a reader keeps for ever.
 */
const TRANSLITERATED: ReadonlyArray<readonly [RegExp, string]> = [
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'o'],
  [/ł/g, 'l'],
  [/đ/g, 'd'],
  [/þ/g, 'th'],
  [/ð/g, 'd'],
];

export function slugFrom(title: string): string {
  const carried = TRANSLITERATED.reduce(
    (text, [letter, as]) => text.replace(letter, as),
    title.toLowerCase(),
  );

  const stripped = carried
    .normalize('NFKD')
    // The decomposition leaves the base letter followed by its combining
    // mark, and the mark is not in [a-z0-9] -- so without this line the strip
    // below turns it into a separator and `resume` comes out `re-sume`, a
    // word broken in half by the very rule meant to carry it through.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (stripped.length <= MAX_SLUG_LENGTH) {
    return stripped;
  }

  const cut = stripped.slice(0, MAX_SLUG_LENGTH + 1);
  const lastBreak = cut.lastIndexOf('-');

  // A single word longer than the bound has no break to cut at, so it is cut
  // where the bound falls -- a long address is better than no address.
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : stripped.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/, '');
}

/**
 * The first address in the `base`, `base-2`, `base-3` … sequence that nothing in
 * `taken` holds.
 *
 * Suffixed rather than refused, because the composer derives the address from
 * what was written and two updates can honestly share a first line — "We shipped
 * it" twice in a quarter is not an error to put in front of an author who is
 * trying to write two sentences.
 *
 * `-2` rather than `-1` for the second: the first one carries no suffix, so
 * `-1` would name a thing that does not exist and make the second look like the
 * first of a series.
 *
 * Pure: the caller supplies what is taken. The set it hands in is a snapshot, so
 * the answer is a proposal and the unique index is what settles it — see
 * `composeUpdate`, which retries when a concurrent compose takes the same one.
 */
export function nextSlug(base: string, taken: readonly string[]): string {
  const held = new Set(taken);

  if (!held.has(base)) {
    return base;
  }

  let suffix = 2;
  while (held.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

/**
 * The longest a derived title may be.
 *
 * A title is read in a list beside others, so it is bounded even though the
 * column is not. The bound is generous — an update's first line is usually a
 * sentence — and the cut falls at a word boundary, because a list entry ending
 * mid-word reads as a bug rather than as an abbreviation.
 */
export const MAX_TITLE_LENGTH = 120;

/**
 * The title an update carries until its author edits it separately
 * (`POST-001/T4`).
 *
 * The first line of the body, because that is what the author already wrote and
 * asking them to write it twice is the field this avoids. Derived rather than
 * copied: internal runs of whitespace collapse, so a line broken by a soft wrap
 * does not arrive with two spaces in the middle of the list entry.
 *
 * Empty body, empty title — and the caller refuses it. A titleless update is not
 * a shorter update, it is nothing, and `content_items.title` is `NOT NULL`
 * precisely so that nothing cannot be stored.
 */
export function titleFromBody(body: string): string {
  const first = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');

  if (first === undefined) {
    return '';
  }

  const collapsed = first.replace(/\s+/g, ' ');

  if (collapsed.length <= MAX_TITLE_LENGTH) {
    return collapsed;
  }

  const cut = collapsed.slice(0, MAX_TITLE_LENGTH + 1);
  const lastSpace = cut.lastIndexOf(' ');

  return (lastSpace > 0 ? cut.slice(0, lastSpace) : collapsed.slice(0, MAX_TITLE_LENGTH)).trimEnd();
}
