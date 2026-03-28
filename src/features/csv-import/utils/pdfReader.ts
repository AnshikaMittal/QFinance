/**
 * PDF text extraction using pdf.js loaded from CDN.
 * No npm dependency required — pdf.js is loaded at runtime.
 */

const PDFJS_VERSION = '4.9.155';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsLib: any = null;

/**
 * Dynamically load pdf.js from CDN (cached after first load).
 */
async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;

  // Load the main library via dynamic import from CDN
  const script = document.createElement('script');
  script.src = `${PDFJS_CDN}/pdf.min.mjs`;
  script.type = 'module';

  await new Promise<void>((resolve, reject) => {
    // Use dynamic import for ESM module
    import(/* @vite-ignore */ `${PDFJS_CDN}/pdf.min.mjs`)
      .then((mod) => {
        pdfjsLib = mod;
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
        resolve();
      })
      .catch(reject);
  });

  return pdfjsLib;
}

export interface PDFPage {
  pageNumber: number;
  lines: string[];
}

/**
 * Extract text from a PDF file as an array of pages, each with its lines.
 */
export async function extractPDFText(file: File): Promise<PDFPage[]> {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: PDFPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items into lines based on Y position
    const lineMap = new Map<number, string[]>();

    for (const item of content.items) {
      if (!('str' in item)) continue;
      // Round Y to nearest integer to group items on the same line
      const y = Math.round(item.transform?.[5] ?? 0);
      const existing = lineMap.get(y) ?? [];
      existing.push(item.str);
      lineMap.set(y, existing);
    }

    // Sort lines top-to-bottom (highest Y first) and join text items
    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([_y, items]) => items.join(' ').trim())
      .filter((line) => line.length > 0);

    pages.push({ pageNumber: i, lines: sortedLines });
  }

  return pages;
}

/**
 * Get all lines from all pages as a flat array.
 */
export async function extractAllLines(file: File): Promise<string[]> {
  const pages = await extractPDFText(file);
  return pages.flatMap((p) => p.lines);
}
