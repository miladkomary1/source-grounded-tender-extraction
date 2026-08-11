const CLAUSE_BOUNDARY_PATTERN =
  /(?=\n(?:Cláusula|Artículo|Apartado|CLÁUSULA|ARTÍCULO|SECCIÓN|CAPÍTULO|ANEXO)\s)/;

const SECTION_HEADING_PATTERN =
  /(?:^|\n)\s*((?:Cláusula|Artículo|Apartado|CLÁUSULA|ARTÍCULO|SECCIÓN|CAPÍTULO|ANEXO)\s+(?:[0-9]+(?:\.[0-9]+)*|[IVXLCMD]+))/g;

export interface DocumentSection {
  key: string;
  heading: string;
  text: string;
}

export interface ComparisonChunk {
  key: string;
  textA: string;
  textB: string;
}

/**
 * Splits a document into manageable chunks for LLM processing.
 * Splits on clause boundaries first, falls back to paragraphs.
 */
export function chunkDocument(
  text: string,
  maxChunkSize: number = 8000
): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const clauseParts = text
    .split(CLAUSE_BOUNDARY_PATTERN)
    .filter((p) => p.trim().length > 0);

  if (clauseParts.length > 1) {
    return mergeChunks(clauseParts, maxChunkSize);
  }

  // Fallback: split on paragraph boundaries (double newline)
  const paragraphParts = text
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);

  if (paragraphParts.length > 1) {
    return mergeChunks(paragraphParts, maxChunkSize);
  }

  // Last resort: hard split by character count
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChunkSize) {
    chunks.push(text.slice(i, i + maxChunkSize));
  }
  return chunks;
}

export function splitDocumentIntoSections(text: string): DocumentSection[] {
  const matches = Array.from(text.matchAll(SECTION_HEADING_PATTERN));
  if (matches.length === 0) return [];

  return matches
    .map((match, index) => {
      const heading = match[1]?.trim();
      if (!heading) return null;

      const sectionStart = match.index + match[0].lastIndexOf(heading);
      const nextStart =
        index + 1 < matches.length
          ? matches[index + 1].index + matches[index + 1][0].lastIndexOf(matches[index + 1][1])
          : text.length;

      const sectionText = text.slice(sectionStart, nextStart).trim();
      if (!sectionText) return null;

      return {
        key: normalizeHeadingKey(heading),
        heading,
        text: sectionText,
      };
    })
    .filter(Boolean) as DocumentSection[];
}

export function buildComparisonChunks(
  textA: string,
  textB: string,
  maxChunkSize: number = 32000
): ComparisonChunk[] {
  const sectionsA = collapseSections(splitDocumentIntoSections(textA));
  const sectionsB = collapseSections(splitDocumentIntoSections(textB));

  if (sectionsA.size === 0 || sectionsB.size === 0) {
    return zipChunks(chunkDocument(textA, maxChunkSize), chunkDocument(textB, maxChunkSize));
  }

  const keys = Array.from(new Set([...sectionsA.keys(), ...sectionsB.keys()]));
  const chunks: ComparisonChunk[] = [];
  const sectionChunkSize = Math.max(Math.floor(maxChunkSize / 2), 4000);

  for (const key of keys) {
    const sourceA = sectionsA.get(key) ?? '';
    const sourceB = sectionsB.get(key) ?? '';

    if ((sourceA.length || 0) + (sourceB.length || 0) <= maxChunkSize) {
      chunks.push({ key, textA: sourceA, textB: sourceB });
      continue;
    }

    const partsA = sourceA ? chunkDocument(sourceA, sectionChunkSize) : [];
    const partsB = sourceB ? chunkDocument(sourceB, sectionChunkSize) : [];
    chunks.push(...zipChunks(partsA, partsB, key));
  }

  return chunks.filter((chunk) => chunk.textA.trim() || chunk.textB.trim());
}

/**
 * Merges small parts into chunks respecting maxChunkSize.
 */
function mergeChunks(parts: string[], maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += (current ? '\n\n' : '') + part;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function estimateChunkCount(text: string, maxChunkSize: number = 8000): number {
  return chunkDocument(text, maxChunkSize).length;
}

export function estimateAnalysisChunkCount(
  mode: 'costes' | 'clausulas' | 'comparar' | 'ficha',
  textA: string,
  textB?: string
): number {
  if (!textA.trim()) {
    return 0;
  }

  if (mode === 'comparar') {
    return textB?.trim() ? buildComparisonChunks(textA, textB, 32_000).length : 0;
  }

  return estimateChunkCount(textA, mode === 'ficha' ? 32_000 : 8_000);
}

function normalizeHeadingKey(heading: string): string {
  return heading
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function collapseSections(sections: DocumentSection[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const section of sections) {
    const existing = map.get(section.key);
    map.set(section.key, existing ? `${existing}\n\n${section.text}` : section.text);
  }

  return map;
}

function zipChunks(partsA: string[], partsB: string[], keyPrefix = 'Fragmento'): ComparisonChunk[] {
  const max = Math.max(partsA.length, partsB.length);
  const chunks: ComparisonChunk[] = [];

  for (let index = 0; index < max; index++) {
    const textA = partsA[index] ?? '';
    const textB = partsB[index] ?? '';
    if (!textA.trim() && !textB.trim()) continue;

    chunks.push({
      key: max > 1 ? `${keyPrefix} (${index + 1}/${max})` : keyPrefix,
      textA,
      textB,
    });
  }

  return chunks;
}
