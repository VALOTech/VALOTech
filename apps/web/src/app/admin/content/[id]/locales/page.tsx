import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { localeGrid } from '../../../../../content/locales';
import { bcp47, LOCALES, type Locale } from '../../../../../i18n/locales';

import styles from './locales.module.css';

export const metadata: Metadata = { title: 'Translations' };

/** English holds no locale row — the revision's own blocks are it. */
const AUTHORED: Locale = 'en';

type CellState = 'authored' | 'not-started' | 'machine' | 'reviewed';

// The admin console is English only (ADMIN-002): its chrome is not translated,
// unlike the content an admin writes. The language names are English too, from
// the platform's own display-name table, and the dates are English in UTC.
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
const REVISION_DATE = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const STATE_LABEL: Record<CellState, string> = {
  authored: 'Authored',
  'not-started': 'Not started',
  machine: 'Machine draft',
  reviewed: 'Reviewed',
};

/**
 * `GET /admin/content/<id>/locales` (`CMS-005/T6`) — the locale grid: twenty
 * languages down, the item's revisions across, and every cell one of four
 * states. A machine draft and a not-started locale read differently, because a
 * machine row is never served (`CMS-R05`) and the grid is where an admin sees
 * that nothing is ready yet — most of all that a new revision starts with no
 * locale rows, one authored language and nineteen not-started cells.
 *
 * The state is carried by a word as well as a colour (`A11Y-R03`). The `/admin`
 * segment layout has already resolved the admin (`ADMIN-002`), and this read is
 * not reader-scoped, so the page needs no actor of its own.
 */
export default async function LocalesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const revisions = await localeGrid(id);

  const cellClass: Record<CellState, string | undefined> = {
    authored: styles.authored,
    'not-started': styles.notStarted,
    machine: styles.machine,
    reviewed: styles.reviewed,
  };

  return (
    <div className={styles.locales}>
      <h1>Translations</h1>
      <p className={styles.intro}>
        Which languages each version of this content is ready in. A machine draft is shown to no reader until an admin
        has reviewed it.
      </p>

      {revisions.length === 0 ? (
        <p className={styles.empty}>This content has no versions yet.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col" className={styles.corner}>
                  Language
                </th>
                {revisions.map((revision) => (
                  <th key={revision.revisionId} scope="col" className={styles.revHead}>
                    <span className={styles.revKind}>{revision.published ? 'Published' : 'Draft'}</span>
                    <span className={styles.revDate}>{REVISION_DATE.format(revision.createdAt)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOCALES.map((locale) => (
                <tr key={locale}>
                  <th scope="row" className={styles.localeHead}>
                    <span className={styles.language}>{LANGUAGE_NAMES.of(bcp47(locale)) ?? locale}</span>
                    <span className={styles.code}>{locale}</span>
                  </th>
                  {revisions.map((revision) => {
                    const state: CellState =
                      locale === AUTHORED
                        ? 'authored'
                        : ((revision.localeStates[locale] as CellState | undefined) ?? 'not-started');
                    return (
                      <td key={revision.revisionId} className={cellClass[state]}>
                        {STATE_LABEL[state]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
