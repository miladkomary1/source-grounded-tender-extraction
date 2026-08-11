/**
 * Locale and mode identifiers used by the prompt templates and pipeline types.
 *
 * In the full application these are re-exported from a large translation module.
 * That module is user-interface material and is not part of the extraction method,
 * so this repository carries only the two type definitions the method depends on.
 */
export type Locale = 'es' | 'en' | 'ca';
export type Mode = 'costes' | 'clausulas' | 'comparar' | 'ficha';
