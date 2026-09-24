// Model interface charge of the canonical configuration, from measured token counts.
//
// Reads the archived per-call usage of the September 2026 campaign. No network, no key.
// Token counts are the primary quantity: they stay valid after provider prices change.
//
//   node analysis/2026-09/cost.mjs

import { readFileSync } from 'node:fs';

const RESULTS = 'data/runs/2026-09/results.json';

// Google Generative Language API, gemini-2.5-flash, paid tier, standard,
// USD per million tokens, accessed 16 September 2026.
const PRICE = { input: 0.30, output: 2.50 };

const data = JSON.parse(readFileSync(RESULTS, 'utf8'));

const byArm = new Map();
for (const r of data.records) {
  const u = r.call?.usage;
  if (!u) continue;
  const a = byArm.get(r.arm) ?? { calls: 0, prompt: 0, output: 0, chars: 0 };
  a.calls += 1;
  a.prompt += u.promptTokenCount ?? 0;
  a.output += u.candidatesTokenCount ?? 0;
  a.chars += Number(r.input_chars) || 0;
  byArm.set(r.arm, a);
}

const charge = (p, o) => (p / 1e6) * PRICE.input + (o / 1e6) * PRICE.output;
const f = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const lines = [];
lines.push('MODEL INTERFACE CHARGE, CANONICAL CONFIGURATION');
lines.push('campaign C-R2-4DOC, September 2026, model ' + data.canonical_configuration.model_requested
  + ', one call per document, no call avoided');
lines.push('prices accessed 16 September 2026: USD ' + PRICE.input.toFixed(2)
  + ' per 1M input tokens, USD ' + PRICE.output.toFixed(2) + ' per 1M output tokens');
lines.push('');
lines.push('arm'.padEnd(18) + 'calls'.padStart(7) + 'prompt/call'.padStart(13)
  + 'output/call'.padStart(13) + 'total/call'.padStart(12) + 'USD/document'.padStart(14));

for (const [arm, a] of byArm) {
  const p = a.prompt / a.calls;
  const o = a.output / a.calls;
  lines.push(arm.padEnd(18) + String(a.calls).padStart(7) + f(p).padStart(13)
    + f(o).padStart(13) + f(p + o).padStart(12)
    + charge(p, o).toFixed(4).padStart(14));
}

const c = byArm.get('control');
lines.push('');
lines.push('The canonical arm consumes ' + f(c.prompt / c.calls) + ' prompt and '
  + f(c.output / c.calls) + ' output tokens per document, a charge of USD '
  + charge(c.prompt / c.calls, c.output / c.calls).toFixed(4) + ' per document.');
lines.push('This is the model interface charge only. Reading time, deployment and operation');
lines.push('are not measured. The deterministic path of the deployed prototype consumes no');
lines.push('tokens, but the harness evaluated here never takes that path.');

console.log(lines.join('\n'));
