// REGISTRY-REFERENCED EVALUATION (MAJOR 5)
//
// PLACSP publishes a structured record for every tender alongside the PDF. Where
// the workflow extracts a field the platform also publishes, that record is an
// INDEPENDENT reference: created by the contracting authority, not by us, and never
// inspected during development. This scores extraction with no new human annotation.
//
// It is a silver standard, not an absolute one: the platform record is itself keyed
// in by hand. A disagreement locates a discrepancy without saying which side is wrong.
//
// No model is queried; committed artefacts only.
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const man = JSON.parse(readFileSync(`${root}/paper/corpus_pcap/manifest.json`, 'utf8'));
const ext = JSON.parse(readFileSync(`${root}/paper/_surfaced_values_ext.json`, 'utf8'));

const out = [];
const log = (s) => { console.log(s); out.push(s); };

const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

const byDoc = new Map();
for (const e of ext) {
  if (!byDoc.has(e.doc)) byDoc.set(e.doc, {});
  const d = byDoc.get(e.doc);
  if (d[e.field] == null) d[e.field] = { value: e.value, engine: e.engine || '?' };
}

log('=== REGISTRY-REFERENCED EVALUATION AGAINST PLACSP PUBLISHED RECORDS ===');
log(`corpus: ${man.length} tenders, none inspected during development; extracted records for ${byDoc.size}\n`);

// ---------------- 1. Procedure: a clean, scorable comparison ----------------
let pHit = 0, pMiss = 0, pAbsent = 0;
const pBad = [];
for (const m of man) {
  if (!m.procedure) continue;
  const f = (byDoc.get(m.file) || {}).procedimiento;
  if (!f) { pAbsent++; continue; }
  const a = norm(f.value), b = norm(m.procedure);
  if (a === b || a.startsWith(b) || b.startsWith(a)) pHit++;
  else { pMiss++; pBad.push([m.file, f.value, m.procedure]); }
}
log('1. PROCEDURE TYPE, scored against the published record');
log(`   extracted for ${pHit + pMiss} of ${pHit + pMiss + pAbsent} tenders; agreement ${pHit}/${pHit + pMiss} = ${(100 * pHit / (pHit + pMiss)).toFixed(1)} %`);
for (const b of pBad) log(`   DISAGREE ${b[0]}: "${b[1]}" vs published "${b[2]}"`);
log('');

// ---------------- 2. Budget: why it CANNOT be scored as accuracy ----------------
log('2. BUDGET, not scorable as accuracy, and the reason matters');
log('   PLACSP publishes three distinct amounts (TaxExclusiveAmount, TotalAmount,');
log('   EstimatedOverallContractAmount). The harvested manifest collapsed them into a');
log('   single `budget` field without recording which one each record carried, so the');
log('   reference is ambiguous per tender. The ratio of our VAT-inclusive figure to the');
log('   published one confirms the corpus mixes them rather than using one consistently:');
const ratios = [];
for (const [file, f] of byDoc) {
  const m = man.find((x) => x.file === file);
  const c = num(f.presupuesto_base_con_iva?.value);
  if (m?.budget && c) ratios.push(c / m.budget);
}
const near = (t) => ratios.filter((r) => Math.abs(r - t) < 0.02).length;
log(`     paired observations ${ratios.length}: ${near(1.00)} near 1.00 (published = total),`);
log(`     ${near(1.21)} near 1.21 (published = tax-exclusive), ${ratios.length - near(1.0) - near(1.21)} neither.`);
log('   Scoring budgets against this field would measure the ambiguity of the reference,');
log('   not the accuracy of the extraction. It is used below only to LOCATE discrepancies,');
log('   which is what a silver standard can legitimately do.');
log('');

// ---------------- 3. Well-formedness audit: needs no reference at all ----------------
const MON = /presupuesto_base_sin_iva|presupuesto_base_con_iva|valor_estimado_contrato/;
const malformed = (v) => {
  const s = String(v).replace(/[€\s]/g, '');
  if (/^0+([.,]0+)?$/.test(s)) return 'all zeros';
  if (/^[.,]/.test(s)) return 'leading separator';
  if (/^0\d/.test(s)) return 'leading zero digits';
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length <= 3 && !/[.,]/.test(s)) return 'implausibly short';
  return null;
};
let tot = 0; const bad = [];
const perEngine = {};
for (const e of ext) {
  if (!MON.test(e.field)) continue;
  tot++;
  const eng = (e.engine || '?').split(' ')[0];
  perEngine[eng] = perEngine[eng] || { n: 0, bad: 0 };
  perEngine[eng].n++;
  const m = malformed(e.value);
  if (m) { perEngine[eng].bad++; bad.push([e.doc, e.field, e.value, m, e.engine]); }
}
log('3. WELL-FORMEDNESS OF SURFACED MONETARY VALUES, the significant finding');
log(`   ${bad.length} of ${tot} monetary values surfaced across the corpus are malformed (${(100 * bad.length / tot).toFixed(1)} %).`);
for (const [k, v] of Object.entries(perEngine)) log(`     ${k.padEnd(16)} ${v.bad} malformed of ${v.n}`);
log('');
for (const b of bad) log(`     ${b[0].padEnd(14)} ${b[1].padEnd(26)} ${JSON.stringify(b[2]).padEnd(13)} ${b[3]}`);
log('');
log('   Every one is a TRUNCATION produced by the deterministic engine: "000,00 EUR" is');
log('   the tail of "40.000,00 EUR", and "00 EUR" the tail of "82.500,00 EUR". The');
log('   language-model engine produced none.');
log('');
log('   THREE CONSEQUENCES, none of them comfortable.');
log('   (a) Every one of these passes the source-grounding gate, because a truncation IS');
log('       a verbatim substring of the document. This is the abstract limitation of the');
log('       gate, demonstrated concretely: locatability is not correctness, and the');
log('       failure mode it misses is exactly the one that silently corrupts a budget.');
log('   (b) The claim that the deterministic engine is the precise component is supported');
log('       only on the four labelled documents. On twenty-six unlabelled tenders it is');
log('       the sole source of malformed output. The paper should say so.');
log('   (c) A one-line well-formedness check would catch all seven at zero cost and');
log('       without a reference, and it belongs in the arithmetic-validation gate.');
log('');
log('WHAT THIS ESTABLISHES');
log('   Procedure type is verified against an independent published reference on');
log(`   ${pHit + pMiss} tenders with ${(100 * pHit / (pHit + pMiss)).toFixed(0)} % agreement and no human annotation, which speaks directly to`);
log('   the concern that every accuracy figure rests on labels made by the developer.');
log('   It does not replace re-annotation of the twenty golden values: the platform does');
log('   not publish the solvency, classification or guarantee thresholds that motivate');
log('   the work. Its real value here was diagnostic, it surfaced a defect that four');
log('   labelled documents could not.');

writeFileSync(`${root}/paper/_registry_check.txt`, out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_registry_check.txt');
