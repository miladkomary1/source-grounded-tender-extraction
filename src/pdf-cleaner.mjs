// Pure-JS module so the regression test runner (plain Node, no TS compilation)
// can exercise the cleaning logic against fixture text dumps. document-parser.ts
// imports from here so there is a single source of truth.

// ---------------------------------------------------------------------------
// Inline boilerplate stripping (substring-level)
// ---------------------------------------------------------------------------
// PDF.js sometimes emits an entire page as a single line (no hasEOL events
// between text runs). When that happens, a clause-body line and a signer
// footer share the same "line" and any whole-line-drop strategy wipes real
// contractual content. The fix is to remove the boilerplate substrings in
// place and leave the surrounding clause text intact.
//
// Each pattern below MUST use the /g flag so .replace replaces all matches
// on the line, not just the first.

export const INLINE_STRIP_PATTERNS = [
  // Full signer block: "Firmado por: NAME Cargo: TITLE Fecha: dd-mm-yyyy hh:mm:ss [Jefe de servicio …]"
  // The optional trailing "Jefe de servicio …" tail (typical Leganés footer)
  // is non-greedy and bounded so it cannot accidentally swallow real clause
  // text that follows the timestamp.
  /Firmado por:\s*[^\n]*?Fecha:\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*Jefe de servicio\s+(?:contrataci[oó]n|gesti[oó]n)[^\n]{0,80}?(?=\s|$|Firmado))?/gi,
  // "Cargo: TITLE Fecha: dd-mm-yyyy hh:mm:ss" — covers the case where the
  // PDF's stamp omits the "Firmado por: NAME" prefix or the name is on a
  // separate text run that pdfjs split off.
  /Cargo:\s*[^\n]*?Fecha:\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?/gi,
  // Trailing role fragment that often lingers after the timestamp when the
  // name+title+date were on separate text runs but the role caption was on
  // its own run. Strip the standalone occurrence.
  /\bJefe de servicio\s+(?:contrataci[oó]n|gesti[oó]n[^\n]{0,40})/gi,
  // Page-number markers
  /\bP[aá]gina:\s*\d+\s*de\s*\d+/gi,
  // Verification-code markers (full code is alnum, may include hyphens)
  /\bC[oó]digo de verificaci[oó]n\s*:\s*[A-Za-z0-9-]+/gi,
  /\bC[oó]digo seguro de verificaci[oó]n\s*:?\s*[A-Za-z0-9-]*/gi,
  // Verification URLs (typical municipal/sede-electrónica patterns)
  /https?:\/\/\S*licitacion\S*/gi,
  /https?:\/\/sede\S*/gi,
  // Authenticity notices that some PCAPs append on every page
  /Este documento es Copia Aut[ée]ntica[^\n]{0,200}/gi,
  /Su autenticidad puede ser comprobada[^\n]{0,200}/gi,
  /Para la verificaci[oó]n del siguiente c[oó]digo[^\n]{0,200}/gi,
  /Firmado electr[óo]nicamente[^\n]{0,200}/gi,
];

export function stripInlineBoilerplate(text) {
  let out = text;
  for (const re of INLINE_STRIP_PATTERNS) {
    out = out.replace(re, ' ');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Whole-line filtering (only fires when the PDF actually emits real \n)
// ---------------------------------------------------------------------------
// Strips boilerplate lines from official Spanish public-procurement PDFs.
// Anchored with ^ on purpose: when the line begins with "Firmado por:" the
// whole line is signature metadata and contains no clause text. When the
// signature is concatenated with clause text on a single line, the inline
// pass above takes care of it.
export const BOILERPLATE_LINE_PATTERNS = [
  /^Firmado por:/i,
  /^Cargo:/i,
  /^Fecha:\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/i,
  /^Jefe de servicio/i,
  /^Este documento es Copia Aut[ée]ntica/i,
  /^Su autenticidad puede ser comprobada/i,
  /^Para la verificaci[oó]n del siguiente c[oó]digo/i,
  /^https?:\/\/\S*licitacion\S*/i,
  /^C[oó]digo de verificaci[oó]n\s*:/i,
  /^P[aá]gina:\s*\d+\s*de\s*\d+/i,
];

export function cleanPdfPageText(pageText) {
  // 1. Remove inline boilerplate substrings so a single-line page that mixes
  //    clause text with a signer footer doesn't lose the clause text.
  const stripped = stripInlineBoilerplate(pageText);

  // 2. Drop fully-boilerplate lines (only fires when the PDF actually emits
  //    one boilerplate marker per line, which happens on some PCAPs).
  return stripped
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Cross-page repeated-line detector (best-effort)
// ---------------------------------------------------------------------------
// For PDFs that DO emit per-line text, we additionally drop lines that recur
// on ≥45 % of pages AND positively match a known boilerplate shape. Anything
// that does not match a positive shape is left alone so we never wipe real
// content that happens to repeat (page-header titles, recurring CCEC labels,
// etc.).
export function removeRepeatedBoilerplateLines(pageTexts) {
  if (pageTexts.length < 4) {
    return pageTexts;
  }

  const lineCounts = new Map();

  for (const pageText of pageTexts) {
    const uniquePageLines = new Set(
      pageText.split('\n').map(normalizeRepeatedLineCandidate).filter(Boolean)
    );

    for (const line of uniquePageLines) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const repeatedThreshold = Math.max(3, Math.ceil(pageTexts.length * 0.45));
  const repeatedLines = new Set(
    [...lineCounts.entries()]
      .filter(([line, count]) => count >= repeatedThreshold && isSafeBoilerplateCandidate(line))
      .map(([line]) => line)
  );

  if (repeatedLines.size === 0) {
    return pageTexts;
  }

  return pageTexts.map((pageText) =>
    pageText
      .split('\n')
      .filter((line) => !repeatedLines.has(normalizeRepeatedLineCandidate(line)))
      .join('\n')
      .trim()
  );
}

export function normalizeRepeatedLineCandidate(line) {
  return line.replace(/\s+/g, ' ').trim();
}

export function isSafeBoilerplateCandidate(line) {
  if (line.length < 6 || line.length > 160) {
    return false;
  }

  if (/^(cl[áa]usula|anexo|apartado|art[íi]culo|cap[íi]tulo|secci[óo]n)\b/i.test(line)) {
    return false;
  }

  if (/(presupuesto|garant[íi]a|seguro|solvencia|criterios|plazo|contratista|adjudicatario|iva|valor estimado)/i.test(line)) {
    return false;
  }

  // Only delete a recurring line when it positively matches a known boilerplate
  // shape. Earlier versions tried to detect ALL-CAPS signer-name lines too,
  // which over-stripped contract titles repeated as page headers.
  return (
    /^p[áa]gina\s+\d+/i.test(line) ||
    /^expediente\s*[:/]/i.test(line) ||
    /^c[óo]digo seguro de verificaci[óo]n/i.test(line) ||
    /^csv\s*[:/]/i.test(line) ||
    /^firmado electr[óo]nicamente/i.test(line) ||
    /contrataci[oó]n del sector p[uú]blico/i.test(line) ||
    /sede electr[oó]nica/i.test(line)
  );
}

/**
 * Run all cleaning passes on a list of raw page texts.
 */
export function cleanPdfPages(rawPageTexts) {
  const perPage = rawPageTexts.map(cleanPdfPageText);
  return removeRepeatedBoilerplateLines(perPage);
}
