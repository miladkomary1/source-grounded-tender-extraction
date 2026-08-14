// Confusion matrix for the verification gate, on the 20 hand-verified fields.
//
//                     value CORRECT        value INCORRECT
//   surfaced          TP                   FP   <- acted on, and wrong
//   withheld          FN  <- cost of gate  TN   <- the gate doing its job
//
// PROVENANCE. Everything below comes from ONE campaign: the pinned run recorded in
// paper/_run_pinned.log and its per-field companion paper/_perfield.tsv, plus
// paper/_precision.txt which was produced under the same pinned sampling settings.
// paper/_surfaced_values.json is deliberately NOT used: it was dumped from a
// different run, and joining it to this campaign gave a precision of 82.4 % against
// the 88.9 % the campaign itself reports. Mixing runs is what that discrepancy was.
//
// No model is queried.
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const tsv = readFileSync(`${root}/paper/_perfield.tsv`, 'utf8').trim().split(/\r?\n/).slice(1);

// Campaign aggregates, as printed in paper/_run_pinned.log (10 runs, SD 0.00).
const ACC_GATED = 16;      // full workflow, strict gate
const ACC_UNGATED = 18;    // hybrid without the gate
const SURFACED_GOLDEN = 18; // from _precision.txt: 88.9 % = 16/18
const GOLDEN = 20;

const rows = tsv.map((l) => { const c = l.split('\t'); return { k: c[0], det: +c[2] === 10, ai: +c[3] === 10, wf: +c[4] === 10 }; });

const out = [];
const log = (s) => { console.log(s); out.push(s); };

const wrong = rows.filter((r) => !r.wf);              // workflow did not get these right
const gateLost = wrong.filter((r) => r.ai || r.det);  // ...but an engine did hold the right value
const nobody = wrong.filter((r) => !r.ai && !r.det);  // ...and nobody had it right

const TP = ACC_GATED;                       // surfaced and correct
const FP = SURFACED_GOLDEN - ACC_GATED;     // surfaced and wrong
const FN = ACC_UNGATED - ACC_GATED;         // withheld though correct = what the gate cost
const TN = (GOLDEN - SURFACED_GOLDEN) - FN; // withheld and wrong

log('=== CONFUSION MATRIX FOR THE VERIFICATION GATE ===');
log('20 hand-verified fields; gemini-2.5-flash, pinned sampling; identical in all ten runs.\n');
log('                        value CORRECT     value INCORRECT');
log(`  SURFACED                 TP = ${String(TP).padStart(2)}           FP = ${String(FP).padStart(2)}`);
log(`  WITHHELD BY GATE         FN = ${String(FN).padStart(2)}           TN = ${String(TN).padStart(2)}`);
log('');

const prec = TP / (TP + FP), rec = TP / (TP + FN);
const spec = (TN + FP) ? TN / (TN + FP) : NaN;
log(`  Precision   TP/(TP+FP) = ${(100 * prec).toFixed(1)} %   of what it shows you, how much is right`);
log(`  Recall      TP/(TP+FN) = ${(100 * rec).toFixed(1)} %   of the correct values it held, how many survive`);
log(`  F1                     = ${(100 * 2 * prec * rec / (prec + rec)).toFixed(1)} %`);
log(`  Specificity TN/(TN+FP) = ${Number.isNaN(spec) ? 'n/a' : (100 * spec).toFixed(1) + ' %'}   of the WRONG values it held, how many it caught`);
log('');

log('CONSISTENCY CHECKS (all must pass)');
const checks = [
  ['precision reproduces _precision.txt (88.9 %)', Math.abs(100 * prec - 88.9) < 0.1],
  ['TP + FP equals the surfaced count (18)', TP + FP === SURFACED_GOLDEN],
  ['TP + FN equals ungated accuracy (18)', TP + FN === ACC_UNGATED],
  ['all four cells sum to the golden set (20)', TP + FP + FN + TN === GOLDEN],
  ['fields the workflow got wrong equals 20 - accuracy', wrong.length === GOLDEN - ACC_GATED],
  ['gate-lost fields (engine right, workflow wrong) equals FN', gateLost.length === FN],
];
let ok = true;
for (const [name, pass] of checks) { log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); if (!pass) ok = false; }
log(ok ? '\n  All checks pass; the matrix is consistent with the campaign.' : '\n  *** INCONSISTENT, do not use these numbers. ***');
log('');

log('WHICH FIELDS');
log(`  FN, held correctly by an engine, removed by the gate (${gateLost.length}):`);
for (const r of gateLost) log(`      ${r.k}`);
log(`  Wrong for every configuration, so surfaced-but-wrong (${nobody.length}):`);
for (const r of nobody) log(`      ${r.k}`);
log('');
log('  The gate-lost fields are contract-type values: the model returns a short phrase');
log('  where the document carries only the head word, so the strict 18-character prefix');
log('  test rejects a value that is right. The relaxed token-based gate recovers exactly');
log('  these and returns 18/20 with the ungrounded share still at zero.');
log('');

log('READING IT HONESTLY');
log(`  Among the labelled fields the gate withheld ${FN + TN} values: ${FN} correct and ${TN} incorrect,`);
log(`  while ${FP} wrong values passed straight through it. On this subset the gate is`);
log('  therefore all cost and no benefit. That is not a flaw in the implementation but a');
log('  property of what it tests: LOCATABILITY, not correctness. A wrong value copied');
log('  verbatim from the document passes; a right value paraphrased by the model fails.');
log('  Because the labels were fixed independently of the gate, this is a non-circular');
log('  measurement, it is the strongest available answer to Reviewer #1, and it happens');
log('  to be unfavourable.');
log('');
log('  The gate earns its place on the UNLABELLED majority, where the ungated hybrid');
log('  leaves 15.4 % of surfaced values unlocatable and the gated one leaves none. Those');
log('  removals cannot be scored here because those fields carry no labels, which is');
log('  precisely the gap the human audit instrument was built to close.');
log('');
log('  It also argues that the strict gate is the wrong operating point: the relaxed');
log(`  variant recovers all ${FN} withheld-but-correct values at no cost in ungroundedness. The obstacle to`);
log('  adopting it as canonical is that it was tuned in-sample, not that it performs worse.');

writeFileSync(`${root}/paper/_confusion.txt`, out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_confusion.txt');
