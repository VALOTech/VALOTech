import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getFormatter, getTranslations } from 'next-intl/server';

import { requireInvestorPage } from '../../../auth/page-guard';
import { reportArchive } from '../../../content/reports';

import styles from '../hall.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hall');
  return { title: t('archive.title') };
}

/**
 * `GET /hall/reports` — every period from this reader's first report to the one
 * we are in, newest first and grouped by year (`RPT-002/T3`, `RPT-002` §3).
 *
 * **A gap is a row and not an omission.** A period nobody published into is the
 * thing an investor is looking for as often as a period somebody did, so it is
 * drawn with the others rather than closing the list up around it. It says only
 * that there is nothing here to read: `RPT-002` §3 makes a report this reader may
 * not see indistinguishable from a period that is empty, and wording that
 * separated them would undo in the copy what the query is careful to do.
 *
 * **Nothing here links to a report yet.** `RPT-003` builds the reading view;
 * until it does, a period's title is text, because a link that answers the
 * not-found page is one a reader tries twice.
 */
export default async function ReportArchivePage(): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const [years, t, format] = await Promise.all([
    reportArchive(actor),
    getTranslations('hall'),
    getFormatter(),
  ]);
  const day = (value: Date): string => format.dateTime(value, { dateStyle: 'medium' });

  return (
    <main className={styles.main}>
      <section className={styles.lede} aria-labelledby="archive-heading">
        <h1 id="archive-heading" className={styles.eyebrow}>
          {t('archive.title')}
        </h1>
      </section>

      {years.length === 0 ? (
        <p className={`${styles.panel} ${styles.empty}`}>{t('archive.empty')}</p>
      ) : (
        years.map((year) => (
          // The year names its own group rather than labelling it from outside,
          // so a reader moving by heading lands on the year they were after
          // (`A11Y-R01`).
          <section key={year.year} aria-labelledby={`year-${year.year}`}>
            <h2 id={`year-${year.year}`} className={styles.eyebrow}>
              {year.year}
            </h2>
            <ul className={styles.stream}>
              {year.entries.map((entry) => (
                <li key={entry.period} className={styles.streamRow}>
                  <div className={styles.streamIdentity}>
                    <span className={styles.role}>{entry.period}</span>
                    <span className={entry.report === null ? styles.empty : styles.itemTitle}>
                      {entry.report === null ? t('archive.gap') : entry.report.title}
                    </span>
                  </div>
                  {entry.report === null ? null : (
                    <span className={styles.meta}>
                      {entry.publishedAt === null ? null : `${day(entry.publishedAt)} · `}
                      {entry.readAt === null ? t('report.unopened') : t('report.opened')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
