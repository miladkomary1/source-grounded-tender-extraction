// R2-2 campaign: shared definitions for every arm.
//
// One factor changes per arm; inputs, prompts, scorer and downstream checks are
// otherwise identical to the canonical campaign C-PIN-4DOC-B. Nothing in lib/ is
// modified: the no-repair variant re-assembles cleanPdfPageText out of the pieces
// lib/pdf-cleaner.mjs already exports, minus the joinSplitNumbers call.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROOT = 'C:/Users/milad.komary/Documents/projects/PCAP';
export const OUT = `${ROOT}/paper/runs_r2`;
// Where per-call checkpoints are written. Defaults to the campaign directory;
// the offline self-test redirects it outside the project so a synthetic record
// can never land in the real archive. Text caches are always read from OUT.
export const WORK = process.env.R2_OUT || OUT;
export const imp = (rel) => import(pathToFileURL(`${ROOT}/${rel}`).href);

export const FIELDS = ['organo_contratacion','numero_expediente','objeto_contrato','presupuesto_base_sin_iva','presupuesto_base_con_iva','valor_estimado_contrato','plazo_ejecucion','plazo_presentacion_ofertas','lugar_presentacion','garantia_provisional','garantia_definitiva','solvencia_economica','solvencia_tecnica','clasificacion_empresarial','procedimiento','tramitacion','tipo_contrato','iva','ofertas_anormalmente_bajas','plazo_garantia','seguros_obligatorios','presentacion_electronica'];

// Canonical sampling configuration (brief decision 2 = C-PIN-4DOC-B).
export const PIN_CFG = { temperature: 0, topP: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
export const MODEL = process.env.MODEL || 'gemini-2.5-flash';
export const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

// Input caps. The control keeps the harness's 120,000-character cap verbatim.
// The full-text arm exists precisely to remove the selection rule AND the cap,
// which together are the architectural choice R3.17 questions; 900,000 is a
// safety stop, above the largest document in the corpus.
export const CONTROL_CAP = 120000;
export const FULLTEXT_CAP = 900000;

// --- normalisation, verbatim from paper/_baseline.mjs line 28 ---------------
export const norm = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

// --- grounding gates, verbatim from paper/_baseline.mjs --------------------
export function grounded(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value); if (v.length < 4) return nsrc.includes(v);
  return nsrc.includes(v.slice(0, Math.min(18, v.length)));
}
export function groundedRobust(value, nsrc) {
  if (!value) return false;
  const nums = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi);
  if (nums) return nums.some((x) => nsrc.includes(norm(x)));
  const v = norm(value); if (v.length < 4) return nsrc.includes(v);
  const toks = v.split(/\s+/).filter((t) => t.length >= 4);
  if (!toks.length) return nsrc.includes(v.slice(0, Math.min(18, v.length)));
  return toks.every((t) => nsrc.includes(t));
}

// --- input selection rules -------------------------------------------------
// (a) current head-and-annex selection, verbatim from paper/_baseline.mjs line 38
export function focus(t) { const hp = /(?:^|\n)\s*ANEXO\s+I\b/g; let m = null; for (const x of t.matchAll(hp)) m = x; if (!m) return t; const s = m.index; const nx = /(?:^|\n)\s*ANEXO\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/.exec(t.slice(s + 10)); const e = nx ? s + 10 + nx.index : Math.min(t.length, s + 120000); const f = `${t.slice(0, Math.min(12000, s))}\n\n[…]\n\n${t.slice(s, e)}`; return (f.length >= 8000 && f.length < t.length * 0.8) ? f : t; }

// (b) field-specific passage selection. Deterministic: for each schema field,
// take a window around each of the first MAX_HITS cue matches, then merge
// overlapping windows and emit them in document order. No model call is used to
// choose passages, so the rule is reproducible from the text alone.
export const CUES = {
  organo_contratacion: [/[oó]rgano de contrataci[oó]n/i, /entidad adjudicadora/i, /poder adjudicador/i],
  numero_expediente: [/n[uú]mero de expediente/i, /\bexpediente\s*[:nº]/i, /\bexpte\.?\b/i],
  objeto_contrato: [/objeto del contrato/i, /objeto de la licitaci[oó]n/i],
  presupuesto_base_sin_iva: [/presupuesto base de licitaci[oó]n/i, /\bsin iva\b/i, /\biva excluido\b/i],
  presupuesto_base_con_iva: [/\bcon iva\b/i, /\biva incluido\b/i, /presupuesto base de licitaci[oó]n/i],
  valor_estimado_contrato: [/valor estimado/i],
  plazo_ejecucion: [/plazo de ejecuci[oó]n/i, /duraci[oó]n del contrato/i],
  plazo_presentacion_ofertas: [/plazo de presentaci[oó]n de (?:las )?(?:ofertas|proposiciones)/i, /fecha l[ií]mite/i],
  lugar_presentacion: [/lugar de presentaci[oó]n/i, /presentaci[oó]n de (?:las )?(?:ofertas|proposiciones)/i],
  garantia_provisional: [/garant[ií]a provisional/i],
  garantia_definitiva: [/garant[ií]a definitiva/i],
  solvencia_economica: [/solvencia econ[oó]mica/i, /solvencia financiera/i],
  solvencia_tecnica: [/solvencia t[eé]cnica/i, /solvencia profesional/i],
  clasificacion_empresarial: [/clasificaci[oó]n (?:empresarial|del contratista|exigible)/i, /\bgrupo\s+[A-K]\b.{0,40}\bsubgrupo\b/i],
  procedimiento: [/procedimiento (?:abierto|restringido|negociado|de adjudicaci[oó]n)/i, /forma de adjudicaci[oó]n/i],
  tramitacion: [/tramitaci[oó]n (?:ordinaria|urgente|anticipada)/i, /\btramitaci[oó]n\b/i],
  tipo_contrato: [/tipo de contrato/i, /contrato de (?:obras|servicios|suministros?|concesi[oó]n)/i],
  iva: [/\bi\.?v\.?a\.?\b/i, /impuesto sobre el valor a[ñn]adido/i, /tipo impositivo/i],
  ofertas_anormalmente_bajas: [/anormalmente baja/i, /ofertas desproporcionadas/i, /temeraria/i],
  plazo_garantia: [/plazo de garant[ií]a/i],
  seguros_obligatorios: [/seguro de responsabilidad civil/i, /p[oó]liza/i, /seguros?\s+(?:obligatorios?|exigidos?)/i],
  presentacion_electronica: [/presentaci[oó]n electr[oó]nica/i, /medios electr[oó]nicos/i, /plataforma de contrataci[oó]n/i],
};
export const PASSAGE_WINDOW = 1500; // characters each side of a cue match
export const PASSAGE_MAX_HITS = 3;  // per cue pattern

export function passageSelect(t, cap = CONTROL_CAP) {
  const spans = [];
  for (const pats of Object.values(CUES)) {
    for (const re of pats) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let hits = 0;
      for (const m of t.matchAll(g)) {
        spans.push([Math.max(0, m.index - PASSAGE_WINDOW), Math.min(t.length, m.index + m[0].length + PASSAGE_WINDOW)]);
        if (++hits >= PASSAGE_MAX_HITS) break;
      }
    }
  }
  if (!spans.length) return t.slice(0, cap);
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [spans[0].slice()];
  for (const [s, e] of spans.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  let out = '';
  for (const [s, e] of merged) {
    const piece = t.slice(s, e);
    if (out.length + piece.length + 9 > cap) { out += `\n\n[…]\n\n${piece.slice(0, Math.max(0, cap - out.length - 9))}`; break; }
    out += (out ? '\n\n[…]\n\n' : '') + piece;
  }
  return out;
}

export function selectInput(rule, text) {
  if (rule === 'head_annex') return focus(text).slice(0, CONTROL_CAP);
  if (rule === 'fulltext') return text.slice(0, FULLTEXT_CAP);
  if (rule === 'passage') return passageSelect(text, CONTROL_CAP);
  throw new Error(`unknown selection rule ${rule}`);
}

// --- structured output schema (R3.23) --------------------------------------
// The "flattened value-only" schema of paper/_schematest.mjs, one flat nullable
// string per field. This is the accepted flat schema R3.23 asks to be brought
// into the main evaluation.
export const FLAT_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: ['string', 'null'] }])),
  required: FIELDS,
  additionalProperties: false,
};

// --- document-information-extraction baseline prompt (R2 Q6, decision 7) ----
// A generic zero-shot key-value extraction with none of the paper's apparatus:
// no 22-field schema, no normaliser, no grounding gate, no deterministic engine.
// Declared in summary.md as a stated stand-in for an off-the-shelf document-IE
// system, because no local document-IE model can be obtained without an install.
export const DOCIE_PROMPT = [
  'Eres un sistema genérico de extracción de información documental.',
  'Lee el documento y devuelve exclusivamente un objeto JSON con una única clave "campos",',
  'cuyo valor es una lista de objetos {"clave": ..., "valor": ...}.',
  'Cada elemento debe recoger un dato explícito del documento junto con la etiqueta con la que el propio documento lo nombra.',
  'Usa la redacción literal del documento tanto en la clave como en el valor.',
  'No infieras, no calcules, no normalices formatos y no añadas campos que el documento no indique.',
].join(' ');

// --- arm definitions --------------------------------------------------------
// Run counts, set by the control arm's own measured variation (author decision,
// 2026-09-15). Across its nine archive-protocol runs the control shows zero
// run-to-run variation in ACCURACY (full workflow 17, ungated hybrid 19, robust
// gate 18, identical in every run) but real variation in COVERAGE, 45 to 51 of
// 88, almost all of it one bistable document: `9 f PCAP.pdf` emits either 10 or
// 15 of 22 fields and nothing in between. So ten runs for the three arms whose
// outcome is coverage and whose factor acts on that same document, and five for
// the two whose outcome is accuracy and which therefore inherit the invariance.
export const ARMS = [
  { id: 'control',        runs: 10, variant: 'repair',   selection: 'head_annex', schema: false, normalize: true,  mode: 'ficha',
    label: 'Control: canonical full workflow (C-PIN-4DOC-B configuration)',
    factor: 'none (reproduction of the archived pinned campaign)' },
  { id: 'input_fulltext', runs: 10, variant: 'repair',   selection: 'fulltext',   schema: false, normalize: true,  mode: 'ficha',
    label: 'R3.17: full document text as model input',
    factor: 'input selection: whole cleaned text instead of head-and-annex selection' },
  { id: 'input_passage',  runs: 10, variant: 'repair',   selection: 'passage',    schema: false, normalize: true,  mode: 'ficha',
    label: 'R3.17: field-specific passage selection',
    factor: 'input selection: cue-driven per-field passages instead of head-and-annex selection' },
  { id: 'docie_baseline', runs: 5,  variant: 'repair',   selection: 'head_annex', schema: false, normalize: false, mode: 'docie',
    label: 'R2 Q6: generic zero-shot document-information-extraction baseline',
    factor: 'method: generic key-value extraction with no schema, normaliser, gate or rules' },
  { id: 'schema_flat',    runs: 5,  variant: 'repair',   selection: 'head_annex', schema: true,  normalize: false, mode: 'ficha',
    label: 'R3.23: accepted flat structured-output schema, no normaliser',
    factor: 'output contract: flat responseJsonSchema instead of schema-less + normaliser' },
  { id: 'no_repair',      runs: 10, variant: 'norepair', selection: 'head_annex', schema: false, normalize: true,  mode: 'ficha',
    label: 'R3.11: text layer without the joinSplitNumbers repair',
    factor: 'pre-processing: joinSplitNumbers disabled' },
];
export const ARM_BY_ID = Object.fromEntries(ARMS.map((a) => [a.id, a]));

// Every GKEY, GKEY2, GKEY3 ... present in the environment, in numeric order.
// Attempts rotate across the whole list, so widening it widens the rotation.
// No key format is assumed: the project uses both the older and the newer shape.
export function collectKeys() {
  return Object.keys(process.env)
    .filter((k) => /^GKEY\d*$/.test(k) && process.env[k])
    .sort((a, b) => (Number(a.slice(4) || 1) - Number(b.slice(4) || 1)))
    .map((k) => process.env[k]);
}

export function loadLabels() {
  const lab = JSON.parse(readFileSync(`${ROOT}/fixtures/eval-labels.json`, 'utf8'));
  const out = {};
  for (const [doc, d] of Object.entries(lab)) {
    if (doc.startsWith('_')) continue;
    out[doc] = Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_')));
  }
  return out;
}
