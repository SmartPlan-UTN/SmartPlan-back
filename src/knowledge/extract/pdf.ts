/**
 * Text of a textual PDF menu, line by line. Scanned (image-only) PDFs yield
 * no text and are left for review: v1 does no OCR.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer,
) => Promise<{
  text: string;
  numpages: number;
  info?: Record<string, unknown>;
}>;

export interface PdfText {
  lines: string[];
  pages: number;
  /** The document's own modification date, when it states one. */
  modifiedAt: Date | null;
}

function pdfDate(value: unknown): Date | null {
  const match = /D:(\d{4})(\d{2})(\d{2})/.exec(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  );
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function readPdf(body: Buffer): Promise<PdfText | null> {
  try {
    const parsed = await pdfParse(body);
    const lines = parsed.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (lines.length < 5) return null;
    return {
      lines: mergePriceLines(lines),
      pages: parsed.numpages,
      modifiedAt: pdfDate(parsed.info?.ModDate ?? parsed.info?.CreationDate),
    };
  } catch {
    return null;
  }
}

/**
 * PDF text often splits "Item" and "$12.000" onto separate lines; join a
 * lone price line to the item before it.
 */
export function mergePriceLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (const line of lines) {
    if (/^\$\s*\d[\d.,]*$/.test(line) && merged.length)
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    else merged.push(line);
  }
  return merged;
}
