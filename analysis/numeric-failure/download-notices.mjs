// Download the English rendering of each TED notice in the manifest.
// No API key, no model calls. Skips anything already on disk so it can be re-run.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Repository-relative: analysis/numeric-failure/ is two levels below the root.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'data', 'ted');
const man = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8'));
mkdirSync(`${OUT}/pdf`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, skipped = 0, failed = 0;
const problems = [];

for (const m of man) {
  const path = `${OUT}/pdf/${m.file}`;
  if (existsSync(path) && statSync(path).size > 20000) { skipped++; continue; }
  try {
    const res = await fetch(m.pdfEnglish, {
      headers: { 'User-Agent': 'academic-research/1.0 (procurement extraction study)' },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { failed++; problems.push(`${m.id}: HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    // A PDF starts %PDF; anything else is an error page served with status 200.
    if (buf.subarray(0, 4).toString() !== '%PDF') { failed++; problems.push(`${m.id}: not a PDF (${buf.length} bytes)`); continue; }
    writeFileSync(path, buf);
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok} downloaded`);
  } catch (e) {
    failed++; problems.push(`${m.id}: ${e.message.slice(0, 60)}`);
  }
  await sleep(250);   // courteous pacing against a public service
}

console.log(`\ndownloaded ${ok}, already present ${skipped}, failed ${failed}`);
if (problems.length) { console.log('problems:'); problems.slice(0, 10).forEach((p) => console.log('  ' + p)); }

// Record which manifest entries actually have a document on disk.
const present = man.filter((m) => existsSync(`${OUT}/pdf/${m.file}`) && statSync(`${OUT}/pdf/${m.file}`).size > 20000);
writeFileSync(`${OUT}/manifest-available.json`, JSON.stringify(present, null, 2), 'utf8');
const mb = present.reduce((s, m) => s + statSync(`${OUT}/pdf/${m.file}`).size, 0) / 1e6;
console.log(`\ncorpus on disk: ${present.length} documents, ${mb.toFixed(1)} MB`);
console.log(`countries: ${new Set(present.map((m) => m.country)).size}, original languages: ${new Set(present.map((m) => m.originalLanguage)).size}`);
