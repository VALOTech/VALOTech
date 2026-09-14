'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { CONTENT_TYPES, CONTENT_UPDATE_KINDS, PORTFOLIO_PRODUCTS } from '../../db/types';
import { PRODUCT_LABEL } from '../../portfolio/labels';

import styles from './room.module.css';

/**
 * The room's search, as a control on the chrome (`CMS-007/T3`, `CMS-007/T6`).
 *
 * **It lives in the header so it follows the reader.** Looking something up is
 * a thing an investor does from wherever they are, and a field that sits on one
 * page is one they navigate back to before they can use it.
 *
 * **A `details` disclosure, not a scripted menu.** Opening and closing is the
 * element's own behaviour: it works with the keyboard, it is announced as
 * expanded or collapsed, and it survives a page where script never loads.
 * Inside it, a plain GET form — the narrowing lives in the URL, so it can be
 * sent to a colleague and the back button undoes it.
 *
 * **A client component for one reason: the current query.** A layout is handed
 * no `searchParams`, so a field rendered in the chrome cannot be filled from
 * the server with what the reader last asked for — and a search box that
 * forgets the search is one that has to be retyped to be corrected. It reads
 * the raw values only to prefill; every value is validated again on the server
 * against its closed vocabulary before it reaches a statement.
 *
 * It imports its labels and its two vocabularies and nothing else. A client
 * component that imports a value from a module reaching the database drags the
 * driver into the browser bundle, and neither the type-checker nor the test run
 * sees it — only the build does.
 */
export function SearchForm(): ReactElement {
  const t = useTranslations('room');
  const params = useSearchParams();
  const value = (name: string): string => params.get(name) ?? '';
  const narrowed = ['q', 'type', 'kind', 'product', 'period'].some((name) => value(name) !== '');

  return (
    <details className={styles.searchDisclosure} open={narrowed}>
      {/* An icon with its name beside it, hidden from sight and not from a
          screen reader: an icon-only control is a guess for anybody who does
          not already know what the glyph means (`A11Y-R02`). */}
      <summary className={styles.searchToggle}>
        <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13.2 13.2 17.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className={styles.srOnly}>{t('search.label')}</span>
      </summary>

      <form method="get" action="/room" className={styles.search} role="search">
        <div className={styles.searchField}>
          <label htmlFor="room-q" className={styles.searchLabel}>
            {t('search.label')}
          </label>
          <input
            id="room-q"
            name="q"
            type="search"
            defaultValue={value('q')}
            placeholder={t('search.placeholder')}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.searchFilters}>
          <div className={styles.searchField}>
            <label htmlFor="room-type" className={styles.searchLabel}>
              {t('search.type')}
            </label>
            <select id="room-type" name="type" defaultValue={value('type')} className={styles.searchSelect}>
              <option value="">{t('search.any')}</option>
              {CONTENT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`search.typeValue.${item}`)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchField}>
            <label htmlFor="room-kind" className={styles.searchLabel}>
              {t('search.kind')}
            </label>
            <select id="room-kind" name="kind" defaultValue={value('kind')} className={styles.searchSelect}>
              <option value="">{t('search.any')}</option>
              {CONTENT_UPDATE_KINDS.map((item) => (
                <option key={item} value={item}>
                  {t(`search.kindValue.${item}`)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchField}>
            <label htmlFor="room-product" className={styles.searchLabel}>
              {t('search.product')}
            </label>
            {/* A product's name is a proper noun and is the same in every
                locale, so these come from the one label map. */}
            <select id="room-product" name="product" defaultValue={value('product')} className={styles.searchSelect}>
              <option value="">{t('search.any')}</option>
              {PORTFOLIO_PRODUCTS.map((item) => (
                <option key={item} value={item}>
                  {PRODUCT_LABEL[item]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchField}>
            <label htmlFor="room-period" className={styles.searchLabel}>
              {t('search.period')}
            </label>
            <input
              id="room-period"
              name="period"
              type="text"
              defaultValue={value('period')}
              placeholder={t('search.periodPlaceholder')}
              className={styles.searchInput}
            />
          </div>

          <button type="submit" className={styles.searchSubmit}>
            {t('search.submit')}
          </button>
        </div>
      </form>
    </details>
  );
}
