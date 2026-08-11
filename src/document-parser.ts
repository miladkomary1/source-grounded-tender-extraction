import { cleanPdfPages } from './pdf-cleaner.mjs';

/**
 * Parse a PDF or DOCX file and return its plain text content.
 */
export async function parseDocument(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    return parsePDF(file);
  } else if (ext === 'docx') {
    return parseDOCX(file);
  } else {
    throw new Error(`Unsupported file extension: ${ext ?? '(none)'}`);
  }
}

// Headings that should start on their own line so the chunker can find clause boundaries.
const CLAUSE_HEADING =
  /(CAPÍTULO\s+[IVXLC]+|Cláusula\s+\d|Artículo\s+\d|Apartado\s+\d|CLÁUSULA\s+\d|ARTÍCULO\s+\d|SECCIÓN\s+\d|ANEXO\s+[IVXLCMDI]+)/g;

async function parsePDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rawPageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Build text preserving line breaks: items with hasEOL=true end a line.
    let pageText = '';
    for (const item of content.items) {
      const ti = item as { str?: string; hasEOL?: boolean };
      if (!ti.str) continue;
      pageText += ti.str;
      if (ti.hasEOL) pageText += '\n';
      else pageText += ' ';
    }

    rawPageTexts.push(pageText);
  }

  const cleanedPages = cleanPdfPages(rawPageTexts);
  let fullText = cleanedPages.join('\n\n');

  // Normalise runs of whitespace (PDFs often have multiple spaces between words)
  fullText = fullText.replace(/[ \t]{2,}/g, ' ');

  // Ensure clause/chapter headings start on their own line so the chunker works
  fullText = fullText.replace(CLAUSE_HEADING, '\n$1');

  // Collapse more-than-two consecutive newlines
  fullText = fullText.replace(/\n{3,}/g, '\n\n');

  return fullText.trim();
}

async function parseDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  // Use the browser build of mammoth
  const mammoth = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer });

  return result.value;
}
