import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import { requireInvestorPage } from '../../auth/page-guard';

import './fonts.css';
import { LocaleForm } from './locale-form';
import { RoomNav, type RoomDestination } from './nav';
import { SearchForm } from './search-form';
import styles from './room.module.css';

/**
 * The `/room` segment layout — the one place the room's role check happens
 * (`SEC-R01`), and the chrome every surface under it wears (`INV-001/T4`).
 *
 * The check is here rather than in each page so it is a structural property of
 * the segment: a page under this layout cannot render without it resolving
 * first. The failure that prevents is the fourth room page shipping without the
 * check the first three have.
 *
 * **The chrome is the gateway's, with no scene.** The same mark, the same
 * wordmark with the second word in the accent, the same header height and the
 * same ground, so an investor who signs in is somewhere continuous with the
 * page they came from. What does not come across is the world: the gateway's
 * scene is an argument being made to somebody deciding, and this is a room for
 * somebody who has already decided and came to read.
 *
 * **The search is here rather than on the landing**, because a field that
 * sits on one page is one a reader navigates back to before they can use it.
 *
 * **The rail names only destinations that exist.** Reports and decks are
 * reading views `RPT-003` and `DECK-003` build, and an entry pointing at a page
 * that answers the not-found page is one somebody tries twice; each returns
 * here with the surface it points at. `INV-001/T3` closes when all four stand.
 */
export default async function RoomLayout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await requireInvestorPage();
  const [t, locale] = await Promise.all([getTranslations('room'), getLocale()]);

  const destinations: readonly RoomDestination[] = [
    { href: '/room', label: t('nav.room') },
    { href: '/account/sessions', label: t('nav.account') },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/room" className={styles.brand}>
          {/* Decorative: the wordmark beside it already names the company, and a
              screen reader that read both would say it twice. */}
          <img src="/valo-symbol-white.png" alt="" className={styles.mark} width={28} height={28} />
          <span className={styles.wordmark}>
            VALO <span className={styles.wordmarkAccent}>Tech</span>
          </span>
        </Link>

        <RoomNav destinations={destinations} />

        {/* Looking something up is a thing an investor does from wherever they
            are, so the field is on the chrome rather than on one page. */}
        <SearchForm />

        <LocaleForm current={locale} />

        {/* A plain form, because the route takes no body and no token: the
            session cookie is SameSite=Lax, so a cross-site post arrives without
            it and the handler finds nothing to end. No script is needed to sign
            somebody out, and a control that needs one fails closed on the day
            it does not load. */}
        <form method="post" action="/api/auth/sign-out" className={styles.signOutForm}>
          <button type="submit" className={styles.signOut}>
            <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path
                d="M12.5 6V4.5A1.5 1.5 0 0 0 11 3H5.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17H11a1.5 1.5 0 0 0 1.5-1.5V14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path d="M9 10h8m0 0-2.6-2.6M17 10l-2.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.srOnly}>{t('signOut')}</span>
          </button>
        </form>
      </header>

      {children}
    </div>
  );
}
