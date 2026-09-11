import { describe, expect, it } from 'vitest';

import { bcp47, DEFAULT_LOCALE, dir, isLocale, isRtl, LOCALES, negotiate, resolveLocale } from './locales';

describe('negotiate', () => {
  it('takes the first Accept-Language tag we carry, by base subtag', () => {
    expect(negotiate('en-US,en;q=0.9')).toBe('en');
    expect(negotiate('vi-VN,vi;q=0.9,en;q=0.8')).toBe('vi');
    expect(negotiate('de')).toBe('de');
  });

  it('splits Chinese into its scripts the way the gateway does', () => {
    expect(negotiate('zh-CN')).toBe('zh');
    expect(negotiate('zh')).toBe('zh');
    expect(negotiate('zh-TW')).toBe('zt');
    expect(negotiate('zh-Hant')).toBe('zt');
    expect(negotiate('zh-HK')).toBe('zt');
    expect(negotiate('zh-MO')).toBe('zt');
  });

  it('answers Filipino to both fil and tl', () => {
    expect(negotiate('fil-PH')).toBe('tl');
    expect(negotiate('tl')).toBe('tl');
  });

  it('skips tags it does not carry and takes the first it does', () => {
    expect(negotiate('xx-YY,fr;q=0.9')).toBe('fr');
  });

  it('falls back to English for an absent or unmatched header', () => {
    expect(negotiate(null)).toBe(DEFAULT_LOCALE);
    expect(negotiate('')).toBe(DEFAULT_LOCALE);
    expect(negotiate('xx-YY,zz')).toBe(DEFAULT_LOCALE);
  });

  it('is not misled by a quality value or surrounding spaces', () => {
    expect(negotiate('ar;q=0.2, en;q=0.1')).toBe('ar');
  });
});

describe('resolveLocale', () => {
  it('honours a cookie that names a locale we carry, over the header', () => {
    expect(resolveLocale('ja', 'en-US')).toBe('ja');
  });

  it('ignores a cookie naming one we do not, and negotiates the header', () => {
    expect(resolveLocale('xx', 'vi-VN')).toBe('vi');
  });

  it('negotiates the header when there is no cookie', () => {
    expect(resolveLocale(undefined, 'ko')).toBe('ko');
    expect(resolveLocale(undefined, null)).toBe(DEFAULT_LOCALE);
  });
});

describe('locale facts', () => {
  it('carries exactly the twenty ecosystem locales, none repeated', () => {
    expect(LOCALES).toHaveLength(20);
    expect(new Set(LOCALES).size).toBe(20);
  });

  it('knows which locales it carries', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('zt')).toBe(true);
    expect(isLocale('xx')).toBe(false);
  });

  it('marks only Arabic and Urdu right to left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(dir('ar')).toBe('rtl');
    expect(dir('en')).toBe('ltr');
    expect(dir('vi')).toBe('ltr');
  });

  it('advertises the BCP-47 tag each locale actually has', () => {
    expect(bcp47('en')).toBe('en');
    expect(bcp47('zh')).toBe('zh-Hans');
    expect(bcp47('zt')).toBe('zh-Hant');
    expect(bcp47('tl')).toBe('fil');
  });
});
