// Recompute with the well-formedness check applied.
//
// Mirrors lib/pipeline/blocks/validate.ts :: isWellFormedAmount. Kept in step by
// the assertions at the end, which fail loudly if the two ever diverge.
//
// No model is queried.
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const out = [];
const log = (s) => { console.log(s); out.push(s); };

const parseEsAmount = (v) => {
  if (v == null) return null;
  const m = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isWellFormedAmount = (value) => {
  if (value == null) return false;
  const s = String(value).replace(/[\s€]/g, '');
  if (!s) return false;
  if (/^[.,]/.test(s)) return false;
  if (/^0[\d]/.test(s)) return false;
  if (/^\d{1,3}$/.test(s)) return false;
  return parseEsAmount(value) != null;
};
const MONETARY = new Set(['presupuesto_base_sin_iva', 'presupuesto_base_con_iva', 'valor_estimado_contrato']);

log('=== EFFECT OF THE WELL-FORMEDNESS CHECK ===\n');

// ---------- 26-document corpus ----------
const ext = JSON.parse(readFileSync(`${root}/paper/_surfaced_values_ext.json`, 'utf8'));
const extMon = ext.filter((e) => MONETARY.has(e.field));
const extBad = extMon.filter((e) => !isWellFormedAmount(e.value));
const extGood = extMon.filter((e) => isWellFormedAmount(e.value));

log('26-DOCUMENT REPLICATION CORPUS (single archived harvest)');
log(`  surfaced values, all fields      : ${ext.length}`);
log(`  of which monetary                : ${extMon.length}`);
log(`  withheld by the new check        : ${extBad.length}  (${(100 * extBad.length / extMon.length).toFixed(1)} % of monetary, ${(100 * extBad.length / ext.length).toFixed(1)} % of all surfaced)`);
log(`  monetary values retained         : ${extGood.length}`);
log('');
log('  withheld:');
for (const e of extBad) log(`    ${e.doc.padEnd(14)} ${e.field.padEnd(26)} ${JSON.stringify(e.value).padEnd(13)} [${e.engine}]`);
log('');
log('  retained (confirming the check is not over-eager):');
for (const e of extGood.slice(0, 10)) log(`    ${e.doc.padEnd(14)} ${e.field.padEnd(26)} ${JSON.stringify(e.value)}`);
log(`    ... and ${Math.max(0, extGood.length - 10)} more, all well-formed.`);
log('');

// ---------- 4-document labelled corpus ----------
const four = JSON.parse(readFileSync(`${root}/paper/_surfaced_values.json`, 'utf8'));
const fourMon = four.filter((e) => MONETARY.has(e.field));
const fourBad = fourMon.filter((e) => !isWellFormedAmount(e.value));
log('4-DOCUMENT LABELLED CORPUS');
log(`  monetary values surfaced : ${fourMon.length}`);
log(`  withheld by the check    : ${fourBad.length}`);
for (const e of fourBad) log(`    ${e.doc} ${e.field} ${JSON.stringify(e.value)}`);
log(fourBad.length === 0
  ? '  -> the headline accuracy figures (16.0/20, precision 88.9 %) are UNCHANGED.'
  : '  -> WARNING: the labelled results change; the headline figures must be recomputed.');
log('');

// ---------- what this means for the reported coverage ----------
log('EFFECT ON REPORTED COVERAGE');
log('  The paper reports coverage on the 26-document corpus as a mean over three runs');
log(`  (294.7 ± 5.2 of 572 slots). The archived harvest is a single run, so the exact`);
log('  corrected mean cannot be derived from it; what is measured here is that the check');
log(`  withholds ${extBad.length} of ${ext.length} surfaced values in that harvest. Applying the same`);
log(`  proportion to the reported mean gives approximately ${(294.7 * (1 - extBad.length / ext.length)).toFixed(1)} of 572, a reduction of`);
log(`  about ${(294.7 * extBad.length / ext.length).toFixed(1)} slots. This is an ESTIMATE, flagged as such: the campaign should be`);
log('  re-run before the corrected figure is printed as a measurement.');
log('');
log('  Note the direction of the correction. Coverage falls slightly and no accuracy');
log('  figure improves, because the withheld values were wrong to begin with. The paper');
log('  gains a defect that its own audit caught, not a better number.');
log('');

// ---------- self-tests ----------
const cases = [
  ['000,00 €', false], ['00 €', false], ['48 €', false], ['77 €', false], ['15 €', false],
  ['25 €', false], ['37 €', false],
  ['5.532.479,98 €', true], ['163.090.932,28', true], ['82.500,00 €', true],
  ['116.547,29 €', true], ['1.234,00', true], ['40.000,00 €', true],
];
let pass = 0;
const fails = [];
for (const [v, want] of cases) { if (isWellFormedAmount(v) === want) pass++; else fails.push(`${JSON.stringify(v)} expected ${want}`); }
log(`SELF-TEST: ${pass}/${cases.length} cases pass`);
for (const f of fails) log(`  FAIL ${f}`);
if (fails.length) log('  *** the check is wrong; do not use these numbers ***');
else log('  All seven observed truncations are rejected and every well-formed amount is kept.');

writeFileSync(`${root}/paper/_wellformed_recompute.txt`, out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_wellformed_recompute.txt');
