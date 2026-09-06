# VALO Tech — brand

The identity of the **parent company**, not of a product. Each of the six
products carries its own kit in its own repository — VALO Ads' Aurora, VALO
Pocket's Verdant, Shimmra's Halo, Amavo's Ember, Farola's Beacon, Verdiq's
Sterling. This one is the mark they all sit under, and the design language of
the surface that introduces them: **Gateway**.

## Gateway

Deep space with condensed display type and glass panels held in a planet's
orbit. One theme, dark, because everything in it is lit — there is no light
variant and the three-way toggle that once offered one was removed rather than
maintained as a half-truth.

The reasoning behind every decision in it — why the world is sized from the
frame rather than capped in pixels, why a label opens away from the disc, why
the sky carries a colour temperature — is in
[docs/design-gateway.md](../docs/design-gateway.md). That file is the record;
this directory is the interface to it.

## Contents

| File | What it is |
|---|---|
| `tokens.css` | The design tokens as custom properties, ready to import |
| `tokens.json` | The same values as data, for anything that is not CSS |
| `GUIDELINES.md` | How the mark and the palette are used, and how they are not |

The marks themselves live where the site loads them from, because the site is
the deployed artifact and a second copy would go stale:
`assets/valo-symbol-white.png`, `assets/valo-symbol-teal.png`,
`assets/favicon.ico` and its sizes, `assets/apple-touch-icon.png`,
`assets/icon-512.png`, and the social card at `assets/og-cover.png` generated
from `assets/og.html`.

## Where the values come from

`tokens.css` and `tokens.json` are **extracted from `assets/site.css`**, which is
what the live page actually uses. They are not a parallel definition: a token
that disagrees with the stylesheet is a token that is wrong, and the stylesheet
wins. Regenerate them when the `:root` block changes, in the same commit.
