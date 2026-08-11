export function findLabeledValue(
  text: string,
  labels: string[],
  type: 'money' | 'duration' | 'percent',
  opts?: { maxGap?: number }
): string | null;

export const FICHA_LABEL_SYNONYMS: Record<string, string[]>;
