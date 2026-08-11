// Verify block — source-grounding for findings.
//
// Every finding the pipeline emits must be provable against the literal source
// text: its clause_reference and source_excerpt must both appear in the cleaned
// document AND lie within EVIDENCE_PROXIMITY_WINDOW characters of each other.
// This is what stops the LLM (or a regex) from surfacing a clause that isn't in
// the document. reattributeClause additionally rescues findings the model
// mislabeled by re-deriving the clause from document structure.
//
// Carved out of app/api/analyze/route.ts in Stage 0 with no behaviour change.

import type { Finding } from '../../analysis-schema';
import type { Mode } from '../../i18n-types';
import { findEnclosingClauseNumber, formatClauseReference } from '../../source-attribution.mjs';

const EVIDENCE_PROXIMITY_WINDOW = (() => {
  const parsed = Number(process.env.OPENAI_EVIDENCE_WINDOW_CHARS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4_000;
})();

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.clause_reference}::${finding.source_excerpt.slice(0, 50)}::${finding.clause_referenceB ?? ''}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripExcerptDelimiters(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'“”‘’«»([{]+/, '')
    .replace(/[\s"'“”‘’«»)\]}.,;:!?]+$/, '')
    .trim();
}

function excerptCandidates(excerpt: string): string[] {
  return Array.from(
    new Set(
      [
        excerpt,
        stripExcerptDelimiters(excerpt),
        excerpt.replace(/(?:\.\.\.|…)\s*$/, '').trim(),
        stripExcerptDelimiters(excerpt).replace(/(?:\.\.\.|…)\s*$/, '').trim(),
      ].filter(Boolean)
    )
  );
}

function findAllIndexes(source: string, value: string): number[] {
  const indexes: number[] = [];
  let fromIndex = 0;

  while (fromIndex < source.length) {
    const foundIndex = source.indexOf(value, fromIndex);
    if (foundIndex === -1) {
      break;
    }

    indexes.push(foundIndex);
    fromIndex = foundIndex + Math.max(value.length, 1);
  }

  return indexes;
}

function findExcerptPositions(normalizedSource: string, excerpt: string): number[] {
  return Array.from(
    new Set(
      excerptCandidates(excerpt).flatMap((candidate) => {
        const normalizedCandidate = normalizeForSearch(candidate);
        return normalizedCandidate.length > 0 ? findAllIndexes(normalizedSource, normalizedCandidate) : [];
      })
    )
  );
}

function findClauseReferencePositions(normalizedSource: string, clauseReference: string): number[] {
  const normalizedReference = normalizeForSearch(clauseReference);

  if (!normalizedReference || !normalizedSource) {
    return [];
  }

  const exactMatches = findAllIndexes(normalizedSource, normalizedReference);

  const match = normalizedReference.match(
    /\b(clausula|articulo|apartado|seccion|capitulo|anexo)\s+([0-9]+(?:\.[0-9]+)*|[ivxlcdm]+)/i
  );

  if (!match) {
    return exactMatches;
  }

  const [, keyword, identifier] = match;
  const relaxedPattern = new RegExp(
    `${escapeRegExp(keyword)}\\s+${escapeRegExp(identifier)}(?:\\b|[.:)\\-])`,
    'gi'
  );

  const relaxedMatches = Array.from(normalizedSource.matchAll(relaxedPattern), (relaxedMatch) => relaxedMatch.index ?? -1)
    .filter((index) => index >= 0);

  return Array.from(new Set([...exactMatches, ...relaxedMatches]));
}

// Rescue a finding whose stated clause_reference does not co-locate with its
// excerpt by re-deriving the reference from the nearest preceding clause heading
// in the source. Only touches findings that would otherwise be dropped by
// verifyFinding, so it is strictly additive to recall (see lib/source-attribution).
export function reattributeClause(finding: Finding, normalizedSource: string): Finding {
  // Leave already-valid attributions untouched.
  if (sourceContainsEvidencePair(normalizedSource, finding.clause_reference, finding.source_excerpt)) {
    return finding;
  }

  const excerptPositions = findExcerptPositions(normalizedSource, finding.source_excerpt);
  if (excerptPositions.length === 0) {
    // Excerpt isn't in the source at all — verifyFinding will drop it regardless.
    return finding;
  }

  for (const position of excerptPositions) {
    const clauseNumber = findEnclosingClauseNumber(normalizedSource, position, EVIDENCE_PROXIMITY_WINDOW);
    if (clauseNumber != null) {
      const corrected = formatClauseReference(clauseNumber);
      if (normalizeForSearch(corrected) !== normalizeForSearch(finding.clause_reference)) {
        return { ...finding, clause_reference: corrected };
      }
    }
  }

  return finding;
}

function sourceContainsEvidencePair(normalizedSource: string, clauseReference: string, excerpt: string): boolean {
  const referencePositions = findClauseReferencePositions(normalizedSource, clauseReference);
  const excerptPositions = findExcerptPositions(normalizedSource, excerpt);

  if (referencePositions.length === 0 || excerptPositions.length === 0) {
    return false;
  }

  return referencePositions.some((referencePosition) =>
    excerptPositions.some(
      (excerptPosition) => Math.abs(excerptPosition - referencePosition) <= EVIDENCE_PROXIMITY_WINDOW
    )
  );
}

function sourceContainsLiteralExcerpt(normalizedSource: string, excerpt: string): boolean {
  return findExcerptPositions(normalizedSource, excerpt).length > 0;
}

export function verifyFinding(finding: Finding, normalizedSourceA: string, mode: Mode, normalizedSourceB?: string): Finding {
  const hasReferenceA = finding.clause_reference?.trim().length > 0;
  const hasExcerptA = finding.source_excerpt?.trim().length > 0;

  if (!hasReferenceA) {
    return { ...finding, verification_status: 'sin_referencia' };
  }

  if (!hasExcerptA) {
    return { ...finding, verification_status: 'sin_extracto' };
  }

  if (
    !sourceContainsEvidencePair(normalizedSourceA, finding.clause_reference, finding.source_excerpt) &&
    !sourceContainsLiteralExcerpt(normalizedSourceA, finding.source_excerpt)
  ) {
    return { ...finding, verification_status: 'sin_extracto' };
  }

  if (mode === 'comparar') {
    const clauseReferenceB = finding.clause_referenceB?.trim() ?? '';
    const sourceExcerptB = finding.source_excerptB?.trim() ?? '';

    if (!clauseReferenceB || !normalizedSourceB) {
      return { ...finding, verification_status: 'sin_referencia' };
    }

    if (!sourceExcerptB) {
      return { ...finding, verification_status: 'sin_extracto' };
    }

    if (
      !sourceContainsEvidencePair(normalizedSourceB, clauseReferenceB, sourceExcerptB) &&
      !sourceContainsLiteralExcerpt(normalizedSourceB, sourceExcerptB)
    ) {
      return { ...finding, verification_status: 'sin_extracto' };
    }
  }

  return { ...finding, verification_status: 'verificado' };
}
