export const BOILERPLATE_LINE_PATTERNS: readonly RegExp[];
export const INLINE_STRIP_PATTERNS: readonly RegExp[];

export function stripInlineBoilerplate(text: string): string;
export function cleanPdfPageText(pageText: string): string;
export function removeRepeatedBoilerplateLines(pageTexts: string[]): string[];
export function normalizeRepeatedLineCandidate(line: string): string;
export function isSafeBoilerplateCandidate(line: string): boolean;
export function cleanPdfPages(rawPageTexts: string[]): string[];
