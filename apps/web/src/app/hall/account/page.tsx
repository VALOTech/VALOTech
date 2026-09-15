import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { headers } from 'next/headers';
import { getFormatter, getTranslations } from 'next-intl/server';

import { presentedToken } from '../../../auth/gate';
import { requireInvestorPage } from '../../../auth/page-guard';
import { currentSessionId, liveSessionsForAccount } from '../../../auth/session';
import { investorMailPreference } from '../../../mail/unsubscribe';

import styles from '../hall.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hall');
  return { title: t('nav.account') };
}

/**
 * `GET /hall/account` — what a reader may see and change about their own
 * account: the sessions they have open, and whether investor mail reaches them
 * (`INV-001/T3`, `AUTH-004/T2`, `MAIL-002/T2`).
 *
 * **One page rather than two.** These were separate surfaces outside the hall,
 * each drawing its own card because there was no chrome to sit inside. A person
 * looking for "my account" looks in one place, and two entries in a rail of four
 * for one subject is a rail that describes the code's layout rather than the
 * reader's question.
 *
 * Under `/hall` so the segment layout's gate, chrome and footer all apply
 * without this page arranging any of them, and so a session expiring here
 * returns the reader here rather than to the landing (`INV-001/T5`).
 *
 * Server-rendered with no client script: every control is a plain form posting
 * to a route that takes no body worth guarding, which is what two settings and
 * two buttons need. A control that needs a bundle fails closed on the day the
 * bundle does not load.
 */
export default async function AccountPage(): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const token = presentedToken(await headers());
  const [currentId, sessions, preference, t, sessionsText, mailText, format] = await Promise.all([
    currentSessionId(token),
    liveSessionsForAccount(actor.id),
    investorMailPreference(actor.id),
    getTranslations('hall'),
    getTranslations('sessions'),
    getTranslations('mailPreference'),
    getFormatter(),
  ]);

  const stamp = (value: Date): string =>
    format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className={styles.main}>
      <section className={styles.lede} aria-labelledby="account-heading">
        <h1 id="account-heading" className={styles.eyebrow}>
          {t('nav.account')}
        </h1>
      </section>

      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className={styles.eyebrow}>
          {sessionsText('title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.empty}>{sessionsText('intro')}</p>
          <ul className={styles.stream}>
            {sessions.map((session) => (
              // The current row is marked from the cookie's own session id
              // rather than from anything the list carries, so the list never
              // has to hold a token to know which row is this device.
              <li
                key={session.id}
                className={styles.streamRow}
                aria-current={session.id === currentId ? 'true' : undefined}
              >
                <div className={styles.streamIdentity}>
                  {session.id === currentId ? (
                    <span className={styles.role}>{sessionsText('current')}</span>
                  ) : null}
                  <span className={styles.itemTitle}>
                    {sessionsText('began')} {stamp(session.createdAt)}
                  </span>
                </div>
                <span className={styles.meta}>
                  {sessionsText('lastActive')} {stamp(session.lastSeenAt)} · {sessionsText('expires')}{' '}
                  {stamp(session.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
          <form className={styles.accountAct} method="post" action="/api/account/sessions/all">
            <button type="submit" className={styles.accountButton}>
              {sessionsText('endEverywhere')}
            </button>
            <p className={styles.empty}>{sessionsText('endEverywhereHint')}</p>
          </form>
        </div>
      </section>

      <section aria-labelledby="mail-heading">
        <h2 id="mail-heading" className={styles.eyebrow}>
          {mailText('title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.claim}>{preference.stopped ? mailText('stopped') : mailText('on')}</p>
          {/* A stop an admin set says so, and the reason they typed is not shown:
              that text is written by staff about a person, and this page is read
              by the person it is about (`MAIL-002` §3). */}
          {preference.stopped && preference.source === 'admin' ? (
            <p className={styles.empty}>{mailText('stoppedByCompany')}</p>
          ) : null}
          <p className={styles.empty}>{mailText('stops')}</p>
          <p className={styles.empty}>{mailText('keeps')}</p>
          <form className={styles.accountAct} method="post" action="/api/account/mail">
            <input type="hidden" name="intent" value={preference.stopped ? 'resume' : 'stop'} />
            <button type="submit" className={styles.accountButton}>
              {preference.stopped ? mailText('resume') : mailText('stop')}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
