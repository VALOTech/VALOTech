import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import { requireInvestorPage } from '../../auth/page-guard';

import './fonts.css';
import { LocaleForm } from './locale-form';
import { ECOSYSTEM } from './ecosystem';
import { HallNav, type HallDestination } from './nav';
import { SearchForm } from './search-form';
import styles from './hall.module.css';

/**
 * The `/hall` segment layout — the one place the hall's role check happens
 * (`SEC-R01`), and the chrome every surface under it wears (`INV-001/T4`).
 *
 * The check is here rather than in each page so it is a structural property of
 * the segment: a page under this layout cannot render without it resolving
 * first. The failure that prevents is the fourth hall page shipping without the
 * check the first three have.
 *
 * **The chrome is the gateway's, with no scene.** The same mark, the same
 * wordmark with the second word in the accent, the same header height and the
 * same ground, so an investor who signs in is somewhere continuous with the
 * page they came from. What does not come across is the world: the gateway's
 * scene is an argument being made to somebody deciding, and this is a hall for
 * somebody who has already decided and came to read.
 *
 * **The search is here rather than on the landing**, because a field that
 * sits on one page is one a reader navigates back to before they can use it.
 *
 * **The footer carries one thing.** A reader signed in still needs the privacy
 * notice, and one they would have to sign out to reach is one they do not read.
 *
 * **The rail names only destinations that exist.** Reports and decks are
 * reading views `RPT-003` and `DECK-003` build, and an entry pointing at a page
 * that answers the not-found page is one somebody tries twice; each returns
 * here with the surface it points at. `INV-001/T3` closes when all four stand.
 */
export default async function HallLayout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await requireInvestorPage();
  const [t, privacy, locale] = await Promise.all([
    getTranslations('hall'),
    getTranslations('privacy'),
    getLocale(),
  ]);

  const destinations: readonly HallDestination[] = [
    { href: '/hall', label: t('nav.hall') },
    { href: '/hall/reports', label: t('nav.reports') },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/hall" className={styles.brand}>
          {/* Decorative: the wordmark beside it already names the company, and a
              screen reader that read both would say it twice. */}
          <img src="/valo-symbol-white.png" alt="" className={styles.mark} width={28} height={28} />
          <span className={styles.wordmark}>
            VALO <span className={styles.wordmarkAccent}>Tech</span>
          </span>
        </Link>

        <HallNav destinations={destinations} />

        {/* The three controls are one group rather than three things the frame
            happens to hold: they are what a reader reaches for, not where they
            are going, and spacing them apart makes the eye hunt for each. */}
        <div className={styles.tools}>
          {/* Looking something up is a thing an investor does from wherever
              they are, so the field is on the chrome rather than on one page. */}
          <SearchForm />

          <LocaleForm current={locale} />

          {/* The account sits with the tools and not in the rail, because it is
              a thing the reader reaches for rather than a place the company
              publishes to. The rail names where the writing is; this names
              where the reader's own settings are. */}
          <Link href="/hall/account" className={styles.accountLink}>
            <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <circle cx="10" cy="6.75" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M3.75 17c0-3.2 2.8-5.25 6.25-5.25S16.25 13.8 16.25 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span className={styles.srOnly}>{t('nav.account')}</span>
          </Link>

          {/* A plain form, because the route takes no body and no token: the
              session cookie is SameSite=Lax, so a cross-site post arrives
              without it and the handler finds nothing to end. No script is
              needed to sign somebody out, and a control that needs one fails
              closed on the day it does not load. */}
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
                <path
                  d="M9 10h8m0 0-2.6-2.6M17 10l-2.6 2.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.srOnly}>{t('signOut')}</span>
            </button>
          </form>
        </div>
      </header>

      {children}

      {/* Two columns, and they are two because they answer two different
          questions: what else this company builds, and what it does with your
          data. `SITE-006` §3 asks that the legal pages sit in a row of their
          own rather than folded in among the product links, and a column is
          that row — a reader looking for the notice should not have to read
          past six product names to find it.

          The notice is reachable from inside the hall as well as from the
          sign-in page (`LEGAL-SG-001/T2`): somebody deciding whether to accept
          an invitation reads it before they have an account, and somebody who
          already has one reads it while signed in. A notice they would have to
          sign out to find is one they do not read.

          **Only pages that exist are linked.** `SITE-006/T1` adds the cookie
          and terms pages; until it does they are absent rather than present and
          answering the not-found page, which is a link a reader tries twice. */}
      <footer className={styles.footer}>
        <div className={styles.footerColumns}>
          <nav className={styles.footerColumn} aria-labelledby="foot-eco">
            <h2 id="foot-eco" className={styles.footerHeading}>
              {t('footer.ecosystem')}
            </h2>
            <ul className={styles.footerList}>
              {ECOSYSTEM.map((product) => (
                <li key={product.href}>
                  {/* `noreferrer` with `noopener`: these are the company's own
                      sites and the second is the one that matters, but sending
                      the hall's URL as a referrer to anything says which
                      surface a reader came from. */}
                  <a
                    className={`${styles.footerLink} ${styles.footerProduct}`}
                    href={product.href}
                    rel="noopener noreferrer"
                  >
                    {/* Decorative: the name is beside it, and a screen reader
                        that read both would say the product twice. */}
                    <img src={product.mark} alt="" className={styles.footerMark} width={18} height={18} />
                    {product.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.footerColumn} aria-labelledby="foot-legal">
            <h2 id="foot-legal" className={styles.footerHeading}>
              {t('footer.policies')}
            </h2>
            <ul className={styles.footerList}>
              <li>
                <a className={styles.footerLink} href="/privacy">
                  {privacy('link')}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className={styles.footerRights}>{t('footer.rights')}</p>
      </footer>
    </div>
  );
}
