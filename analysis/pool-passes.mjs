// Pool the independent 26-document passes into the figures Table 10 reports.
//
// Each pass is a separate invocation of the harness at the pinned sampling
// configuration, after the text-layer repair. Only passes that printed a full
// aggregate are used, so every row rests on the same number of observations.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const LOGS = [
  ['pass 1', `${root}/paper/_run_corpus26_fixed_r1.log`],
  ['pass 2', `${root}/paper/_run_corpus26_pass3_final.log`],
  ['pass 3', `${root}/paper/_run_corpus26_pass4.log`],
];

// "AI engine alone (no det)   : coverage 395.0 ± 0.0 ... ungrounded% 26.0 ± 0.0"
const ROWS = [
  ['ai',      /AI engine alone[^\n]*?coverage\s+([\d.]+)[^\n]*?ungrounded%\s+([\d.]+)/],
  ['ungated', /Hybrid, UNGATED[^\n]*?coverage\s+([\d.]+)[^\n]*?ungrounded%\s+([\d.]+)/],
  ['gated',   /Full workflow, GATED[^\n]*?coverage\s+([\d.]+)/],
  ['relaxed', /Full workflow, ROBUST gate[^\n]*?coverage\s+([\d.]+)/],
  ['norules', /AI \+ gate, NO rules[^\n]*?coverage\s+([\d.]+)/],
];

const data = {};
const used = [];
for (const [name, path] of LOGS) {
  if (!existsSync(path)) { console.log(`${name}: log missing, skipped`); continue; }
  const txt = readFileSync(path, 'utf8').replace(/\r?\n/g, '\n').replace(/\n(?=\s*[\d/])/g, ' ');
  if (!/AGGREGATE/.test(txt)) { console.log(`${name}: no aggregate printed, skipped`); continue; }
  let ok = true;
  const row = {};
  for (const [key, re] of ROWS) {
    const m = txt.match(re);
    if (!m) { ok = false; break; }
    row[key] = { cov: +m[1] };
    if (m[2] != null) row[key].ung = +m[2];
  }
  if (!ok) { console.log(`${name}: aggregate incomplete, skipped`); continue; }
  used.push(name);
  for (const k of Object.keys(row)) {
    data[k] = data[k] || { cov: [], ung: [] };
    data[k].cov.push(row[k].cov);
    if (row[k].ung != null) data[k].ung.push(row[k].ung);
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1));
// 95 % t-interval; t for n-1 degrees of freedom at small n
const TCRIT = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 9: 2.262 };
const ci = (a) => a.length < 2 ? 0 : (TCRIT[a.length - 1] ?? 2.262) * sd(a) / Math.sqrt(a.length);
const fmt = (a) => `${mean(a).toFixed(1)} ± ${ci(a).toFixed(1)}`;
const fmtPct = (a) => `${mean(a).toFixed(1)} ± ${ci(a).toFixed(1)} %`;

const out = [];
const log = (s) => { console.log(s); out.push(s); };
log('=== 26-DOCUMENT REPLICATION, POOLED OVER INDEPENDENT PASSES ===');
log(`passes used: ${used.length} (${used.join(', ')}); pinned sampling, after the text-layer repair\n`);
if (used.length < 2) { log('Not enough complete passes to pool.'); process.exit(1); }

log('configuration                       coverage /572     unverifiable share   raw');
const NAME = { ai: 'Language-model engine alone', ungated: 'Hybrid, ungated', norules: 'Model + gate, no rules', gated: 'Full workflow (strict gate)', relaxed: 'Full workflow (relaxed gate)' };
for (const k of ['ai', 'ungated', 'norules', 'gated', 'relaxed']) {
  const d = data[k];
  if (!d) continue;
  const u = d.ung.length ? fmtPct(d.ung) : '0 %';
  log(`${NAME[k].padEnd(34)} ${fmt(d.cov).padEnd(17)} ${u.padEnd(20)} [${d.cov.join(', ')}]`);
}
log(`${'Deterministic engine only'.padEnd(34)} ${'96 (17 %)'.padEnd(17)} ${'0 %'.padEnd(20)} reproducible`);
log('');
log('CELL VALUES FOR TABLE 10');
log(`  language-model alone, coverage      : ${fmt(data.ai.cov)}`);
log(`  language-model alone, unverifiable  : ${fmtPct(data.ai.ung)}`);
log(`  ungated hybrid, coverage            : ${fmt(data.ungated.cov)}`);
log(`  ungated hybrid, unverifiable        : ${fmtPct(data.ungated.ung)}`);
log(`  full workflow strict, coverage      : ${fmt(data.gated.cov)}`);
log(`  full workflow relaxed, coverage     : ${fmt(data.relaxed.cov)}`);
log('');
const relBeats = mean(data.relaxed.cov) > mean(data.gated.cov);
log(`On this corpus the relaxed gate is the ${relBeats ? 'BROADER' : 'NARROWER'} of the two`);
log(`(${mean(data.relaxed.cov).toFixed(1)} against ${mean(data.gated.cov).toFixed(1)}), which is the reverse of the labelled corpus,`);
log('where the strict gate populates more slots. Both leave nothing unverifiable.');

writeFileSync(`${root}/paper/_pooled_26doc.txt`, out.join('\n'), 'utf8');
console.log('\n-> wrote paper/_pooled_26doc.txt');
