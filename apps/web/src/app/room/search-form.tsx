import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { CONTENT_TYPES, CONTENT_UPDATE_KINDS, PORTFOLIO_PRODUCTS } from '../../db/types';
import { PRODUCT_LABEL } from '../../portfolio/labels';

import styles from './room.module.css';
import type { RoomQuery } from './query';

/**
 * The field and its filters, above the stream (`CMS-007/T3`, `CMS-007/T6`).
 *
 * **A plain GET form.** The narrowing lives in the URL, so a reader can send a
 * colleague what they are looking at, the back button undoes a filter, and the
 * whole control works with no script at all — which matters more here than
 * anywhere else in the room, because a search that needs JavaScript is a search
 * that fails silently on the day the bundle does not load.
 *
 * **Every control carries its own label** (`A11Y-R02`), and the labels are real
 * `label` elements rather than placeholders: a placeholder disappears the moment
 * somebody types, which is exactly when a person who lost their place needs to
 * read it. The placeholder is used for the one thing a label cannot say — that
 * the search runs over the authored text rather than the reader's own language
 * (`CMS-007` §3), which is a limitation better stated than inferred from an
 * empty result.
 *
 * The filter vocabularies are the closed ones the schema holds, mapped by key
 * rather than listed here, so a fifth kind or a seventh product stops the build
 * rather than quietly missing from the control.
 */
export async function SearchForm({ current }: { readonly current: RoomQuery }): Promise<ReactElement> {
  const t = await getTranslations('room');

  return (
    <form method="get" action="/room" className={styles.search} role="search">
      <div className={styles.searchField}>
        <label htmlFor="room-q" className={styles.searchLabel}>
          {t('search.label')}
        </label>
        <input
          id="room-q"
          name="q"
          type="search"
          defaultValue={current.q}
          placeholder={t('search.placeholder')}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.searchFilters}>
        <div className={styles.searchField}>
          <label htmlFor="room-type" className={styles.searchLabel}>
            {t('search.type')}
          </label>
          <select id="room-type" name="type" defaultValue={current.type ?? ''} className={styles.searchSelect}>
            <option value="">{t('search.any')}</option>
            {CONTENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`search.typeValue.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.searchField}>
          <label htmlFor="room-kind" className={styles.searchLabel}>
            {t('search.kind')}
          </label>
          <select id="room-kind" name="kind" defaultValue={current.kind ?? ''} className={styles.searchSelect}>
            <option value="">{t('search.any')}</option>
            {CONTENT_UPDATE_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`search.kindValue.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.searchField}>
          <label htmlFor="room-product" className={styles.searchLabel}>
            {t('search.product')}
          </label>
          {/* A product's name is a proper noun and is the same in every locale,
              so these come from the one label map rather than the catalogue. */}
          <select id="room-product" name="product" defaultValue={current.product ?? ''} className={styles.searchSelect}>
            <option value="">{t('search.any')}</option>
            {PORTFOLIO_PRODUCTS.map((value) => (
              <option key={value} value={value}>
                {PRODUCT_LABEL[value]}
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
            defaultValue={current.period ?? ''}
            placeholder={t('search.periodPlaceholder')}
            className={styles.searchInput}
          />
        </div>

        <button type="submit" className={styles.searchSubmit}>
          {t('search.submit')}
        </button>
      </div>
    </form>
  );
}
