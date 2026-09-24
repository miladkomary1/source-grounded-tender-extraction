// Pipeline foundation types.
//
// The analysis is being restructured into an ordered sequence of independently
// testable "blocks" (ingest → clean → classify → segment → extract → validate →
// route → assemble → output). Each block is a small unit with a typed contract,
// so it can be unit-tested and benchmarked in isolation and swapped or upgraded
// without touching the others. This file defines the shared contracts; blocks
// live under lib/pipeline/blocks/ and are composed by lib/pipeline/orchestrator.
//
// Stage 0 introduces these types and carves the first cohesive helpers out of
// the monolithic route handler without changing behaviour. Later stages adopt
// FieldResult across the extraction cascade.

import type { Locale, Mode } from '../i18n-types';

/** How a field/finding value was obtained, in cascade priority order. */
export type ExtractionMethod = 'ccec' | 'generic' | 'ner' | 'llm' | 'derived';

/** Template family of a pliego, drives which extractors run (Stage 1). */
export type TemplateFamily = 'ccec-cuadro' | 'prose' | 'lettered-cuadro' | 'unknown';

/** Contract type per LCSP. */
export type ContractType = 'obras' | 'servicios' | 'suministros' | 'mixto' | 'otro' | 'desconocido';

/**
 * A single extracted value with full provenance. The cascade (Stage 3) emits
 * these so downstream blocks can reason about confidence, escalate low-confidence
 * fields to the LLM, and flag uncertain values for human review instead of
 * silently trusting them.
 */
export interface FieldResult {
  value: string | null;
  /** 0..1, higher means more trustworthy. */
  confidence: number;
  method: ExtractionMethod;
  /** Character offsets into the cleaned source text, when known. */
  sourceSpan?: { start: number; end: number };
  /** Set when confidence is below the routing threshold. */
  needsReview: boolean;
  /** Human-readable clause/apartado reference, when known. */
  reference?: string;
}

/** Document classification produced by the classify block (Stage 1). */
export interface DocumentClassification {
  contractType: ContractType;
  templateFamily: TemplateFamily;
  reportLanguage: Locale;
}

/**
 * A pipeline block: a focused transform over the shared context. Blocks are
 * async to allow remote blocks (Docling/NER service, Stage 6). They must be
 * fail-soft, a block that cannot run returns the context unchanged rather than
 * throwing, so an optional/remote stage never breaks the analysis.
 */
export interface Block<Ctx> {
  readonly name: string;
  run(ctx: Ctx): Promise<Ctx> | Ctx;
}

export type { Locale, Mode };
