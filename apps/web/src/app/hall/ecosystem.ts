/**
 * The six products the company builds, as the gateway's own footer lists them
 * (`docs/ECOSYSTEM.md`).
 *
 * Here rather than read from `index.html` at runtime: the gateway is a static
 * document this application also serves, and parsing it for a link set would
 * make the hall's chrome depend on the markup of a page nobody edits with that
 * in mind. The names are proper nouns and the same in every locale, so they
 * carry no dictionary key (`I18N-R01` governs prose, not names).
 */
export interface EcosystemProduct {
  readonly name: string;
  readonly href: string;
}

export const ECOSYSTEM: readonly EcosystemProduct[] = [
  { name: 'VALO Ads', href: 'https://valoads.io' },
  { name: 'VALO Pocket', href: 'https://valopocket.io' },
  { name: 'Shimmra', href: 'https://shimmra.live' },
  { name: 'Amavo', href: 'https://amavo.app' },
  { name: 'Farola', href: 'https://farola.io' },
  { name: 'Verdiq', href: 'https://verdiq.io' },
];
