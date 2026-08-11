// Validate block (Stage 4).
//
// Cross-checks the assembled ficha for internal arithmetic consistency and flags
// fields that don't reconcile. This catches a class of silent extraction errors
// (a budget grabbed from the wrong line, an IVA that doesn't match the base, a
// total that isn't base+IVA) that a single-field extractor cannot see. It never
// edits values — it only reports issues and which fields a human should verify,
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

const REL_TOLERANCE = 0.02; // 2% — absorbs rounding and minor line differences.

export function validateFicha(ficha: Record<string, unknown> | null): ValidationResult {
  const issues: ValidationIssue[] = [];
  const review = new Set<string>();
  if (!ficha) return { consistent: true, issues, reviewFields: [] };

  const base = parseEsAmount(fieldValue(ficha, 'presupuesto_base_sin_iva'));
  const conIva = parseEsAmount(fieldValue(ficha, 'presupuesto_base_con_iva'));
  const valor = parseEsAmount(fieldValue(ficha, 'valor_estimado_contrato'));
  const ivaPct = parseEsPercent(fieldValue(ficha, 'iva'));
  // The IVA field is "21% (1.161.820,80 €)" — the amount is the part after the %.
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

  return { consistent: issues.length === 0, issues, reviewFields: [...review] };
}

export function validationNotice(result: ValidationResult, locale: 'es' | 'en' | 'ca'): string | null {
  if (result.consistent) return null;
  const lead =
    locale === 'en'
      ? 'Some extracted figures do not reconcile — verify before relying on them: '
      : locale === 'ca'
        ? 'Algunes xifres extretes no quadren — verifiqueu-les abans de fer-les servir: '
        : 'Algunas cifras extraídas no cuadran entre sí — verifíquelas antes de usarlas: ';
  return lead + result.issues.map((i) => i.message).join(' ');
}
