import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { headers } from 'next/headers';
import { getFormatter, getTranslations } from 'next-intl/server';

import { presentedToken } from '../../../auth/gate';
import { requireInvestorPage } from '../../../auth/page-guard';
import { currentSessionId, liveSessionsForAccount } from '../../../auth/session';

import styles from './sessions.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions');
  return { title: t('title') };
}

/**
 * `GET /account/sessions` (`AUTH-004/T2`) — the reader's own live sessions, the
 * current one marked, and the control that ends them all.
 *
 * Server-rendered with no client script: the end-everywhere control is a plain
 * form posting to the route `AUTH-004/T3` mounts, which takes no `Origin` check
 * and no body, so a form is all it needs. The current row is marked from the
 * cookie's own session id rather than from anything the list carries, so the
 * list never has to hold a token to know which row is this device.
 */
export default async function SessionsPage(): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const token = presentedToken(await headers());
  const [currentId, sessions, t, format] = await Promise.all([
    currentSessionId(token),
    liveSessionsForAccount(actor.id),
    getTranslations('sessions'),
    getFormatter(),
  ]);

  const stamp = (value: Date): string => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>

        <ul className={styles.list}>
          {sessions.map((session) => (
            <li
              key={session.id}
              className={styles.item}
              aria-current={session.id === currentId ? 'true' : undefined}
            >
              {session.id === currentId ? <span className={styles.current}>{t('current')}</span> : null}
              <dl className={styles.meta}>
                <div className={styles.pair}>
                  <dt>{t('began')}</dt>
                  <dd>{stamp(session.createdAt)}</dd>
                </div>
                <div className={styles.pair}>
                  <dt>{t('lastActive')}</dt>
                  <dd>{stamp(session.lastSeenAt)}</dd>
                </div>
                <div className={styles.pair}>
                  <dt>{t('expires')}</dt>
                  <dd>{stamp(session.expiresAt)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <form className={styles.end} method="post" action="/api/account/sessions/all">
          <button type="submit">{t('endEverywhere')}</button>
          <p className={styles.hint}>{t('endEverywhereHint')}</p>
        </form>
      </section>
    </main>
  );
}
