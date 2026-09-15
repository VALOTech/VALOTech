/* VALO Tech — the legal pages' behaviour (`SITE-006`).

   The gateway's own script is not loaded here. `site.js` drives chips, orbit
   stages, the mapping stage and the investor gate, and it titles the document
   from `hero.h1`; on a page that has none of those it would do nothing except
   put the homepage's headline in the tab. What a legal page needs is the
   twenty-locale swap and nothing else, which is this file.

   Two dictionaries are read, not one. `assets/i18n.js` carries the engine — the
   locale list, the right-to-left set, the BCP 47 tags and the negotiation rule —
   and the chrome words these pages share with the footer, so `Privacy` is
   translated once for the whole site rather than once per page that prints it.
   `assets/legal-i18n.js` carries the pages' own copy, and it is a second
   catalogue rather than more keys in the first because the first is loaded by
   the homepage: forty-nine keys of legal prose in twenty languages on the
   critical path of a page nobody opened to read them is a cost paid by every
   visitor for the few who follow the link. Here the order is reversed and both
   are worth fetching, because this is the page they came for. */
(function (w) {
  "use strict";

  var doc = w.document,
    root = doc.documentElement;
  var I = w.VALO_I18N,
    L = w.VALO_LEGAL;

  if (!I || !L) return;

  var LANG_KEY = "valotech-lang";

  /* The page's own copy wins, then the site's, then English. A key present in
     neither is returned as itself rather than as an empty node: a raw key on
     screen is a visible defect somebody reports, and a blank is one nobody
     sees (`I18N-R04`). */
  function tr(loc, key) {
    var page = L.dict[loc],
      site = I.dict[loc];
    if (page && page[key] != null) return page[key];
    if (site && site[key] != null) return site[key];
    if (L.dict.en[key] != null) return L.dict.en[key];
    return I.dict.en[key] != null ? I.dict.en[key] : key;
  }

  /* The same key and the same precedence as the homepage, so a language chosen
     there is the language a legal page opens in. */
  function currentLang() {
    var saved = null;
    try {
      saved = localStorage.getItem(LANG_KEY);
    } catch (e) {}
    if (saved && I.locales.indexOf(saved) >= 0) return saved;
    return I.match(w.navigator.languages || [w.navigator.language || "en"]);
  }

  function apply(loc) {
    root.setAttribute("lang", I.bcp47[loc] || loc);
    root.setAttribute("dir", I.rtl.indexOf(loc) >= 0 ? "rtl" : "ltr");

    doc.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = tr(loc, el.getAttribute("data-i18n"));
    });
    doc.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = tr(loc, el.getAttribute("data-i18n-html"));
    });
    doc.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", tr(loc, el.getAttribute("data-i18n-aria")));
    });

    /* Each page names its own heading key, so the tab says which legal page is
       open rather than which company it belongs to. */
    var key = doc.body.getAttribute("data-legal-title");
    if (key) doc.title = tr(loc, key) + " | VALO Tech";
  }

  apply(currentLang());
})(window);
