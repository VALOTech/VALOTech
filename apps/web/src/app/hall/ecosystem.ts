/**
 * The six products the company builds, as the gateway's own footer lists them
 * (`docs/ECOSYSTEM.md`).
 *
 * Here rather than read from `index.html` at runtime: the gateway is a static
 * document this application also serves, and parsing it for a link set would
 * make the hall's chrome depend on the markup of a page nobody edits with that
 * in mind. The names are proper nouns and the same in every locale, so they
 * carry no dictionary key (`I18N-R01` governs prose, not names).
 *
 * **The mark, not the lockup.** Each product's repository ships several forms;
 * the one taken here is `*-mark.svg`, which is the symbol alone. The `*-logo-*`
 * files are lockups that already contain the product's name and a tagline, and
 * they draw that name with `<text>` in a font the visitor may not have — so
 * beside a name of our own they would say it twice, in a typeface that changes
 * from machine to machine.
 *
 * Copied into `public/` rather than linked from each product's own domain: the
 * Content-Security-Policy admits images from `'self'` and `data:` only, so a
 * remote logo would be blocked and the footer would show six broken frames. The
 * copy is a copy and will not follow a rebrand on its own, which is the cost of
 * serving it from here.
 */
export interface EcosystemProduct {
  readonly name: string;
  readonly href: string;
  /** The product's own symbol, served from this origin. */
  readonly mark: string;
}

export const ECOSYSTEM: readonly EcosystemProduct[] = [
  { name: 'VALO Ads', href: 'https://valoads.io', mark: '/ecosystem/valo-ads.svg' },
  { name: 'VALO Pocket', href: 'https://valopocket.io', mark: '/ecosystem/valo-pocket.svg' },
  { name: 'Shimmra', href: 'https://shimmra.live', mark: '/ecosystem/shimmra.svg' },
  { name: 'Amavo', href: 'https://amavo.app', mark: '/ecosystem/amavo.svg' },
  { name: 'Farola', href: 'https://farola.io', mark: '/ecosystem/farola.svg' },
  { name: 'Verdiq', href: 'https://verdiq.io', mark: '/ecosystem/verdiq.svg' },
];
