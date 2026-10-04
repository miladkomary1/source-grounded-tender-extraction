// THE ERROR FACTORS OF EVERY SILENTLY WRONG VALUE, NOT ONLY THE TEN PRINTED
//
// `numeric-failure.mjs` classifies each located amount and prints at most ten
// worked examples. The conclusions of the manuscript quoted a range, 135 to 11,893,
// taken from those ten, as though it held over all 42 silently wrong values. This
// script recomputes the factor for every one of the 42, so that the sentence can
// state a measured range rather than the span of a sample.
//
// It reproduces the harness exactly. `parseEs`, `textOf` and `findPrinted` are copied
// from `_numeric_failure.mjs` character for character, and the same pdfjs build reads
// the same committed PDFs, so the classification counts printed below must match
// `results/numeric-failure/numeric-failure.txt`: 0 correct, 42 silently wrong, 45 refused of 87. If
// they do not, the recomputed factors are not comparable and must not be used.
//
// Nothing outside results/numeric-failure/ is written. No model is queried.
//
//   node recount_factors.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Repository-relative. This file lives in analysis/numeric-failure/, so the repository
// root is two levels up; run it from anywhere with `node analysis/numeric-failure/...`.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = join(root, 'data', 'ted');
const OUT = join(root, 'results', 'numeric-failure', 'error-factors.txt');
const BUILD = join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const imp = (p) => import(pathToFileURL(p).href);
const pdfjs = await imp(join(BUILD, 'pdf.mjs'));
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(BUILD, 'pdf.worker.mjs')).href;

// ---- copied verbatim from _numeric_failure.mjs ------------------------------------
const parseEs = (v) => {
  const m = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function textOf(p) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(p)), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join(''));
  }
  return pages.join('\n');
}

function findPrinted(text, value) {
  const whole = String(Math.round(value * 100)).replace(/(\d\d)$/, '');
  const cents = String(Math.round(value * 100)).slice(-2);
  const sep = '[\\s\\u00A0.,\']{0,2}';
  const body = whole.split('').join(sep);
  for (const re of [
    new RegExp(`${body}${sep}[.,]${sep}${cents.split('').join(sep)}`),
    new RegExp(`(?<![\\d])${body}(?![\\d])`),
  ]) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return null;
}
// -----------------------------------------------------------------------------------

const man = JSON.parse(readFileSync(`${CORPUS}/manifest.json`, 'utf8'));
const cases = man.filter((m) => m.value != null && existsSync(`${CORPUS}/pdf/${m.file}`));

const out = [];
const log = (s) => { console.log(s); out.push(s); };
log('=== ERROR FACTOR OF EVERY SILENTLY WRONG VALUE ===');
log(`corpus: ${cases.length} TED notices with a published reference amount\n`);

let located = 0, ok = 0, refused = 0;
const wrong = [];
for (const c of cases) {
  const t = await textOf(`${CORPUS}/pdf/${c.file}`);
  const printed = findPrinted(t, c.value);
  if (!printed) continue;
  located++;
  const got = parseEs(printed);
  if (got == null) { refused++; continue; }
  const near = Math.abs(got - c.value) <= 0.02 * Math.max(1, Math.abs(c.value));
  if (near) { ok++; continue; }
  wrong.push({ country: c.country, file: c.file, printed, got, value: c.value,
               factor: c.value / got });
}

log('CLASSIFICATION, which must match results/numeric-failure/numeric-failure.txt');
log(`  located        ${located} of ${cases.length}`);
log(`  correct        ${ok}`);
log(`  silently wrong ${wrong.length}`);
log(`  refused        ${refused}`);
const matches = located === 87 && ok === 0 && wrong.length === 42 && refused === 45;
log(`  reproduces the harness: ${matches ? 'YES' : 'NO, DO NOT USE THESE FACTORS'}`);
log('');

wrong.sort((a, b) => a.factor - b.factor);
const f = wrong.map((w) => w.factor);
const med = f.length % 2 ? f[(f.length - 1) / 2]
  : (f[f.length / 2 - 1] + f[f.length / 2]) / 2;
log('FACTOR = reference value / what the shipped parser returns');
log(`  count   ${f.length}`);
log(`  minimum ${f[0].toFixed(2)}`);
log(`  median  ${med.toFixed(2)}`);
log(`  maximum ${f[f.length - 1].toFixed(2)}`);
log(`  below 10x: ${f.filter((x) => x < 10).length}; 10x to 1,000x: ${f.filter((x) => x >= 10 && x < 1000).length}; 1,000x and above: ${f.filter((x) => x >= 1000).length}`);
log('');
log('EVERY CASE, ascending by factor');
log('country  printed                reference        parsed        factor');
for (const w of wrong) {
  log(`  ${w.country}    ${JSON.stringify(w.printed).padEnd(20)} ${String(w.value).padEnd(16)} ${String(w.got).padEnd(13)} ${w.factor.toFixed(2)}`);
}

mkdirSync(join(root, 'results', 'numeric-failure'), { recursive: true });
writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`\n-> wrote ${OUT}`);
