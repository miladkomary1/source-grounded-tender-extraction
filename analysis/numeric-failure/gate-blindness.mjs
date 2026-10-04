// Do the silently corrupted amounts actually pass the source-grounding gate?
//
// The claim that the gate is blind to misreading must be demonstrated, not assumed.
// This runs the workflow's own grounding predicate over each corrupted value and the
// text it came from, and reports how many are admitted.
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

const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

// The grounding predicate as used in the evaluation harness: a value containing a
// number is grounded when that number appears verbatim in the normalised source.
function grounded(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[NÑ]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value);
  if (v.length < 4) return nsrc.includes(v);
  return nsrc.includes(v.slice(0, Math.min(18, v.length)));
}

const parseEs = (v) => {
  const m = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : { raw: m[0], value: n };
};
// keep the matched substring, which is what a pipeline would surface
const parseEsRaw = (v) => {
  const m = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  return m ? m[0] : null;
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
  const cents = String(Math.round(value * 100)).slice(-2);
  const whole = String(Math.round(value * 100)).replace(/(\d\d)$/, '');
  const sep = '[\\s\\u00A0.,\']{0,2}';
  for (const re of [
    new RegExp(`${whole.split('').join(sep)}${sep}[.,]${sep}${cents.split('').join(sep)}`),
    new RegExp(`(?<![\\d])${whole.split('').join(sep)}(?![\\d])`),
  ]) { const m = text.match(re); if (m) return m[0].trim(); }
  return null;
}

const man = JSON.parse(readFileSync(`${CORPUS}/manifest.json`, 'utf8'));
const cases = man.filter((m) => m.value != null && existsSync(`${CORPUS}/pdf/${m.file}`));

const out = []; const log = (s) => { console.log(s); out.push(s); };
log('=== IS THE SOURCE-GROUNDING GATE BLIND TO MISREADING? ===\n');

let corrupted = 0, admitted = 0, rejected = 0;
const shown = [];
for (const c of cases) {
  const t = await textOf(`${CORPUS}/pdf/${c.file}`);
  const printed = findPrinted(t, c.value);
  if (!printed) continue;
  const surfaced = parseEsRaw(printed);            // what the shipped parser would surface
  if (!surfaced) continue;                          // refused: nothing surfaced, nothing to admit
  const got = Number(surfaced.replace(/\./g, '').replace(',', '.'));
  if (Math.abs(got - c.value) <= 0.02 * Math.max(1, Math.abs(c.value))) continue;  // correct
  corrupted++;
  const nsrc = norm(t);
  const pass = grounded(surfaced, nsrc);
  if (pass) admitted++; else rejected++;
  if (shown.length < 8) shown.push({ c, printed, surfaced, got, pass });
}

log(`silently corrupted amounts examined : ${corrupted}`);
log(`  admitted by the grounding gate    : ${admitted}`);
log(`  rejected by the grounding gate    : ${rejected}`);
log('');
log(`The gate admits ${admitted} of ${corrupted} (${(100 * admitted / corrupted).toFixed(1)} %) of the values it has misread,`);
log('because the fragment it surfaced is, by construction, a substring of the document.');
log('');
log('EXAMPLES');
log('country  printed in document      surfaced      parsed as     reference      gate');
for (const s of shown) {
  log(`  ${s.c.country}    ${JSON.stringify(s.printed).padEnd(20)} ${s.surfaced.padEnd(12)} ${String(s.got).padEnd(12)} ${String(s.c.value).padEnd(13)} ${s.pass ? 'ADMITS' : 'rejects'}`);
}
mkdirSync(join(root, 'results', 'numeric-failure'), { recursive: true });
writeFileSync(join(root, 'results', 'numeric-failure', 'gate-blindness.txt'), out.join('\n'), 'utf8');
console.log('\n-> wrote results/numeric-failure/gate-blindness.txt');
