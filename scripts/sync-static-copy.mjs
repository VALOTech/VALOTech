#!/usr/bin/env node
/* Write the English dictionary into index.html as the served text.
 *
 * site.js swaps every [data-i18n] node on load, so the markup only ever needed a
 * key. But a reader without JavaScript - a crawler that does not execute it, a
 * social-card scraper, a printed page, a text browser - then gets headings with
 * no body under them. English is the source of truth (assets/i18n.js), so the
 * markup is generated from it rather than maintained beside it.
 *
 *   node scripts/sync-static-copy.mjs           write index.html
 *   node scripts/sync-static-copy.mjs --check   exit 1 if it would change
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "index.html");
const notFoundPath = join(root, "404.html");

const shim = { window: {} };
new Function("window", readFileSync(join(root, "assets/i18n.js"), "utf8"))(shim.window);
const I = shim.window.VALO_I18N;
const en = I.dict.en;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* A node that stops matching the scanner would otherwise vanish without a sound. */
const EXPECTED_NODES = 86;

/* Nothing else enforces that the twenty dictionaries carry the same keys, and a
   locale missing one silently falls back to English at runtime. */
const enKeys = Object.keys(en);
const parity = [];
for (const loc of I.locales) {
  const d = I.dict[loc];
  if (!d) { parity.push(`${loc}: no dictionary`); continue; }
  const missing = enKeys.filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !(k in en));
  const blank = enKeys.filter((k) => typeof d[k] === "string" && !d[k].trim());
  if (missing.length) parity.push(`${loc}: missing ${missing.join(", ")}`);
  if (extra.length) parity.push(`${loc}: unknown ${extra.join(", ")}`);
  if (blank.length) parity.push(`${loc}: blank ${blank.join(", ")}`);
}
if (parity.length) {
  console.error("assets/i18n.js locale parity is broken:\n  " + parity.join("\n  "));
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const attrs = `(?:"[^"]*"|'[^']*'|[^>"'])`;
const open = new RegExp(`<([a-zA-Z][\\w-]*)((?:${attrs})*?\\bdata-i18n(-html)?=(?:"([^"]+)"|'([^']+)')(?:${attrs})*)>`, "g");

let out = "", cursor = 0, filled = 0, missing = [];
for (const m of html.matchAll(open)) {
  const [full, tag, , isHtml, dq, sq] = m;
  const key = dq ?? sq;
  const contentStart = m.index + full.length;
  const close = `</${tag}>`;
  const closeAt = html.indexOf(close, contentStart);
  if (closeAt < 0) throw new Error(`unclosed <${tag}> for ${key}`);
  const inner = html.slice(contentStart, closeAt);
  if (new RegExp(`<${tag}[\\s>]`, "i").test(inner)) throw new Error(`nested <${tag}> inside ${key}`);
  if (!(key in en)) { missing.push(key); continue; }
  const value = isHtml ? en[key] : esc(en[key]);
  out += html.slice(cursor, contentStart) + value;
  cursor = closeAt;
  filled++;
}
out += html.slice(cursor);

/* aria-label is a member-facing string; it is set at runtime from data-i18n-aria
   and must therefore be the English value in the served markup. */
const ariaRe = new RegExp(`(<[a-zA-Z][\\w-]*(?:${attrs})*?\\bdata-i18n-aria=(?:"([^"]+)"|'([^']+)')(?:${attrs})*>)`, "g");
out = out.replace(ariaRe, (tagText, _all, dq2, sq2) => {
  const key = dq2 ?? sq2;
  if (!(key in en)) { missing.push(key); return tagText; }
  return /\baria-label=/.test(tagText)
    ? tagText.replace(/\baria-label="[^"]*"/, `aria-label="${esc(en[key])}"`)
    : tagText.replace(/>$/, ` aria-label="${esc(en[key])}">`);
});

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

if (process.argv.includes("--check")) {
  const drift = [];
  if (out !== html) drift.push("index.html");
  if (nfOut !== nf) drift.push("404.html");
  if (drift.length) {
    console.error(`${drift.join(" and ")} out of sync with the English dictionary.`);
    console.error("run: node scripts/sync-static-copy.mjs");
    process.exit(1);
  }
  if (filled !== EXPECTED_NODES) {
    console.error(`index.html has ${filled} localized nodes, expected ${EXPECTED_NODES}.`);
    console.error("a node was added or silently skipped; update EXPECTED_NODES if the change is intended");
    process.exit(1);
  }
  console.log(`index.html (${filled}/${EXPECTED_NODES} localized nodes) and 404.html (${I.locales.length} locales) match the dictionary.`);
} else {
  writeFileSync(htmlPath, out);
  writeFileSync(notFoundPath, nfOut);
  console.log(`wrote ${filled} localized nodes into index.html, ${I.locales.length} locales into 404.html`);
}
