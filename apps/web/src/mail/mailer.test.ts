/**
 * The message composer (`MAIL-001/T1`). Pure — no port, no network — because the
 * property under test is that a preview and a send are the same bytes: the text
 * half is the body as written, and the HTML half is that same body escaped and
 * paragraphed, inventing no structure the author did not write and letting no
 * character through that a mail client would read as markup.
 */

import { describe, expect, it } from 'vitest';

import { compose } from './mailer';

describe('compose (MAIL-001/T1)', () => {
  it('passes the subject through unchanged', () => {
    expect(compose('Q3 is live', 'body').subject).toBe('Q3 is live');
  });

  it('keeps the plain-text half the body verbatim — it is what a plain-text client shows', () => {
    const body = 'Dear investor,\n\nThe Q3 report is available.\n\nBest,\nThe team';
    expect(compose('subject', body).text).toBe(body);
  });

  it('escapes the characters a mail client would read as markup', () => {
    const { html } = compose('subject', 'A & B <script>alert("x")</script> it\'s here');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });

  it('splits the HTML into a paragraph per blank-line-separated block', () => {
    const { html } = compose('subject', 'First paragraph.\n\nSecond paragraph.');
    expect(html).toBe('<p>First paragraph.</p>\n<p>Second paragraph.</p>');
  });

  it('turns a single newline inside a paragraph into a line break', () => {
    const { html } = compose('subject', 'Line one\nLine two');
    expect(html).toBe('<p>Line one<br>\nLine two</p>');
  });

  it('renders an empty or whitespace-only body as no HTML rather than an empty paragraph', () => {
    expect(compose('subject', '').html).toBe('');
    expect(compose('subject', '   \n\n  \t ').html).toBe('');
  });

  it('generates both halves from the one source, so neither is an afterthought', () => {
    const body = 'One.\n\nTwo.';
    const message = compose('s', body);
    expect(message.text).toBe(body);
    expect(message.html).toBe('<p>One.</p>\n<p>Two.</p>');
  });
});
