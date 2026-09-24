// MAJOR 7, external baseline, quantified.
//
// Reviewer #1: "layout-aware parsers ... address exactly the table-heavy layouts
// the deterministic engine struggles with. Running at least one of these on the
// four labelled documents would anchor the results."
//
// This holds the extraction engine constant and swaps ONLY the parser:
//     pdfjs (used throughout the paper)  vs  IBM Docling (DocLayNet + TableFormer)
// so the difference is attributable to layout-aware parsing alone.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const imp = (r) => import(pathToFileURL(`${root}/${r}`).href);
const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines } = await imp('lib/pdf-cleaner.mjs');
const { extractDeterministicFichaFields } = await imp('lib/ficha-deterministic.mjs');

const labels = JSON.parse(readFileSync(`${root}/fixtures/eval-labels.json`, 'utf8'));
const report = JSON.parse(readFileSync(`${root}/paper/_docling_report.json`, 'utf8'));
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const FIELDS = ['organo_contratacion','numero_expediente','objeto_contrato','presupuesto_base_sin_iva','presupuesto_base_con_iva','valor_estimado_contrato','plazo_ejecucion','plazo_presentacion_ofertas','lugar_presentacion','garantia_provisional','garantia_definitiva','solvencia_economica','solvencia_tecnica','clasificacion_empresarial','procedimiento','tramitacion','tipo_contrato','iva','ofertas_anormalmente_bajas','plazo_garantia','seguros_obligatorios','presentacion_electronica'];

async function pdfjsText(p) {
  const t0 = Date.now();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(p)), useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  const text = removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
  return { text, seconds: (Date.now() - t0) / 1000 };
}

const out = [];
const log = (s) => { console.log(s); out.push(s); };
log('=== MAJOR 7, EXTERNAL BASELINE: layout-aware parsing (Docling) vs pdfjs ===');
log('Extraction engine held constant; only the PARSER differs.\n');
log('doc                                  parser   secs    chars   cov/22  acc/gold');

const tot = { pdfjs: { cov: 0, acc: 0, sec: 0 }, docling: { cov: 0, acc: 0, sec: 0 } };
let goldTotal = 0;

for (const f of readdirSync(`${root}/examples`).filter((x) => /\.pdf$/i.test(x))) {
  const gold = labels[f] || {};
  const gk = Object.keys(gold).filter((k) => !k.startsWith('_'));
  goldTotal += gk.length;

  const a = await pdfjsText(`${root}/examples/${f}`);
  const mdPath = `${root}/paper/_docling_out/${f.replace(/\.[pP][dD][fF]$/, '')}.md`;
  const rep = report.find((r) => r.doc === f);
  const md = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;

  for (const [name, text, secs] of [['pdfjs', a.text, a.seconds], ['docling', md, rep?.seconds ?? 0]]) {
    if (!text) { log(`${f.slice(0, 34).padEnd(36)} ${name.padEnd(8)} (unavailable)`); continue; }
    const det = extractDeterministicFichaFields(text);
    const cov = FIELDS.filter((k) => det[k]?.value).length;
    const acc = gk.filter((k) => norm(det[k]?.value || '').includes(norm(gold[k]))).length;
    tot[name].cov += cov; tot[name].acc += acc; tot[name].sec += secs;
    log(`${f.slice(0, 34).padEnd(36)} ${name.padEnd(8)} ${String(Math.round(secs)).padStart(4)}  ${String(text.length).padStart(7)}   ${String(cov).padStart(2)}/22    ${acc}/${gk.length}`);
  }
}

log('');
log(`TOTALS (4 documents, 88 field-slots, ${goldTotal} golden values)`);
log(`  pdfjs   : coverage ${tot.pdfjs.cov}/88, accuracy ${tot.pdfjs.acc}/${goldTotal}, parse time ${tot.pdfjs.sec.toFixed(1)} s total`);
log(`  Docling : coverage ${tot.docling.cov}/88, accuracy ${tot.docling.acc}/${goldTotal}, parse time ${tot.docling.sec.toFixed(0)} s total`);
log(`  speed   : Docling is ~${Math.round(tot.docling.sec / Math.max(0.01, tot.pdfjs.sec))}x slower`);
log('');
log('INTERPRETATION');
const dCov = tot.docling.cov - tot.pdfjs.cov, dAcc = tot.docling.acc - tot.pdfjs.acc;
log(`  Layout-aware parsing changes deterministic coverage by ${dCov >= 0 ? '+' : ''}${dCov} slots and`);
log(`  accuracy by ${dAcc >= 0 ? '+' : ''}${dAcc} values, at ~${Math.round(tot.docling.sec / 4)} s per document versus under a second.`);
log('  This is the external anchor Reviewer #1 asked for: it is a genuinely');
log('  different, published parsing method (IBM DocLayNet + TableFormer) applied to');
log('  the same documents with our extraction engine unchanged.');

writeFileSync(`${root}/paper/_docling_comparison.txt`, out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_docling_comparison.txt');
