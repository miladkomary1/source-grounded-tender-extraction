// Segment block (Stage 2).
//
// Builds a reusable structural map of a cleaned pliego — clause headings, annex
// headings, and "cuadro" items (lettered "A. …" or numbered "8) …") — each with
// its character span. The deterministic extractors are anchored on the Leganés
// CCEC apartado NUMBERS; on other layouts those numbers differ, so the engine
// misses structural fields the document plainly states. This map lets an
// extractor locate a field by its heading TEXT (e.g. "OBJETO DEL CONTRATO")
// regardless of the surrounding numbering, and read the value that follows.
//
// Pure (no imports): loads under Next and a plain Node test runner.

export interface Segment {
  /** Canonical marker, e.g. "24" (clause), "I" (anexo), "A" or "8" (cuadro item). */
  marker: string;
  title: string;
  start: number; // index of the heading in the source
  bodyStart: number; // index where the heading ends / body begins
  end: number; // index of the next sibling heading (or text end)
}

export interface DocumentSegments {
  clauses: Segment[];
  anexos: Segment[];
  cuadroItems: Segment[];
}

function closeSpans(list: Array<Omit<Segment, 'end'>>, textLength: number): Segment[] {
  return list.map((seg, i) => ({ ...seg, end: i + 1 < list.length ? list[i + 1].start : textLength }));
}

function collect(text: string, re: RegExp, marker: (m: RegExpMatchArray) => string, title: (m: RegExpMatchArray) => string): Segment[] {
  const out: Array<Omit<Segment, 'end'>> = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    out.push({
      marker: marker(m),
      title: title(m).replace(/\s+/g, ' ').trim(),
      start: m.index,
      bodyStart: m.index + m[0].length,
    });
  }
  return closeSpans(out, text.length);
}

// "Cláusula 24. Responsabilidad del contratista por daños..."
const CLAUSE_RE = /(?:^|[\s.])Cl[aá]usulas?\s+(\d{1,2})\s*[.\-–)]\s*([A-ZÁÉÍÓÚÜÑ][^.\n]{2,90})/gi;
// "ANEXO I - CUADRO..." / "ANEXO VII DOCUMENTO..."
const ANEXO_RE = /(?:^|[\s.])ANEXO\s+([IVXLC]{1,5}|\d{1,2})\b[\s.\-–]*([^\n]{0,80})/gi;
// Lettered cuadro item: "A. PRESUPUESTO BASE", "B. VALOR ESTIMADO".
const LETTERED_RE = /(?:^|[\s.])([A-H])\.\s+([A-ZÁÉÍÓÚÜÑ][^.\n]{3,70})/g;
// Numbered cuadro apartado: "8) PLAZO DE EJECUCIÓN", "22) GARANTÍA DEFINITIVA".
const NUMBERED_RE = /(?:^|[\s.])(\d{1,2})\)\s*([A-ZÁÉÍÓÚÜÑ][^.\n]{3,70})/g;

export function segmentDocument(text: string): DocumentSegments {
  if (typeof text !== 'string') return { clauses: [], anexos: [], cuadroItems: [] };
  const lettered = collect(text, LETTERED_RE, (m) => m[1], (m) => m[2]);
  const numbered = collect(text, NUMBERED_RE, (m) => m[1], (m) => m[2]);
  // Prefer whichever cuadro style is dominant in this document.
  const cuadroItems = numbered.length >= lettered.length ? numbered : lettered;
  return {
    clauses: collect(text, CLAUSE_RE, (m) => m[1], (m) => m[2]),
    anexos: collect(text, ANEXO_RE, (m) => m[1].toUpperCase(), (m) => m[2]),
    cuadroItems,
  };
}

/**
 * Find the body text of the first segment whose title matches `titleRe`, within
 * `maxBody` chars. Returns null when no heading matches. Used by structural
 * extractors to read a field's value regardless of the document's numbering.
 */
export function segmentBody(text: string, segments: Segment[], titleRe: RegExp, maxBody = 400): string | null {
  for (const seg of segments) {
    if (titleRe.test(seg.title) || titleRe.test(`${seg.marker} ${seg.title}`)) {
      return text.slice(seg.bodyStart, Math.min(seg.end, seg.bodyStart + maxBody)).replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}
