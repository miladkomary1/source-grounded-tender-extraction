// Recompute accurate source contexts for the audit dump (no API cost).
//
// The first pass mapped a value back to the raw text by searching its first
// token, which landed on unrelated passages (signature blocks etc.). A
// misleading snippet is worse than none in a human audit — it can make a
// correct value look wrong. This builds a normalised copy of the document with
// an index map back to raw offsets, locates the value in normalised space, and
// slices the RAW text at the mapped offset. Values that cannot be located
// exactly get context:null, and the kit then tells the auditor to search the PDF.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const imp = (rel) => import(pathToFileURL(`${root}/${rel}`).href);
const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines } = await imp('lib/pdf-cleaner.mjs');

const DUMP = process.argv[2];
const DOCDIR = process.argv[3];
if (!DUMP || !existsSync(DUMP)) { console.error('usage: node _fixcontext.mjs <dump.json> <docdir>'); process.exit(1); }

async function clean(p) {
  const d = new Uint8Array(readFileSync(p));
  const pdf = await pdfjs.getDocument({ data: d, useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  return removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
}

/** Normalised text + map from normalised index -> raw index. */
function normWithMap(raw) {
  let out = '', map = [], prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const dec = ch.normalize('NFKD').replace(/\p{M}+/gu, '');
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      out += ' '; map.push(i); prevSpace = true; continue;
    }
    prevSpace = false;
    const low = dec.toLowerCase();
    for (const c of low) { out += c; map.push(i); }
  }
  return { norm: out, map };
}
const normStr = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

const items = JSON.parse(readFileSync(DUMP, 'utf8'));
const cache = new Map();
let exact = 0, partial = 0, none = 0;

for (const it of items) {
  if (!cache.has(it.doc)) {
    const text = await clean(`${DOCDIR}/${it.doc}`);
    cache.set(it.doc, { text, ...normWithMap(text) });
  }
  const { text, norm, map } = cache.get(it.doc);
  const v = normStr(it.value);
  let at = v ? norm.indexOf(v) : -1;
  let kind = 'exact';
  if (at < 0 && v.length > 18) { at = norm.indexOf(v.slice(0, 18)); kind = 'partial'; }
  if (at < 0) {
    // numeric values: locate the first number the gate would have matched
    const nums = String(it.value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi) || [];
    for (const nmb of nums) { const p = norm.indexOf(normStr(nmb)); if (p >= 0) { at = p; kind = 'partial'; break; } }
  }
  if (at < 0) { it.context = null; it.contextKind = 'not-located'; none++; continue; }
  const rawAt = map[at] ?? 0;
  const snippet = text.slice(Math.max(0, rawAt - 200), rawAt + 340).replace(/\s+/g, ' ').trim();
  // Self-verify: only keep a snippet that demonstrably contains the value (or,
  // for numerics, the matched number). A snippet that does not is worse than
  // none — it would bias the auditor against a correct value.
  const ns = normStr(snippet);
  const nums = String(it.value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+/g) || [];
  const ok = ns.includes(v) || (v.length > 18 && ns.includes(v.slice(0, 18))) || nums.some((n) => ns.includes(normStr(n)));
  if (!ok) { it.context = null; it.contextKind = 'not-located'; none++; continue; }
  it.context = snippet;
  it.contextKind = kind;
  kind === 'exact' ? exact++ : partial++;
}

writeFileSync(DUMP, JSON.stringify(items, null, 2), 'utf8');
console.log(`contexts recomputed for ${items.length} values -> exact ${exact}, partial ${partial}, not-located ${none}`);
