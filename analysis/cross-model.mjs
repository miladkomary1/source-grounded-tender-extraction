// Cross-model replication + per-value dump (revision R1).
//
// Two jobs in one pass, both requested by Reviewer #1:
//   MAJOR 6, "test the same schema on at least one other model or provider":
//             runs the SAME prompt/normalizer/gate stack on DeepSeek instead of
//             Gemini, and additionally tests the DECOMPOSED record-only schema
//             that the Gemini endpoint accepted but was never evaluated.
//   MAJOR 1, dumps every value the full workflow SURFACES, with the engine that
//             produced it, so a human auditor can check whether "passes the
//             locatability gate" really means "present and correctly interpreted".
//
//   DSKEY=<deepseek key> node paper/_crossmodel.mjs [RUNS=3]
//
// Writes: paper/_crossmodel.log (console copy), paper/_surfaced_values.json

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const KEY = process.env.DSKEY;
const RUNS = Number(process.env.RUNS || 3);
const MODEL = process.env.DSMODEL || 'deepseek-chat';
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

const out = [];
const log = (s) => { console.log(s); out.push(s); };

async function clean(p) {
  const d = new Uint8Array(readFileSync(p));
  const pdf = await pdfjs.getDocument({ data: d, useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  return removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
}
function focus(t) { const hp = /(?:^|\n)\s*ANEXO\s+I\b/g; let m = null; for (const x of t.matchAll(hp)) m = x; if (!m) return t; const s = m.index; const nx = /(?:^|\n)\s*ANEXO\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/.exec(t.slice(s + 10)); const e = nx ? s + 10 + nx.index : Math.min(t.length, s + 120000); const f = `${t.slice(0, Math.min(12000, s))}\n\n[…]\n\n${t.slice(s, e)}`; return (f.length >= 8000 && f.length < t.length * 0.8) ? f : t; }

let tokIn = 0, tokOut = 0;
async function deepseek(instr, input, schema) {
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: instr }, { role: 'user', content: input }],
    stream: false,
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  };
  if (schema) body.messages[0].content += `\n\nDevuelve EXACTAMENTE este esquema JSON (22 campos de primer nivel, sin anidar): ${schema}`;
  for (let a = 0; a < 4; a++) {
    let r;
    try {
      r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
      });
    } catch { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; }
    const tx = await r.text();
    if (!r.ok) { log(`  API ${r.status}: ${tx.slice(0, 160)}`); return null; }
    try {
      const d = JSON.parse(tx);
      tokIn += d.usage?.prompt_tokens || 0; tokOut += d.usage?.completion_tokens || 0;
      return JSON.parse(d.choices?.[0]?.message?.content ?? '{}');
    } catch { return null; }
  }
  return null;
}

// Canonical gate = strict (numbers verbatim; text by 18-char prefix), as in Table 5.
function grounded(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value); if (v.length < 4) return nsrc.includes(v);
  return nsrc.includes(v.slice(0, Math.min(18, v.length)));
}
/** Context window around the first occurrence, for the human auditor. */
function locate(value, text) {
  if (!value) return null;
  const nsrc = norm(text), v = norm(value);
  const probe = v.length > 18 ? v.slice(0, 18) : v;
  const i = nsrc.indexOf(probe);
  if (i < 0) return null;
  // map back approximately: search raw text case-insensitively for the first token
  const tok = String(value).trim().split(/\s+/)[0];
  const j = tok ? text.toLowerCase().indexOf(tok.toLowerCase()) : -1;
  const at = j >= 0 ? j : 0;
  return text.slice(Math.max(0, at - 180), at + 320).replace(/\s+/g, ' ').trim();
}

const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
const docs = [];
for (const f of files) {
  const text = await clean(`${dir}/${f}`);
  docs.push({ f, text, nsrc: norm(text), det: extractDeterministicFichaFields(text), gold: labels[f] || {} });
}
const labelN = docs.reduce((s, d) => s + Object.keys(d.gold).filter((k) => !k.startsWith('_')).length, 0);
const total = docs.length * FIELDS.length;

const DECOMPOSED = JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, 'string|null'])));
const runs = [];
const surfaced = [];   // per-value dump for the human audit (first run only)

for (let r = 1; r <= RUNS; r++) {
  let aiFill = 0, aiGround = 0, aiAcc = 0, gFill = 0, gAcc = 0, hFill = 0, hAcc = 0, hUngr = 0, failed = 0;
  for (const d of docs) {
    const raw = await deepseek(getSystemPrompt('ficha', 'es'), focus(d.text).slice(0, 120000));
    if (!raw) { failed++; continue; }
    const normd = normalizeModelFicha(raw);
    await sleep(600);
    for (const k of FIELDS) {
      const nv = normd?.[k]?.value ?? null;
      const dv = d.det[k]?.value || null;
      const g = nv ? grounded(nv, d.nsrc) : false;
      if (nv) { aiFill++; if (g) aiGround++; }
      const gated = dv || (g ? nv : null);      // full workflow
      const hyb = dv || nv;                      // ungated hybrid
      if (gated) gFill++;
      if (hyb) { hFill++; if (!dv && nv && !g) hUngr++; }
      if (r === 1 && gated) {
        surfaced.push({ doc: d.f, field: k, value: gated, engine: dv ? 'deterministic' : 'language-model (gate-passed)', context: locate(gated, d.text) });
      }
    }
    for (const k of Object.keys(d.gold).filter((x) => !x.startsWith('_'))) {
      const nv = normd?.[k]?.value ?? null, dv = d.det[k]?.value || null;
      const g = nv ? grounded(nv, d.nsrc) : false;
      if (norm(nv || '').includes(norm(d.gold[k]))) aiAcc++;
      if (norm(dv || (g ? nv : '') || '').includes(norm(d.gold[k]))) gAcc++;
      if (norm(dv || nv || '').includes(norm(d.gold[k]))) hAcc++;
    }
  }
  if (failed) { log(`run ${r}: DISCARDED (${failed} doc call(s) failed)`); continue; }
  runs.push({ aiFill, aiGround, aiAcc, gFill, gAcc, hFill, hAcc, hUngr });
  log(`run ${r}: workflow ${gAcc}/${labelN} acc, cov ${gFill}/${total} | ungated ${hAcc}/${labelN}, ungr ${hUngr} | AI alone ${aiAcc}/${labelN}, ungrounded ${aiFill ? Math.round(100 * (aiFill - aiGround) / aiFill) : 0}%`);
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const TC = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57 };
const ci = (a) => a.length < 2 ? 0 : (TC[a.length - 1] || 1.96) * sd(a) / Math.sqrt(a.length);
const col = (k) => runs.map((x) => x[k]);
const ms = (k) => `${mean(col(k)).toFixed(1)} ± ${ci(col(k)).toFixed(1)}`;

log(`\n==== CROSS-MODEL (${MODEL}) over ${runs.length} complete runs | n=${docs.length} docs, ${total} slots, ${labelN} golden ====`);
if (runs.length) {
  const ungr = runs.map((s) => s.aiFill ? 100 * (s.aiFill - s.aiGround) / s.aiFill : 0);
  log(`AI engine alone      : coverage ${ms('aiFill')}/${total}   accuracy ${ms('aiAcc')}/${labelN}   ungrounded ${mean(ungr).toFixed(1)}%`);
  log(`Hybrid, UNGATED      : coverage ${ms('hFill')}/${total}   accuracy ${ms('hAcc')}/${labelN}   ungrounded values ${mean(col('hUngr')).toFixed(1)}`);
  log(`Full workflow, GATED : coverage ${ms('gFill')}/${total}   accuracy ${ms('gAcc')}/${labelN}   surfaced ungrounded 0`);
}
log(`tokens: ${tokIn} in / ${tokOut} out  (~CNY ${((tokIn / 1e6) * 2 + (tokOut / 1e6) * 8).toFixed(3)})`);

// ---- MAJOR 6: the DECOMPOSED record-only schema the Gemini endpoint accepted ----
// Skipped when harvesting audit values from the unlabelled corpus (already
// answered on the labelled documents; a second pass would cost tokens for nothing).
log(`\n---- Decomposed record-only schema (22 single-level fields), 1 pass ----`);
let decFill = 0, decAcc = 0, decOK = 0;
for (const d of (process.env.SKIP_DECOMPOSED ? [] : docs)) {
  const raw = await deepseek(getSystemPrompt('ficha', 'es'), focus(d.text).slice(0, 120000), DECOMPOSED);
  if (!raw) { log(`  ${d.f.slice(0, 24)}: REJECTED/failed`); continue; }
  decOK++;
  const normd = normalizeModelFicha(raw) || {};
  for (const k of FIELDS) if (normd?.[k]?.value) decFill++;
  for (const k of Object.keys(d.gold).filter((x) => !x.startsWith('_'))) if (norm(normd?.[k]?.value || '').includes(norm(d.gold[k]))) decAcc++;
  await sleep(600);
}
log(process.env.SKIP_DECOMPOSED
  ? 'decomposed schema: SKIPPED (SKIP_DECOMPOSED set)'
  : `decomposed schema: ${decOK}/${docs.length} docs returned usable output | coverage ${decFill}/${total} | accuracy ${decAcc}/${labelN}`);
log(`tokens total: ${tokIn} in / ${tokOut} out  (~CNY ${((tokIn / 1e6) * 2 + (tokOut / 1e6) * 8).toFixed(3)})`);

const SUF = process.env.OUT_SUFFIX || '';
// Write the DATA first: it is the expensive artefact (API tokens already spent).
// A failure to write the convenience log must never destroy it, that happened
// once when the shell held the same filename open (EBUSY).
writeFileSync(`${root}/paper/_surfaced_values${SUF}.json`, JSON.stringify(surfaced, null, 2), 'utf8');
try {
  writeFileSync(`${root}/paper/_crossmodel${SUF}.log`, out.join('\n'), 'utf8');
} catch (e) {
  console.log(`(log file not written: ${e.code}, data JSON is safe)`);
}
log(`\nwrote paper/_crossmodel.log and paper/_surfaced_values.json (${surfaced.length} surfaced values for audit)`);
