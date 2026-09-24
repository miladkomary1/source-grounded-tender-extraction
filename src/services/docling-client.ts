// Docling client (Stage 6), calls the optional PACP document service for
// layout/table-faithful PDF parsing. Fail-soft: returns null whenever the
// service is not configured, unreachable, or slow, so the pipeline always falls
// back to its pure-TS pdfjs path. Same contract as the cache adapter.

export interface DoclingTableRow {
  [column: string]: string | number | null;
}
export interface DoclingParseResult {
  text: string;
  tables: DoclingTableRow[][];
  pages: number | null;
}

const TIMEOUT_MS = (() => {
  const n = Number(process.env.DOCLING_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
})();

export function doclingEnabled(): boolean {
  return Boolean(process.env.DOCLING_SERVICE_URL?.trim());
}

export async function doclingParse(pdf: Uint8Array, filename = 'document.pdf'): Promise<DoclingParseResult | null> {
  const base = process.env.DOCLING_SERVICE_URL?.trim();
  if (!base) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([pdf as BlobPart], { type: 'application/pdf' }), filename);
    const secret = process.env.DOCLING_SERVICE_SECRET?.trim();
    const res = await fetch(`${base.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      body: form,
      headers: secret ? { 'X-Service-Key': secret } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[docling] parse_not_ok', res.status);
      return null;
    }
    const data = (await res.json()) as Partial<DoclingParseResult>;
    if (typeof data.text !== 'string') return null;
    return { text: data.text, tables: Array.isArray(data.tables) ? data.tables : [], pages: data.pages ?? null };
  } catch (error) {
    console.warn('[docling] parse_failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}
