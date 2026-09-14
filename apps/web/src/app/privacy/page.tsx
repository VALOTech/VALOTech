import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { getSettings, publishedContact } from '../../config/settings';

import styles from './privacy.module.css';

export const metadata: Metadata = { title: 'Privacy' };

/**
 * `GET /privacy` — what this hall holds about the people who read it, why, for
 * how long, and what they can ask for (`LEGAL-SG-001/T1`, `LEGAL-SG-001/T6`).
 *
 * **Written to be true rather than complete** (`LEGAL-SG-001` §3). It names the
 * four things actually held — the account, the role and state, the sessions,
 * and what a person opened — and no more; a generic template listing processing
 * this product does not do is worse than a page naming five things accurately,
 * and it is short because a notice nobody finishes is a notice nobody has read.
 *
 * **It discloses the backup window rather than omitting it** (`LEGAL-SG-001/T6`).
 * An erased person survives in an encrypted backup for up to twelve months
 * (`DATA-003` §3), which every system has and few notices admit; a notice
 * implying otherwise is the inaccurate one.
 *
 * The page signs nobody in and is served to anyone, because a notice behind a
 * login is a notice the person deciding whether to accept an invitation cannot
 * read. It carries no cookie and sets none.
 */
export default async function PrivacyPage(): Promise<ReactElement> {
  const t = await getTranslations('privacy');

  // The address the notice publishes is a setting, so an operator can point it
  // at a designated contact without a deploy (`LEGAL-SG-001/T4`). A row set to
  // nothing is treated as no row: the registry's own default is the address the
  // gateway already publishes, so the sentence naming where to write is true
  // whatever the table holds.
  const address = publishedContact(await getSettings().get('privacy.contact'));

  return (
    <main className={styles.main}>
      <article className={styles.notice}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>

        <section aria-labelledby="held">
          <h2 id="held" className={styles.heading}>
            {t('heldTitle')}
          </h2>
          <ul className={styles.list}>
            <li>{t('heldIdentity')}</li>
            <li>{t('heldRole')}</li>
            <li>{t('heldSessions')}</li>
            <li>{t('heldReads')}</li>
          </ul>
          <p>{t('heldBasis')}</p>
        </section>

        <section aria-labelledby="kept">
          <h2 id="kept" className={styles.heading}>
            {t('keptTitle')}
          </h2>
          <p>{t('keptBody')}</p>
          <p>{t('keptBackups')}</p>
        </section>

        <section aria-labelledby="rights">
          <h2 id="rights" className={styles.heading}>
            {t('rightsTitle')}
          </h2>
          <ul className={styles.list}>
            <li>{t('rightsAccess')}</li>
            <li>{t('rightsCorrection')}</li>
            <li>{t('rightsWithdrawal')}</li>
            <li>{t('rightsErasure')}</li>
          </ul>
          <p>{t('rightsWhen')}</p>
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact" className={styles.heading}>
            {t('contactTitle')}
          </h2>
          {/* The address is interpolated as a value rather than wrapped in a
              link tag: a tag would put markup in twenty message files, and the
              one it buys is a convenience an address in plain text already
              gives. */}
          <p>{t('contactBody', { address })}</p>
        </section>
      </article>
    </main>
  );
}
