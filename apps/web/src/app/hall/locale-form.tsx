'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { languageName, LOCALE_FLAG, LOCALES } from '../../i18n/locales';

import { Disclosure } from './disclosure';
import styles from './hall.module.css';

/**
 * The language the reader is written to in, on the chrome (`INV-001/T4`).
 *
 * **One form, twenty submit buttons.** Choosing a language is the whole gesture
 * — a reader who has found their own line does not then want to confirm it — so
 * each row carries its own value and submits on the click that selects it. That
 * also keeps the control working with no script: a `select` that navigates on
 * change needs JavaScript to do it, and a `select` that does not needs a second
 * button nobody wanted.
 *
 * **Each language is named in itself.** A picker listing "Vietnamese" in
 * English is useless to the person who needs it, because they are looking for
 * the word they would recognise. The flag beside it is the gateway's own
 * mapping and is decorative: a flag is a country and not a language, so it
 * carries `alt=""` and the endonym is what the row says.
 *
 * **A form, posting to a route.** The locale is resolved on the server for
 * every render, so a cookie written in the browser would take effect on the
 * next navigation rather than this one. The current path travels with it, so
 * the reader lands back where they were rather than at the top of the hall.
 *
 * A client component only to know where "here" is; it imports its labels, the
 * catalogue and nothing that reaches a database.
 */
export function LocaleForm({ current }: { readonly current: string }): ReactElement {
  const t = useTranslations('hall');
  const pathname = usePathname();
  const params = useSearchParams().toString();
  const next = params === '' ? pathname : `${pathname}?${params}`;
  const chosen = LOCALES.find((locale) => locale === current) ?? 'en';

  return (
    <Disclosure
      className={styles.localeDisclosure}
      summary={
        <summary className={styles.localeToggle}>
        <img
          className={styles.flag}
          src={`/flags/${LOCALE_FLAG[chosen]}.svg`}
          alt=""
          width={21}
          height={15}
        />
        <span className={styles.localeCurrent}>{languageName(chosen)}</span>
          <span className={styles.srOnly}>{t('language')}</span>
        </summary>
      }
    >

      <form method="post" action="/api/locale" className={styles.localeMenu}>
        <input type="hidden" name="next" value={next} />
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            className={styles.localeOption}
            aria-current={locale === chosen ? 'true' : undefined}
          >
            <img className={styles.flag} src={`/flags/${LOCALE_FLAG[locale]}.svg`} alt="" width={21} height={15} />
            {languageName(locale)}
          </button>
        ))}
      </form>
    </Disclosure>
  );
}
