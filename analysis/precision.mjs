// Non-circular evidence for MAJOR 1, and the precision figure MINOR 5 / Q3.5 asks for.
//
// MAJOR 1's objection: "no ungrounded value surfaced" is measured with the same
// locatability test the gate applies, so it holds by construction. The golden
// labels, by contrast, were fixed independently of the gate. So for the labelled
// subset we CAN ask a non-circular question:
//     of the values the gate let through, how many are actually CORRECT?
// That is precision on the verified subset, which is also exactly the number
// Reviewer #1 says is "computable from the reported data" but never reported.
//
//   GKEY=... [PINNED=1] node paper/_precision.mjs
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const KEYS = [process.env.GKEY, process.env.GKEY2, process.env.GKEY3].filter(Boolean);
const MODEL = process.env.MODEL || 'gemini-2.5-flash';
const RUNS = Number(process.env.RUNS || 3);
const PIN = { temperature: 0, topP: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const dir = `${root}/examples`;
const imp = (r) => import(pathToFileURL(`${root}/${r}`).href);
const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines } = await imp('lib/pdf-cleaner.mjs');
const { extractDeterministicFichaFields } = await imp('lib/ficha-deterministic.mjs');
const { normalizeModelFicha } = await imp('lib/pipeline/blocks/ficha-normalize.ts');
const { getSystemPrompt } = await imp('lib/prompts.ts');

const labels = JSON.parse(readFileSync(`${root}/fixtures/eval-labels.json`, 'utf8'));
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clean(p) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(p)), useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  return removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
}
function focus(t) { const hp = /(?:^|\n)\s*ANEXO\s+I\b/g; let m = null; for (const x of t.matchAll(hp)) m = x; if (!m) return t; const s = m.index; const nx = /(?:^|\n)\s*ANEXO\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/.exec(t.slice(s + 10)); const e = nx ? s + 10 + nx.index : Math.min(t.length, s + 120000); const f = `${t.slice(0, Math.min(12000, s))}\n\n[…]\n\n${t.slice(s, e)}`; return (f.length >= 8000 && f.length < t.length * 0.8) ? f : t; }
function grounded(v, nsrc) {
  if (!v) return false;
  const nums = String(v).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const s = norm(v); if (s.length < 4) return nsrc.includes(s);
  return nsrc.includes(s.slice(0, Math.min(18, s.length)));
}
let ki = 0;
async function gemini(instr, input) {
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: instr }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { responseMimeType: 'application/json', ...(process.env.PINNED === '1' ? PIN : {}) } });
  for (let a = 0; a < 8; a++) {
    const key = KEYS[ki++ % KEYS.length];
    let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }); } catch { await sleep(1500 * (a + 1)); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; }
    const tx = await r.text(); if (!r.ok) { await sleep(500); continue; }
    try { return JSON.parse(JSON.parse(tx).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}'); } catch { return null; }
  }
  return null;
}

const docs = [];
for (const f of readdirSync(dir).filter((x) => /\.pdf$/i.test(x))) {
  const text = await clean(`${dir}/${f}`);
  docs.push({ f, text, nsrc: norm(text), det: extractDeterministicFichaFields(text), gold: labels[f] || {} });
}

const rows = [];
for (let r = 1; r <= RUNS; r++) {
  let surf = 0, corr = 0, lmSurf = 0, lmCorr = 0, detSurf = 0, detCorr = 0, failed = 0;
  for (const d of docs) {
    const raw = await gemini(getSystemPrompt('ficha', 'es'), focus(d.text).slice(0, 120000));
    if (!raw) { failed++; continue; }
    const nd = normalizeModelFicha(raw);
    await sleep(800);
    for (const k of Object.keys(d.gold).filter((x) => !x.startsWith('_'))) {
      const dv = d.det[k]?.value || null;
      const nv = nd?.[k]?.value ?? null;
      const gated = dv || (nv && grounded(nv, d.nsrc) ? nv : null);   // what the workflow SHOWS
      if (!gated) continue;                                            // withheld -> not counted in precision
      surf++;
      const ok = norm(gated).includes(norm(d.gold[k]));
      if (ok) corr++;
      if (dv) { detSurf++; if (ok) detCorr++; } else { lmSurf++; if (ok) lmCorr++; }
    }
  }
  if (failed) { console.log(`run ${r}: discarded (${failed} failures)`); continue; }
  rows.push({ surf, corr, lmSurf, lmCorr, detSurf, detCorr });
  console.log(`run ${r}: surfaced ${surf}/20 golden, correct ${corr} -> precision ${(100 * corr / surf).toFixed(1)}%  [LM-gated ${lmCorr}/${lmSurf}, det ${detCorr}/${detSurf}]`);
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const T = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 9: 2.26 };
const ci = (a) => a.length < 2 ? 0 : (T[a.length - 1] || 1.96) * sd(a) / Math.sqrt(a.length);
const prec = rows.map((x) => 100 * x.corr / x.surf);
const lmPrec = rows.map((x) => x.lmSurf ? 100 * x.lmCorr / x.lmSurf : 0);

const out = [];
out.push(`=== PRECISION ON THE VERIFIED SUBSET (MINOR 5 / Q3.5) and NON-CIRCULAR EVIDENCE (MAJOR 1) ===`);
out.push(`model ${MODEL}, sampling ${process.env.PINNED === '1' ? JSON.stringify(PIN) : 'provider defaults'}, ${rows.length} runs`);
out.push(`workflow precision on the verified subset : ${mean(prec).toFixed(1)} ± ${ci(prec).toFixed(1)} %   (correct / surfaced among the 20 golden values)`);
out.push(`  of which gate-passed LANGUAGE-MODEL values: ${mean(lmPrec).toFixed(1)} ± ${ci(lmPrec).toFixed(1)} %   (${mean(rows.map(r=>r.lmCorr)).toFixed(1)}/${mean(rows.map(r=>r.lmSurf)).toFixed(1)} per run)`);
out.push(`  deterministic values                     : ${(100 * mean(rows.map(r=>r.detCorr)) / Math.max(1e-9, mean(rows.map(r=>r.detSurf)))).toFixed(1)} %`);
out.push('');
out.push('WHY THIS IS NOT CIRCULAR: the golden labels were fixed independently of the');
out.push('grounding gate, so asking "of the values the gate let through, how many are');
out.push('CORRECT?" is not answerable by the gate itself. It is a genuine, if small,');
out.push('external check on the gate, complementary to (not a substitute for) a full');
out.push('human audit of the unlabelled surfaced values.');
console.log('\n' + out.join('\n'));
writeFileSync(`${root}/paper/_precision.txt`, out.join('\n'), 'utf8');
