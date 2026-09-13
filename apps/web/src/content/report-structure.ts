/**
 * What a report is shaped like, with no database in it.
 *
 * This is separate from `reports.ts` for one reason and it is not tidiness: the
 * editor is a client component and needs `standsSectionAt` on every keystroke to
 * know where the progress board goes (`RPT-001/T4`). Importing that from a module
 * that also opens a database connection would pull the connection into the
 * browser bundle, so the pure half lives here and the reads stay there. Nothing
 * in this file may import `db/index` for the same reason.
 */

import { type Block } from './blocks';
import { deriveSections } from './sections';

/**
 * The section `INV-003`’s board narrates, by the words that open it.
 *
 * Named rather than spelled twice because two places need it and they must
 * agree: the structure a report opens with puts this heading in, and the
 * editor finds the heading again to put the board beside it (`RPT-001/T4`).
 * Written in one place, a rewording moves both; written in two, a rewording
 * seeds every new report with a heading the panel can no longer find.
 */
export const STANDS_HEADING = 'Where each product stands';

/**
 * The headings a first report opens with (`RPT-001` §3): a starting point, not a
 * schema. Each is an ordinary level-2 heading, and an author may delete or
 * reorder any of them.
 */
export const DEFAULT_REPORT_STRUCTURE: readonly Block[] = [
  { type: 'heading', level: 2, text: 'The period in one paragraph' },
  { type: 'heading', level: 2, text: STANDS_HEADING },
  { type: 'heading', level: 2, text: 'What shipped' },
  { type: 'heading', level: 2, text: 'Numbers' },
  { type: 'heading', level: 2, text: 'What we are working on next' },
  { type: 'heading', level: 2, text: 'Asks' },
];

/**
 * Where `STANDS_HEADING` opens its section, as an index into `blocks`, or `null`
 * when this report has no such section (`RPT-001/T4`).
 *
 * **The index is computed from `deriveSections` rather than by scanning for a
 * heading directly**, because "beside that section" is a claim about a section
 * and this file should not hold a second opinion about what opens one. A scan
 * of its own would agree with `DECK-001`’s derivation today and silently stop
 * agreeing the day that definition moves — the panel would then sit beside
 * something the rest of the application does not think is a section.
 *
 * **Null is an ordinary answer, not a failure.** The suggested structure is a
 * starting point an author may delete or reword (`RPT-001` §3), and a report
 * whose author removed the section is a report with nothing for the board to
 * sit beside. The caller says so plainly rather than hiding the board, because
 * a panel that vanishes when a heading is reworded looks like a fault.
 *
 * The first match wins. Two sections cannot both be the one the board narrates,
 * and a report carrying the heading twice is a document with a problem of its
 * own that this is not the surface to raise.
 */
export function standsSectionAt(blocks: Block[]): number | null {
  let index = 0;

  for (const section of deriveSections(blocks)) {
    if (section.heading === STANDS_HEADING) {
      return index;
    }

    index += section.blocks.length;
  }

  return null;
}
