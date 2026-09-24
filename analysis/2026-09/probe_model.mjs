// One metadata request: is the pinned model id still served, and does the
// endpoint still accept the flat responseJsonSchema the R3.23 arm needs?
// Costs no generation quota for the first check. Prints no key material.
import { MODEL, ENDPOINT, collectKeys } from './arms.mjs';

const KEYS = collectKeys();
if (!KEYS.length) { console.error('NO_KEY'); process.exit(4); }
console.log(`keys available: ${KEYS.length}`);

// Check every key separately: one dead or differently-scoped key in the rotation
// would otherwise show up later as an unexplained run of client errors.
let tx = null, ok = 0;
for (let i = 0; i < KEYS.length; i++) {
  const r = await fetch(`${ENDPOINT}/models/${MODEL}`, {
    headers: { 'x-goog-api-key': KEYS[i] }, signal: AbortSignal.timeout(60000),
  });
  const body = await r.text();
  let note = '';
  if (!r.ok) { try { note = JSON.parse(body)?.error?.status || JSON.parse(body)?.error?.message?.slice(0, 120) || ''; } catch { note = body.slice(0, 120); } }
  console.log(`  key ${i + 1}/${KEYS.length}  GET /models/${MODEL} -> HTTP ${r.status} ${note}`);
  if (r.ok) { ok++; tx = tx || body; }
}
console.log(`keys that serve ${MODEL}: ${ok}/${KEYS.length}`);
if (!ok) { console.log('NOT SERVED by any key'); process.exit(5); }
const j = JSON.parse(tx);
console.log(`name              ${j.name}`);
console.log(`version           ${j.version}`);
console.log(`displayName       ${j.displayName}`);
console.log(`inputTokenLimit   ${j.inputTokenLimit}`);
console.log(`outputTokenLimit  ${j.outputTokenLimit}`);
console.log(`methods           ${(j.supportedGenerationMethods || []).join(', ')}`);
