import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getTranslations } from 'next-intl/server';

import { SignInForm } from './sign-in-form';
import styles from '../auth-card.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('title') };
}

/**
 * `GET /sign-in` (`AUTH-001/T4`) — the form, server-rendered in the reader's
 * locale. The heading and the orienting line are read on the server; the fields
 * and their behaviour are the client form below, which shares the same locale
 * through the provider in the root layout.
 */
export default async function SignInPage(): Promise<ReactElement> {
  const t = await getTranslations('signIn');
  const privacy = await getTranslations('privacy');
  const forgot = await getTranslations('forgot');

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <h1 id="sign-in-title" className={styles.title}>
          {t('title')}
        </h1>
        <p className={styles.intro}>{t('intro')}</p>
        <SignInForm />
      </section>
      {/* The notice is linked from here because somebody deciding whether to
          accept an invitation reads it before they have an account, so a notice
          reachable only from inside the room is one they cannot reach
          (`LEGAL-SG-001/T2`). */}
      <p className={styles.aside}>
        {/* The way to a reset, from the one page somebody reaches when their
            password does not work. A reset page nothing links to is a page only
            an admin knows about, which makes self-service reset
            (`AUTH-DEC-05`) self-service in name (`SEC-001/T4`). */}
        <a href="/forgot">{forgot('title')}</a>
      </p>
      <p className={styles.aside}>
        <a href="/privacy">{privacy('link')}</a>
      </p>
    </main>
  );
}
