export const OBLIGATION_CLAUSE_HINTS: Array<{ test: RegExp; clause: number; label: string }>;
export function findEnclosingClauseNumber(
  normalizedSource: string,
  position: number,
  maxLookback?: number
): number | null;
export function findEnclosingApartado(
  normalizedSource: string,
  position: number,
  maxLookback?: number
): string | null;
export function formatClauseReference(clauseNumber: number): string;
export function formatApartadoReference(apartado: string): string;
