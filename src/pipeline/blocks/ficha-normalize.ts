// Ficha-normalize block.
//
// Gemini runs in schema-less JSON mode (the full schema 400s on gemini-flash),
// so it free-forms the ficha: it renames fields (valor_estimado vs
// valor_estimado_contrato), nests amount objects ({importe, base} instead of a
// string), omits some fields, and sometimes returns the ficha under
// `ficha_ejecutiva`. The strict FichaResultSchema then rejects the WHOLE ficha
// on the first malformed field, discarding 20+ correctly-extracted values
// (observed live on real pliegos). This block coerces the raw AI ficha into the
// exact schema shape so validation keeps everything it can.

// Pure shaper, intentionally has NO imports so it loads under both Next and a
// plain Node test runner. The route validates the returned object with
// FichaResultSchema (which it already imports).

type FichaFieldOut = { value: string | null; clause_reference: string | null; confidence: 'alta' | 'media' | 'baja' | null; notes: null };
type BooleanClauseOut = { aplica: boolean | null; clause_reference: string | null };
type CriterioOut = { criterio: string; peso_porcentaje: number | null; tipo: 'objetivo' | 'subjetivo'; clause_reference: string | null };

const SIMPLE_FIELDS = [
  'organo_contratacion', 'numero_expediente', 'objeto_contrato', 'presupuesto_base_sin_iva',
  'presupuesto_base_con_iva', 'valor_estimado_contrato', 'plazo_ejecucion', 'plazo_presentacion_ofertas',
  'lugar_presentacion', 'garantia_provisional', 'garantia_definitiva', 'solvencia_economica',
  'solvencia_tecnica', 'clasificacion_empresarial', 'procedimiento', 'tramitacion', 'tipo_contrato',
  'iva', 'ofertas_anormalmente_bajas', 'plazo_garantia', 'seguros_obligatorios', 'presentacion_electronica',
] as const;

// Common field-name variants the model emits, mapped to the canonical schema key.
// Different models rename fields differently (e.g. gemini-2.5-flash drops the
// "de" connectors that gemini-2.5-pro keeps), so the alias map is what lets one
// normalizer absorb several models' output shapes.
const FIELD_ALIASES: Record<string, string[]> = {
  valor_estimado_contrato: ['valor_estimado', 'valor_estimado_del_contrato', 'valorEstimado'],
  presupuesto_base_con_iva: ['presupuesto_base_licitacion', 'presupuesto_base_de_licitacion', 'presupuesto_con_iva', 'presupuesto_total'],
  presupuesto_base_sin_iva: ['presupuesto_sin_iva', 'base_imponible', 'importe_base'],
  presentacion_electronica: ['presentacion_electronica_plataforma', 'licitacion_electronica', 'presentacion_ofertas_electronica'],
  numero_expediente: ['expediente', 'num_expediente', 'numero_de_expediente'],
  organo_contratacion: ['organo_contratante', 'organo_de_contratacion', 'organo'],
  objeto_contrato: ['objeto_del_contrato', 'objeto'],
  plazo_ejecucion: ['plazo_de_ejecucion', 'duracion_contrato', 'duracion'],
  plazo_presentacion_ofertas: ['plazo_de_presentacion_de_ofertas', 'plazo_presentacion_de_ofertas', 'plazo_de_presentacion'],
  lugar_presentacion: ['lugar_de_presentacion', 'lugar_presentacion_ofertas'],
  plazo_garantia: ['plazo_de_garantia', 'periodo_garantia'],
  garantia_definitiva: ['garantia_definitiva_importe'],
  clasificacion_empresarial: ['clasificacion'],
  tipo_contrato: ['tipo_de_contrato', 'calificacion'],
};

function flattenScalars(value: unknown, depth = 0): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) {
    const parts = value.map((v) => flattenScalars(v, depth + 1)).filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }
  if (typeof value === 'object' && depth < 3) {
    const obj = value as Record<string, unknown>;
    // Prefer an explicit value-bearing key when present.
    for (const k of ['value', 'importe', 'amount', 'texto', 'descripcion']) {
      if (k in obj) {
        const s = flattenScalars(obj[k], depth + 1);
        if (s) return s;
      }
    }
    const parts = Object.values(obj).map((v) => flattenScalars(v, depth + 1)).filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }
  return null;
}

function coerceField(raw: unknown): FichaFieldOut {
  const empty: FichaFieldOut = { value: null, clause_reference: null, confidence: null, notes: null };
  if (raw == null) return empty;
  // Model-derived ficha values are medium confidence, not source-anchored like
  // the deterministic CCEC extractors ('alta'). The merge keeps the
  // deterministic field (and its higher confidence) when both are present, so
  // the assembled ficha carries a real confidence gradient.
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const value = flattenScalars(raw);
    return { ...empty, value, confidence: value ? 'media' : null };
  }
  const obj = raw as Record<string, unknown>;
  const hasShape = 'value' in obj || 'clause_reference' in obj;
  const value = hasShape ? flattenScalars(obj.value) : flattenScalars(obj);
  const ref =
    typeof obj.clause_reference === 'string'
      ? obj.clause_reference
      : typeof obj.reference === 'string'
        ? obj.reference
        : null;
  return { value, clause_reference: ref, confidence: value ? 'media' : null, notes: null };
}

function coerceBoolean(raw: unknown): BooleanClauseOut {
  const empty: BooleanClauseOut = { aplica: null, clause_reference: null };
  if (raw == null) return empty;
  if (typeof raw === 'boolean') return { aplica: raw, clause_reference: null };
  if (typeof raw === 'string') {
    if (/^s[ií]\b|permit|aplica|true/i.test(raw)) return { aplica: true, clause_reference: null };
    if (/^no\b|prohib|false/i.test(raw)) return { aplica: false, clause_reference: null };
    return empty;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const aplica = typeof obj.aplica === 'boolean' ? obj.aplica : null;
    const ref = typeof obj.clause_reference === 'string' ? obj.clause_reference : null;
    return { aplica, clause_reference: ref };
  }
  return empty;
}

function coerceCriterios(raw: unknown): CriterioOut[] {
  if (!Array.isArray(raw)) return [];
  const out: CriterioOut[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const criterio = flattenScalars(obj.criterio ?? obj.nombre ?? obj.descripcion);
    if (!criterio) continue;
    const peso =
      typeof obj.peso_porcentaje === 'number'
        ? obj.peso_porcentaje
        : typeof obj.peso === 'number'
          ? obj.peso
          : null;
    const tipo = /subjet|juicio/i.test(String(obj.tipo ?? '')) ? 'subjetivo' : 'objetivo';
    out.push({ criterio, peso_porcentaje: peso, tipo, clause_reference: typeof obj.clause_reference === 'string' ? obj.clause_reference : null });
  }
  return out;
}

/**
 * Coerce a raw model ficha (any shape) into the exact FichaResult field shape,
 * ready for FichaResultSchema validation by the caller. Returns null when the
 * input has no ficha-like content or carries no real values. Looks under
 * `ficha`, then `ficha_ejecutiva`, then treats the object itself as the ficha.
 */
export function normalizeModelFicha(parsed: unknown): Record<string, unknown> | null {
  if (parsed == null || typeof parsed !== 'object') return null;
  const top = parsed as Record<string, unknown>;
  // Different models wrap the summary record under different keys: flash uses
  // `ficha`/`ficha_ejecutiva`, pro uses `tender_details`. Fall back to the object
  // itself when no wrapper is present.
  const rawFicha = (top.ficha ?? top.ficha_ejecutiva ?? top.tender_details ?? top.datos_ficha ?? top.tender_summary ?? parsed) as Record<string, unknown> | null;
  if (rawFicha == null || typeof rawFicha !== 'object') return null;

  const lookup = (canonical: string): unknown => {
    if (rawFicha[canonical] != null) return rawFicha[canonical];
    for (const alias of FIELD_ALIASES[canonical] ?? []) {
      if (rawFicha[alias] != null) return rawFicha[alias];
    }
    return null;
  };

  const candidate: Record<string, unknown> = {};
  for (const field of SIMPLE_FIELDS) candidate[field] = coerceField(lookup(field));
  candidate.criterios_adjudicacion = coerceCriterios(rawFicha.criterios_adjudicacion ?? rawFicha.criterios_de_adjudicacion);
  candidate.subcontratacion_permitida = coerceBoolean(rawFicha.subcontratacion_permitida ?? rawFicha.subcontratacion);
  candidate.revision_precios_aplica = coerceBoolean(rawFicha.revision_precios_aplica ?? rawFicha.revision_de_precios);

  // Only return a ficha if it carries at least one real value (avoid an
  // all-empty object overriding nothing downstream).
  const hasAny = SIMPLE_FIELDS.some((f) => {
    const field = candidate[f] as FichaFieldOut | undefined;
    return (field?.value ?? '').toString().trim().length > 0;
  });
  return hasAny ? candidate : null;
}
