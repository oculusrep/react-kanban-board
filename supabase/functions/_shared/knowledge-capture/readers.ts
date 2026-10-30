/**
 * The real file readers behind extract.ts: pdf.js (unpdf) for PDF text layers,
 * mammoth for .docx, SheetJS for spreadsheets, and Claude for scanned pages.
 *
 * Imported lazily (dynamic import with a fixed specifier) so the converse/file
 * actions don't pay for pdf.js on a cold start.
 *
 * References:
 *   unpdf    https://github.com/unjs/unpdf
 *   mammoth  https://github.com/mwilliamson/mammoth.js#api
 *   SheetJS  https://docs.sheetjs.com/docs/api/parse-options (sheetRows)
 *   Claude   https://docs.anthropic.com/en/docs/build-with-claude/pdf-support
 */
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { MAX_SHEET_ROWS } from './attachments.ts';
import { anthropicCreate, buildBaseParams, CHAT_PRICING } from './config.ts';
import { runToolLoop } from './loop.ts';
import { parseModelJson } from './proposal.ts';

/** Text-layer pages per step, and the wall-time budget that stands in for CPU time. */
const PDF_PAGES_PER_STEP = 40;
const PDF_STEP_BUDGET_MS = 900;

export async function pdfPages(bytes: Uint8Array, fromPage: number) {
  const { getDocumentProxy } = await import('npm:unpdf@1.0.6');
  const started = performance.now();
  // pdf.js takes ownership of the buffer it's given; pass a copy.
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    const total = pdf.numPages as number;
    const pages: Array<{ page: number; text: string }> = [];
    for (let n = Math.max(1, fromPage); n <= total; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // unpdf's own join: each item's string, a newline where pdf.js saw a line end.
      const text = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
        .map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : ''))
        .join('');
      pages.push({ page: n, text });
      page.cleanup();
      if (pages.length >= PDF_PAGES_PER_STEP || performance.now() - started > PDF_STEP_BUDGET_MS) break;
    }
    return { total, pages };
  } finally {
    await pdf.destroy();
  }
}

export async function docxText(bytes: Uint8Array): Promise<string> {
  const mammoth = (await import('npm:mammoth@1.8.0')).default;
  // mammoth types want a Node Buffer; a Uint8Array works at runtime (Deno npm compat).
  const result = await mammoth.extractRawText({ buffer: bytes } as never);
  return String(result.value ?? '');
}

export async function sheets(bytes: Uint8Array) {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  // sheetRows stops the parser after the header + MAX_SHEET_ROWS rows, which is
  // what keeps a huge workbook inside the CPU limit.
  const wb = XLSX.read(bytes, { type: 'array', sheetRows: MAX_SHEET_ROWS + 1, cellDates: true });
  return (wb.SheetNames as string[]).map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
    const full = ws['!fullref'] ?? ws['!ref'];
    const fullRows = full ? XLSX.utils.decode_range(full).e.r + 1 : rows.length;
    return { name, rows, truncated: fullRows > MAX_SHEET_ROWS + 1 };
  });
}

const OCR_SYSTEM_PROMPT = `You transcribe scanned pages of a PDF for a search index.

Copy the text on each requested page exactly as it appears: same words, numbers, dollar amounts and dates, in reading order. Do not summarise, correct, translate or add anything. Keep line breaks between paragraphs; join lines that wrap mid-sentence. Render a table as one row per line with cells separated by " | ". Write [illegible] for text you can't read. If a page has no text (a photo, a blank page), return an empty string for it.

Return JSON: {"pages": [{"page": 3, "text": "..."}]} with one entry per requested page.`;

const OCR_OUTPUT_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: { page: { type: 'integer' }, text: { type: 'string' } },
          required: ['page', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['pages'],
    additionalProperties: false,
  },
};

/** Claude reads the given pages from the page images. */
export async function ocrPages(apiKey: string, bytes: Uint8Array, pages: number[]) {
  const out = await runToolLoop({
    create: anthropicCreate(apiKey),
    execute: () => Promise.reject(new Error('no tools')),
    // ~700 tokens a dense page; 3 pages per step plus thinking fits easily.
    baseParams: { ...buildBaseParams(OCR_SYSTEM_PROMPT), max_tokens: 8000 },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) },
          // Every step of the same file sends the same document: cached after the first.
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: `Transcribe page${pages.length === 1 ? '' : 's'} ${pages.join(', ')} of this PDF.` },
      ],
    }],
    tools: [],
    pricing: CHAT_PRICING,
    outputFormat: OCR_OUTPUT_FORMAT,
  });
  const parsed = parseModelJson(out.text);
  const list = Array.isArray(parsed.pages) ? parsed.pages : [];
  return list
    .filter((p): p is { page: number; text: string } =>
      !!p && typeof (p as { page?: unknown }).page === 'number' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => ({ page: p.page, text: p.text }));
}
