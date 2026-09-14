import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getFormatter, getTranslations } from 'next-intl/server';

import Link from 'next/link';

import { requireInvestorPage } from '../../auth/page-guard';
import { grantedDecksForAccount } from '../../content/decks';
import { currentReport } from '../../content/reports';
import { updateStream } from '../../content/stream';
import { isNarrowed, search } from '../../content/search';
import { hasOpened, unreadUpdateCount } from '../../content/unread';
import type { PortfolioStage } from '../../db/types';
import { standing } from '../../portfolio/board';
import { PRODUCT_LABEL } from '../../portfolio/labels';

import { narrowest, readRoomQuery, withoutNarrowing } from './query';
import styles from './room.module.css';
import { SearchForm } from './search-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('room');
  return { title: t('title') };
}

/**
 * The four stage words as the room says them.
 *
 * `portfolio/labels.ts` holds the console's, which are English by design and
 * are not a reader's (`I18N-R01`). A product's name is a proper noun and is
 * imported from there unchanged; a stage is a word in a sentence and is not.
 * Keyed by the union, so a fifth stage stops the build here rather than reaching
 * an investor as the raw token `in private use`.
 */
const STAGE_KEY: Readonly<Record<PortfolioStage, string>> = {
  building: 'stage.building',
  'in private use': 'stage.inPrivateUse',
  'in market': 'stage.inMarket',
  paused: 'stage.paused',
};

/**
 * `GET /room` — what a signed-in investor lands on (`INV-001/T1`).
 *
 * Four things in the order the PRD says an investor wants them, which is the
 * order of somebody catching up rather than the order of formality (`INV-001`
 * §3): what is new, where things stand, the current report, and the decks they
 * hold. The progress board sits above the report deliberately — the board is a
 * state a reader absorbs in ten seconds and the report is twenty minutes they
 * may not have now.
 *
 * **Every read takes the reader** (`DATA-R05`), and the gate is the server's
 * (`SEC-R01`): `requireInvestorPage` answers an actor or the page never renders.
 * The five reads are issued together because none depends on another's result,
 * so the landing costs one round trip's latency rather than five.
 *
 * **Each of the four says its own absence in its own words** (`INV-001` §3). A
 * first-time investor's room is legitimately near-empty, and a blank area is
 * indistinguishable from a load that failed — so an empty stream says the
 * company has not posted yet, and says it under a heading that explains what
 * would appear there.
 *
 * **Nothing here links to a reading view, because none exists yet.** The titles
 * are text rather than anchors: `/content/<id>` answers a document's body as
 * data, not a page, and the rendered views are `POST-003`, `RPT-003` and
 * `DECK-003`. A link that answers the not-found page is one a reader tries
 * twice, which is worse than a title they can read and not yet open.
 *
 * The gate is called here rather than in a segment layout. `/room` is the one
 * page under it today; when `INV-001/T3` adds the other three destinations the
 * check belongs in a layout, the way `/admin`'s does, so that the fourth page
 * cannot ship without it.
 */
export default async function RoomPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const query = readRoomQuery(await searchParams);

  // A narrowed room is a different page, not the landing with a list appended:
  // the four things below are what has happened lately, and a reader who has
  // asked a question wants its answer rather than the room's own summary under
  // it (`CMS-007` §2, `INV-001` §3).
  if (isNarrowed(query.q, query)) {
    const [results, t, format] = await Promise.all([
      search(query.q, actor, query),
      getTranslations('room'),
      getFormatter(),
    ]);
    const day = (value: Date): string => format.dateTime(value, { dateStyle: 'medium' });
    const drop = narrowest(query);

    return (
      <main className={styles.main}>
        <SearchForm current={query} />

        {/* The count is announced rather than only shown: a reader who submits
            the form and hears nothing cannot tell a narrow result from a broken
            one (`CMS-007/T6`, `A11Y-R02`). It is polite, not assertive, because
            it arrives with a whole new page and interrupting is not the job. */}
        <p className={styles.resultCount} role="status" aria-live="polite">
          {t('search.count', { count: results.length })}
        </p>

        {results.length === 0 ? (
          <div className={styles.panel}>
            {/* An empty result says which narrowing produced it and offers to
                drop the one that excluded the most. "No results" alone is
                indistinguishable from a broken search, and an investor who
                concludes the room is broken does not ask (`CMS-007/T5`). */}
            <p className={styles.empty}>
              {drop === null ? t('search.emptyPlain') : t('search.emptyNarrowed', { narrowing: t(`search.narrowing.${drop}`) })}
            </p>
            {drop === null ? null : (
              <p className={styles.widen}>
                <Link href={withoutNarrowing(query, drop)} className={styles.widenLink}>
                  {t('search.widen', { narrowing: t(`search.narrowing.${drop}`) })}
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className={styles.panel}>
            <ul className={styles.stream}>
              {results.map((item) => (
                <li key={item.id} className={styles.streamRow}>
                  <div className={styles.streamIdentity}>
                    {item.product === null ? null : (
                      <span className={styles.role}>{PRODUCT_LABEL[item.product]}</span>
                    )}
                    <span className={styles.itemTitle}>{item.title}</span>
                  </div>
                  {item.period === null ? null : <span className={styles.meta}>{item.period}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    );
  }


  const [unread, stream, board, report, decks, t, format] = await Promise.all([
    unreadUpdateCount(actor),
    updateStream(actor),
    standing(),
    currentReport(actor),
    grantedDecksForAccount(actor.id),
    getTranslations('room'),
    getFormatter(),
  ]);

  const reportOpened = report === null ? false : await hasOpened(actor.id, report.id);
  const day = (value: Date): string => format.dateTime(value, { dateStyle: 'medium' });

  return (
    <main className={styles.main}>
      {/* 1. What is new — the question they came with, and the only thing here
          that is not on a panel. The label is the eyebrow and the count is the
          claim beneath it, which is the shape every section on the gateway
          takes: the reader is told what they are looking at, then told the
          thing. It is a sentence and never a dot, so a screen reader reaches
          the same information a sighted reader does (`A11Y-R02`). */}
      <section className={styles.lede} aria-labelledby="room-new">
        <h1 id="room-new" className={styles.eyebrow}>
          {t('new.heading')}
        </h1>
        <p
          className={`${styles.claim} ${
            unread !== null && unread > 0 ? styles.claimWaiting : styles.claimClear
          }`}
        >
          {unread === null || unread === 0 ? t('new.none') : t('new.count', { count: unread })}
        </p>
      </section>

      {/* The stream carries no heading of its own: the one above names it, and a
          second saying the same thing twice is chrome. A row leads with the
          product it is about where the author named one, which is the identity
          pattern the gateway uses — what this is about, then what it says. */}
      <section className={styles.panel} aria-label={t('new.heading')}>
        {stream.entries.length === 0 ? (
          <p className={styles.empty}>{t('new.empty')}</p>
        ) : (
          <ul className={styles.stream}>
            {stream.entries.map((entry) => (
              <li key={entry.item.id} className={styles.streamRow}>
                <div className={styles.streamIdentity}>
                  {entry.item.product === null ? null : (
                    <span className={styles.role}>{PRODUCT_LABEL[entry.item.product]}</span>
                  )}
                  <span className={styles.itemTitle}>{entry.item.title}</span>
                </div>
                <span className={styles.meta}>{day(entry.publishedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Where things stand — the board, and the page's centre of gravity.
          Six cards rather than six rows, because a product is an object a
          reader compares against the others and a row is a line they scan past.
          All six always render, and a product nobody has written a row for says
          so rather than showing this module's assumption as a statement
          (`INV-003/T4`). The stage is a word in a neutral pill and never a hue:
          the brand's one accent marks the interactive and the current, and a
          stage is neither (`INV-003/T5`, `A11Y-R03`). */}
      <section aria-labelledby="room-standing">
        <h2 id="room-standing" className={styles.eyebrow}>
          {t('standing.heading')}
        </h2>
        {board.every((entry) => !entry.set) ? (
          <p className={`${styles.panel} ${styles.empty}`}>{t('standing.empty')}</p>
        ) : null}
        <ul className={styles.board}>
          {board.map((entry) => (
            <li key={entry.product} className={`${styles.panel} ${styles.product}`}>
              <div className={styles.productHead}>
                <span className={styles.productName}>{PRODUCT_LABEL[entry.product]}</span>
                <span className={`${styles.stage}${entry.set ? '' : ` ${styles.stageUnset}`}`}>
                  {t(STAGE_KEY[entry.stage])}
                </span>
              </div>
              <span className={styles.meta}>
                {entry.set && entry.changedAt !== null ? day(entry.changedAt) : t('standing.unset')}
              </span>
              {entry.headline === null ? null : <p className={styles.headline}>{entry.headline}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* 3. The current report — one card and not the document. It is the most
          recent period this reader may read rather than the most recent
          publication (`RPT-002/T4`), which `currentReport` decides. */}
      <section aria-labelledby="room-report">
        <h2 id="room-report" className={styles.eyebrow}>
          {t('report.heading')}
        </h2>
        <div className={styles.panel}>
          {report === null ? (
            <p className={styles.empty}>{t('report.empty')}</p>
          ) : (
            <div className={styles.report}>
              {report.period === null ? null : <span className={styles.role}>{report.period}</span>}
              <span className={styles.reportTitle}>{report.title}</span>
              <span className={styles.meta}>{reportOpened ? t('report.opened') : t('report.unopened')}</span>
            </div>
          )}
        </div>
      </section>

      {/* 4. Your decks — read once, so present rather than prominent. */}
      <section aria-labelledby="room-decks">
        <h2 id="room-decks" className={styles.eyebrow}>
          {t('decks.heading')}
        </h2>
        <div className={styles.panel}>
          {decks.length === 0 ? (
            <p className={styles.empty}>{t('decks.empty')}</p>
          ) : (
            <ul className={styles.stream}>
              {decks.map((deck) => (
                <li key={deck.deckId} className={styles.streamRow}>
                  <span className={styles.itemTitle}>{deck.deckTitle}</span>
                  <span className={styles.meta}>{day(deck.grantedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <SearchForm current={query} />
    </main>
  );
}
