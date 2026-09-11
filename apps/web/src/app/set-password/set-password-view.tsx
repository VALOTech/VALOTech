import type { ReactElement } from 'react';

import { getTranslations } from 'next-intl/server';

import { tokenIsLive } from '../../auth/invitation';

import { SetPasswordForm } from './set-password-form';
import styles from './set-password.module.css';

/**
 * The shared body of `/invite/<token>` and `/reset/<token>` (`AUTH-003/T4`): the
 * set-password form when the token is still live, and the expired panel when it
 * is not. The liveness peek chooses between the two; it does not guard the
 * write, which the POST consumes under its own atomic predicate, so a token that
 * lapses between this render and the submit is answered there rather than here.
 */
export async function SetPasswordView({ token }: { readonly token: string }): Promise<ReactElement> {
  const t = await getTranslations('setPassword');
  const live = await tokenIsLive(token);

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="set-password-title">
        {live ? (
          <>
            <h1 id="set-password-title" className={styles.title}>
              {t('title')}
            </h1>
            <p className={styles.intro}>{t('intro')}</p>
            <SetPasswordForm token={token} />
          </>
        ) : (
          <>
            <h1 id="set-password-title" className={styles.title}>
              {t('expiredTitle')}
            </h1>
            <p className={styles.intro}>{t('expiredBody')}</p>
          </>
        )}
      </section>
    </main>
  );
}
