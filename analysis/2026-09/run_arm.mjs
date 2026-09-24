// R2-2 stage B: execute one (arm, run) batch of model calls.
//
// One JSON file is written per (arm, run, document) IMMEDIATELY after the call
// returns, so a killed process loses at most one call and a resume skips what
// already exists. Failures are recorded as outcomes, never dropped (decision 5).
// Quota exhaustion is the one condition that writes nothing and exits 3, so the
// document is retried on a later day rather than banked as a failure.
//
// usage: node run_arm.mjs --arm <id> --run <n>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ROOT, OUT, WORK, imp, FIELDS, MODEL, ENDPOINT, PIN_CFG, FLAT_SCHEMA, DOCIE_PROMPT, CUES,
         norm, grounded, groundedRobust, selectInput, ARM_BY_ID, collectKeys } from './arms.mjs';

const { normalizeModelFicha } = await imp('lib/pipeline/blocks/ficha-normalize.ts');
const { getSystemPrompt } = await imp('lib/prompts.ts');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const armId = arg('arm');
const runNo = Number(arg('run'));
const arm = ARM_BY_ID[armId];
if (!arm || !Number.isInteger(runNo) || runNo < 1) { console.error('usage: --arm <id> --run <n>'); process.exit(2); }

// SYNTHETIC is the offline self-test: every step except the HTTP call runs for
// real, against a fabricated response. It refuses to write inside the campaign
// directory, and every record it writes is stamped synthetic:true, which
// assemble.py rejects. It exists so the harness is proved before a key is spent.
const SYNTHETIC = process.env.R2_SYNTHETIC === '1';
if (SYNTHETIC && WORK === OUT) { console.error('R2_SYNTHETIC requires R2_OUT to point outside the campaign directory'); process.exit(2); }

const KEYS = collectKeys();
if (!KEYS.length && !SYNTHETIC) { console.error('NO_KEY: no GKEY* variable is set'); process.exit(4); }
if (!SYNTHETIC) console.log(`keys in rotation: ${KEYS.length}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = Number(process.env.R2_PACE_MS || 9000);
const slug = (f) => f.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
const runDir = `${WORK}/raw/${armId}/run${String(runNo).padStart(2, '0')}`;
mkdirSync(runDir, { recursive: true });

const cache = JSON.parse(readFileSync(`${OUT}/cache/text_${arm.variant}.json`, 'utf8'));

// Key rotation offset, persisted across processes.
//
// Each batch is only four calls, so a rotation that restarted at key 0 in every
// process hammered the first keys and barely touched the last: over the first
// day keys 1 and 2 took 45 and 43 attempts while key 8 took 8. Since the
// free-tier allowance is per project and each key is its own project, that
// wasted most of the daily capacity. Carrying the offset over spreads calls
// evenly. The file holds a counter and no key material.
const ROT = `${WORK}/rotation_state.json`;
let _ki = 0;
try { _ki = Number(JSON.parse(readFileSync(ROT, 'utf8')).next || 0) || 0; } catch { _ki = 0; }
const saveRotation = () => { try { writeFileSync(ROT, JSON.stringify({ next: _ki % 1000003, note: 'key rotation offset; contains no key material' })); } catch { /* best effort */ } };
// Returns {ok, attempts[], retries, latency_ms, text, http_status, usage, model_version,
// finish_reason, quota_exhausted}. Never returns key material.
async function callGemini(instr, input, useSchema, doc, file) {
  if (SYNTHETIC) return synthesise(doc, file);
  const generationConfig = { responseMimeType: 'application/json', ...PIN_CFG };
  if (useSchema) generationConfig.responseJsonSchema = FLAT_SCHEMA;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: instr }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig,
  });
  const attempts = [];
  const t0 = Date.now();
  let quotaHits = 0;
  // The cap must allow a full rotation of every key to return 429 before the
  // loop gives up, or a wide rotation would report "retries exhausted" for what
  // is really quota exhaustion, and the campaign would bank it as a failure.
  const MAX_ATTEMPTS = Math.max(10, KEYS.length + 4);
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const key = KEYS[_ki % KEYS.length]; const keyIndex = _ki % KEYS.length; _ki++;
    const s = Date.now();
    let r;
    try {
      r = await fetch(`${ENDPOINT}/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      attempts.push({ key_index: keyIndex, http_status: null, latency_ms: Date.now() - s, outcome: 'network_or_timeout', error_class: e?.name || 'Error' });
      await sleep(2000 * (a + 1)); continue;
    }
    const lat = Date.now() - s;
    if (r.status === 429) {
      quotaHits++;
      // Record which quota was hit and any retry delay the server names, so a
      // stop can be explained rather than guessed at. No key material is in it.
      let quota = null;
      try {
        const e = JSON.parse(await r.text())?.error;
        quota = {
          message: e?.message?.slice(0, 400) ?? null,
          violations: (e?.details || []).flatMap((d) => (d.violations || []).map((v) => ({ id: v.quotaId, metric: v.quotaMetric, value: v.quotaValue }))),
          retry_after: (e?.details || []).find((d) => d['@type']?.includes('RetryInfo'))?.retryDelay ?? null,
        };
      } catch { /* body not JSON; status alone is the record */ }
      attempts.push({ key_index: keyIndex, http_status: 429, latency_ms: lat, outcome: 'quota', quota });
      if (quotaHits >= KEYS.length) return { ok: false, quota_exhausted: true, quota, attempts, retries: attempts.length - 1, latency_ms: Date.now() - t0 };
      await sleep(1500); continue;
    }
    if (r.status === 503 || r.status >= 500) {
      attempts.push({ key_index: keyIndex, http_status: r.status, latency_ms: lat, outcome: 'server_error' });
      await sleep(2000 * (a + 1)); continue;
    }
    const tx = await r.text();
    if (r.ok) {
      attempts.push({ key_index: keyIndex, http_status: r.status, latency_ms: lat, outcome: 'ok' });
      let env = null;
      try { env = JSON.parse(tx); } catch { /* handled below */ }
      return {
        ok: true, attempts, retries: attempts.length - 1, latency_ms: Date.now() - t0,
        http_status: r.status, response_bytes: tx.length,
        model_version: env?.modelVersion ?? null,
        finish_reason: env?.candidates?.[0]?.finishReason ?? null,
        usage: env?.usageMetadata ?? null,
        text: env?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? null,
      };
    }
    let msg = '';
    try { msg = JSON.parse(tx)?.error?.status || ''; } catch { msg = ''; }
    attempts.push({ key_index: keyIndex, http_status: r.status, latency_ms: lat, outcome: 'client_error', error_class: msg });
    await sleep(400);
  }
  return { ok: false, quota_exhausted: false, attempts, retries: attempts.length - 1, latency_ms: Date.now() - t0 };
}

// Offline self-test response. Deterministic in (arm, run, document) so the
// self-test is reproducible. It deliberately produces correct values, one wrong
// value, one ungrounded value, one unparseable body and one retry, so every
// branch of the scorer and of the reliability accounting is exercised.
function synthesise(d, file) {
  const idx = Object.keys(cache).indexOf(file);
  const attempts = [];
  if ((runNo + idx) % 4 === 0) attempts.push({ key_index: 0, http_status: 503, latency_ms: 800, outcome: 'server_error' });
  attempts.push({ key_index: 0, http_status: 200, latency_ms: 4200 + 250 * idx + 90 * runNo, outcome: 'ok' });
  const gk = Object.keys(d.gold);
  const flat = Object.fromEntries(FIELDS.map((k) => [k, null]));
  gk.forEach((k, i) => {
    let v = d.gold[k];
    if (runNo % 3 === 0 && i === 0) v = `${v} (revisado)`;          // still correct: whole-word containment
    if (runNo % 5 === 0 && i === 1) v = '999.999,99 EUR';           // wrong and ungrounded
    flat[k] = v;
  });
  flat.lugar_presentacion = 'Plataforma inexistente de Contratacion Fabricada';  // ungrounded on purpose
  const extra = d.text.match(/procedimiento abierto/i);
  if (extra && !flat.procedimiento) flat.procedimiento = extra[0];
  let text;
  if (arm.mode === 'docie') {
    text = JSON.stringify({ campos: Object.entries(flat).filter(([, v]) => v).map(([k, v]) => ({ clave: k.replace(/_/g, ' '), valor: v })) });
  } else if ((runNo + idx) % 7 === 3) {
    text = '{"ficha": {truncated';                                   // unparseable on purpose
  } else if (arm.schema) {
    text = JSON.stringify(flat);
  } else {
    text = JSON.stringify({ ficha: Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, { value: v, clause_reference: null, confidence: 'alta', notes: null }])) });
  }
  const lat = attempts.reduce((s, a) => s + a.latency_ms, 0);
  return { ok: true, attempts, retries: attempts.length - 1, latency_ms: lat, http_status: 200,
    response_bytes: text.length, model_version: 'gemini-2.5-flash-SYNTHETIC', finish_reason: 'STOP',
    usage: { promptTokenCount: Math.round(input_len / 3.6), candidatesTokenCount: 700, totalTokenCount: Math.round(input_len / 3.6) + 700 },
    text };
}
let input_len = 0;

// Deterministic mapping from a generic key-value list to the 22-field schema, by
// the same cue patterns the passage-selection rule uses. This mapping is part of
// the baseline system, not of the scorer: a generic extractor emits its own keys
// and has to be projected onto the schema before it can be compared at all.
function mapDocie(pairs) {
  const out = Object.fromEntries(FIELDS.map((k) => [k, null]));
  for (const [field, pats] of Object.entries(CUES)) {
    for (const p of pairs) {
      const k = String(p?.clave ?? p?.key ?? '');
      const v = p?.valor ?? p?.value ?? null;
      if (!k || v == null || String(v).trim() === '') continue;
      if (pats.some((re) => re.test(k))) { out[field] = String(v).trim(); break; }
    }
  }
  return out;
}

const instr = arm.mode === 'docie' ? DOCIE_PROMPT : getSystemPrompt('ficha', 'es');
let wrote = 0, skipped = 0;
for (const [file, d] of Object.entries(cache)) {
  const path = `${runDir}/${slug(file)}.json`;
  if (existsSync(path)) { skipped++; continue; }
  const input = selectInput(arm.selection, d.text);
  input_len = input.length;
  const started = new Date().toISOString();
  const res = await callGemini(instr, input, arm.schema, d, file);
  if (res.quota_exhausted) {
    console.log(`QUOTA_EXHAUSTED at ${armId} run ${runNo} ${file}: all ${KEYS.length} key(s) returned HTTP 429. Nothing written for this document; resume later.`);
    if (res.quota) console.log(`  quota detail: ${JSON.stringify(res.quota)}`);
    saveRotation();
    process.exit(3);
  }

  let parsed = null, json_ok = false;
  if (res.ok && res.text != null) { try { parsed = JSON.parse(res.text); json_ok = parsed != null && typeof parsed === 'object'; } catch { json_ok = false; } }

  const rawFicha = arm.mode === 'docie' ? {}
    : (parsed ? (parsed.ficha ?? parsed.ficha_ejecutiva ?? parsed) : {});
  const daPairs = arm.mode === 'docie' && parsed ? (Array.isArray(parsed.campos) ? parsed.campos : Array.isArray(parsed.fields) ? parsed.fields : []) : [];
  const docieMapped = arm.mode === 'docie' ? mapDocie(daPairs) : null;
  const normd = (arm.normalize && parsed) ? normalizeModelFicha(parsed) : null;

  // Schema compliance: every declared field present with the declared type.
  const schema_ok = arm.schema
    ? !!parsed && FIELDS.every((k) => k in parsed && (parsed[k] === null || typeof parsed[k] === 'string'))
    : null;

  const fields = {};
  for (const k of FIELDS) {
    const rv = arm.mode === 'docie' ? docieMapped[k] : rawFicha?.[k];
    const raw = typeof rv === 'string' && rv.trim() ? rv.trim() : (rv && typeof rv === 'object' && typeof rv.value === 'string' && rv.value.trim() ? rv.value.trim() : null);
    const nv = arm.normalize ? (normd?.[k]?.value ?? null) : raw;
    fields[k] = {
      raw,
      model_value: nv,
      deterministic: d.det[k] ?? null,
      grounded_strict: nv ? grounded(nv, d.nsrc) : false,
      grounded_robust: nv ? groundedRobust(nv, d.nsrc) : false,
    };
  }

  const rec = {
    arm: armId, arm_factor: arm.factor, run: runNo, document: file,
    pages: d.pages, source_chars: d.chars,
    preprocessing_variant: arm.variant, selection_rule: arm.selection,
    normaliser: arm.normalize, structured_output_schema: arm.schema ? 'flat_value_only' : null,
    prompt_mode: arm.mode,
    input_chars: input.length,
    model_requested: MODEL, model_served: res.model_version ?? null,
    endpoint: `${ENDPOINT}/models/${MODEL}:generateContent`,
    generation_config: { ...PIN_CFG, responseMimeType: 'application/json', responseJsonSchema: arm.schema ? 'flat_value_only' : null },
    started_at: started, finished_at: new Date().toISOString(),
    call: {
      request_valid: !!res.ok, http_status: res.http_status ?? null,
      attempts: res.attempts, retries: res.retries, calls: res.attempts.length,
      latency_ms: res.latency_ms, finish_reason: res.finish_reason ?? null,
      response_bytes: res.response_bytes ?? null, usage: res.usage ?? null,
      failure_mode: res.ok ? null : 'retries_exhausted',
    },
    parse: { json_ok, schema_compliant: schema_ok, raw_field_count: Object.values(fields).filter((f) => f.raw).length },
    fields,
    docie_pairs: arm.mode === 'docie' ? daPairs.slice(0, 400) : null,
    gold: d.gold,
  };
  if (SYNTHETIC) rec.synthetic = true;
  writeFileSync(path, JSON.stringify(rec, null, 1));
  saveRotation();
  wrote++;
  const emitted = Object.values(fields).filter((f) => f.model_value).length;
  console.log(`${armId} run ${runNo} ${file.slice(0, 28).padEnd(30)} http ${String(res.http_status ?? 'FAIL').padEnd(4)} retries ${res.retries} ${String(res.latency_ms).padStart(6)}ms json ${json_ok ? 'ok ' : 'NO '} emitted ${emitted}/22`);
  // Free-tier pacing. The gap is deliberately long: at ~120,000 characters an
  // input is roughly 33,000 tokens, so the tokens-per-minute allowance binds
  // well before the requests-per-minute one. Keys alternate per attempt, so the
  // per-key rate is half the rate below.
  if (!SYNTHETIC) await sleep(PACE_MS);
}
console.log(`done ${armId} run ${runNo}: wrote ${wrote}, already present ${skipped}`);
