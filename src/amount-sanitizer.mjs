import { sanitizeAmount as sanitizeStrictAmount } from './ficha-deterministic.mjs';

const BARE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;
const NOT_SPECIFIED_RE = /^(?:no\s+especific(?:ado|at)|not\s+specified|no\s+identificado|no\s+identificat|not\s+identified)$/i;

export function amountNotSpecified(locale = 'es') {
  return locale === 'en' ? 'Not specified' : locale === 'ca' ? 'No especificat' : 'No especificado';
}

export function isForbiddenBareAmount(value) {
  return BARE_NUMBER_RE.test(String(value ?? '').trim());
}

export function isMisboundFormalizationTwenty(value, context = '') {
  const text = `${context} ${value ?? ''}`;
  return /formalizaci|formalisation|formalitzaci|escritura|notar|contract formalisation/i.test(text) &&
    /\b20\s*(?:%|por\s+ciento)\b/i.test(String(value ?? ''));
}

export function isUnsupportedTenPercent(value, context = '') {
  const text = `${context} ${value ?? ''}`;
  return /\b10\s*(?:%|por\s+ciento)\b/i.test(String(value ?? '')) &&
    !/garant[ií]a|guarantee|garantia|complementaria|complementary|total/i.test(text);
}

export function sanitizeAmountForReport(value, locale = 'es', context = '') {
  if (value == null) {
    return null;
  }

  const raw = String(value).replace(/\s+/g, ' ').trim();
  if (!raw) {
    return null;
  }

  if (isMisboundFormalizationTwenty(raw, context) || isUnsupportedTenPercent(raw, context)) {
    return amountNotSpecified(locale);
  }

  const parts = raw
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = [];
  let invalidSeen = false;

  for (const part of parts.length > 0 ? parts : [raw]) {
    if (isMisboundFormalizationTwenty(part, context) || isUnsupportedTenPercent(part, context) || isForbiddenBareAmount(part)) {
      invalidSeen = true;
      continue;
    }

    const sanitized = sanitizeStrictAmount(part, locale);
    if (sanitized == null || sanitized === '') {
      continue;
    }

    const sanitizedText = String(sanitized).trim();
    if (NOT_SPECIFIED_RE.test(sanitizedText) && !NOT_SPECIFIED_RE.test(part)) {
      invalidSeen = true;
      continue;
    }

    kept.push(sanitizedText);
  }

  const unique = Array.from(new Set(kept));
  if (unique.length > 0) {
    return unique.join('; ');
  }

  return invalidSeen || raw ? amountNotSpecified(locale) : null;
}
