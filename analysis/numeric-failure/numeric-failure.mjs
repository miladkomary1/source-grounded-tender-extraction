// NUMERIC REPRESENTATION FAILURE ACROSS JURISDICTIONS
//
// A source-grounding gate asks whether a surfaced value occurs in the document. It
// cannot ask whether the value was READ CORRECTLY from the document. This experiment
// measures the size of that blind spot when a parser calibrated for one jurisdiction
// reads another's documents.
//
// Design. For each TED notice with a published reference amount, the printed
// rendering of that amount is located in the English text of the document. Each
// parsing strategy is then given exactly that string, so the measurement isolates
// parsing from retrieval: every strategy sees the same, correct characters.
//
//   raw-es     the parser as shipped for Spanish documents
//   repaired   the same parser after the intra-number space repair of the methodology
//   locale     a convention-aware parser that infers the separator scheme
//
// A result is a SILENT CORRUPTION when the parser returns a number that is not the
// reference and does not signal failure. Those are the dangerous ones: they are
// well-formed, they are substrings of the document, and the grounding gate admits them.
//
// No model is queried. No API key. Committed documents only.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Repository-relative. This file lives in analysis/numeric-failure/, so the repository
// root is two levels up; run it from anywhere with `node analysis/numeric-failure/...`.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = join(root, 'data', 'ted');
const BUILD = join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const imp = (p) => import(pathToFileURL(p).href);
const pdfjs = await imp(join(BUILD, 'pdf.mjs'));
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(BUILD, 'pdf.worker.mjs')).href;
const { joinSplitNumbers } = await imp(join(root, 'src', 'pdf-cleaner.mjs'));

// ---- the three parsing strategies -------------------------------------------------
// As shipped: Spanish convention, dot thousands and comma decimal.
const parseEs = (v) => {
  const m = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
// Same parser, applied after the intra-number space repair.
const parseRepaired = (v) => parseEs(joinSplitNumbers(String(v)));
// Convention-aware: decide the decimal mark from the string itself, then strip the rest.
const parseLocale = (v) => {
  const s = String(v).replace(/[^\d.,\s\u00A0']/g, '').trim();
  if (!s) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  let dec = null;
  if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? '.' : ',';
  else if (lastComma >= 0) dec = /,\d{1,2}$/.test(s) ? ',' : null;
  else if (lastDot >= 0) dec = /\.\d{1,2}$/.test(s) ? '.' : null;
  let out;
  if (dec) {
    const i = s.lastIndexOf(dec);
    out = s.slice(0, i).replace(/[^\d]/g, '') + '.' + s.slice(i + 1).replace(/[^\d]/g, '');
  } else out = s.replace(/[^\d]/g, '');
  const n = Number(out);
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

// Locate the printed rendering of a known amount: the digits in order, allowing any
// grouping character between them.
function findPrinted(text, value) {
  const whole = String(Math.round(value * 100)).replace(/(\d\d)$/, '');   // integer digits
  const cents = String(Math.round(value * 100)).slice(-2);
  const sep = '[\\s\\u00A0.,\']{0,2}';
  const body = whole.split('').join(sep);
  for (const re of [
    new RegExp(`${body}${sep}[.,]${sep}${cents.split('').join(sep)}`),   // with decimals
    new RegExp(`(?<![\\d])${body}(?![\\d])`),                             // integer only
  ]) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

const man = JSON.parse(readFileSync(`${CORPUS}/manifest.json`, 'utf8'));
const cases = man.filter((m) => m.value != null && existsSync(`${CORPUS}/pdf/${m.file}`));

const out = [];
const log = (s) => { console.log(s); out.push(s); };
log('=== NUMERIC REPRESENTATION FAILURE ACROSS JURISDICTIONS ===');
log(`corpus: ${cases.length} TED notices with a published reference amount,`);
log(`${new Set(cases.map((c) => c.country)).size} countries, English renderings\n`);

const S = { es: { ok: 0, silent: 0, refused: 0 }, rep: { ok: 0, silent: 0, refused: 0 }, loc: { ok: 0, silent: 0, refused: 0 } };
const examples = [];
let located = 0, notLocated = 0;
const renderings = {};

for (const c of cases) {
  const t = await textOf(`${CORPUS}/pdf/${c.file}`);
  const printed = findPrinted(t, c.value);
  if (!printed) { notLocated++; continue; }
  located++;

  // record the grouping convention actually used
  const conv = /\d[\s\u00A0]\d/.test(printed) ? 'space-grouped'
    : /\d\.\d{3}/.test(printed) ? 'dot-grouped'
      : /\d,\d{3}/.test(printed) ? 'comma-grouped' : 'plain';
  renderings[conv] = (renderings[conv] || 0) + 1;

  const near = (a, b) => a != null && Math.abs(a - b) <= 0.02 * Math.max(1, Math.abs(b));
  const trial = [['es', parseEs(printed)], ['rep', parseRepaired(printed)], ['loc', parseLocale(printed)]];
  for (const [k, got] of trial) {
    if (got == null) S[k].refused++;
    else if (near(got, c.value)) S[k].ok++;
    else S[k].silent++;
  }
  const gotEs = parseEs(printed);
  if (gotEs != null && !near(gotEs, c.value) && examples.length < 10) {
    examples.push({ c, printed, gotEs, factor: c.value / gotEs });
  }
}

log(`amount located in the document text: ${located} of ${cases.length} (${notLocated} not located, excluded)\n`);
log('HOW THE AMOUNTS ARE PRINTED');
for (const [k, v] of Object.entries(renderings)) log(`  ${k.padEnd(15)} ${v}`);
log('');
log('PARSING OUTCOME (of the located amounts)');
log('strategy                       correct   SILENTLY WRONG   refused to parse');
const row = (name, k) => log(`${name.padEnd(30)} ${String(S[k].ok).padStart(7)} ${String(S[k].silent).padStart(16)} ${String(S[k].refused).padStart(18)}`);
row('as shipped (Spanish parser)', 'es');
row('after the space repair', 'rep');
row('convention-aware parser', 'loc');
log('');
const pct = (n) => `${(100 * n / located).toFixed(1)} %`;
log(`The parser as shipped silently returns a wrong amount for ${S.es.silent} of ${located} values (${pct(S.es.silent)}).`);
log('Every one of those is a substring of the document, so the source-grounding gate');
log('admits it. None is detectable by any check the workflow currently applies.');
log('');
if (examples.length) {
  log('EXAMPLES (printed rendering, what the shipped parser returns, error factor)');
  for (const e of examples) {
    log(`  ${e.c.country}  printed ${JSON.stringify(e.printed).padEnd(22)} reference ${String(e.c.value).padEnd(12)} parsed ${String(e.gotEs).padEnd(10)} off by ${e.factor > 1 ? e.factor.toFixed(0) + 'x' : '1/' + (1 / e.factor).toFixed(0)}`);
  }
}
mkdirSync(join(root, 'results', 'numeric-failure'), { recursive: true });
writeFileSync(join(root, 'results', 'numeric-failure', 'numeric-failure.txt'), out.join('\n'), 'utf8');
console.log('\n-> wrote results/numeric-failure/numeric-failure.txt');
