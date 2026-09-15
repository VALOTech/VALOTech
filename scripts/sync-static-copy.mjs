#!/usr/bin/env node
/* Write the English dictionaries into the served markup.
 *
 * site.js swaps every [data-i18n] node on load, so the markup only ever needed a
 * key. But a reader without JavaScript - a crawler that does not execute it, a
 * social-card scraper, a printed page, a text browser - then gets headings with
 * no body under them. English is the source of truth, so the markup is generated
 * from it rather than maintained beside it.
 *
 * Four pages and two dictionaries. index.html and 404.html read assets/i18n.js;
 * the legal pages read that one for the chrome they share with the footer and
 * assets/legal-i18n.js for their own copy, so `Privacy` is translated once for
 * the whole site rather than once per page that prints it. Both dictionaries are
 * held to the same parity rule, because a locale missing a key falls back to
 * English silently and the page that does it is the one whose whole job is to be
 * understood.
 *
 *   node scripts/sync-static-copy.mjs           write the four pages
 *   node scripts/sync-static-copy.mjs --check   exit 1 if any would change
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "index.html");
const notFoundPath = join(root, "404.html");

const shim = { window: {} };
new Function("window", readFileSync(join(root, "assets/i18n.js"), "utf8"))(shim.window);
new Function("window", readFileSync(join(root, "assets/legal-i18n.js"), "utf8"))(shim.window);
const I = shim.window.VALO_I18N;
const L = shim.window.VALO_LEGAL;
const en = I.dict.en;

/* What a legal page resolves a key against, in the order legal.js resolves it at
   runtime: the page's own copy first, the site's chrome behind it. Written as one
   object rather than two lookups so the generator and the browser cannot disagree
   about precedence. */
const legalEn = Object.assign({}, en, L.dict.en);

/* Each legal page, the key its <title> is built from, and the number of localized
   nodes it carries. The count is here for index.html's reason: a node that stops
   matching the scanner would otherwise vanish without a sound. */
const LEGAL_PAGES = [
  { path: "legal/privacy.html", titleKey: "lp.title", nodes: 22 },
  { path: "legal/cookies.html", titleKey: "lc.title", nodes: 51 }
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* A node that stops matching the scanner would otherwise vanish without a sound. */
const EXPECTED_NODES = 257;

/* Nothing else enforces that the twenty dictionaries carry the same keys, and a
   locale missing one silently falls back to English at runtime. Both catalogues
   are held to it: a legal page is the last surface where an English sentence
   among nineteen translated ones is acceptable. */
function parityOf(name, dict) {
  const enKeys = Object.keys(dict.en);
  const broken = [];
  for (const loc of I.locales) {
    const d = dict[loc];
    if (!d) { broken.push(`${loc}: no dictionary`); continue; }
    const missing = enKeys.filter((k) => !(k in d));
    const extra = Object.keys(d).filter((k) => !(k in dict.en));
    const blank = enKeys.filter((k) => typeof d[k] === "string" && !d[k].trim());
    if (missing.length) broken.push(`${loc}: missing ${missing.join(", ")}`);
    if (extra.length) broken.push(`${loc}: unknown ${extra.join(", ")}`);
    if (blank.length) broken.push(`${loc}: blank ${blank.join(", ")}`);
  }
  if (broken.length) {
    console.error(`${name} locale parity is broken:\n  ` + broken.join("\n  "));
    process.exit(1);
  }
}
parityOf("assets/i18n.js", I.dict);
parityOf("assets/legal-i18n.js", L.dict);

const attrs = `(?:"[^"]*"|'[^']*'|[^>"'])`;
const open = new RegExp(`<([a-zA-Z][\\w-]*)((?:${attrs})*?\\bdata-i18n(-html)?=(?:"([^"]+)"|'([^']+)')(?:${attrs})*)>`, "g");
const ariaRe = new RegExp(`(<[a-zA-Z][\\w-]*(?:${attrs})*?\\bdata-i18n-aria=(?:"([^"]+)"|'([^']+)')(?:${attrs})*>)`, "g");

/* One page, one dictionary: the English written in, the nodes counted, and every
   key the markup asks for that the dictionary does not carry. Four pages run
   through it so a rule tightened here tightens everywhere -- the nesting refusal
   below caught a real mistake once, and a second copy of this loop is a second
   place for it to be absent. */
function fillPage(source, dict) {
  let out = "", cursor = 0, filled = 0;
  const missing = [];

  for (const m of source.matchAll(open)) {
    const [full, tag, , isHtml, dq, sq] = m;
    const key = dq ?? sq;
    const contentStart = m.index + full.length;
    const close = `</${tag}>`;
    const closeAt = source.indexOf(close, contentStart);
    if (closeAt < 0) throw new Error(`unclosed <${tag}> for ${key}`);
    const inner = source.slice(contentStart, closeAt);
    if (new RegExp(`<${tag}[\\s>]`, "i").test(inner)) throw new Error(`nested <${tag}> inside ${key}`);
    if (!(key in dict)) { missing.push(key); continue; }
    const value = isHtml ? dict[key] : esc(dict[key]);
    out += source.slice(cursor, contentStart) + value;
    cursor = closeAt;
    filled++;
  }
  out += source.slice(cursor);

  /* aria-label is a visitor-facing string; it is set at runtime from
     data-i18n-aria and must therefore be the English value in the served markup. */
  out = out.replace(ariaRe, (tagText, _all, dq2, sq2) => {
    const key = dq2 ?? sq2;
    if (!(key in dict)) { missing.push(key); return tagText; }
    return /\baria-label=/.test(tagText)
      ? tagText.replace(/\baria-label="[^"]*"/, `aria-label="${esc(dict[key])}"`)
      : tagText.replace(/>$/, ` aria-label="${esc(dict[key])}">`);
  });

  return { out, filled, missing };
}

const html = readFileSync(htmlPath, "utf8");
let { out, filled, missing } = fillPage(html, en);

/* The head is what a social-card scraper reads, and nothing kept it in step. */
const head = [
  [/(<title>)[^<]*(<\/title>)/, `VALO Tech | ${en["hero.h1"].replace(/<[^>]*>/g, "").replace(/[.\u3002\u0964\u06D4]\s*$/, "")}`],
  [/(<meta property="og:title" content=")[^"]*(")/, en["hero.h1"].replace(/<[^>]*>/g, "").replace(/[.\u3002]\s*$/, "")],
  [/(<meta name="twitter:title" content=")[^"]*(")/, `VALO Tech | ${en["hero.h1"].replace(/<[^>]*>/g, "").replace(/[.\u3002]\s*$/, "")}`]
];
for (const [re, value] of head) {
  if (!re.test(out)) throw new Error(`index.html is missing a head tag the sync owns: ${re}`);
  out = out.replace(re, (_m2, a2, b2) => `${a2}${esc(value)}${b2 ?? ""}`);
}

/* The legal pages. Each resolves against its own copy over the site's chrome, and
   each owns its <title> from the heading it prints: a tab reading "VALO Tech" on
   three different documents is a tab that tells a reader with several open which
   company they are on and not which page. */
const legal = LEGAL_PAGES.map((page) => {
  const file = join(root, page.path);
  const source = readFileSync(file, "utf8");
  const filledPage = fillPage(source, legalEn);
  const titleRe = /(<title>)[^<]*(<\/title>)/;
  if (!titleRe.test(filledPage.out)) throw new Error(`${page.path} has no <title> the sync can own`);
  const text = `${esc(legalEn[page.titleKey])} | VALO Tech`;
  missing = missing.concat(filledPage.missing);
  return { ...page, file, source, out: filledPage.out.replace(titleRe, `$1${text}$2`), filled: filledPage.filled };
});

if (missing.length) {
  console.error("keys used in markup but absent from the English dictionary:\n  " + missing.join("\n  "));
  process.exit(1);
}

/* 404.html inlines its own strings: an error page should cost one request and still
   render in the visitor's language. The table is generated from the same dictionary,
   and the English in the markup is generated from it too, so neither can drift. */
const nf = readFileSync(notFoundPath, "utf8");
const START = "    /* NF-TABLE-START */\n", END = "    /* NF-TABLE-END */";
const a = nf.indexOf(START), b = nf.indexOf(END);
if (a < 0 || b < 0) throw new Error("404.html is missing its NF-TABLE markers");

const table = "    var NF = {\n" +
  I.locales.map((loc) => {
    const d = I.dict[loc] || en;
    const row = ["nf.title", "nf.body", "nf.home"].map((k) => JSON.stringify(d[k] ?? en[k]));
    return `      ${JSON.stringify(loc)}: [${row.join(", ")}]`;
  }).join(",\n") + "\n    };\n";

let nfOut = nf.slice(0, a + START.length) + table + nf.slice(b);
const swap = (id, value) => {
  const re = new RegExp(`(id="${id}"[^>]*>)[^<]*(<)`);
  if (!re.test(nfOut)) throw new Error(`404.html is missing #${id}`);
  nfOut = nfOut.replace(re, `$1${esc(value)}$2`);
};
swap("nfTitle", en["nf.title"]);
swap("nfBody", en["nf.body"]);
swap("nfHome", en["nf.home"]);
nfOut = nfOut.replace(/<title>[^<]*<\/title>/, `<title>${esc(en["nf.title"])} | VALO Tech</title>`);

const counts = [["index.html", filled, EXPECTED_NODES]].concat(
  legal.map((page) => [page.path, page.filled, page.nodes])
);

if (process.argv.includes("--check")) {
  const drift = [];
  if (out !== html) drift.push("index.html");
  if (nfOut !== nf) drift.push("404.html");
  for (const page of legal) if (page.out !== page.source) drift.push(page.path);
  if (drift.length) {
    console.error(`${drift.join(", ")} out of sync with the English dictionary.`);
    console.error("run: node scripts/sync-static-copy.mjs");
    process.exit(1);
  }
  const moved = counts.filter(([, actual, expected]) => actual !== expected);
  if (moved.length) {
    for (const [name, actual, expected] of moved) {
      console.error(`${name} has ${actual} localized nodes, expected ${expected}.`);
    }
    console.error("a node was added or silently skipped; update the expected count if the change is intended");
    process.exit(1);
  }
  console.log(
    `${counts.map(([name, actual, expected]) => `${name} (${actual}/${expected})`).join(", ")}` +
      ` and 404.html (${I.locales.length} locales) match the dictionaries.`
  );
} else {
  writeFileSync(htmlPath, out);
  writeFileSync(notFoundPath, nfOut);
  for (const page of legal) writeFileSync(page.file, page.out);
  console.log(
    `wrote ${counts.map(([name, actual]) => `${actual} nodes into ${name}`).join(", ")},` +
      ` ${I.locales.length} locales into 404.html`
  );
}
