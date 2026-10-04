// Build a multi-country, English-language tender corpus from TED.
//
// TED (Tenders Electronic Daily) is the EU's official procurement journal. Every
// notice is published as a structured record AND as a rendered PDF in each of the
// 24 official languages. That gives two things this study did not previously have:
//
//   1. an English-language document set, so the workflow can be tested on a
//      language for which none of its deterministic rules were written; and
//   2. field-level reference values that require no annotation, because the
//      structured record is published by the contracting authority itself.
//
// A limitation stated in the paper: a TED notice PDF is a rendering of
// the same structured record that supplies the reference, so recovering fields from
// it is an easier task than reading a 45-page national specification. It tests
// breadth (many countries, many languages, real documents) rather than difficulty.
// The Spanish specifications remain the hard case.
//
// No API key and no model calls. TED's search API is open.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Repository-relative: analysis/numeric-failure/ is two levels below the root.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'data', 'ted');
const API = 'https://api.ted.europa.eu/v3/notices/search';

const FIELDS = [
  'publication-number', 'notice-title', 'organisation-name-buyer',
  'organisation-country-buyer', 'procedure-type', 'contract-nature-main-proc',
  'deadline-receipt-tender-date-lot', 'classification-cpv', 'publication-date',
  'total-value', 'estimated-value-lot', 'document-url-lot', 'BT-702-notice',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(query, limit, page) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, fields: FIELDS, limit, page }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`TED search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Country spread matters: a corpus drawn from one member state would repeat the
// weakness the Spanish corpus already has.
const COUNTRIES = ['IRL', 'DEU', 'FRA', 'ITA', 'NLD', 'POL', 'SWE', 'DNK', 'FIN', 'PRT', 'BEL', 'AUT'];
const PER_COUNTRY = Number(process.env.PER_COUNTRY || 4);

(async () => {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(`${OUT}/pdf`, { recursive: true });
  const manifest = [];
  let seen = 0;

  for (const cc of COUNTRIES) {
    const q = `classification-cpv=45* AND contract-nature-main-proc=works `
      + `AND organisation-country-buyer=${cc} AND publication-date>=20250101`;
    let data;
    try { data = await search(q, PER_COUNTRY, 1); }
    catch (e) { console.log(`  ${cc}: ${e.message}`); continue; }
    const got = data.notices || [];
    console.log(`  ${cc}: ${got.length} of ${data.totalNoticeCount} available`);

    for (const n of got) {
      seen++;
      const id = n['publication-number'];
      const eng = n.links?.pdf?.ENG;
      if (!eng) { console.log(`     ${id}: no English rendering, skipped`); continue; }

      // Several fields arrive as arrays, and names and titles as multilingual maps.
      const one = (v) => (Array.isArray(v) ? v[0] : v);
      const text = (v) => {
        let x = one(v);
        if (x && typeof x === 'object') x = x.eng ?? x.ENG ?? one(Object.values(x)[0]);
        return String(x ?? '').replace(/^[a-z]{3}\s*[:-]+\s*/i, '').replace(/[{}]/g, '').trim();
      };

      const title = text(n['notice-title']).slice(0, 160);
      const val = one(n['total-value']) ?? one(n['estimated-value-lot']);
      manifest.push({
        id,
        file: `ted_${id.replace('-', '_')}.pdf`,
        country: one(n['organisation-country-buyer']),
        originalLanguage: one(n['BT-702-notice']),
        buyer: text(n['organisation-name-buyer']),
        title,
        procedure: one(n['procedure-type']),
        contractNature: one(n['contract-nature-main-proc']),
        cpv: [...new Set(Array.isArray(n['classification-cpv']) ? n['classification-cpv'] : [n['classification-cpv']])].filter(Boolean),
        publicationDate: String(one(n['publication-date']) ?? '').slice(0, 10),
        deadline: one(n['deadline-receipt-tender-date-lot']),
        value: val ?? null,
        documentsUrl: n['document-url-lot'] ?? null,
        pdfEnglish: eng,
      });
    }
    await sleep(400);   // courteous pacing against a public service
  }

  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nmanifest: ${manifest.length} notices from ${new Set(manifest.map((m) => m.country)).size} countries`);
  console.log(`  with a published value      : ${manifest.filter((m) => m.value != null).length}`);
  console.log(`  with a deadline             : ${manifest.filter((m) => m.deadline).length}`);
  console.log(`  with a documents URL        : ${manifest.filter((m) => m.documentsUrl).length}`);
  console.log(`  originally English          : ${manifest.filter((m) => m.originalLanguage === 'ENG').length}`);
  console.log('\n-> data/ted/manifest.json');
})();
