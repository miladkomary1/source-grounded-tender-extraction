// Spanish PCAP Anexo I (Cuadro de Características Específicas del Contrato,
// "CCEC") structural parser.
//
// In a Spanish PCAP, Anexo I is the contractually authoritative source for
// ficha fields: cláusula 1 typically states that, where general clauses and
// Anexo I disagree, Anexo I prevails. Anexo I is structured as a numbered
// list (apartados 1..36, with sub-apartados such as 14.a, 34.1).
//
// Mapping of ficha fields to apartado numbers (Leganés-style PCAP, see
// CLAUDE_CODE_HANDOFF.md §2 Phase 2):
//
//    1   Procedimiento + calificación
//    2   Órgano contratante
//    3   Tramitación
//    4   Objeto del contrato
//    7   Situación / CPV / clasificación obra / proyecto / disponibilidad
//    8   Plazo de ejecución
//    9   Modificaciones previstas
//   10   Presupuesto + valor estimado (PEM, GG, BI, base imponible, IVA, total)
//   11   Crédito presupuestario / cofinanciación
//   12   Sujeto a regulación armonizada
//   13   Sujeto a recurso especial
//   14   Clasificación + solvencia (económica + técnica)
//   20   Garantía provisional
//   21   Variantes
//   22   Garantía definitiva
//   23   Garantía complementaria
//   24   Pólizas de seguros (RC + TR con importes)
//   25   Programa de trabajo
//   26   Subcontratación
//   27   Régimen de pagos
//   28   Revisión de precios
//   29   Director facultativo
//   31   Plazo de garantía
//   32   Composición Mesa de contratación
//   33   Licitación electrónica
//   34   Otras obligaciones esenciales y gastos por cuenta del contratista
//        (sub-apartados 34.1..34.7 — críticos para Costes)
//   35   Condiciones especiales de ejecución (social / medioambiental)
//   36   Confidencialidad
//
// The parser returns a Map keyed by the canonical apartado number ("3", "14",
// "34.1") whose values are { numero, titulo, contenido }. It is conservative:
// if it cannot find at least MIN_VALID_APARTADOS distinct apartados it returns
// null and the caller falls back to whole-document prompting.

const MIN_VALID_APARTADOS = 8;

// Lines that introduce the Anexo I block. We accept variants seen in real
// PCAPs: "ANEXO I", "ANEXO I.", "ANEXO I -", with optional leading whitespace
// and optional CCEC subtitle on the same or next line.
const ANEXO_I_HEADING =
  /(?:^|\n)\s*ANEXO\s+I\b[^\n]*\n/i;

// Heading that closes Anexo I — usually the next ANEXO (II/III/...) or a
// trailing signature page. We stop the scan at the first such marker.
const ANEXO_I_TERMINATOR =
  /\n\s*(ANEXO\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b|FIRMADO\s+ELECTR[ÓO]NICAMENTE)/i;

// An apartado boundary is a line that starts with a number followed by ".",
// ")" or "-", then at least one non-numeric character (so "21.000,00 euros"
// inside a body does NOT trigger a false boundary). Sub-apartados such as
// "34.1.", "18.1.2." or "14.a" are recognised too.
const APARTADO_BOUNDARY = /(?:^|\n)\s*(\d{1,2}(?:\.\d{1,2}){0,2}(?:\.[a-z])?)[\.\)\-]\s+(?=[A-ZÁÉÍÓÚÜÑ])/g;

/**
 * @typedef {{ numero: string, titulo: string, contenido: string }} AnexoIApartado
 */

/**
 * Parse Anexo I out of the full document text.
 * @param {string} fullText
 * @returns {Map<string, AnexoIApartado> | null}
 */
export function parseAnexoI(fullText) {
  if (!fullText || typeof fullText !== 'string') return null;

  const headingMatch = fullText.match(ANEXO_I_HEADING);
  if (!headingMatch || headingMatch.index === undefined) return null;

  const blockStart = headingMatch.index + headingMatch[0].length;
  const tail = fullText.slice(blockStart);

  const terminatorMatch = tail.match(ANEXO_I_TERMINATOR);
  const blockEnd = terminatorMatch && terminatorMatch.index !== undefined ? terminatorMatch.index : tail.length;
  const block = tail.slice(0, blockEnd);

  const boundaries = [];
  for (const match of block.matchAll(APARTADO_BOUNDARY)) {
    if (match.index === undefined) continue;
    boundaries.push({ index: match.index, numero: match[1], headingLength: match[0].length });
  }

  if (boundaries.length < MIN_VALID_APARTADOS) return null;

  const apartados = new Map();
  for (let i = 0; i < boundaries.length; i++) {
    const current = boundaries[i];
    const next = boundaries[i + 1];

    const sliceStart = current.index + current.headingLength;
    const sliceEnd = next ? next.index : block.length;
    const body = block.slice(sliceStart, sliceEnd).trim();

    // Title = first sentence-ish span (up to first newline or ".").
    const titleMatch = body.match(/^[^\n.]{0,200}/);
    const titulo = titleMatch ? titleMatch[0].trim() : '';
    const contenido = body.trim();

    // Last writer wins is fine: PCAPs sometimes repeat headings across
    // resúmenes; the last instance is usually the canonical one.
    apartados.set(current.numero, { numero: current.numero, titulo, contenido });
  }

  return apartados;
}

/**
 * Convenience accessor: get the body text of a specific apartado, or null.
 * @param {Map<string, AnexoIApartado> | null} apartados
 * @param {string | string[]} numero
 * @returns {string | null}
 */
export function getApartadoContenido(apartados, numero) {
  if (!apartados) return null;
  const candidates = Array.isArray(numero) ? numero : [numero];
  for (const n of candidates) {
    const apartado = apartados.get(n);
    if (apartado && apartado.contenido) return apartado.contenido;
  }
  return null;
}

/**
 * Canonical mapping of ficha field names to Anexo I apartado numbers. Useful
 * for prompt construction and tests.
 */
export const FICHA_TO_APARTADO = Object.freeze({
  procedimiento: '1',
  tipo_contrato: '1',
  organo_contratacion: '2',
  tramitacion: '3',
  objeto_contrato: '4',
  plazo_ejecucion: '8',
  presupuesto_base_sin_iva: '10',
  presupuesto_base_con_iva: '10',
  valor_estimado_contrato: '10',
  iva: '10',
  clasificacion_empresarial: '14',
  solvencia_economica: '14',
  solvencia_tecnica: '14',
  garantia_provisional: '20',
  garantia_definitiva: '22',
  seguros_obligatorios: '24',
  subcontratacion_permitida: '26',
  revision_precios_aplica: '28',
  plazo_garantia: '31',
  presentacion_electronica: '33',
  // Apartado 34 and its sub-apartados (34.1..34.7) hold the critical
  // contractor-side cost obligations the Costes report relies on.
  otras_obligaciones_contratista: '34',
});
