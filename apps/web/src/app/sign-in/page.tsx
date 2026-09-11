import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getTranslations } from 'next-intl/server';

import { SignInForm } from './sign-in-form';
import styles from './sign-in.module.css';

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

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <h1 id="sign-in-title" className={styles.title}>
          {t('title')}
        </h1>
        <p className={styles.intro}>{t('intro')}</p>
        <SignInForm />
      </section>
    </main>
  );
}
