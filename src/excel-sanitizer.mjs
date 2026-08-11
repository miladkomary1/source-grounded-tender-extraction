import { amountNotSpecified, sanitizeAmountForReport } from './amount-sanitizer.mjs';

const AMOUNT_HEADERS = new Set([
  'amount or percentage',
  'amount / percentage',
  'amount',
  'cost or percentage',
  'cost / percentage',
  'cost',
  'importe o porcentaje',
  'importe / porcentaje',
  'importe',
  'importe estimado',
  'coste o porcentaje',
  'coste / porcentaje',
  'coste',
  'import o percentatge',
  'import / percentatge',
  'import',
  'cost o percentatge',
  'cost / percentatge',
]);

const REFERENCE_HEADERS = new Set([
  'reference',
  'ref',
  'clause',
  'referencia',
  'referència',
  'cláusula',
  'clausula',
]);

const ANY_BARE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

export function noIdentifiedReference(locale = 'es') {
  return locale === 'en' ? 'Not identified' : locale === 'ca' ? 'No identificat' : 'No identificado';
}

export function notMentionedInDocument(locale = 'es') {
  return locale === 'en'
    ? 'Not mentioned in the analysed document'
    : locale === 'ca'
      ? "No s'esmenta en el document analitzat"
      : 'No se menciona en el documento analizado';
}

export function isBareNumberCell(value) {
  return ANY_BARE_NUMBER_RE.test(cellText(value));
}

export function isForbiddenBareExcelAmount(value) {
  return ANY_BARE_NUMBER_RE.test(cellText(value));
}

export function sanitizeReferenceForReport(value, locale = 'es') {
  const text = cellText(value);
  if (!text) return '';
  const parts = text
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isBareNumberCell(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join('; ') : noIdentifiedReference(locale);
}

export function sanitizeWorkbookForExport(workbook, locale = 'es') {
  for (const worksheet of workbook.worksheets) {
    const amountColumns = new Set();
    const referenceColumns = new Set();

    worksheet.eachRow((row) => {
      row.eachCell((cell, columnNumber) => {
        const normalized = normalizeHeader(cell.value);
        if (isAmountHeader(normalized)) {
          amountColumns.add(columnNumber);
        }
        if (isReferenceHeader(normalized)) {
          referenceColumns.add(columnNumber);
        }
      });
    });

    worksheet.eachRow((row) => {
      const context = rowValues(row).join(' ');

      for (const columnNumber of amountColumns) {
        const cell = row.getCell(columnNumber);
        if (isAmountHeader(normalizeHeader(cell.value))) {
          continue;
        }
        const text = cellText(cell.value);
        if (!text) {
          continue;
        }
        const sanitized = sanitizeAmountForReport(text, locale, context);
        cell.value = sanitized && !isForbiddenBareExcelAmount(sanitized) ? sanitized : amountNotSpecified(locale);
      }

      for (const columnNumber of referenceColumns) {
        const cell = row.getCell(columnNumber);
        if (isReferenceHeader(normalizeHeader(cell.value))) {
          continue;
        }
        const text = cellText(cell.value);
        if (!text) {
          continue;
        }
        cell.value = sanitizeReferenceForReport(text, locale);
      }
    });
  }
}

export function findInvalidWorkbookAmountCells(workbook) {
  const invalid = [];

  for (const worksheet of workbook.worksheets) {
    const amountColumns = new Set();
    worksheet.eachRow((row) => {
      row.eachCell((cell, columnNumber) => {
        if (isAmountHeader(normalizeHeader(cell.value))) {
          amountColumns.add(columnNumber);
        }
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      for (const columnNumber of amountColumns) {
        const cell = row.getCell(columnNumber);
        if (isAmountHeader(normalizeHeader(cell.value))) {
          continue;
        }
        if (isForbiddenBareExcelAmount(cell.value)) {
          invalid.push({
            sheetName: worksheet.name,
            rowNumber,
            columnNumber,
            value: cellText(cell.value),
          });
        }
      }
    });
  }

  return invalid;
}

export function assertWorkbookHasNoBareAmountCells(workbook) {
  const invalid = findInvalidWorkbookAmountCells(workbook);
  if (invalid.length > 0) {
    const preview = invalid
      .slice(0, 5)
      .map((item) => `${item.sheetName}!R${item.rowNumber}C${item.columnNumber}=${item.value}`)
      .join(', ');
    throw new Error(`Bare numeric amount cells remain after Excel sanitization: ${preview}`);
  }
}

function isAmountHeader(normalized) {
  return AMOUNT_HEADERS.has(normalized) ||
    /\b(amount|importe|import|coste|cost)\b/.test(normalized) && /\b(percentage|porcentaje|percentatge|percent|por ciento)\b/.test(normalized);
}

function isReferenceHeader(normalized) {
  return REFERENCE_HEADERS.has(normalized);
}

function normalizeHeader(value) {
  return cellText(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function rowValues(row) {
  const values = [];
  row.eachCell((cell) => {
    values.push(cellText(cell.value));
  });
  return values;
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => cellText(part.text)).join('').trim();
    }
    if ('hyperlink' in value && 'text' in value) return cellText(value.text);
  }
  return String(value).trim();
}
