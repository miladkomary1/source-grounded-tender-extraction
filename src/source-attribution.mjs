// Source-attribution: derive a finding's clause reference from the document
// structure at the location of its source excerpt, instead of trusting the
// label the LLM produced.
//
// Why this exists: verifyFinding (app/api/analyze/route.ts) keeps a finding only
// when its clause_reference and source_excerpt both appear in the source AND lie
// within EVIDENCE_PROXIMITY_WINDOW chars of each other. When the model extracts a
// real obligation but mislabels the article (e.g. binds an IVA line to
// "Cláusula 3" when it actually sits in Anexo I apartado 10, or a responsabilidad
// excerpt to the wrong clause), the pair fails to co-locate and the finding is
// dropped, a silent recall loss. Re-deriving the clause from the nearest
// preceding heading is correct by construction and, because the heading precedes
// the excerpt within the look-back window, is guaranteed to pass verification.
//
// Scope: this only RESCUES findings whose stated reference does not already
// co-locate with the excerpt. Findings that already verify are never touched, so
// the pass is strictly additive to recall and cannot degrade a good attribution.

// Matches a general-clause heading ("Cláusula 24") in normalized (lowercased,
// deaccented) source text.
const CLAUSE_HEADING_RE = /clausula\s+(\d{1,2})\b/gi;
// Matches an Anexo I apartado heading ("24)" / "34.5)") in normalized source.
const APARTADO_HEADING_RE = /(?:^|[\s.])(\d{1,2}(?:\.\d{1,2})?)\)\s/g;

// Topic → expected canonical clause for the Leganés-family obras PCAP. Used to
// label apartado-derived references and to document the intended mapping; the
// structural scan is the source of truth for which clause actually encloses an
// excerpt.
export const OBLIGATION_CLAUSE_HINTS = [
  { test: /responsabilidad.*(da[ñn]os|perjuicios)|da[ñn]os y perjuicios/i, clause: 24, label: 'Cláusula 24' },
  { test: /subcontrataci[oó]n/i, clause: 28, label: 'Cláusula 28' },
  { test: /revisi[oó]n de precios/i, clause: 30, label: 'Cláusula 30' },
  { test: /obligaciones,?\s+gastos|gastos,?\s+impuestos|por cuenta del (?:contratista|adjudicatario)/i, clause: 31, label: 'Cláusula 31' },
  { test: /(obligaciones )?laboral|social|seguridad social|convenio colectivo|transparencia/i, clause: 32, label: 'Cláusula 32' },
  { test: /plazo de garant[ií]a|per[ií]odo de garant[ií]a/i, clause: 37, label: 'Cláusula 37' },
  { test: /seguro|p[oó]liza|responsabilidad civil|todo riesgo/i, clause: 16, label: 'Cláusula 16' },
];

// Nearest preceding general-clause number to `position`, within `maxLookback`
// chars. Returns the clause number or null. The match nearest the excerpt (the
// last one before it) is the enclosing clause.
export function findEnclosingClauseNumber(normalizedSource, position, maxLookback = 4000) {
  if (typeof normalizedSource !== 'string' || position <= 0) return null;
  const start = Math.max(0, position - maxLookback);
  const window = normalizedSource.slice(start, position);
  let last = null;
  for (const m of window.matchAll(CLAUSE_HEADING_RE)) last = m[1];
  return last ? Number(last) : null;
}

// Nearest preceding Anexo I apartado number to `position`, within `maxLookback`.
export function findEnclosingApartado(normalizedSource, position, maxLookback = 4000) {
  if (typeof normalizedSource !== 'string' || position <= 0) return null;
  const start = Math.max(0, position - maxLookback);
  const window = normalizedSource.slice(start, position);
  let last = null;
  for (const m of window.matchAll(APARTADO_HEADING_RE)) last = m[1];
  return last ?? null;
}

export function formatClauseReference(clauseNumber) {
  return `Cláusula ${clauseNumber}`;
}

export function formatApartadoReference(apartado) {
  return `Anexo I apdo. ${apartado}`;
}
