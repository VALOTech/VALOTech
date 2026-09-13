/**
 * The blocks, as a reader sees them (`CMS-004/T1`). Pure: rendered to a string,
 * with no database and no browser.
 *
 * This is the renderer every reading surface goes through, so the assertions are
 * about the markup a reader's browser actually receives. The two that carry the
 * most weight are about **marks** and about **alternative text**.
 *
 * Marks are offsets rather than nesting, and they may overlap. A link inside a
 * bold phrase has to render as both without either mark knowing about the other,
 * and a mark ending mid-sentence has to stop there — which is the case a
 * renderer that wrapped whole paragraphs would get wrong and nobody would notice
 * until an investor read a paragraph that was entirely a hyperlink.
 *
 * An image's alternative text reaches the `alt` attribute, because a document
 * that refuses to save without it (`CMS-002/T3`) and then drops it on the way
 * out has spent the author's effort on nothing (`A11Y-R02`).
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Block } from './blocks';
import { RenderedBlocks } from './render';

const html = (blocks: Block[]): string => renderToStaticMarkup(RenderedBlocks({ blocks }));

describe('RenderedBlocks (CMS-004/T1)', () => {
  describe('headings', () => {
    it('renders its level, and never the speaker note', () => {
      expect(html([{ type: 'heading', level: 2, text: 'This quarter' }])).toBe('<h2>This quarter</h2>');
      expect(html([{ type: 'heading', level: 3, text: 'An aside' }])).toBe('<h3>An aside</h3>');
      // The note is for whoever presents a deck (`DECK-001/T5`), not for a reader.
      expect(html([{ type: 'heading', level: 2, text: 'Said', context: 'say this slowly' }])).not.toContain(
        'slowly',
      );
    });
  });

  describe('paragraphs and their marks', () => {
    it('renders plain text with no wrapper of its own', () => {
      expect(html([{ type: 'paragraph', text: 'just words', marks: [] }])).toContain('just words');
    });

    it('emphasises only the words the mark covers', () => {
      const rendered = html([
        {
          type: 'paragraph',
          text: 'we shipped the editor',
          marks: [{ start: 3, end: 10, type: 'strong' }],
        },
      ]);

      expect(rendered).toContain('<strong>shipped</strong>');
      expect(rendered).not.toContain('<strong>we shipped the editor</strong>');
    });

    it('renders a link with its target and no referrer', () => {
      const rendered = html([
        {
          type: 'paragraph',
          text: 'read the report',
          marks: [{ start: 9, end: 15, type: 'link', href: 'https://valotech.org' }],
        },
      ]);

      expect(rendered).toContain('<a href="https://valotech.org" rel="noreferrer">report</a>');
    });

    it('renders a link inside a bold phrase as both, with neither swallowing the other', () => {
      const rendered = html([
        {
          type: 'paragraph',
          text: 'read the report now',
          marks: [
            { start: 0, end: 15, type: 'strong' },
            { start: 9, end: 15, type: 'link', href: 'https://valotech.org' },
          ],
        },
      ]);

      // The overlap is one run under both marks; the words outside it carry only
      // the mark that reaches them.
      expect(rendered).toContain('<strong>read the </strong>');
      // The overlapping run carries both, nested; which is outermost does not
      // matter to a reader, and that it stops at the mark boundary does.
      expect(rendered).toContain(
        '<a href="https://valotech.org" rel="noreferrer"><strong>report</strong></a>',
      );
      expect(rendered).toContain('now');
      expect(rendered).not.toContain('report now</a>');
    });

    it('renders italic and code as their own elements', () => {
      const rendered = html([
        {
          type: 'paragraph',
          text: 'an aside and a value',
          marks: [
            { start: 3, end: 8, type: 'em' },
            { start: 15, end: 20, type: 'code' },
          ],
        },
      ]);

      expect(rendered).toContain('<em>aside</em>');
      expect(rendered).toContain('<code>value</code>');
    });
  });

  describe('lists and quotes', () => {
    it('renders an ordered list as one and an unordered list as the other', () => {
      expect(html([{ type: 'list', ordered: true, items: ['one', 'two'] }])).toBe(
        '<ol><li>one</li><li>two</li></ol>',
      );
      expect(html([{ type: 'list', ordered: false, items: ['one'] }])).toBe('<ul><li>one</li></ul>');
    });

    it('renders a quote with its attribution, and without one when there is none', () => {
      expect(html([{ type: 'quote', text: 'a quote', attribution: 'someone' }])).toContain(
        '<footer>someone</footer>',
      );
      expect(html([{ type: 'quote', text: 'a quote', attribution: null }])).not.toContain('<footer>');
    });
  });

  describe('the two that carry a file', () => {
    it('renders an image from the media route, carrying its alternative text', () => {
      const rendered = html([
        { type: 'image', mediaId: 'a-file', alt: 'a chart of revenue', caption: 'Revenue' },
      ]);

      expect(rendered).toContain('src="/media/a-file"');
      expect(rendered).toContain('alt="a chart of revenue"');
      expect(rendered).toContain('<figcaption>Revenue</figcaption>');
    });

    it('renders a figure’s numbers as a table, so a screen reader can read them', () => {
      const rendered = html([
        { type: 'figure', mediaId: 'a-chart', caption: 'Quarterly', data: ['10', '20'] },
      ]);

      expect(rendered).toContain('<figcaption>Quarterly</figcaption>');
      expect(rendered).toContain('<td>10</td>');
      expect(rendered).toContain('<td>20</td>');
    });
  });

  describe('the document as a whole', () => {
    it('renders every block in the order it was written', () => {
      const rendered = html([
        { type: 'heading', level: 2, text: 'First' },
        { type: 'paragraph', text: 'Second', marks: [] },
        { type: 'divider' },
      ]);

      expect(rendered.indexOf('First')).toBeLessThan(rendered.indexOf('Second'));
      expect(rendered).toContain('<hr/>');
    });

    it('renders nothing at all for an empty document', () => {
      expect(html([])).toBe('');
    });
  });
});
