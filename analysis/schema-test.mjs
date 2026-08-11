// M4: give strict schema enforcement a fair chance. Send (a) the full nested
// schema the app would attach, (b) a decomposed ficha-only schema, (c) a
// flattened value-only schema, and report HTTP status + usable fields each.
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const KEY = process.env.GKEY;
const MODEL = process.env.MODEL || 'gemini-2.5-flash';
const root = 'C:/Users/milad.komary/Documents/projects/PCAP';
const dir = `${root}/examples`;
const imp = (rel) => import(pathToFileURL(`${root}/${rel}`).href);
const pdfjs = await imp('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(`${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).href;
const { cleanPdfPageText, removeRepeatedBoilerplateLines } = await imp('lib/pdf-cleaner.mjs');
const { getSystemPrompt } = await imp('lib/prompts.ts');
const { analysisJsonSchema } = await imp('lib/analysis-schema.ts');

const FICHA_FIELDS = ['organo_contratacion','numero_expediente','objeto_contrato','presupuesto_base_sin_iva','presupuesto_base_con_iva','valor_estimado_contrato','plazo_ejecucion','plazo_presentacion_ofertas','lugar_presentacion','garantia_provisional','garantia_definitiva','solvencia_economica','solvencia_tecnica','clasificacion_empresarial','procedimiento','tramitacion','tipo_contrato','iva','ofertas_anormalmente_bajas','plazo_garantia','seguros_obligatorios','presentacion_electronica'];

// (b) decomposed: just the ficha object (nested value/ref/conf/notes per field)
const fichaField = { type: 'object', properties: { value: { type: ['string','null'] }, clause_reference: { type: ['string','null'] }, confidence: { type: ['string','null'] }, notes: { type: ['string','null'] } }, required: ['value','clause_reference','confidence','notes'], additionalProperties: false };
const fichaOnly = { type: 'object', properties: Object.fromEntries(FICHA_FIELDS.map((f) => [f, fichaField])), required: FICHA_FIELDS, additionalProperties: false };
// (c) flattened: one flat string per field
const flat = { type: 'object', properties: Object.fromEntries(FICHA_FIELDS.map((f) => [f, { type: ['string','null'] }])), required: FICHA_FIELDS, additionalProperties: false };

async function clean(p) {
  const d = new Uint8Array(readFileSync(p));
  const pdf = await pdfjs.getDocument({ data: d, useSystemFonts: true }).promise; const pg = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pg.push(c.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')); }
  return removeRepeatedBoilerplateLines(pg.map(cleanPdfPageText)).join('\n\n').replace(/[ \t]{2,}/g, ' ');
}
async function call(instr, input, schema) {
  const gc = { responseMimeType: 'application/json' };
  if (schema) gc.responseJsonSchema = schema;
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: instr }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: gc });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body });
  const tx = await r.text();
  let parsed = null, fields = 0, err = '';
  if (r.ok) {
    try { const j = JSON.parse(JSON.parse(tx).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}'); parsed = j; const fc = j.ficha ?? j; for (const f of FICHA_FIELDS) { const v = fc[f]; if (v && (typeof v === 'string' ? v.trim() : v.value)) fields++; } } catch (e) { err = 'parse:' + e.message; }
  } else { try { err = JSON.parse(tx).error?.message?.slice(0, 160) || tx.slice(0, 160); } catch { err = tx.slice(0, 160); } }
  return { status: r.status, fields, err };
}

const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
const doc = await clean(`${dir}/${files[0]}`); // one representative document (Pliego A)
const instr = getSystemPrompt('ficha', 'es');
const input = doc.slice(0, 120000);
console.log(`MODEL=${MODEL} doc=${files[0]}`);
for (const [name, sc] of [['full nested schema', analysisJsonSchema], ['decomposed ficha-only', fichaOnly], ['flattened value-only', flat], ['schema-less', null]]) {
  const res = await call(instr, input, sc);
  console.log(`${name.padEnd(24)} -> HTTP ${res.status}  fichaFields=${res.fields}/22  ${res.err}`);
  await new Promise((r) => setTimeout(r, 1500));
}
