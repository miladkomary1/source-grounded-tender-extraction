// Ground block, source-locatability gate for model ficha values.
//
// The findings path already refuses to surface anything not provable against
// the source (verify.ts), but until now model FICHA values reached the user
// unchecked: the n=10 evaluation (paper/_baseline.mjs) measured ~24% of raw
// model ficha values as not locatable in the document. This block enforces the
// workflow's core guarantee on the ficha too: a model value is surfaced only
// when it can be located in the cleaned source text; otherwise it is withheld
// with an explanatory note instead of silently trusted.
//
// The check is the evaluation's ROBUST gate. Numeric content (Spanish
// thousand-dot amounts, durations) must appear VERBATIM in the normalized
// source, this keeps the zero-hallucination guarantee strict on the fields
// that carry financial risk. Purely textual values count as grounded when
// every content token (>= 4 chars) appears in the source; the earlier
// 18-char-prefix variant wrongly rejected correct categorical values the model
// phrases with extra words ("Contrato de obras" where the source has "obras"),
// costing 1.6/20 accuracy in the n=10 ablation (16.4 -> 18.0 when relaxed).
//
// Pure module, intentionally has NO imports (like ficha-normalize) so it
// loads under both Next and a plain Node test runner (scripts/benchmark.mjs).

type GroundableField = {
  value: string | null;
  clause_reference: string | null;
  confidence: 'alta' | 'media' | 'baja' | null;
  notes: string | null;
};

/** Same normalization the gate was evaluated with: NFKD, strip diacritics,
 * collapse whitespace, lowercase. Apply to BOTH the source and the value. */
export function normalizeForGrounding(value: string): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Spanish thousand-dot amounts (64.335,36) and durations (6 SEMANAS, 24 MESES).
// Kept identical to the evaluated gate in paper/_baseline.mjs.
const NUMERIC_CONTENT = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\s*(?:MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)/gi;

/**
 * Robust locatability test. `normalizedSource` must be the output of
 * normalizeForGrounding over the cleaned document text.
 */
export function isValueGrounded(value: string | null | undefined, normalizedSource: string): boolean {
  if (!value) return false;
  const nums = String(value).match(NUMERIC_CONTENT);
  if (nums) return nums.some((x) => normalizedSource.includes(normalizeForGrounding(x)));
  const v = normalizeForGrounding(String(value));
  if (v.length < 4) return normalizedSource.includes(v);
  const tokens = v.split(/\s+/).filter((t) => t.length >= 4);
  if (!tokens.length) return normalizedSource.includes(v.slice(0, Math.min(18, v.length)));
  return tokens.every((t) => normalizedSource.includes(t));
}

function isGroundableField(raw: unknown): raw is GroundableField {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as object);
}

/**
 * Gate a model-produced ficha against the cleaned source text. Every simple
 * field (shape { value, clause_reference, ... }) whose value cannot be located
 * in the source is withheld: value/reference cleared, `withheldNote` recorded
 * in notes so the UI can say WHY the field is empty. Array fields (criterios)
 * and boolean clauses pass through untouched.
 *
 * Deterministic ficha values must NOT be routed through this gate, they are
 * source-anchored by construction and their clause references prove it.
 *
 * Returns the gated ficha plus the withheld field names (for telemetry).
 */
export function groundModelFicha<T extends Record<string, unknown>>(
  ficha: T | null,
  sourceText: string,
  withheldNote: string
): { ficha: T | null; withheldFields: string[] } {
  if (!ficha) return { ficha: null, withheldFields: [] };

  const normalizedSource = normalizeForGrounding(sourceText);
  const withheldFields: string[] = [];
  const gated: Record<string, unknown> = { ...ficha };

  for (const [key, field] of Object.entries(ficha)) {
    if (!isGroundableField(field) || !field.value?.trim()) continue;
    if (isValueGrounded(field.value, normalizedSource)) continue;
    withheldFields.push(key);
    gated[key] = {
      value: null,
      clause_reference: null,
      confidence: null,
      notes: withheldNote,
    } satisfies GroundableField;
  }

  return { ficha: gated as T, withheldFields };
}
