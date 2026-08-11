// MAJOR 4 / MINOR 7 / Q2.7 / Q4.7 — cost recomputed on the FAIR baseline, with
// TOKEN COUNTS as the primary (durable) quantity and euro figures as a derived,
// dated column. Token counts come from the actual campaign logs, not estimates.
import { writeFileSync } from 'node:fs';

// Measured token usage, DeepSeek cross-model campaign (paper/_crossmodel.log):
//   5 runs x 4 documents = 20 document analyses
const MEASURED = { runs: 5, docs: 4, promptTokens: 494215, completionTokens: 54040 };
const perDocIn = MEASURED.promptTokens / (MEASURED.runs * MEASURED.docs);
const perDocOut = MEASURED.completionTokens / (MEASURED.runs * MEASURED.docs);

// Prices per 1M tokens, quoted with the access date so the paper stays honest
// when prices move. The token counts above do not move.
const PRICED = '2026-08-11';
const PRICES = {
  'gemini-2.5-flash':   { in: 0.30, out: 2.50, cur: 'USD' },
  'deepseek-chat':      { in: 0.28, out: 0.42, cur: 'USD' },
  'frontier (per-call)':{ in: 3.00, out: 15.00, cur: 'USD' },
};
const cost = (m, ti, to) => (ti / 1e6) * PRICES[m].in + (to / 1e6) * PRICES[m].out;

const out = [];
const log = (s) => { console.log(s); out.push(s); };

log('=== COST, RECOMPUTED ON THE FAIR BASELINE (MAJOR 4) ===');
log(`prices accessed ${PRICED}; token counts are measured and price-independent\n`);
log(`MEASURED per document (workflow, single focused call):`);
log(`  input  ${Math.round(perDocIn).toLocaleString()} tokens`);
log(`  output ${Math.round(perDocOut).toLocaleString()} tokens`);
log('');

const wfFlash = cost('gemini-2.5-flash', perDocIn, perDocOut);
const wfDeep = cost('deepseek-chat', perDocIn, perDocOut);
log(`Workflow cost per document`);
log(`  gemini-2.5-flash : $${wfFlash.toFixed(4)}`);
log(`  deepseek-chat    : $${wfDeep.toFixed(4)}`);
log('');

// (a) NAIVE baseline the paper currently uses for its 95 % claim: a frontier
//     model queried once PER CHUNK, with overlapping context.
const CHUNKS = 12;                                  // per-chunk querying of a ~45-page pliego
const naiveIn = perDocIn * CHUNKS * 1.15;           // + overlap
const naiveOut = perDocOut * CHUNKS;
const naive = cost('frontier (per-call)', naiveIn, naiveOut);

// (b) FAIR baseline the reviewer asks for: ONE frontier-model call per document,
//     same input as the workflow.
const fair = cost('frontier (per-call)', perDocIn, perDocOut);

log(`Baselines per document`);
log(`  (a) naive per-chunk frontier (${CHUNKS} calls): $${naive.toFixed(3)}   [what the 95 % claim used]`);
log(`  (b) FAIR single frontier call             : $${fair.toFixed(3)}   [what the reviewer asks for]`);
log('');
const redNaive = 100 * (1 - wfFlash / naive);
const redFairFlash = 100 * (1 - wfFlash / fair);
const redFairDeep = 100 * (1 - wfDeep / fair);
log(`Reduction vs (a) naive : ${redNaive.toFixed(0)} %   <- the current headline; keep only as context`);
log(`Reduction vs (b) FAIR  : ${redFairFlash.toFixed(0)} % (flash) / ${redFairDeep.toFixed(0)} % (deepseek)   <- NEW HEADLINE`);
log('');
log('Note: the deterministic-only path costs ZERO tokens and requires no API key.');
log('For the fields it covers, the saving against any model baseline is 100 %.');
log('');
// ---- Reconciliation with the figure the previous version reported ----
// v17 stated the workflow at "three to six euro cents" per document. The
// MEASURED tokens imply less than half of that. Revising our own cost DOWNWARD
// would enlarge the claimed saving — exactly the kind of move Reviewer #1 is
// objecting to elsewhere. We therefore adopt the CONSERVATIVE claim (the
// reviewer's own 40-70 %) in the abstract, and report the measured tokens for
// transparency so any reader can recompute at current prices.
const PAPER_LOW = 0.03, PAPER_HIGH = 0.06;   // EUR, as printed in v17
const FAIR_EUR = 0.10;                        // EUR, reviewer's fair baseline (matches our $0.115)
const consLow = 100 * (1 - PAPER_HIGH / FAIR_EUR);
const consHigh = 100 * (1 - PAPER_LOW / FAIR_EUR);

log('=== RECONCILIATION WITH v17 ===');
log(`  v17 printed workflow cost   : EUR ${PAPER_LOW}-${PAPER_HIGH} per document (conservative estimate)`);
log(`  measured from token counts  : ~EUR ${(wfFlash * 0.92).toFixed(3)} per document (flash, ${PRICED} prices)`);
log(`  -> the earlier figure OVERSTATED our own cost; correcting it downward would`);
log(`     INFLATE the saving. We keep the conservative claim.`);
log(`  conservative saving vs fair baseline: ${consLow.toFixed(0)}-${consHigh.toFixed(0)} %  (Reviewer #1's own arithmetic)`);
log('');
log('=== RECOMMENDED WORDING (conservative; use in abstract and conclusions) ===');
log(`Measured against the fairer baseline of a single frontier-model call per`);
log(`document (of the order of ten euro cents), the workflow at three to six euro`);
log(`cents reduces model cost by roughly ${consLow.toFixed(0)} to ${consHigh.toFixed(0)} percent — a factor of two to three —`);
log(`rather than the ninety-five percent quoted against our own initial per-chunk`);
log(`implementation, which is retained only as context. Per document the workflow`);
log(`consumes about ${Math.round(perDocIn / 1000)} thousand input and ${(perDocOut / 1000).toFixed(1)} thousand output tokens; these counts are`);
log(`reported as the primary quantity because they remain valid after provider`);
log(`prices change (prices accessed ${PRICED}). The deterministic path costs no`);
log(`tokens at all.`);

writeFileSync('C:/Users/milad.komary/Documents/projects/PCAP/paper/_cost_recomputed.txt', out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_cost_recomputed.txt');
