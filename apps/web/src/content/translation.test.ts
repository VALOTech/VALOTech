/**
 * Turning a block into the strings a translator replaces, and back
 * (`CMS-005/T4`). Pure: no database, no screen.
 *
 * The claim that matters most is about **marks**. A translation replaces a whole
 * string at once, so the offsets a mark stores cannot survive being carried
 * across — and `marks.ts:remapMarks`, which is right under a cursor, reads a
 * wholesale replacement as one edited run and grows every mark to cover it. A
 * link over two English words would become a link over the whole translated
 * paragraph. So a marked span is offered as its own field and the offsets are
 * rebuilt from the pieces, which is what keeps emphasis on the words that carry
 * it.
 *
 * The second claim is the **round trip**: a block's fields, put back unchanged,
 * are that block. That is what fails the moment the two walks disagree about
 * order, which is the one way position-as-key can break.
 */

import { describe, expect, it } from 'vitest';

import type { Block } from './blocks';
import { validateBlocks } from './blocks';
import { fieldsOf, translated } from './translation';

const EVERY_SHAPE: Block[] = [
  { type: 'heading', level: 2, text: 'This quarter' },
  { type: 'heading', level: 3, text: 'Aside', context: 'say this slowly' },
  {
    type: 'paragraph',
    text: 'we shipped the editor today',
    marks: [
      { start: 3, end: 10, type: 'strong' },
      { start: 15, end: 21, type: 'link', href: 'https://valotech.org' },
    ],
  },
  { type: 'list', ordered: true, items: ['first', 'second'] },
  { type: 'quote', text: 'a quote', attribution: 'someone' },
  { type: 'quote', text: 'an unattributed quote', attribution: null },
  { type: 'image', mediaId: 'a-file', alt: 'a picture', caption: 'a caption' },
  { type: 'image', mediaId: 'a-file', alt: 'a picture', caption: null },
  { type: 'figure', mediaId: 'a-chart', caption: 'a chart', data: ['10', '20'] },
  { type: 'figure', mediaId: 'a-chart', caption: null, data: ['30'] },
  { type: 'divider' },
];

/** The values a block currently holds, in the order the screen shows them. */
const valuesOf = (block: Block): string[] => fieldsOf(block).map((field) => field.value);

describe('fieldsOf and translated (CMS-005/T4)', () => {
  describe('the round trip', () => {
    it.each(EVERY_SHAPE.map((block) => [block.type, block] as const))(
      'puts a %s back exactly as it was',
      (_type, block) => {
        expect(translated(block, valuesOf(block))).toEqual(block);
      },
    );
  });

  describe('what a translator is offered', () => {
    it('names every string by what it is in the document', () => {
      expect(fieldsOf(EVERY_SHAPE[0] as Block).map((field) => field.label)).toEqual(['Heading']);
      expect(fieldsOf(EVERY_SHAPE[1] as Block).map((field) => field.label)).toEqual([
        'Heading',
        'Speaker note',
      ]);
      expect(fieldsOf(EVERY_SHAPE[3] as Block).map((field) => field.label)).toEqual([
        'List item 1',
        'List item 2',
      ]);
      expect(fieldsOf(EVERY_SHAPE[8] as Block).map((field) => field.label)).toEqual([
        'Figure caption',
        'Figure value 1',
        'Figure value 2',
      ]);
    });

    it('offers nothing for a divider', () => {
      expect(fieldsOf({ type: 'divider' })).toEqual([]);
    });

    it('does not offer the file an image names, which a translation must not change', () => {
      const image: Block = { type: 'image', mediaId: 'a-file', alt: 'a picture', caption: 'a caption' };

      expect(valuesOf(image)).toEqual(['a picture', 'a caption']);
      expect(translated(image, ['ảnh', 'chú thích'])).toEqual({
        type: 'image',
        mediaId: 'a-file',
        alt: 'ảnh',
        caption: 'chú thích',
      });
    });

    it('cuts a paragraph at its mark boundaries, naming what each piece carries', () => {
      const paragraph = EVERY_SHAPE[2] as Block;

      expect(fieldsOf(paragraph)).toEqual([
        { label: 'Paragraph', value: 'we ', long: true },
        { label: 'Paragraph (bold)', value: 'shipped', long: true },
        { label: 'Paragraph', value: ' the ', long: true },
        { label: 'Paragraph (link)', value: 'editor', long: true },
        { label: 'Paragraph', value: ' today', long: true },
      ]);
    });

    it('names a piece that two marks cover, so a linked phrase inside a bold one is visible', () => {
      const paragraph: Block = {
        type: 'paragraph',
        text: 'read the report now',
        marks: [
          { start: 0, end: 15, type: 'strong' },
          { start: 9, end: 15, type: 'link', href: 'https://valotech.org' },
        ],
      };

      expect(fieldsOf(paragraph).map((field) => field.label)).toEqual([
        'Paragraph (bold)',
        'Paragraph (bold, link)',
        'Paragraph',
      ]);
    });
  });

  describe('what happens to the marks', () => {
    it('keeps a link on the words it was on, whatever length they become', () => {
      const paragraph = EVERY_SHAPE[2] as Block;

      const result = translated(paragraph, ['chúng tôi ', 'đã phát hành', ' trình ', 'soạn thảo', ' hôm nay']);

      expect(result).toEqual({
        type: 'paragraph',
        text: 'chúng tôi đã phát hành trình soạn thảo hôm nay',
        marks: [
          { start: 10, end: 22, type: 'strong' },
          { start: 29, end: 38, type: 'link', href: 'https://valotech.org' },
        ],
      });
      // The rebuilt offsets are a valid mark set for the text they describe, so
      // the write boundary admits them without a second normalisation.
      expect(() => validateBlocks([result])).not.toThrow();
    });

    it('drops a mark whose words the translator removed', () => {
      const paragraph = EVERY_SHAPE[2] as Block;

      const result = translated(paragraph, ['chúng tôi ', '', ' trình ', 'soạn thảo', ' hôm nay']);

      expect(result).toMatchObject({
        text: 'chúng tôi  trình soạn thảo hôm nay',
        marks: [{ start: 17, end: 26, type: 'link', href: 'https://valotech.org' }],
      });
    });

    it('leaves an unmarked paragraph one field and no marks', () => {
      const plain: Block = { type: 'paragraph', text: 'just words', marks: [] };

      expect(valuesOf(plain)).toEqual(['just words']);
      expect(translated(plain, ['chỉ là chữ'])).toEqual({
        type: 'paragraph',
        text: 'chỉ là chữ',
        marks: [],
      });
    });
  });

  describe('a value list that does not match', () => {
    it('keeps what is there when a value is missing', () => {
      const list: Block = { type: 'list', ordered: false, items: ['one', 'two', 'three'] };

      expect(translated(list, ['một'])).toMatchObject({ items: ['một', 'two', 'three'] });
    });

    it('ignores a value beyond the block’s own fields', () => {
      const heading: Block = { type: 'heading', level: 2, text: 'Title' };

      expect(translated(heading, ['Tiêu đề', 'and more', 'and more'])).toEqual({
        type: 'heading',
        level: 2,
        text: 'Tiêu đề',
      });
    });
  });
});
