// Validate block (Stage 4).
//
// Cross-checks the assembled ficha for internal arithmetic consistency and flags
// fields that don't reconcile. This catches a class of silent extraction errors
// (a budget grabbed from the wrong line, an IVA that doesn't match the base, a
// total that isn't base+IVA) that a single-field extractor cannot see. It never
// edits values, it only reports issues and which fields a human should verify,
// so the caller can downgrade their confidence and surface a notice.
//
// Pure (no imports): loads under Next and a plain Node test runner.

export interface ValidationIssue {
  check: string;
  fields: string[];
  message: string;
}
export interface ValidationResult {
  consistent: boolean;
  issues: ValidationIssue[];
  reviewFields: string[];
}

// "5.532.479,98 €" / "6.694.300,78" -> 5532479.98. Returns null if not a money value.
export function parseEsAmount(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// A surfaced monetary value must look like a COMPLETE amount.
//
// The deterministic patterns build on `\d{1,3}(?:\.\d{3})*(?:,\d+)?`, whose `*`
// permits zero thousands-groups. With no guard against starting mid-number, a match
// can begin inside a longer figure: "40.000,00 €" yields "000,00 €" and
// "82.500,00 €" yields "00 €". Such a fragment is a verbatim substring of the
// source, so the grounding gate admits it, locatability cannot distinguish a
// truncation from the whole. Only a well-formedness test can.
//
// Assumption, stated because it is a judgement: in the budget fields a real figure
// always carries a decimal comma or a thousands separator, so a bare integer of
// three digits or fewer is treated as a fragment rather than a genuine small amount.
export function isWellFormedAmount(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).replace(/[\s€]/g, '');
  if (!s) return false;
  if (/^[.,]/.test(s)) return false;        // starts with a separator
  if (/^0[\d]/.test(s)) return false;       // leading zero digits: "000,00", "00"
  if (/^\d{1,3}$/.test(s)) return false;    // bare fragment: "48", "77", "25"
  return parseEsAmount(value) != null;      // and must parse to a positive amount
}

/** Budget fields to which the well-formedness test applies. */
export const MONETARY_FIELDS = [
  'presupuesto_base_sin_iva',
  'presupuesto_base_con_iva',
  'valor_estimado_contrato',
] as const;

// First integer percentage in the value ("21% (1.161.820,80 €)" -> 21).
export function parseEsPercent(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).match(/(\d{1,2})\s*%/);
  return m ? Number(m[1]) : null;
}

function fieldValue(ficha: Record<string, unknown> | null, key: string): unknown {
  const f = ficha?.[key] as { value?: unknown } | undefined;
  return f && typeof f === 'object' ? f.value : undefined;
}

const REL_TOLERANCE = 0.02; // 2%, absorbs rounding and minor line differences.

export function validateFicha(ficha: Record<string, unknown> | null): ValidationResult {
  const issues: ValidationIssue[] = [];
  const review = new Set<string>();
  if (!ficha) return { consistent: true, issues, reviewFields: [] };

  const base = parseEsAmount(fieldValue(ficha, 'presupuesto_base_sin_iva'));
  const conIva = parseEsAmount(fieldValue(ficha, 'presupuesto_base_con_iva'));
  const valor = parseEsAmount(fieldValue(ficha, 'valor_estimado_contrato'));
  const ivaPct = parseEsPercent(fieldValue(ficha, 'iva'));
  // The IVA field is "21% (1.161.820,80 €)", the amount is the part after the %.
  const ivaAmount = parseEsAmount(String(fieldValue(ficha, 'iva') ?? '').replace(/^\D*\d{1,2}\s*%/, ''));

  const close = (a: number, b: number) => Math.abs(a - b) <= REL_TOLERANCE * Math.max(a, b);

  // 1) base + IVA = total con IVA.
  if (base != null && conIva != null && ivaPct != null) {
    const expected = base * (1 + ivaPct / 100);
    if (!close(expected, conIva)) {
      issues.push({
        check: 'base_iva_total',
        fields: ['presupuesto_base_sin_iva', 'iva', 'presupuesto_base_con_iva'],
        message: `Base ${base.toLocaleString('es-ES')} + ${ivaPct}% IVA ≠ total ${conIva.toLocaleString('es-ES')} (esperado ≈ ${expected.toLocaleString('es-ES', { maximumFractionDigits: 2 })}).`,
      });
      ['presupuesto_base_sin_iva', 'presupuesto_base_con_iva', 'iva'].forEach((f) => review.add(f));
    }
  }

  // 2) The IVA euro amount matches base × IVA%.
  if (base != null && ivaPct != null && ivaAmount != null) {
    const expectedIva = base * (ivaPct / 100);
    if (!close(expectedIva, ivaAmount)) {
      issues.push({
        check: 'iva_amount',
        fields: ['iva', 'presupuesto_base_sin_iva'],
        message: `El importe de IVA (${ivaAmount.toLocaleString('es-ES')}) no coincide con ${ivaPct}% de la base.`,
      });
      review.add('iva');
    }
  }

  // 3) Valor estimado should be >= base imponible (it usually adds prórrogas/mods).
  if (valor != null && base != null && valor < base * (1 - REL_TOLERANCE)) {
    issues.push({
      check: 'valor_ge_base',
      fields: ['valor_estimado_contrato', 'presupuesto_base_sin_iva'],
      message: `El valor estimado (${valor.toLocaleString('es-ES')}) es menor que la base imponible (${base.toLocaleString('es-ES')}); revísese a qué campo corresponde cada cifra.`,
    });
    ['valor_estimado_contrato', 'presupuesto_base_sin_iva'].forEach((f) => review.add(f));
  }

  // 4) Every surfaced monetary value must be a complete amount, not a fragment.
  //    This runs independently of the identities above, because a truncation
  //    usually leaves no arithmetic trace to contradict: the other budget fields
  //    may be absent, so nothing disagrees with it.
  for (const key of MONETARY_FIELDS) {
    const raw = fieldValue(ficha, key);
    if (raw == null || String(raw).trim() === '') continue;
    if (isWellFormedAmount(raw)) continue;
    issues.push({
      check: 'amount_well_formed',
      fields: [key],
      message: `El importe extraído para ${key} ("${String(raw).trim()}") está incompleto o truncado; no debe usarse.`,
    });
    review.add(key);
  }

  return { consistent: issues.length === 0, issues, reviewFields: [...review] };
}

export function validationNotice(result: ValidationResult, locale: 'es' | 'en' | 'ca'): string | null {
  if (result.consistent) return null;
  const lead =
    locale === 'en'
      ? 'Some extracted figures do not reconcile, verify before relying on them: '
      : locale === 'ca'
        ? 'Algunes xifres extretes no quadren, verifiqueu-les abans de fer-les servir: '
        : 'Algunas cifras extraídas no cuadran entre sí, verifíquelas antes de usarlas: ';
  return lead + result.issues.map((i) => i.message).join(' ');
}
