// Deterministic ficha extractor for Spanish PCAPs.
//
// Operates on the cleaned, flat-text output of document-parser.ts (after the
// inline boilerplate strip in pdf-cleaner.mjs). It does not rely on newline
// boundaries: pdfjs-dist often emits an entire PCAP page as a single line, so
// patterns are written to anchor on apartado markers ("8) PLAZO DE EJECUCIÓN
// Plazo: 18 MESES") and on the literal Spanish PCAP wording the LCSP-template
// CCEC layout uses.
//
// Each extractor returns a FichaField {value, clause_reference, confidence,
// notes} or null. The caller (analysis route) merges this with the LLM-side
// ficha; deterministic results win when both are present, on the basis that a
// regex anchored on apartado wording cannot hallucinate.
//
// Hard contract: every value emitted by these extractors must appear verbatim
// somewhere in the input text. No paraphrasing, no formatting beyond trim.
//
// All values referenced in CLAUDE_CODE_HANDOFF.md §1b plus the explicit
// blocker list in the user's reliability brief are covered here:
//   tipo_contrato, procedimiento, tramitacion, plazo_ejecucion,
//   valor_estimado_contrato, presupuesto_base_sin_iva (base imponible),
//   iva, presupuesto_base_con_iva (TOTAL), garantia_provisional,
//   garantia_definitiva, seguros_obligatorios, plazo_garantia,
//   presentacion_electronica.

import { findLabeledValue } from './labeled-value.mjs';

const NUM_ES = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?`;

/**
 * @typedef {{ value: string, clause_reference: string, confidence: 'alta'|'media'|'baja', notes: string|null }} FichaField
 */

// A value found via the generic cross-template scanner rather than a precise
// apartado anchor — flagged 'media' confidence and a generic reference so the
// UI/merge layer can tell it apart from the high-confidence CCEC extractions.
function fieldFromGeneric(value, label) {
  return { value: value.replace(/\s+/g, ' ').trim(), clause_reference: label, confidence: 'media', notes: null };
}

function fieldFrom(value, clauseReference) {
  return {
    value: value.replace(/\s+/g, ' ').trim(),
    clause_reference: clauseReference,
    confidence: 'alta',
    notes: null,
  };
}

// ---------------------------------------------------------------------------
// Apartado 1 — Procedimiento + Calificación (Tipo de contrato)
// ---------------------------------------------------------------------------
// Real Leganés text:
//   "1) PROCEDIMIENTO Y CALIFICACIÓN DEL CONTRATO PROCEDIMIENTO: ABIERTO.
//    CALIFICACIÒN: Contrato administrativo de OBRAS art. 13 LCSP."
const PROCEDIMIENTO_VALUES =
  /(ABIERTO\s+SIMPLIFICADO|ABIERTO|RESTRINGIDO|NEGOCIADO\s+(?:SIN|CON)\s+PUBLICIDAD|NEGOCIADO|DI[ÁA]LOGO\s+COMPETITIVO|ASOCIACI[ÓO]N\s+PARA\s+LA\s+INNOVACI[ÓO]N|CONCURSO\s+DE\s+PROYECTOS)/i;

export function extractProcedimiento(text) {
  const m = text.match(
    new RegExp(
      String.raw`PROCEDIMIENTO\s*(?:Y\s+CALIFICACI[ÓO]N\s+DEL\s+CONTRATO\s+PROCEDIMIENTO\s*:?\s*)?` +
        PROCEDIMIENTO_VALUES.source,
      'i'
    )
  );
  if (!m) return null;
  return fieldFrom(properCase(m[1]), 'Anexo I apdo. 1');
}

const TIPO_CONTRATO_VALUES =
  /(OBRAS|SERVICIOS|SUMINISTROS|GESTI[ÓO]N\s+DE\s+SERVICIOS\s+P[ÚU]BLICOS|CONCESI[ÓO]N\s+DE\s+(?:OBRAS|SERVICIOS)|MIXTO|ADMINISTRATIVO\s+ESPECIAL)/i;

export function extractTipoContrato(text) {
  // Anchor on "Contrato administrativo de" or "CONTRATO DE" inside or near
  // apartado 1, since "OBRAS" alone appears all over the document.
  const m =
    text.match(
      new RegExp(
        String.raw`Contrato\s+administrativo\s+de\s+` + TIPO_CONTRATO_VALUES.source,
        'i'
      )
    ) ||
    text.match(new RegExp(String.raw`CALIFICACI[ÒÓ]N\s*:?\s*[^\n]*?` + TIPO_CONTRATO_VALUES.source, 'i')) ||
    text.match(new RegExp(String.raw`CONTRATO\s+DE\s+` + TIPO_CONTRATO_VALUES.source + String.raw`(?=\s+PROCEDIMIENTO)`, 'i'));
  if (!m) return null;
  return fieldFrom(properCase(m[1]), 'Anexo I apdo. 1');
}

// ---------------------------------------------------------------------------
// Apartado 3 — Tramitación
// ---------------------------------------------------------------------------
// Real Leganés text: "3) TRAMITACIÓN : Ordinaria"
export function extractTramitacion(text) {
  const m = text.match(/3\s*\)\s*TRAMITACI[ÓO]N\s*[:.\s]+(Ordinaria|Urgente|Emergencia)/i);
  if (m) return fieldFrom(properCase(m[1]), 'Anexo I apdo. 3');
  // Prose layouts: "La tramitación del expediente es ordinaria".
  const g = text.match(/tramitaci[oó]n\s+(?:del\s+(?:expediente|contrato)\s+)?(?:ser[áa]\s+|es\s+|:\s*)(ordinaria|urgente|emergencia|anticipada)/i);
  return g ? fieldFromGeneric(properCase(g[1]), 'Pliego (tramitación)') : null;
}

// ---------------------------------------------------------------------------
// Apartado 8 — Plazo de ejecución
// ---------------------------------------------------------------------------
// Real Leganés text: "8) PLAZO DE EJECUCIÓN Plazo: 18 MESES Contados a..."
const DURATION = String.raw`\d+\s*(?:MESES|MES|SEMANAS|SEMANA|D[IÍ]AS|D[IÍ]A|A[ÑN]OS|A[ÑN]O)`;

export function extractPlazoEjecucion(text) {
  const m =
    text.match(
      new RegExp(
        String.raw`PLAZO\s+DE\s+EJECUCI[ÓO]N\s+(?:Plazo\s*:?\s*)?(` + DURATION + String.raw`)`,
        'i'
      )
    ) ||
    text.match(
      new RegExp(String.raw`Duraci[oó]n\s+del\s+contrato\s*:?\s*(` + DURATION + String.raw`)`, 'i')
    );
  if (m) return fieldFrom(m[1].toUpperCase(), 'Anexo I apdo. 8');
  const generic = findLabeledValue(
    text,
    ['plazo de ejecuci[oó]n', 'plazo de duraci[oó]n', 'duraci[oó]n del contrato', 'plazo total de ejecuci[oó]n'],
    'duration'
  );
  return generic ? fieldFromGeneric(generic, 'Pliego (plazo de ejecución)') : null;
}

// ---------------------------------------------------------------------------
// Apartado 10 — Valor estimado, base imponible, IVA, total con IVA
// ---------------------------------------------------------------------------
// Real Leganés text:
//   A) Valor estimado Total valor estimado contrato : 5.532.479,98 €
//   B) Presupuesto base de licitación: ... Total Base imponible: 5.532.479,98
//      Importe del 21% de IVA: 1.161.820,80 € TOTAL: 6.694.300,78 €
//
// CRITICAL: there are TWO "TOTAL" markers in apartado 10 — one for the GG+BI
// subtotal ("Total: 883.337,14 €") and one for the IVA-inclusive grand total.
// We anchor the grand-total extractor on "Importe del 21% de IVA: ... TOTAL:"
// so we cannot pick up the GG+BI subtotal by mistake (the audit's #76 bug).

export function extractValorEstimado(text) {
  const m = text.match(
    new RegExp(
      String.raw`Total\s+valor\s+estimado\s+contrato\s*:?\s*(` + NUM_ES + String.raw`)\s*€`,
      'i'
    )
  );
  if (m) return fieldFrom(`${m[1]} €`, 'Anexo I apdo. 10 (Valor estimado)');
  const generic = findLabeledValue(text, ['valor estimado del contrato', 'valor estimado'], 'money');
  return generic ? fieldFromGeneric(generic, 'Pliego (valor estimado)') : null;
}

export function extractBaseImponible(text) {
  const m = text.match(
    new RegExp(String.raw`Total\s+Base\s+imponible\s*:?\s*(` + NUM_ES + String.raw`)`, 'i')
  );
  if (!m) return null;
  return fieldFrom(`${m[1]} €`, 'Anexo I apdo. 10 (Base imponible)');
}

export function extractIva(text) {
  // Must capture both rate and amount so the user sees "21% (1.161.820,80 €)"
  // and can reconcile against the total.
  const m = text.match(
    new RegExp(
      String.raw`Importe\s+del\s+(\d{1,2})\s*%\s+de\s+IVA\s*:?\s*(` + NUM_ES + String.raw`)\s*€`,
      'i'
    )
  );
  if (!m) return null;
  return fieldFrom(`${m[1]}% (${m[2]} €)`, 'Anexo I apdo. 10 (IVA)');
}

export function extractPresupuestoBaseConIva(text) {
  // Anchor on the IVA line so the GG+BI subtotal cannot leak in.
  const m = text.match(
    new RegExp(
      String.raw`Importe\s+del\s+\d{1,2}\s*%\s+de\s+IVA[^\n]*?TOTAL\s*:?\s*(` + NUM_ES + String.raw`)\s*€`,
      'i'
    )
  );
  if (m) return fieldFrom(`${m[1]} €`, 'Anexo I apdo. 10 (TOTAL con IVA)');
  const generic = findLabeledValue(
    text,
    ['presupuesto base de licitaci[oó]n', 'presupuesto de licitaci[oó]n', 'presupuesto del contrato'],
    'money'
  );
  return generic ? fieldFromGeneric(generic, 'Pliego (presupuesto base de licitación)') : null;
}

export function extractPresupuestoBaseSinIva(text) {
  // The "presupuesto base sin IVA" in the LCSP CCEC layout IS the base
  // imponible, so we surface the same value with an apartado-10 reference.
  const base = extractBaseImponible(text);
  return base ? { ...base, clause_reference: 'Anexo I apdo. 10 (Base imponible)' } : null;
}

// ---------------------------------------------------------------------------
// Apartado 20 — Garantía provisional
// ---------------------------------------------------------------------------
// Real Leganés text: "20) GARANTÍA PROVISIONAL. Procede: NO"
export function extractGarantiaProvisional(text) {
  const m = text.match(/20\s*\)\s*GARANT[ÍI]A\s+PROVISIONAL[\s\S]{0,80}?Procede\s*:?\s*(SI|S[ÍI]|NO)/i);
  if (!m) return null;
  const verdict = /^(SI|S[ÍI])$/i.test(m[1]) ? 'SI' : 'NO';
  const value = verdict === 'NO' ? 'No procede' : 'Procede: SI';
  return fieldFrom(value, 'Anexo I apdo. 20');
}

// ---------------------------------------------------------------------------
// Apartado 22 — Garantía definitiva
// ---------------------------------------------------------------------------
// Real Leganés text: "22) GARANTÍA DEFINITIVA. Procede: SI Importe: 5% del
//   importe de adjudicación del contrato, IVA excluido. Constitución mediante
//   retención en el precio. NO"
export function extractGarantiaDefinitiva(text) {
  const block = text.match(/22\s*\)\s*GARANT[ÍI]A\s+DEFINITIVA[\s\S]{0,400}?(?=\d{1,2}\s*\))/i);
  if (!block) {
    // Generic fallback: "garantía definitiva ... del 5% del precio/importe de
    // adjudicación". Guarded against provisional/complementaria/threshold text.
    const g = text.match(/garant[ií]a\s+definitiva\b([^.\n]{0,45}?)(\d{1,2})\s*%(\s+(?:del?|sobre)\s+[^.\n]{0,70})?/i);
    if (g && !/\b(provisional|complementaria|inferior|superior|no\s+inferior)\b/i.test(g[0])) {
      const basis = (g[3] || '').replace(/\s+/g, ' ').trim().replace(/\s+\d{1,3}$/, '').replace(/\.$/, '');
      return fieldFromGeneric(`${g[2]}%${basis ? ' ' + basis : ''}`, 'Pliego (garantía definitiva)');
    }
    return null;
  }
  const body = block[0];
  const importe = body.match(/Importe\s*:?\s*([^\n.]{2,200})/i);
  const procede = body.match(/Procede\s*:?\s*(SI|S[ÍI]|NO)/i);
  const retencion = body.match(/(?:Constituci[oó]n\s+mediante\s+retenci[oó]n\s+en\s+el\s+precio[:.\s]*)\s*(SI|S[ÍI]|NO)/i);

  const parts = [];
  if (procede) parts.push(`Procede: ${/^(SI|S[ÍI])$/i.test(procede[1]) ? 'SI' : 'NO'}`);
  if (importe) parts.push(`Importe: ${importe[1].replace(/\s+/g, ' ').trim().replace(/\.$/, '')}`);
  if (retencion) parts.push(`Retención en el precio: ${/^(SI|S[ÍI])$/i.test(retencion[1]) ? 'SI' : 'NO'}`);
  if (parts.length === 0) return null;

  return fieldFrom(parts.join('; '), 'Anexo I apdo. 22');
}

// ---------------------------------------------------------------------------
// Apartado 24 — Pólizas de seguros (RC + TR + franquicia)
// ---------------------------------------------------------------------------
// Real Leganés text:
//   "24) PÓLIZAS DE SEGUROS Procede: SI. Responsabilidad Civil de
//    construcción: ... por importe mínimo de coincidente con el presupuesto
//    de ejecución material de 4.649.142,84 € por siniestro y año. ...
//    Póliza seguro TR Construcción (todo riesgo): ... por un importe de
//    5.532.479,98 € incluyendo los daños a los bienes preexistentes y
//    cláusula de beneficiario a favor del Ayuntamiento. ... Franquicia
//    admisible en seguro: NO"
export function extractSeguros(text) {
  const block = text.match(/24\s*\)\s*P[ÓO]LIZAS\s+DE\s+SEGUROS[\s\S]{0,2000}?(?=\d{1,2}\s*\))/i);
  if (!block) return null;
  const body = block[0];

  const rc = body.match(
    new RegExp(
      String.raw`Responsabilidad\s+Civil[^\n]*?(` + NUM_ES + String.raw`)\s*€\s*(?:por\s+siniestro\s+y\s+a[ñn]o)?`,
      'i'
    )
  );
  const tr = body.match(
    new RegExp(
      String.raw`(?:TR\s+Construcci[oó]n|todo\s+riesgo)[^\n]*?por\s+un?\s+importe\s+de\s+(` + NUM_ES + String.raw`)\s*€`,
      'i'
    )
  );
  const franquicia = body.match(/Franquicia\s+admisible\s+(?:en\s+seguro)?\s*:?\s*(SI|S[ÍI]|NO)/i);

  const parts = [];
  if (rc) parts.push(`RC Construcción: ${rc[1]} € por siniestro y año`);
  if (tr) parts.push(`TR Construcción: ${tr[1]} €`);
  if (franquicia) parts.push(`Franquicia admisible: ${/^(SI|S[ÍI])$/i.test(franquicia[1]) ? 'SI' : 'NO'}`);
  if (parts.length === 0) return null;

  return fieldFrom(parts.join('; '), 'Anexo I apdo. 24');
}

// ---------------------------------------------------------------------------
// Apartado 31 — Plazo de garantía
// ---------------------------------------------------------------------------
// Real Leganés (obras) text: "31) PLAZO DE GARANTÍA: 1 año."
// Servicios/suministros CCEC use the same heading under a different apartado
// number and often interpose a "Plazo:" token: "PLAZO DE GARANTÍA Plazo: 6
// MESES". Capture the apartado number when present so the reference is accurate
// across contract types, and tolerate the optional "Plazo:" token.
export function extractPlazoGarantia(text) {
  const m = text.match(
    new RegExp(
      String.raw`(?:(\d{1,2})\s*\)\s*)?PLAZO\s+DE\s+GARANT[ÍI]A\b\s*[:.]?\s*(?:Plazo\s*:?\s*)?(` +
        DURATION +
        String.raw`)`,
      'i'
    )
  );
  if (m) {
    const ref = m[1] ? `Anexo I apdo. ${m[1]}` : 'Anexo I (plazo de garantía)';
    return fieldFrom(m[2].toUpperCase(), ref);
  }
  const generic = findLabeledValue(text, ['plazo de garant[ií]a', 'per[ií]odo de garant[ií]a'], 'duration');
  return generic ? fieldFromGeneric(generic, 'Pliego (plazo de garantía)') : null;
}

// ---------------------------------------------------------------------------
// Apartado 33 — Licitación electrónica / presentación electrónica
// ---------------------------------------------------------------------------
// Real Leganés text: "33) LICITACIÓN ELECTRÓNICA: SI OBLIGATORIA. ..."
export function extractPresentacionElectronica(text) {
  const m = text.match(/33\s*\)\s*LICITACI[ÓO]N\s+ELECTR[ÓO]NICA\s*[:.\s]+([^\n.]{2,160})/i);
  if (!m) return null;
  return fieldFrom(m[1].replace(/\s+/g, ' ').trim(), 'Anexo I apdo. 33');
}

// ---------------------------------------------------------------------------
// Apartado 4 — Objeto del contrato
// ---------------------------------------------------------------------------
// Real Leganés text: "4) OBJETO DEL CONTRATO OBRAS DEL PROYECTO DE
//   CONSTRUCCIÓN DEL CENTRO MULTIFUNCIONAL "VEREDA DE ESTUDIANTES"."
export function extractObjeto(text) {
  const m = text.match(/4\s*\)\s*OBJETO\s+DEL\s+CONTRATO\s+([^\n]{5,300}?)\.\s+\d{1,2}\s*\)/i);
  if (m) return fieldFrom(m[1].replace(/\s+/g, ' ').trim(), 'Anexo I apdo. 4');
  // Only the CAPS-heading form ("OBJETO DEL CONTRATO <DESCRIPTION>") — the actual
  // stated object. The description must START with a letter or quote, never a
  // digit, so a table-of-contents line ("OBJETO DEL CONTRATO 9 A. DEFINICIÓN…")
  // cannot leak its page number in. The generic "el objeto del contrato es…"
  // prose form is deliberately NOT matched: it returns boilerplate definitions,
  // not the specific object, which would violate the never-wrong contract.
  const g = text.match(/\bOBJETO\s+DEL\s+CONTRATO\b[.:\s]+([A-ZÁÉÍÓÚÑ"“][^\n]{12,200}?)(?:\.\s|\s\d{1,2}\s*[.\-)])/);
  return g ? fieldFromGeneric(g[1].replace(/\s+/g, ' ').trim(), 'Pliego (objeto del contrato)') : null;
}

// ---------------------------------------------------------------------------
// Apartado 2 — Órgano de contratación
// ---------------------------------------------------------------------------
export function extractOrgano(text) {
  const m = text.match(/2\s*\)\s*[ÓO]RGANO\s+CONTRATANTE\s+([^\n]{3,200}?)(?:\s+Direcci[oó]n\s+postal\s*:|\s+\d{1,2}\s*\))/i);
  if (!m) return null;
  return fieldFrom(m[1].replace(/\s+/g, ' ').trim(), 'Anexo I apdo. 2');
}

// ---------------------------------------------------------------------------
// Apartado 14 — Solvencia económica + técnica + clasificación
// ---------------------------------------------------------------------------
export function extractSolvenciaEconomica(text) {
  // Obras CCEC: "volumen de negocios igual o superior a X euros".
  // Servicios/suministros CCEC: "Volumen anual de negocios por importe de X €"
  // or "...por importe de X euros". Match both connectors.
  const m = text.match(
    new RegExp(
      String.raw`volumen\s+(?:anual\s+)?de\s+negocios[^.\n]*?(?:igual\s+o\s+superior\s+a|por\s+importe\s+de|de)\s+(` +
        NUM_ES +
        String.raw`)\s*(?:€|euros)`,
      'i'
    )
  );
  if (!m) return null;
  return fieldFrom(`Volumen anual de negocios ≥ ${m[1]} €`, 'Anexo I apdo. 14');
}

export function extractSolvenciaTecnica(text) {
  const m = text.match(
    new RegExp(
      String.raw`70\s*%\s*\)\s*:\s*(` + NUM_ES + String.raw`)\s*euros`,
      'i'
    )
  );
  if (!m) return null;
  return fieldFrom(`Importe anual acumulado en obras del mismo tipo ≥ ${m[1]} € (10 últimos años)`, 'Anexo I apdo. 14');
}

export function extractClasificacion(text) {
  const matches = Array.from(
    text.matchAll(
      /Grupo\s*:?\s*([A-Z])\)?\s*[A-Za-záéíóúñ\s]*?Subgrupo\s*:?\s*(\d{1,2})\s*\.?\s*[A-Za-záéíóúñ\s,.]*?Categor[íi]a\s*:?\s*(\d)/gi
    )
  );
  if (matches.length === 0) return null;
  const parts = matches.map((m) => `Grupo ${m[1]}, Subgrupo ${m[2]}, Categoría ${m[3]}`);
  return fieldFrom([...new Set(parts)].join(' + '), 'Anexo I apdo. 14');
}

// ---------------------------------------------------------------------------
// Top-level extractor
// ---------------------------------------------------------------------------
const EXTRACTORS = {
  organo_contratacion: extractOrgano,
  objeto_contrato: extractObjeto,
  procedimiento: extractProcedimiento,
  tipo_contrato: extractTipoContrato,
  tramitacion: extractTramitacion,
  plazo_ejecucion: extractPlazoEjecucion,
  valor_estimado_contrato: extractValorEstimado,
  presupuesto_base_sin_iva: extractPresupuestoBaseSinIva,
  presupuesto_base_con_iva: extractPresupuestoBaseConIva,
  iva: extractIva,
  garantia_provisional: extractGarantiaProvisional,
  garantia_definitiva: extractGarantiaDefinitiva,
  seguros_obligatorios: extractSeguros,
  plazo_garantia: extractPlazoGarantia,
  presentacion_electronica: extractPresentacionElectronica,
  solvencia_economica: extractSolvenciaEconomica,
  solvencia_tecnica: extractSolvenciaTecnica,
  clasificacion_empresarial: extractClasificacion,
};

/**
 * Run every deterministic extractor and return a partial ficha shape, with
 * `null` for fields that no extractor recovered.
 */
export function extractDeterministicFichaFields(text) {
  if (!text || typeof text !== 'string') return {};
  /** @type {Record<string, FichaField | null>} */
  const out = {};
  for (const [key, fn] of Object.entries(EXTRACTORS)) {
    try {
      out[key] = fn(text);
    } catch {
      out[key] = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Amount validation
// ---------------------------------------------------------------------------
// A "valid" amount string for findings.amount_or_percentage / cost_summary
// must visibly carry one of: € sign, "euros", a percentage paired with a base,
// or a "No especificado" / "No procede" sentinel. Bare integers like "21",
// "30", "35", "42" are rejected because they leak into amount fields when the
// LLM picks up an unrelated number from the same paragraph (the audit's
// "Excel still puts bare 21 in many amount fields" complaint).

const NOT_SPECIFIED_RE = /^(?:no\s+especific(?:ado|at)|not\s+specified|no\s+procede|n\/a|n\.a\.|—|-)$/i;
const VALID_AMOUNT_RE = /(?:€|\beuros?\b|\bMEUR\b|%|por\s+ciento|del?\s+(?:importe|presupuesto|valor|precio|PEM)\b|por\s+siniestro|por\s+a[ñn]o|del\s+\d|\bMESES?\b|\bA[ÑN]OS?\b|\bD[IÍ]AS?\b)/i;

export function isStrictlyValidAmount(value) {
  if (value == null) return true; // null is fine — represents "not extracted"
  const s = String(value).trim();
  if (s === '') return true;
  if (NOT_SPECIFIED_RE.test(s)) return true;
  if (/^\d{1,3}(?:[.,]\d+)?$/.test(s)) return false; // bare number
  return VALID_AMOUNT_RE.test(s);
}

/**
 * Sanitize a finding's amount_or_percentage. Returns the input verbatim when
 * it's strictly valid, or a "Not specified" sentinel localized for the report
 * when it's a bare-number leak.
 */
export function sanitizeAmount(value, locale = 'es') {
  if (isStrictlyValidAmount(value)) return value ?? null;
  return locale === 'en' ? 'Not specified' : locale === 'ca' ? 'No especificat' : 'No especificado';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function properCase(s) {
  // For ALL-CAPS extracted values, normalize to "Title Case" for display.
  // Keeps acronyms intact when they are 2-3 letters.
  return s
    .toLowerCase()
    .replace(/\b\p{L}+/gu, (w) =>
      w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
    );
}
