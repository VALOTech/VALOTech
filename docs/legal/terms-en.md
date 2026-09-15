# `legal/terms` — the English source, for review

This is the whole of what `SITE-006`'s terms page will say. It is here rather
than in `legal/` because the page does not publish until somebody qualified has
read it ([`operator-checklist.md#TERMS-REVIEW`](../operator-checklist.md#TERMS-REVIEW)),
and `docs/` never reaches `main`, which is what GitHub Pages serves.

**What this is bounded to.** Three statements and no more: who operates the site,
what the investor hall is, and what a reader may not do with what they read
there. Two things a terms page usually carries are deliberately absent, because
both are legal choices rather than descriptions of the system — a governing-law
clause and any limitation of liability. Adding either from this side would be
guessing at a commitment, and the page is shorter than a reader expects for that
reason rather than by oversight.

**What happens after the read.** The English below is corrected, the nineteen
translations are authored from the corrected text, `legal/terms.html` is built
beside the other two pages, and the footer's legal row gains its third link. The
translations follow the review rather than preceding it, so a rewritten paragraph
is translated once.

---

## Terms of use

Who operates this site, what the investor hall is, and what you may do with what
you read here.

### Who operates this site

valotech.org is operated by VALO TECH PTE. LTD., a company registered in
Singapore. Write to hello@valotech.org.

### What this site is

A description of what the company builds. It is not an offer, an invitation or
advice of any kind, and nothing on it commits the company to providing a product
or a service.

### The investor hall

The hall is a private area for people the company has given access to. Access is
personal: it is granted to a named person, it is not to be passed on, and the
company can end it at any time.

### What you read in the hall

Reporting in the hall is confidential and is given to you for your own decisions.
It is not to be republished, forwarded or shown to anybody who has not been given
access of their own. It describes a moment, it may be superseded by a later
document, and it is not a promise about the future.

### What belongs to whom

The words, the design and the marks on this site and in the hall belong to VALO
Tech or to the companies named on them. Reading them transfers nothing.

### When these change

We rewrite them rather than adding to the bottom, so what you read is what is in
force now. The date above says when they last changed.

---

## The keys the page will use

The page is built the way `legal/privacy.html` and `legal/cookies.html` are: each
block is a node carrying a key, and `assets/legal-i18n.js` holds the twenty
locales. The mapping, so the copy above and the catalogue cannot drift apart when
the page is built:

| Key | Block |
|---|---|
| `lt.title` | Terms of use |
| `lt.lede` | The line under the heading |
| `lt.operatorTitle` · `lt.operatorBody` | Who operates this site |
| `lt.siteTitle` · `lt.siteBody` | What this site is |
| `lt.hallTitle` · `lt.hallBody` | The investor hall |
| `lt.materialTitle` · `lt.materialBody` | What you read in the hall |
| `lt.ipTitle` · `lt.ipBody` | What belongs to whom |
| `lt.changesTitle` · `lt.changesBody` | When these change |

`lt.operatorBody` carries the address as a link, the way `lp.contactBody` does on
the privacy page.
