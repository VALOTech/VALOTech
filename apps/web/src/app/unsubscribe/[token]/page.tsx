import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { investorMailPreference, unsubscribeSubject } from '../../../mail/unsubscribe';
import styles from '../../auth-card.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mailPreference');
  return { title: t('title') };
}

/**
 * `GET /unsubscribe/<token>` (`MAIL-002/T2`) — where the link in every investor
 * message lands. No sign-in: an unsubscribe that requires one is an unsubscribe
 * most people cannot complete, and `DATA-R04` does not care why it failed.
 *
 * **It asks, and the answer is a `POST`.** A bare `GET` that wrote the row would
 * be fetched by every mail scanner, corporate link-protection service and
 * prefetching client that touches the message, and each of those would
 * unsubscribe somebody who never pressed anything — silently, and in a way
 * nobody could tell from a real press. So this renders one button and that
 * button posts (`MAIL-DEC-05`).
 * The click count is unchanged for the reader: they open the link and press
 * once.
 *
 * **It says what it stops and what it does not**, before the press rather than
 * after, so somebody who unsubscribes and then receives a password reset is not
 * surprised into thinking the unsubscribe failed.
 *
 * **A token that does not verify and one naming an account that no longer exists
 * get the same page**, because the difference is not something a holder of the
 * link is owed and telling them apart would confirm an account to anybody
 * keeping an old link. That page is also what a link sent before
 * `SESSION_SECRET` was rotated reaches, so it reads as a link that no longer
 * works rather than as an accusation, and it points at the two doors that do:
 * signing in, and the person who invited them.
 *
 * Nothing here renders a name or an address. The token identifies the account to
 * the server; it does not entitle whoever holds it to read anything about the
 * person (`DATA-R01`, `DATA-R02`).
 */
export default async function UnsubscribePage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const [{ token }, t] = await Promise.all([params, getTranslations('mailPreference')]);
  const accountId = await unsubscribeSubject(token);

  if (accountId === null) {
    return (
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="unsubscribe-title">
          <h1 id="unsubscribe-title" className={styles.title}>
            {t('title')}
          </h1>
          <p className={styles.intro}>{t('expired')}</p>
        </section>
        <p className={styles.aside}>
          <a href="/sign-in">{t('signIn')}</a>
        </p>
      </main>
    );
  }

  const preference = await investorMailPreference(accountId);

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="unsubscribe-title">
        <h1 id="unsubscribe-title" className={styles.title}>
          {t('title')}
        </h1>

        {preference.stopped ? (
          // Announced rather than merely printed: the reader arrives here from
          // their own press, by the redirect the post answers with, and this
          // sentence is the whole of the confirmation.
          <p className={styles.intro} role="status">
            {t('stopped')}
          </p>
        ) : (
          <p className={styles.intro}>{t('confirmIntro')}</p>
        )}

        <p className={styles.intro}>{t('stops')}</p>
        <p className={styles.intro}>{t('keeps')}</p>

        {preference.stopped ? null : (
          <form className={styles.form} method="post" action="/api/unsubscribe">
            <input type="hidden" name="token" value={token} />
            <button type="submit">{t('stop')}</button>
          </form>
        )}
      </section>
      <p className={styles.aside}>
        <a href="/sign-in">{t('signIn')}</a>
      </p>
    </main>
  );
}
