import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { sendingIsPossible } from '../../mail/availability';
import styles from '../auth-card.module.css';

import { ForgotForm } from './forgot-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forgot');
  return { title: t('title') };
}

/**
 * `GET /forgot` — where somebody who cannot sign in asks for a link
 * (`SEC-001/T4`, ratified at [`AUTH-DEC-05`](../../../../docs/decisions-log.md)).
 *
 * Public and signed out, because a person who has forgotten their password is by
 * definition on the outside. It is drawn on the same card as `/sign-in` and links
 * back to it: the two pages are one step apart in the only direction anybody
 * travels between them, and a way back matters most to the person who arrived
 * here by mistake.
 *
 * The room is invite-only, so this page names no account and offers no way to
 * make one — it asks for an address and says the same thing whatever was typed.
 * The fallback when the message never arrives is an admin resetting from the
 * person page, because SMTP reports no bounce and a reset mail lost in transit
 * signals nobody ([`MAIL-DEC-01`](../../../../docs/decisions-log.md)).
 *
 * **When no message can be sent at all, the form is not offered.** A reset link
 * reaches a person only by mail — unlike an invitation, it is never shown to an
 * admin, because one would let them set an active account's password and sign in
 * as its owner (`ADMIN-001` §3). So with no credential this page would take an
 * address, answer `204`, and tell somebody a link was on its way to an inbox
 * nothing was ever handed to. Saying so instead costs nothing and reveals
 * nothing: whether sending is possible is a property of the deployment and not
 * of the address in the box, so the same sentence is shown to everybody who
 * opens the page, including people no account exists for (`SEC-R03`).
 */
export default async function ForgotPage(): Promise<ReactElement> {
  const t = await getTranslations('forgot');
  const sending = await sendingIsPossible();

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="forgot-title">
        <h1 id="forgot-title" className={styles.title}>
          {t('title')}
        </h1>
        {sending.available ? (
          <>
            <p className={styles.intro}>{t('intro')}</p>
            <ForgotForm />
          </>
        ) : (
          // The operator's reason is deliberately not shown: it names a
          // configuration this reader cannot act on, and `mail.unavailable`
          // already puts it in the log for somebody who can.
          <p className={styles.intro} role="status">
            {t('unavailable')}
          </p>
        )}
      </section>
      <p className={styles.aside}>
        <a href="/sign-in">{t('backToSignIn')}</a>
      </p>
    </main>
  );
}
