// R2-2 stage A: build the text caches every arm reads, and measure the
// evidence-span inclusion R3.17 asks for ("the proportion of annotated evidence
// spans actually included in each model request"). No model call is made here;
// everything in this file is deterministic and reproducible offline.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT, imp, FIELDS, norm, selectInput, loadLabels, CONTROL_CAP, FULLTEXT_CAP } from './arms.mjs';

const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${ROOT}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines, stripInlineBoilerplate, BOILERPLATE_LINE_PATTERNS } = await imp('lib/pdf-cleaner.mjs');
const { extractDeterministicFichaFields } = await imp('lib/ficha-deterministic.mjs');

// cleanPdfPageText with step 0 (joinSplitNumbers) removed. Every other step is
// the library's own code, called through the library's own exports.
function cleanPdfPageTextNoRepair(pageText) {
  return stripInlineBoilerplate(pageText)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !BOILERPLATE_LINE_PATTERNS.some((p) => p.test(line)))
    .join('\n')
    .trim();
}

async function rawPages(p) {
  const d = new Uint8Array(readFileSync(p));
  const pdf = await pdfjs.getDocument({ data: d, useSystemFonts: true }).promise;
  const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join(''));
  }
  return { pages: pg, numPages: pdf.numPages };
}
const assemble = (pages, fn) => removeRepeatedBoilerplateLines(pages.map(fn)).join('\n\n').replace(/[ \t]{2,}/g, ' ');

const dir = process.env.EVAL_DIR || `${ROOT}/examples`;
const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();
const labels = loadLabels();
mkdirSync(`${OUT}/cache`, { recursive: true });

const evidence = { generated: new Date().toISOString(), window: 'gold value, normalised, sought verbatim in the normalised text', docs: {} };

for (const variant of ['repair', 'norepair']) {
  const cachePath = `${OUT}/cache/text_${variant}.json`;
  if (existsSync(cachePath) && !process.env.FORCE) { console.log(`cache hit ${variant}`); continue; }
  const docs = {};
  for (const f of files) {
    const { pages, numPages } = await rawPages(`${dir}/${f}`);
    const text = assemble(pages, variant === 'repair' ? cleanPdfPageText : cleanPdfPageTextNoRepair);
    const det = extractDeterministicFichaFields(text);
    docs[f] = {
      pages: numPages,
      chars: text.length,
      text,
      nsrc: norm(text),
      det: Object.fromEntries(FIELDS.map((k) => [k, det[k]?.value ?? null])),
      gold: labels[f] || {},
    };
    console.log(`${variant}  ${f}  ${numPages}p  ${text.length} chars  det ${Object.values(docs[f].det).filter(Boolean).length}/22`);
  }
  writeFileSync(cachePath, JSON.stringify(docs));
}

// --- R3.17 evidence-span inclusion, per selection rule ----------------------
const cache = JSON.parse(readFileSync(`${OUT}/cache/text_repair.json`, 'utf8'));
const RULES = ['head_annex', 'fulltext', 'passage'];
for (const [f, d] of Object.entries(cache)) {
  const gold = d.gold;
  const gk = Object.keys(gold);
  const row = { pages: d.pages, source_chars: d.chars, annotated_spans: gk.length, rules: {} };
  for (const rule of RULES) {
    const sel = selectInput(rule, d.text);
    const nsel = norm(sel);
    const present = gk.filter((k) => nsel.includes(norm(gold[k])));
    row.rules[rule] = {
      input_chars: sel.length,
      share_of_document: d.chars ? +(sel.length / d.chars).toFixed(4) : null,
      spans_included: present.length,
      spans_total: gk.length,
      spans_missing: gk.filter((k) => !present.includes(k)),
    };
  }
  // A span the cleaned document does not contain verbatim cannot be supplied by
  // any selection rule; report that separately so selection is not blamed for it.
  row.spans_absent_from_cleaned_document = gk.filter((k) => !d.nsrc.includes(norm(gold[k])));
  evidence.docs[f] = row;
}
const tot = (rule, key) => Object.values(evidence.docs).reduce((s, r) => s + r.rules[rule][key], 0);
evidence.totals = Object.fromEntries(RULES.map((r) => [r, {
  input_chars: tot(r, 'input_chars'),
  spans_included: tot(r, 'spans_included'),
  spans_total: tot(r, 'spans_total'),
  inclusion_rate: +(tot(r, 'spans_included') / tot(r, 'spans_total')).toFixed(4),
}]));
evidence.caps = { control_cap: CONTROL_CAP, fulltext_cap: FULLTEXT_CAP };
writeFileSync(`${OUT}/evidence_spans.json`, JSON.stringify(evidence, null, 2));
console.log('\nR3.17 evidence-span inclusion (annotated gold values reaching the model input):');
for (const r of RULES) console.log(`  ${r.padEnd(12)} ${evidence.totals[r].spans_included}/${evidence.totals[r].spans_total}  input ${evidence.totals[r].input_chars} chars`);
for (const [f, r] of Object.entries(evidence.docs)) {
  console.log(`  ${f.slice(0, 30).padEnd(32)} ` + RULES.map((x) => `${r.rules[x].spans_included}/${r.annotated_spans}@${r.rules[x].input_chars}`).join('  '));
}
