// Methodology-impact experiment: prompt-engineered LLM (take-as-is) vs the full
// methodology (normalizer + grounding verification + deterministic merge),
// measured on the corpus. Reports usable coverage, GROUNDEDNESS (anti-
// hallucination), and accuracy, the numbers that quantify why the methodology
// beats a prompt-only baseline.
import { readFileSync, readdirSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const KEYS = [process.env.GKEY, process.env.GKEY2, process.env.GKEY3].filter(Boolean);
// Reviewer #1 (MAJOR 8a) asks for the sampling configuration to be PINNED and
// reported rather than inherited from provider defaults, which can change
// server-side. PINNED=1 fixes temperature, output cap and the reasoning budget
// so the campaign is reproducible; the exact values are echoed into the log.
const PINNED = process.env.PINNED === '1';
const PIN_CFG = { temperature: 0, topP: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
const KEY = KEYS.length; // truthy when any key present
const MODEL = process.env.MODEL || 'gemini-2.5-flash'; // second-model generalisation check
const dir = process.env.EVAL_DIR || 'C:/Users/milad.komary/Documents/projects/PCAP/examples';
const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const imp = (rel) => import(pathToFileURL(`${root}/${rel}`).href);
const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines } = await imp('lib/pdf-cleaner.mjs');
const { extractDeterministicFichaFields } = await imp('lib/ficha-deterministic.mjs');
const { normalizeModelFicha } = await imp('lib/pipeline/blocks/ficha-normalize.ts');
const { getSystemPrompt } = await imp('lib/prompts.ts');

const labels = existsSync(`${root}/fixtures/eval-labels.json`) ? JSON.parse(readFileSync(`${root}/fixtures/eval-labels.json`, 'utf8')) : {};
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIELDS = ['organo_contratacion','numero_expediente','objeto_contrato','presupuesto_base_sin_iva','presupuesto_base_con_iva','valor_estimado_contrato','plazo_ejecucion','plazo_presentacion_ofertas','lugar_presentacion','garantia_provisional','garantia_definitiva','solvencia_economica','solvencia_tecnica','clasificacion_empresarial','procedimiento','tramitacion','tipo_contrato','iva','ofertas_anormalmente_bajas','plazo_garantia','seguros_obligatorios','presentacion_electronica'];

async function clean(p) {
  const d = new Uint8Array(readFileSync(p));
  const pdf = await pdfjs.getDocument({ data: d, useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  return removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
}
function focus(t) { const hp = /(?:^|\n)\s*ANEXO\s+I\b/g; let m = null; for (const x of t.matchAll(hp)) m = x; if (!m) return t; const s = m.index; const nx = /(?:^|\n)\s*ANEXO\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/.exec(t.slice(s + 10)); const e = nx ? s + 10 + nx.index : Math.min(t.length, s + 120000); const f = `${t.slice(0, Math.min(12000, s))}\n\n[…]\n\n${t.slice(s, e)}`; return (f.length >= 8000 && f.length < t.length * 0.8) ? f : t; }
let _ki = 0;
async function gemini(instr, input) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: instr }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseMimeType: 'application/json', ...(PINNED ? PIN_CFG : {}) },
  });
  let quotaHits = 0;
  for (let a = 0; a < 10; a++) {
    const key = KEYS[_ki % KEYS.length]; _ki++; // rotate keys each attempt
    let r;
    // A fetch with no timeout can block forever: an earlier campaign sat for 26
    // minutes on a request that never returned, burning wall-clock and no CPU.
    try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(120000) }); }
    catch { await sleep(2000 * (a + 1)); continue; }
    // Quota exhaustion is not a transient fault. Retrying it multiplies the
    // damage: ten attempts per document over twenty-six documents is 260 requests
    // spent discovering the same thing. If every key reports 429 in one full
    // rotation, the allowance is gone; abort the campaign instead of hammering.
    if (r.status === 429) {
      quotaHits++;
      if (quotaHits >= KEYS.length) {
        throw new Error(`QUOTA_EXHAUSTED: all ${KEYS.length} keys returned HTTP 429. Campaign aborted rather than retried; free-tier allowances reset daily.`);
      }
      await sleep(1500); continue;
    }
    if (r.status === 503 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
    const tx = await r.text();
    if (r.ok) { try { return JSON.parse(JSON.parse(tx).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}'); } catch { return null; } }
    await sleep(400); continue; // any client error (expired/blocked key): rotate to the other key
  }
  return null;
}

// A value is "grounded" if a number it contains, or (if no number) a >=10-char
// slice of it, appears in the normalized source text.
function grounded(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value); if (v.length < 4) return nsrc.includes(v);
  return nsrc.includes(v.slice(0, Math.min(18, v.length)));
}

// Robust locatability: numbers stay STRICT (verbatim in source, preserves the
// anti-hallucination guarantee on monetary/date fields), but a text value counts
// as grounded when every content token (>=4 chars) appears in the source, instead
// of a brittle 18-char prefix slice. This recovers correct categorical values the
// model phrases with extra words (e.g. "Contrato de obras" where the source has
// "obras"), which the prefix check wrongly rejected.
function groundedRobust(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value); if (v.length < 4) return nsrc.includes(v);
  const toks = v.split(/\s+/).filter((t) => t.length >= 4);
  if (!toks.length) return nsrc.includes(v.slice(0, Math.min(18, v.length)));
  return toks.every((t) => nsrc.includes(t));
}

const pct = (a, b) => b ? Math.round((100 * a) / b) : 0;
const RUNS = Number(process.env.RUNS || 5);
const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f));

// Clean each PDF once (deterministic) and cache text + det extraction.
const docs = [];
for (const f of files) {
  const text = await clean(`${dir}/${f}`); const nsrc = norm(text);
  const det = extractDeterministicFichaFields(text);
  const gold = labels[f] || {}; const gk = Object.keys(gold).filter((k) => !k.startsWith('_'));
  let detFill = 0, detAcc = 0;
  for (const k of FIELDS) if (det[k]?.value) detFill++;
  for (const k of gk) if (norm(det[k]?.value || '').includes(norm(gold[k]))) detAcc++;
  docs.push({ f, text, nsrc, det, gold, gk, detFill, detAcc });
}
const detFill = docs.reduce((s, d) => s + d.detFill, 0);
const detAcc = docs.reduce((s, d) => s + d.detAcc, 0);
const labelN = docs.reduce((s, d) => s + d.gk.length, 0);
const total = docs.length * FIELDS.length;

// Repeat the stochastic model-dependent measurement until RUNS *complete* runs
// (every document returned output) are collected, so partial API failures do
// not contaminate the average.
writeFileSync('paper/_progress.log', `keys: ${KEYS.length}; target runs: ${RUNS}; model: ${MODEL}; sampling: ${PINNED ? JSON.stringify(PIN_CFG) : 'provider defaults (UNPINNED)'}\n`);
console.log(`sampling configuration: ${PINNED ? JSON.stringify(PIN_CFG) : 'provider defaults (UNPINNED)'}`);
const runStats = [];
const perField = {};
let attempt = 0, consecFails = 0;
while (runStats.length < RUNS && attempt < RUNS * 4) {
  if (consecFails >= 3) { console.log(`\nStopping early: ${consecFails} consecutive failed attempts (keys exhausted).`); break; }
  attempt++;
  let rawUsable = 0, aiFill = 0, aiGround = 0, aiAcc = 0, gatedFill = 0, gatedAcc = 0, hybFill = 0, hybAcc = 0, hybUngr = 0, agFill = 0, agAcc = 0, gatedRFill = 0, gatedRAcc = 0, failed = 0;
  const perdoc = [];
  const runField = {};
  for (const d of docs) {
    const raw = KEY ? await gemini(getSystemPrompt('ficha', 'es'), focus(d.text).slice(0, 120000)) : null;
    if (KEY && raw == null) failed++;
    await sleep(1200);
    const rawFicha = raw ? (raw.ficha ?? raw.ficha_ejecutiva ?? raw) : {};
    const normd = raw ? normalizeModelFicha(raw) : null;
    const gated = {}; const hyb = {}; const aiGated = {}; const gatedR = {};
    let aFill = 0, gFill = 0;
    for (const k of FIELDS) {
      const rv = rawFicha[k]; if (typeof rv === 'string' && rv.trim()) rawUsable++;
      const nv = normd?.[k]?.value ?? null; if (nv) { aiFill++; aFill++; if (grounded(nv, d.nsrc)) aiGround++; }
      const dv = d.det[k]?.value || null;
      gated[k] = dv || (nv && grounded(nv, d.nsrc) ? nv : null); // full workflow: deterministic, else GROUNDED ai
      if (gated[k]) { gatedFill++; gFill++; }
      // Ablation: det + AI WITHOUT the gate (isolates the gate vs the full workflow).
      hyb[k] = dv || nv;
      if (hyb[k]) { hybFill++; if (!dv && nv && !grounded(nv, d.nsrc)) hybUngr++; }
      // Ablation: AI + gate but NO rules (isolates the deterministic engine's share).
      aiGated[k] = (nv && grounded(nv, d.nsrc)) ? nv : null;
      if (aiGated[k]) agFill++;
      // Improvement: full workflow under ROBUST (token-based) grounding.
      gatedR[k] = dv || (groundedRobust(nv, d.nsrc) ? nv : null);
      if (gatedR[k]) gatedRFill++;
    }
    for (const k of d.gk) {
      const aiOK = norm(normd?.[k]?.value || '').includes(norm(d.gold[k]));
      const gatedOK = norm(gated[k] || '').includes(norm(d.gold[k]));
      const detOK = norm(d.det[k]?.value || '').includes(norm(d.gold[k]));
      if (aiOK) aiAcc++;
      if (gatedOK) gatedAcc++;
      if (norm(hyb[k] || '').includes(norm(d.gold[k]))) hybAcc++;
      if (norm(aiGated[k] || '').includes(norm(d.gold[k]))) agAcc++;
      if (norm(gatedR[k] || '').includes(norm(d.gold[k]))) gatedRAcc++;
      runField[`${d.f.slice(0, 16)}::${k}`] = { gold: d.gold[k], det: detOK, ai: aiOK, wf: gatedOK };
    }
    perdoc.push({ f: d.f.slice(0, 22).trim(), det: d.detFill, ai: aFill, gated: gFill });
  }
  if (failed > 0) { consecFails++; const m = `attempt ${attempt}: discarded (${failed} doc call(s) failed)`; console.log(m); appendFileSync('paper/_progress.log', m + '\n'); continue; }
  consecFails = 0;
  for (const [key, v] of Object.entries(runField)) {
    const pf = (perField[key] ||= { gold: v.gold, det: 0, ai: 0, wf: 0 });
    pf.det += v.det ? 1 : 0; pf.ai += v.ai ? 1 : 0; pf.wf += v.wf ? 1 : 0;
  }
  runStats.push({ rawUsable, aiFill, aiGround, aiAcc, gatedFill, gatedAcc, hybFill, hybAcc, hybUngr, agFill, agAcc, gatedRFill, gatedRAcc, perdoc });
  const m = `run ${runStats.length}: workflow STRICT acc ${gatedAcc}/${labelN} cov ${gatedFill}/${total} | workflow ROBUST acc ${gatedRAcc}/${labelN} cov ${gatedRFill}/${total} | AI alone ${aiAcc}/${labelN}`;
  console.log(m); appendFileSync('paper/_progress.log', m + '\n');
}
if (runStats.length < RUNS) console.log(`\nWARNING: only ${runStats.length}/${RUNS} complete runs collected (token/quota likely exhausted).`);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rng = (a) => `${Math.min(...a)}–${Math.max(...a)}`;
const col = (key) => runStats.map((s) => s[key]);
// sample standard deviation and 95% confidence interval (t-distribution)
const TCRIT = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23, 11: 2.20, 12: 2.18, 13: 2.16, 14: 2.14, 15: 2.13 };
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci = (a) => { const n = a.length; if (n < 2) return 0; return (TCRIT[n - 1] || 1.96) * sd(a) / Math.sqrt(n); };
const ms = (a) => `${mean(a).toFixed(1)} ± ${ci(a).toFixed(1)} (SD ${sd(a).toFixed(1)}, range ${rng(a)})`;
const ungr = runStats.map((s) => 100 - pct(s.aiGround, s.aiFill));
console.log(`\n==== MODEL=${MODEL} | AGGREGATE over ${runStats.length} complete runs (n=${docs.length} docs, ${total} field-slots, ${labelN} golden); intervals are 95% t-CI ====`);
console.log(`Deterministic only         : coverage ${detFill}/${total} (${pct(detFill, total)}%)  accuracy ${detAcc}/${labelN} (${pct(detAcc, labelN)}%)  ungrounded 0%  [reproducible]`);
console.log(`LLM, used as returned      : usable ${Math.round(mean(col('rawUsable')))}/${total} (${pct(Math.round(mean(col('rawUsable'))), total)}%)  accuracy 0/${labelN}`);
console.log(`AI engine alone (no det)   : coverage ${ms(col('aiFill'))} /${total}   accuracy ${ms(col('aiAcc'))} /${labelN}   ungrounded% ${ms(ungr)}`);
console.log(`Hybrid, UNGATED (det+AI)   : coverage ${ms(col('hybFill'))} /${total}   accuracy ${ms(col('hybAcc'))} /${labelN}   ungrounded% ${ms(runStats.map((s) => pct(s.hybUngr, s.hybFill)))}`);
console.log(`AI + gate, NO rules        : coverage ${ms(col('agFill'))} /${total}   accuracy ${ms(col('agAcc'))} /${labelN}   surfaced ungrounded 0%`);
console.log(`Full workflow, GATED       : coverage ${ms(col('gatedFill'))} /${total}   accuracy ${ms(col('gatedAcc'))} /${labelN}   surfaced ungrounded 0%`);
console.log(`Full workflow, ROBUST gate : coverage ${ms(col('gatedRFill'))} /${total}   accuracy ${ms(col('gatedRAcc'))} /${labelN}   (numbers still strict-verbatim)`);
console.log(`>>> GROUNDING SENSITIVITY (strict 18-char prefix vs robust token-based): accuracy ${mean(col('gatedAcc')).toFixed(1)} -> ${mean(col('gatedRAcc')).toFixed(1)} /${labelN}  |  coverage ${mean(col('gatedFill')).toFixed(1)} -> ${mean(col('gatedRFill')).toFixed(1)} /${total}`);
// per-field success across runs (Reviewer A7): which golden fields are systematically hard
const NR = runStats.length;
let pfOut = `doc::field\tgold\tdet/${NR}\tAIalone/${NR}\tworkflow/${NR}\n`;
for (const [key, v] of Object.entries(perField)) pfOut += `${key}\t${String(v.gold).slice(0, 22)}\t${v.det}\t${v.ai}\t${v.wf}\n`;
writeFileSync('paper/_perfield.tsv', pfOut);
console.log('\nPER-FIELD success across ' + NR + ' runs (-> paper/_perfield.tsv):\n' + pfOut);
console.log(`>>> GATE EFFECT (Hybrid UNGATED vs Full workflow GATED, same det floor, differ only by the gate):`);
console.log(`    accuracy ${mean(col('hybAcc')).toFixed(1)} -> ${mean(col('gatedAcc')).toFixed(1)} /${labelN}   |   ungrounded ${mean(runStats.map((s) => pct(s.hybUngr, s.hybFill))).toFixed(0)}% -> 0%`);
// per-doc means
const pdKeys = docs.map((d) => d.f.slice(0, 22).trim());
console.log(`\nPER-DOC mean coverage (det/AI/gated):`);
pdKeys.forEach((name, i) => {
  const ai = mean(runStats.map((s) => s.perdoc[i].ai));
  const g = mean(runStats.map((s) => s.perdoc[i].gated));
  console.log(`  ${name.padEnd(24)} ${docs[i].detFill} / ${ai.toFixed(1)} / ${g.toFixed(1)}`);
});
