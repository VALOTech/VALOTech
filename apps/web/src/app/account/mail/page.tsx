import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { requireInvestorPage } from '../../../auth/page-guard';
import { investorMailPreference } from '../../../mail/unsubscribe';

import styles from './mail.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mailPreference');
  return { title: t('title') };
}

/**
 * `GET /account/mail` (`MAIL-002/T2`) — the reader's own investor-mail
 * preference, and the control that changes it.
 *
 * The same setting the link in a message changes, reached from inside the hall
 * by somebody who is signed in. Both doors write one row: a second list would be
 * a second answer to "does this person want investor mail", and the disagreement
 * between two such lists is exactly what `MAIL-002` says cannot be allowed to
 * happen.
 *
 * Server-rendered with no client script: each control is a plain form posting to
 * the route, which is what a page with one setting and two buttons needs.
 *
 * **It says what the setting stops and what it does not**, in the same words the
 * link's page uses, because the surprise it prevents is the same one: somebody
 * who turns investor mail off and then receives a password reset should not
 * conclude the setting did nothing.
 *
 * **A stop an admin set says so, and the reason they typed is not shown.** That
 * text is written by staff about a person — most often a bounce notice's gist —
 * and this page is read by the person it is about; the sentence here says the
 * company stopped it and where to ask, which is what the reader can act on. They
 * can still start it again: this is their own inbox, and a setting nobody can
 * undo is one that becomes wrong the first time an address starts working again
 * (`MAIL-002` §3).
 */
export default async function AccountMailPage(): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const [preference, t] = await Promise.all([
    investorMailPreference(actor.id),
    getTranslations('mailPreference'),
  ]);

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="mail-title">
        <h1 id="mail-title" className={styles.title}>
          {t('title')}
        </h1>
        <p className={styles.intro}>{t('hallIntro')}</p>

        <p className={styles.state}>{preference.stopped ? t('stopped') : t('on')}</p>

        {preference.stopped && preference.source === 'admin' ? (
          <p className={styles.detail}>{t('stoppedByCompany')}</p>
        ) : null}

        <p className={styles.detail}>{t('stops')}</p>
        <p className={styles.detail}>{t('keeps')}</p>

        <form className={styles.change} method="post" action="/api/account/mail">
          <input type="hidden" name="intent" value={preference.stopped ? 'resume' : 'stop'} />
          <button type="submit">{preference.stopped ? t('resume') : t('stop')}</button>
        </form>
      </section>
    </main>
  );
}
