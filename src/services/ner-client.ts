// NER client (Stage 6), calls the optional PACP document service for Spanish
// procurement entity recognition (BSC NextProcurement models). Fail-soft:
// returns null when the service is not configured or unreachable, so the
// extraction cascade simply skips the `ner` candidate and uses the regex/LLM
// methods instead.

export interface NerEntity {
  text: string;
  label: string;
  score: number;
}

const TIMEOUT_MS = (() => {
  const n = Number(process.env.NER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
})();

export function nerEnabled(): boolean {
  return Boolean(process.env.DOCLING_SERVICE_URL?.trim());
}

export async function nerExtract(text: string, model?: string): Promise<NerEntity[] | null> {
  const base = process.env.DOCLING_SERVICE_URL?.trim();
  if (!base || !text.trim()) return null;
  try {
    const secret = process.env.DOCLING_SERVICE_SECRET?.trim();
    const res = await fetch(`${base.replace(/\/$/, '')}/ner`, {
      method: 'POST',
      headers: secret
        ? { 'Content-Type': 'application/json', 'X-Service-Key': secret }
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify(model ? { text, model } : { text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[ner] not_ok', res.status);
      return null;
    }
    const data = (await res.json()) as { entities?: NerEntity[] };
    return Array.isArray(data.entities) ? data.entities : null;
  } catch (error) {
    console.warn('[ner] failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}
