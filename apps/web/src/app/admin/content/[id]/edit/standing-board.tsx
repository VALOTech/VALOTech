/**
 * What the progress board says, shown while a report's author writes the section
 * that narrates it (`RPT-001/T4`).
 *
 * `INV-003`'s board and the report's "where each product stands" section are two
 * statements of one thing, and they are written months apart by a person who has
 * the board in mind rather than in front of them. Putting the board's current
 * values beside the section makes a disagreement visible **while writing** rather
 * than after publishing, which is the only point at which it is cheap to fix
 * (`RPT-001` §4).
 *
 * **It shows and does not check.** There is no claim here that the section and
 * the board agree — a surface cannot read prose and say whether it narrates a
 * stage correctly, and one that matched product names in the text would be
 * asserting agreement it had not established. The author does the comparing; this
 * makes it possible by putting both in one place.
 *
 * Read-only, and nothing here writes: editing the board is `INV-003/T2`, which
 * is not built, so this deliberately offers no route to it rather than linking
 * somewhere that answers nothing.
 */

import type { ReactElement } from 'react';

import { STANDS_HEADING } from '../../../../../content/report-structure';
import type { Standing } from '../../../../../portfolio/standing';
import { PRODUCT_LABEL, STAGE_LABEL } from '../../../../../portfolio/labels';

import styles from './editor.module.css';

/**
 * The day a stage last moved, which is the whole of what a date means here. An
 * author comparing a sentence against a board wants to know whether the board
 * moved since the last report, and a time of day answers a question nobody asked.
 */
const CHANGED = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

export function StandingBoard({
  board,
  /** Whether the report carries the section this belongs beside. */
  beside,
}: {
  board: readonly Standing[];
  beside: boolean;
}): ReactElement {
  return (
    <aside className={styles.standing} aria-label="Progress board, current values">
      <p className={styles.standingIntro}>
        {beside
          ? 'The board says this today. It is not checked against what you write.'
          : `This report has no “${STANDS_HEADING}” section, so the board sits here rather than beside one.`}
      </p>

      <ul className={styles.standingList}>
        {board.map((entry) => (
          <li key={entry.product} className={styles.standingRow}>
            <span className={styles.standingProduct}>{PRODUCT_LABEL[entry.product]}</span>

            {entry.set ? (
              <>
                <span className={styles.standingStage}>{STAGE_LABEL[entry.stage]}</span>
                {entry.headline === null ? null : (
                  <span className={styles.standingHeadline}>{entry.headline}</span>
                )}
                {entry.changedAt === null ? null : (
                  <span className={styles.standingChanged}>
                    since {CHANGED.format(entry.changedAt)}
                  </span>
                )}
              </>
            ) : (
              // `set` is false, so the stage beside it is this application's
              // assumption rather than anybody's statement (`INV-003`). Printing
              // the assumed word here would put it in a report as though somebody
              // had said it.
              <span className={styles.standingUnset}>nobody has set this</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
