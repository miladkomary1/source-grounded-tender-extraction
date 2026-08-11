// MAJOR 3 — consolidate the three Gemini campaigns into ONE canonical figure,
// with an explicit between-campaign variance component; plus the PAIRED
// gated-vs-ungated comparison Reviewer #1 asked for (Q3.3).
// Pure arithmetic over the per-run values already in paper/*.log — no API cost.
import { writeFileSync } from 'node:fs';

// Per-run accuracy (of 20 golden values), transcribed from the run logs.
const CAMP = {
  'C1 (Table 5 campaign, _run_flash_ablation.log)': {
    gated:   [17, 15, 19, 17, 18, 18, 16, 16, 16, 18],
    ungated: [18, 17, 20, 18, 19, 18, 18, 17, 17, 19],
    ai:      [15, 15, 18, 15, 16, 15, 15, 14, 15, 16],
  },
  'C2 (confirmatory re-run, _run_ablation2.log)': {
    gated:   [17, 17, 17, 16, 15, 16, 16, 16, 16, 16],
    ungated: [18, 18, 18, 17, 17, 18, 18, 18, 17, 18],
    ai:      [15, 15, 16, 15, 15, 14, 16, 13, 14, 15],
  },
  'C3 (sensitivity campaign, _run_robust.log)': {
    gated:   [16, 17, 14, 17, 18, 17, 18, 17, 15, 15],   // strict gate = canonical
    robust:  [18, 19, 16, 18, 20, 19, 18, 18, 18, 16],   // relaxed gate (post-hoc)
    ai:      [15, 14, 13, 15, 17, 16, 17, 15, 14, 14],
    // per-run ungated not logged for this campaign; aggregate mean was 18.2
  },
};

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const T = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 9: 2.26, 19: 2.09, 29: 2.05 };
const t = (df) => T[df] ?? 1.96;

const out = [];
const log = (s) => { console.log(s); out.push(s); };

log('=== MAJOR 3 — CONSOLIDATION OF THE CANONICAL CONFIGURATION ===\n');

// ---------- 1. Full workflow (gated, strict) pooled over all three campaigns ----------
const camps = Object.entries(CAMP).map(([name, v]) => ({ name, runs: v.gated }));
const all = camps.flatMap((c) => c.runs);
const campMeans = camps.map((c) => mean(c.runs));

log('Full workflow (gated, strict gate) — accuracy of 20 golden values');
camps.forEach((c) => log(`  ${c.name}\n    n=${c.runs.length}  mean ${mean(c.runs).toFixed(2)}  SD ${sd(c.runs).toFixed(2)}`));

const grand = mean(all);
const sdWithin = Math.sqrt(camps.reduce((s, c) => s + (c.runs.length - 1) * sd(c.runs) ** 2, 0) / (all.length - camps.length));
const sdBetween = sd(campMeans);
log(`\n  POOLED over ${all.length} runs / ${camps.length} campaigns`);
log(`    grand mean            : ${grand.toFixed(2)} / 20`);
log(`    within-campaign SD    : ${sdWithin.toFixed(2)}`);
log(`    between-campaign SD   : ${sdBetween.toFixed(2)}  (campaign means ${campMeans.map((m) => m.toFixed(1)).join(', ')})`);

// Naive interval treats all runs as exchangeable (what the paper did per-campaign).
const ciNaive = t(all.length - 1) * (sd(all) / Math.sqrt(all.length));
// Cluster-aware interval: campaign is the unit that generalises to a new session.
const ciCluster = t(camps.length - 1) * (sdBetween / Math.sqrt(camps.length));
log(`    95% CI, runs pooled naively : ±${ciNaive.toFixed(2)}   → ${grand.toFixed(1)} ± ${ciNaive.toFixed(1)}`);
log(`    95% CI, campaign-clustered  : ±${ciCluster.toFixed(2)}   → ${grand.toFixed(1)} ± ${ciCluster.toFixed(1)}   <-- RECOMMENDED HEADLINE`);
log(`    (the clustered interval is the honest one: it absorbs the session-to-session`);
log(`     drift of the unpinned deployed model that produced 17.0 / 16.2 / 16.4.)`);

// ---------- 2. Paired gated vs ungated (Reviewer #1, Q3.3) ----------
log('\n--- PAIRED comparison, full workflow vs ungated hybrid (same runs) ---');
const pairs = [];
for (const [name, v] of Object.entries(CAMP)) {
  if (!v.ungated) { log(`  ${name}: per-run ungated not logged — excluded from the paired test`); continue; }
  const d = v.gated.map((g, i) => g - v.ungated[i]);
  pairs.push(...d);
  log(`  ${name}: mean difference ${mean(d).toFixed(2)}`);
}
const dm = mean(pairs), dci = t(pairs.length - 1) * (sd(pairs) / Math.sqrt(pairs.length));
log(`  POOLED paired difference over ${pairs.length} runs: ${dm.toFixed(2)} ± ${dci.toFixed(2)} values`);
log(`  → the gate costs ${Math.abs(dm).toFixed(2)} ± ${dci.toFixed(2)} correct values (95% CI excludes 0: ${(Math.abs(dm) > dci) ? 'YES, significant' : 'no'})`);
log('  This paired estimate is both tighter and more honest than juxtaposing');
log('  the marginal intervals 16.5 vs 18.0, exactly as Reviewer #1 requested.');

// ---------- 3. Relaxed gate, flagged as post-hoc ----------
const rob = CAMP['C3 (sensitivity campaign, _run_robust.log)'];
const dRob = rob.robust.map((r, i) => r - rob.gated[i]);
log('\n--- Relaxed (token-based) gate — POST-HOC sensitivity, same campaign ---');
log(`  strict ${mean(rob.gated).toFixed(2)}  →  relaxed ${mean(rob.robust).toFixed(2)}`);
log(`  paired gain ${mean(dRob).toFixed(2)} ± ${(t(dRob.length - 1) * sd(dRob) / Math.sqrt(dRob.length)).toFixed(2)} values (in-sample; NOT a headline figure)`);

// ---------- 4. AI-alone, pooled ----------
const aiAll = Object.values(CAMP).flatMap((v) => v.ai);
const aiMeans = Object.values(CAMP).map((v) => mean(v.ai));
log('\n--- Language-model engine alone, pooled ---');
log(`  grand mean ${mean(aiAll).toFixed(2)} / 20 over ${aiAll.length} runs; campaign means ${aiMeans.map((m) => m.toFixed(1)).join(', ')}`);

log('\n=== RECOMMENDED CANONICAL SENTENCE FOR THE PAPER ===');
log(`Across ${all.length} runs in ${camps.length} independent campaigns, the full workflow (strict gate)`);
log(`recovered ${grand.toFixed(1)} ± ${ciCluster.toFixed(1)} of the 20 verified values (95% CI, campaign-clustered;`);
log(`within-campaign SD ${sdWithin.toFixed(2)}, between-campaign SD ${sdBetween.toFixed(2)}), and surfaced no value that`);
log(`failed the automatic locatability test. Against the ungated hybrid on the same runs,`);
log(`the gate costs ${Math.abs(dm).toFixed(1)} ± ${dci.toFixed(1)} correct values (paired, n=${pairs.length}).`);

writeFileSync('C:/Users/milad.komary/Documents/projects/PCAP/paper/_consolidated_stats.txt', out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_consolidated_stats.txt');
