/**
 * The rules that turn what was written into what an item is called and where it
 * lives (`POST-001/T1`, `POST-001/T4`, `CMS-006` §6).
 *
 * Pure, so they are tested without a database and without a browser — which is
 * the whole reason they live in a module of their own rather than inside the two
 * surfaces that apply them. Both of those surfaces are client components this
 * application cannot render in a test (`environment: node`, no DOM), so a rule
 * left inside one of them would be a rule nothing could check.
 */

import { describe, expect, it } from 'vitest';

import { nextSlug, slugFrom, titleFromBody } from './derive';

describe('a title as an address (CMS-006 §6)', () => {
  it('lower-cases, hyphenates, and keeps nothing a URL would escape', () => {
    expect(slugFrom('Third Quarter 2026')).toBe('third-quarter-2026');
    expect(slugFrom('We raised! (finally)')).toBe('we-raised-finally');
    expect(slugFrom('  spaces  everywhere  ')).toBe('spaces-everywhere');
  });

  it('keeps the base letter of an accented one rather than dropping the word', () => {
    // NFKD first is what makes this work: without it the accented letter is not
    // in [a-z] and `résumé` would answer `r-sum`, losing the word to a rule
    // meant to transliterate it.
    expect(slugFrom('Résumé of the quarter')).toBe('resume-of-the-quarter');
    expect(slugFrom('Über alles')).toBe('uber-alles');
  });

  it('carries the Latin letters that do not decompose, rather than breaking them', () => {
    // These are single code points under NFKD -- letters in their own right and
    // not a base with an accent -- so the decomposition cannot help and the
    // strip would delete them. The test that only probes `é` and `ü` probes the
    // class that already worked.
    expect(slugFrom('Straße 12 office opens')).toBe('strasse-12-office-opens');
    expect(slugFrom('Đà Nẵng office')).toBe('da-nang-office');
    expect(slugFrom('Bjørn joined')).toBe('bjorn-joined');
    expect(slugFrom('Łódź update')).toBe('lodz-update');
    expect(slugFrom('Æther launch')).toBe('aether-launch');
    expect(slugFrom('Œuvre shipped')).toBe('oeuvre-shipped');
  });

  it('answers empty for a title with no letters or digits it can carry', () => {
    // Not a failure and not a transliteration this rule can honestly make. The
    // caller decides what an item with no address in its title gets called,
    // because only the caller knows what else it has.
    expect(slugFrom('第三季度进展')).toBe('');
    expect(slugFrom('!!! ???')).toBe('');
    expect(slugFrom('')).toBe('');
  });

  it('cuts a long title at a word boundary rather than mid-word', () => {
    const long = 'we are pleased to announce that the third quarter closed ahead of plan across every product';
    const slug = slugFrom(long);

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(long.replace(/ /g, '-')).toContain(slug);
    // The cut fell between words, so the address never ends in half of one.
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('we-are-pleased-to-announce-that-the-third-quarter-closed');
  });

  it('cuts a single over-long word where the bound falls, because it has no break', () => {
    const slug = slugFrom('a'.repeat(80));

    expect(slug).toBe('a'.repeat(60));
  });
});

describe('the next free address (POST-001/T1)', () => {
  it('takes the base when nothing holds it', () => {
    expect(nextSlug('we-shipped', [])).toBe('we-shipped');
    expect(nextSlug('we-shipped', ['something-else'])).toBe('we-shipped');
  });

  it('starts the sequence at two, because the first carries no suffix', () => {
    // `-1` would name a thing that does not exist and make the second look like
    // the first of a series.
    expect(nextSlug('we-shipped', ['we-shipped'])).toBe('we-shipped-2');
  });

  it('walks past every suffix already taken', () => {
    expect(nextSlug('we-shipped', ['we-shipped', 'we-shipped-2', 'we-shipped-3'])).toBe('we-shipped-4');
  });

  it('ignores a gap in the sequence rather than filling it', () => {
    // `-2` is free, so it is taken. Nothing here reserves a hole: an address is
    // an address, and two updates that began the same way are the only thing
    // this sequence is about.
    expect(nextSlug('we-shipped', ['we-shipped', 'we-shipped-3'])).toBe('we-shipped-2');
  });
});

describe('a body as a title (POST-001/T4)', () => {
  it('takes the first line that has something in it', () => {
    expect(titleFromBody('We raised a round.\n\nMore about it below.')).toBe('We raised a round.');
    expect(titleFromBody('\n\n  We raised a round.\n')).toBe('We raised a round.');
  });

  it('collapses internal whitespace, so a wrapped line does not arrive with gaps', () => {
    expect(titleFromBody('We   raised\ta round.')).toBe('We raised a round.');
  });

  it('answers empty for a body with nothing in it, which the caller refuses', () => {
    // A titleless update is not a shorter update, it is nothing, and the column
    // is `NOT NULL` precisely so that nothing cannot be stored.
    expect(titleFromBody('')).toBe('');
    expect(titleFromBody('   \n\n \t ')).toBe('');
  });

  it('cuts a long first line at a word boundary', () => {
    const first = 'w'.repeat(1) + ' ' + 'word '.repeat(40);
    const title = titleFromBody(first);

    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith(' ')).toBe(false);
    expect(title.endsWith('word')).toBe(true);
  });

  it('reads only the first line, however long the rest is', () => {
    expect(titleFromBody('Short.\n' + 'x'.repeat(500))).toBe('Short.');
  });
});
