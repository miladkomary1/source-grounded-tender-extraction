// Classify block (Stage 1).
//
// Determines, cheaply and deterministically, three things about a cleaned PCAP
// that drive the rest of the pipeline:
//   - contractType  — obras / servicios / suministros (LCSP calificación)
//   - templateFamily — how the document presents its data, which decides which
//     extractor strategy the cascade should prefer:
//       ccec-cuadro     : Leganés-style "CUADRO DE CARACTERÍSTICAS" with numbered
//                         apartados ("8) PLAZO DE EJECUCIÓN ...")
//       lettered-cuadro : a cuadro-resumen with lettered items ("A. PRESUPUESTO
//                         BASE ... B. VALOR ESTIMADO ...")
//       prose           : values stated in clause prose ("el plazo ... será de ...")
//   - reportLanguage — es / ca / en (light heuristic; the request locale wins
//     when explicit, this is the document-content fallback).
//
// Pure and fail-soft: unknown inputs return 'desconocido' / 'unknown' / 'es'
// rather than throwing.

import type { ContractType, DocumentClassification, Locale, TemplateFamily } from '../types';

const TIPO_RE =
  /(?:Contrato\s+administrativo\s+de|CALIFICACI[ÓO]N\s*:?\s*[^\n]*?|CONTRATO\s+DE)\s+(OBRAS|SERVICIOS|SUMINISTROS|GESTI[ÓO]N\s+DE\s+SERVICIOS|CONCESI[ÓO]N\s+DE\s+(?:OBRAS|SERVICIOS)|MIXTO)/i;

export function classifyContractType(text: string): ContractType {
  const m = text.match(TIPO_RE);
  if (!m) return 'desconocido';
  const v = m[1].toUpperCase();
  if (v.startsWith('OBRAS')) return 'obras';
  if (v.startsWith('SUMINISTRO')) return 'suministros';
  if (v.includes('SERVICIO')) return 'servicios';
  if (v.startsWith('MIXTO')) return 'mixto';
  return 'otro';
}

export function classifyTemplateFamily(text: string): TemplateFamily {
  const hasCuadro = /CUADRO\s+(?:DE\s+)?CARACTER[ÍI]STICAS|\bCCEC\b/i.test(text);
  // Numbered apartados like "8) PLAZO DE EJECUCIÓN" or "22) GARANTÍA DEFINITIVA".
  const numberedApartados = (text.match(/(?:^|\s)\d{1,2}\s*\)\s*[A-ZÁÉÍÓÚÜÑ]{4,}/g) || []).length;
  // Lettered cuadro items like "A. PRESUPUESTO BASE" / "B. VALOR ESTIMADO".
  const letteredItems = (text.match(/(?:^|\s)[A-H]\.\s*[A-ZÁÉÍÓÚÜÑ]{4,}/g) || []).length;

  if (hasCuadro && numberedApartados >= 6) return 'ccec-cuadro';
  if (letteredItems >= 5) return 'lettered-cuadro';
  if (numberedApartados >= 6) return 'ccec-cuadro';
  // Values present in clause prose with declarative connectors.
  if (/(?:plazo de ejecuci[oó]n|presupuesto base de licitaci[oó]n)[^.\n]{0,60}(?:ser[áa]|asciende a|es de|:)/i.test(text)) {
    return 'prose';
  }
  return 'unknown';
}

// A "framework / model" pliego (pliego tipo / de aplicación general) does NOT
// contain the specific contract figures — they are deferred to a per-contract
// "Cuadro de Características Particulares" (CCP) or a fill-in annex. On these
// documents blank amount fields are CORRECT, not a failure, so we detect and
// surface that to the user instead of letting them think extraction broke.
export function detectFrameworkPliego(text: string): boolean {
  // High precision over recall: only flag when we're confident the specific
  // figures are NOT in this document, so we never mislabel a real contract
  // (which would wrongly excuse a genuine extraction miss).
  //
  // A real, specific pliego states a concrete budget figure near the budget
  // keywords. The framework signature is a "Cuadro de Características
  // Particulares" / CCP marker WITHOUT any concrete budget present — the figures
  // are deferred to the per-contract CCP.
  //
  // Deliberately NOT used as a signal: blank fill-in placeholders ("……"/"___"),
  // because every pliego embeds blank annex FORMS (proposición económica,
  // declaración responsable), which would false-positive real contracts.
  // Leganés-style "CCEC" (Características ESPECÍFICAS) is where figures ARE
  // present, so it is intentionally not matched by the CCP marker.
  const ccpMarker = /cuadro de caracter[íi]sticas particulares|\bccp\b/i.test(text);
  const concreteBudget = /(presupuesto base|valor estimado|importe (?:total|base))[^.\n]{0,80}\d{1,3}(?:\.\d{3})+,\d{2}\s*(?:€|euros)/i.test(text);
  return ccpMarker && !concreteBudget;
}

export function frameworkPliegoNote(locale: Locale): string {
  return locale === 'en'
    ? 'This appears to be a model/framework pliego: the specific figures (budget, value, deadlines) are set per contract in the Cuadro de Características Particulares (CCP), not in this document, so those fields are intentionally blank.'
    : locale === 'ca'
      ? "Sembla un plec tipus/marc: les xifres concretes (pressupost, valor, terminis) es fixen per contracte al Quadre de Característiques Particulars (CCP), no en aquest document, per això aquests camps queden en blanc."
      : 'Parece un pliego tipo/marco: las cifras concretas (presupuesto, valor, plazos) se fijan por contrato en el Cuadro de Características Particulares (CCP), no en este documento, por lo que esos campos quedan en blanco.';
}

export function classifyReportLanguage(text: string): Locale {
  const sample = text.slice(0, 30_000);
  // Conservative: a Spanish pliego is the overwhelming default. Only flip on a
  // decisive title marker plus corroborating Catalan/English function words, so
  // a Castilian document with an incidental foreign word is never misread.
  const catalanTitle = /\bPLEC\s+DE\s+CL[ÀA]USULES\b|\bPLEC\s+DE\s+PRESCRIPCIONS\b/i.test(sample);
  const catalanFn = (sample.toLowerCase().match(/\b(amb|què|aquest|aquesta|dels|d'acord|qualsevol|s'ha)\b/g) || []).length;
  if (catalanTitle && catalanFn >= 3) return 'ca';

  const englishTitle = /\b(tender specifications|terms and conditions|contract notice|the contractor shall)\b/i.test(sample);
  if (englishTitle) return 'en';

  return 'es';
}

export function classifyDocument(text: string, requestLocale?: Locale): DocumentClassification {
  return {
    contractType: classifyContractType(text),
    templateFamily: classifyTemplateFamily(text),
    reportLanguage: requestLocale ?? classifyReportLanguage(text),
  };
}
