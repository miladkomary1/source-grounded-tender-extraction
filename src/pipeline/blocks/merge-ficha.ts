// Merge-ficha block — field-level routing between the two extraction engines.
//
// The n=10 per-field evaluation (paper/_perfield.tsv) shows a clean division
// of labour: the deterministic engine recovers the anchored monetary/duration
// fields essentially whenever it fires (presupuesto con IVA 10/10 where the
// model scores 0/10 on the largest tender), while the model wins the
// categorical fields the anchors misfire on (tipo_contrato: model 10/10,
// deterministic 0/10 on three of four documents; iva and organo_contratacion
// show the same shape). A single global precedence loses one side or the
// other — the previous model-wins merge could ship a wrong model budget over
// a correct deterministic one.
//
// Routing rule: deterministic wins when it has a value (its CCEC anchors are
// source-anchored by construction), EXCEPT the evidence-backed model-first
// fields below, where a present model value wins. Model values are expected to
// have passed the grounding gate (blocks/ground.ts) before reaching this merge.
//
// Pure module — intentionally has NO imports (like ficha-normalize) so it
// loads under both Next and a plain Node test runner (scripts/benchmark.mjs).

type ValueField = { value: string | null };

/**
 * Fields where the model demonstrably beats the deterministic anchors
 * (paper/_perfield.tsv, n=10): the anchors either misfire or never hit, while
 * the (grounded) model value is right. Everything else is deterministic-first.
 */
export const MODEL_FIRST_FICHA_FIELDS: ReadonlySet<string> = new Set([
  'tipo_contrato',
  'iva',
  'organo_contratacion',
]);

function isValueField(raw: unknown): raw is ValueField {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as object);
}

function hasValue(field: unknown): boolean {
  return isValueField(field) && Boolean(field.value?.toString().trim());
}

/**
 * Merge the (grounded) model ficha with the deterministic ficha under the
 * field-level routing rule. Simple fields (shape { value, ... }) are routed
 * per MODEL_FIRST_FICHA_FIELDS; criterios (array) and boolean clauses keep the
 * historical behaviour of model-first with deterministic fallback.
 */
export function mergeFichaWithDeterministic<T extends Record<string, unknown>>(
  modelFicha: T | null,
  deterministicFicha: T | null
): T | null {
  if (!modelFicha) return deterministicFicha;
  if (!deterministicFicha) return modelFicha;

  const merged: Record<string, unknown> = { ...modelFicha };

  const criterios = modelFicha.criterios_adjudicacion;
  if (Array.isArray(criterios) && criterios.length === 0) {
    merged.criterios_adjudicacion = deterministicFicha.criterios_adjudicacion;
  }
  for (const key of ['subcontratacion_permitida', 'revision_precios_aplica'] as const) {
    const modelClause = modelFicha[key] as { aplica: boolean | null } | undefined;
    if (modelClause && modelClause.aplica === null) {
      merged[key] = deterministicFicha[key];
    }
  }

  const simpleKeys = new Set([
    ...Object.keys(modelFicha).filter((k) => isValueField(modelFicha[k])),
    ...Object.keys(deterministicFicha).filter((k) => isValueField(deterministicFicha[k])),
  ]);

  for (const key of simpleKeys) {
    const model = modelFicha[key];
    const det = deterministicFicha[key];
    if (MODEL_FIRST_FICHA_FIELDS.has(key)) {
      // Fall through to det only when it actually has a value — an empty model
      // field may carry the grounding-gate withheld note, which the UI shows.
      merged[key] = hasValue(model) ? model : hasValue(det) ? det : (model ?? det);
    } else {
      merged[key] = hasValue(det) ? det : (model ?? det);
    }
  }

  return merged as T;
}
