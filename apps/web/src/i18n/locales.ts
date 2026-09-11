/**
 * The application's locale facts, in one place (`I18N-DEC-02`).
 *
 * The public gateway carries the same twenty locales in `assets/i18n.js`; this
 * module is their counterpart inside the Next application, so a reader the
 * gateway served in one language and a reader the application negotiates for
 * land on the same set and the same fallback. The order, the right-to-left pair,
 * the BCP-47 tags and the negotiation are copied from that file deliberately
 * rather than re-derived, because two spellings of "which twenty, and how a
 * browser maps onto them" would be two chances to drift apart.
 */

export const LOCALES = [
  'en', 'zh', 'zt', 'vi', 'th', 'id', 'ms', 'tl', 'hi', 'es',
  'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'ja', 'tr', 'ko',
] as const;

export type Locale = (typeof LOCALES)[number];

/** English is the source of truth and the fallback every unmatched request takes. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The cookie an in-application language choice is remembered in. `NEXT_LOCALE`
 * is next-intl's own convention; reading it here is what lets a later language
 * switcher persist a choice without this module changing. When it is absent —
 * and the gateway records its own choice in `localStorage`, which a server
 * render cannot read — the negotiation below takes over.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** The two locales written right to left, which set `dir` on the document. */
const RTL: ReadonlySet<Locale> = new Set(['ar', 'ur']);

/**
 * The BCP-47 tag each locale advertises on `<html lang>`. Most are the locale
 * itself; Chinese is split into its two scripts because `zh` alone tells a
 * screen reader or a search index nothing about which one, and `tl` is served
 * under `fil`, the tag the language actually carries.
 */
const BCP47: Record<Locale, string> = {
  en: 'en', zh: 'zh-Hans', zt: 'zh-Hant', vi: 'vi', th: 'th',
  id: 'id', ms: 'ms', tl: 'fil', hi: 'hi', es: 'es',
  ar: 'ar', fr: 'fr', bn: 'bn', pt: 'pt', ru: 'ru',
  ur: 'ur', de: 'de', ja: 'ja', tr: 'tr', ko: 'ko',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return RTL.has(locale);
}

export function dir(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

export function bcp47(locale: Locale): string {
  return BCP47[locale];
}

/**
 * The locale an `Accept-Language` header asks for, or the default when it asks
 * for none we carry.
 *
 * The logic mirrors the gateway's `match()` so the two surfaces resolve a
 * browser identically: a Chinese tag resolves to Traditional only when it names
 * a Traditional script or region (`hant`, `tw`, `hk`, `mo`) and to Simplified
 * otherwise, Filipino answers to both `fil` and `tl`, and any other tag matches
 * on its base subtag. Quality values already order the header, so the first tag
 * we carry wins.
 */
export function negotiate(acceptLanguage: string | null): Locale {
  if (acceptLanguage === null) {
    return DEFAULT_LOCALE;
  }

  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag === '') {
      continue;
    }

    const base = tag.split('-')[0] ?? '';

    if (base === 'zh') {
      return tag.includes('hant') || tag.includes('tw') || tag.includes('hk') || tag.includes('mo') ? 'zt' : 'zh';
    }
    if (base === 'fil' || base === 'tl') {
      return 'tl';
    }
    if (isLocale(base)) {
      return base;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * The locale a request is served in: a remembered choice when the cookie holds
 * one we carry, otherwise what the browser's `Accept-Language` negotiates. The
 * cookie wins because it is an explicit choice and the header is only a default.
 */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (cookieValue !== undefined && isLocale(cookieValue)) {
    return cookieValue;
  }
  return negotiate(acceptLanguage);
}
