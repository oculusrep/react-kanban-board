/**
 * One extraction step for an attached file.
 *
 * Supabase edge functions get 2 s of CPU per request (network waits don't count)
 * and 256 MB of memory, so a long PDF is read across several requests: each step
 * reads what it can, saves its chunks and its place (knowledge_file_save_step),
 * and reports `more`. The browser calls again until `more` is false; a step that
 * throws is counted (knowledge_file_fail_step) and retried, up to 3 times.
 *
 * Order for a PDF:
 *   1. the text layer, page by page (cheap, exact);
 *   2. pages that had no text layer — scans — read from the page images by
 *      Claude, a few pages per step.
 * Word and spreadsheets are read in one step.
 *
 * Every dependency is injected so the step logic is tested without Dropbox,
 * OpenAI or Anthropic (extract_test.ts). The real readers are in readers.ts.
 */
import {
  capChunks,
  chunkPages,
  chunkPlain,
  type Chunk,
  fileKind,
  MAX_INDEXED_CHARS,
  sheetText,
  unindexedReason,
} from './attachments.ts';

/** A page with fewer characters than this in its text layer is treated as scanned. */
export const SCANNED_PAGE_CHARS = 40;
/** Pages Claude reads per step: keeps each request well inside the 150 s idle timeout. */
export const OCR_PAGES_PER_STEP = 3;
/** Claude takes a PDF of up to 32 MB per request (base64 adds a third) and 100 pages. */
export const OCR_MAX_BYTES = 22 * 1024 * 1024;
export const OCR_MAX_PAGES = 100;

export interface FileRow {
  id: string;
  filename: string;
  file_ext: string;
  dropbox_path: string;
  status: string;
  status_note: string | null;
  page_count: number | null;
  char_count: number;
  read_cursor: number;
  scanned_pages: number[];
  ocr_cursor: number;
  next_ord: number;
}

export interface SavedChunk {
  ord: number;
  locator: string | null;
  method: 'text' | 'scan';
  content: string;
  embedding: string;
  embedding_model: string;
  embedding_dims: number;
}

export interface Progress {
  status?: string;
  status_note?: string | null;
  page_count?: number;
  char_count?: number;
  read_cursor?: number;
  scanned_pages?: number[];
  ocr_cursor?: number;
  next_ord?: number;
}

export interface StepDeps {
  download: (path: string) => Promise<Uint8Array>;
  /** Text of pages from `fromPage` (1-based) on, stopping when its time budget runs out. */
  pdfPages: (bytes: Uint8Array, fromPage: number) => Promise<{ total: number; pages: Array<{ page: number; text: string }> }>;
  docxText: (bytes: Uint8Array) => Promise<string>;
  sheets: (bytes: Uint8Array) => Promise<Array<{ name: string; rows: unknown[][]; truncated: boolean }>>;
  /** Claude reads these pages from the page images. */
  ocrPages: (bytes: Uint8Array, pages: number[]) => Promise<Array<{ page: number; text: string }>>;
  embed: (texts: string[]) => Promise<{ vectors: number[][]; model: string; dimensions: number }>;
  save: (fileId: string, chunks: SavedChunk[], progress: Progress) => Promise<void>;
}

export interface StepResult {
  status: string;
  more: boolean;
}

async function embedChunks(
  deps: StepDeps,
  chunks: Chunk[],
  method: 'text' | 'scan',
  firstOrd: number,
): Promise<SavedChunk[]> {
  if (chunks.length === 0) return [];
  const { vectors, model, dimensions } = await deps.embed(chunks.map((c) => c.content));
  return chunks.map((c, i) => ({
    ord: firstOrd + i,
    locator: c.locator,
    method,
    content: c.content,
    embedding: `[${vectors[i].join(',')}]`,
    embedding_model: model,
    embedding_dims: dimensions,
  }));
}

function finalStatus(chars: number, capped: boolean): string {
  if (chars === 0) return 'no_text';
  return capped ? 'truncated' : 'done';
}

function capNote(capped: boolean, extra: string[]): string | null {
  const notes = [...extra];
  if (capped) notes.unshift(`Indexed the first ${MAX_INDEXED_CHARS.toLocaleString('en-US')} characters; the rest is in Dropbox only.`);
  return notes.length ? notes.join(' ') : null;
}

export async function runStep(file: FileRow, deps: StepDeps): Promise<StepResult> {
  const kind = fileKind(file.file_ext);
  if (!kind || kind === 'image' || kind === 'stored') {
    const note = kind ? unindexedReason(kind) : 'Unrecognised file type.';
    await deps.save(file.id, [], { status: 'unsupported', status_note: note });
    return { status: 'unsupported', more: false };
  }

  const bytes = await deps.download(file.dropbox_path);

  // ---- Word / spreadsheets: one step -------------------------------------
  if (kind === 'docx' || kind === 'sheet') {
    let chunks: Chunk[] = [];
    let rowsCapped = false;
    if (kind === 'docx') {
      chunks = chunkPlain(await deps.docxText(bytes), null);
    } else {
      for (const sheet of await deps.sheets(bytes)) {
        rowsCapped ||= sheet.truncated;
        chunks.push(...chunkPlain(sheetText(sheet.rows), `Sheet: ${sheet.name}`));
      }
    }
    const { kept, chars, capped } = capChunks(chunks, 0);
    const saved = await embedChunks(deps, kept, 'text', 0);
    const status = finalStatus(chars, capped || rowsCapped);
    const notes = rowsCapped ? ['Spreadsheet rows past 5,000 per sheet were not indexed.'] : [];
    await deps.save(file.id, saved, {
      status,
      status_note: status === 'no_text' ? 'No text found in this file.' : capNote(capped, notes),
      char_count: chars,
      next_ord: saved.length,
    });
    return { status, more: false };
  }

  // ---- PDF, phase 1: the text layer ----------------------------------------
  const total = file.page_count;
  if (total === null || file.read_cursor < total) {
    const { total: pageTotal, pages } = await deps.pdfPages(bytes, file.read_cursor + 1);
    const scanned = [...file.scanned_pages];
    const withText: Array<{ page: number; text: string }> = [];
    for (const p of pages) {
      if (p.text.replace(/\s+/g, '').length < SCANNED_PAGE_CHARS) scanned.push(p.page);
      else withText.push(p);
    }
    const lastRead = pages.length ? pages[pages.length - 1].page : file.read_cursor;
    const { kept, chars, capped } = capChunks(chunkPages(withText), file.char_count);
    const saved = await embedChunks(deps, kept, 'text', file.next_ord);

    if (capped) {
      await deps.save(file.id, saved, {
        status: 'truncated',
        status_note: capNote(true, [`Read to p. ${lastRead} of ${pageTotal}.`]),
        page_count: pageTotal, char_count: chars, read_cursor: lastRead, scanned_pages: scanned,
        next_ord: file.next_ord + saved.length,
      });
      return { status: 'truncated', more: false };
    }

    const textDone = lastRead >= pageTotal;
    const more = !textDone || scanned.length > 0;
    const status = more ? 'extracting' : finalStatus(chars, false);
    await deps.save(file.id, saved, {
      status,
      ...(status === 'no_text' ? { status_note: 'No text found in this file.' } : {}),
      page_count: pageTotal, char_count: chars, read_cursor: lastRead, scanned_pages: scanned,
      next_ord: file.next_ord + saved.length,
    });
    return { status, more };
  }

  // ---- PDF, phase 2: scanned pages, read by Claude ---------------------------
  const remaining = file.scanned_pages.slice(file.ocr_cursor);
  const unreadable = bytes.length > OCR_MAX_BYTES || total > OCR_MAX_PAGES;
  if (remaining.length === 0 || unreadable) {
    const notes: string[] = [];
    if (unreadable && remaining.length > 0) {
      notes.push(
        `${remaining.length} scanned page${remaining.length === 1 ? '' : 's'} could not be read: ` +
          `the scan reader takes PDFs up to ${OCR_MAX_PAGES} pages and about 22 MB.`,
      );
    }
    const status = file.char_count === 0 ? 'no_text' : unreadable && remaining.length > 0 ? 'truncated' : 'done';
    await deps.save(file.id, [], {
      status,
      status_note: status === 'no_text' && notes.length === 0 ? 'No text found in this file.' : (notes.join(' ') || null),
    });
    return { status, more: false };
  }

  const batch = remaining.slice(0, OCR_PAGES_PER_STEP);
  const read = await deps.ocrPages(bytes, batch);
  const wanted = new Set(batch);
  const pages = read
    .filter((p) => wanted.has(p.page) && typeof p.text === 'string')
    .sort((a, b) => a.page - b.page);
  const { kept, chars, capped } = capChunks(chunkPages(pages), file.char_count);
  const saved = await embedChunks(deps, kept, 'scan', file.next_ord);
  const ocrCursor = file.ocr_cursor + batch.length;
  const scansLeft = file.scanned_pages.length - ocrCursor;
  const scannedCount = file.scanned_pages.length;
  const scanNote = `${scannedCount} scanned page${scannedCount === 1 ? '' : 's'} read from the page images.`;

  if (capped || scansLeft <= 0) {
    const status = finalStatus(chars, capped);
    await deps.save(file.id, saved, {
      status,
      status_note: status === 'no_text' ? 'No readable text, including the scanned pages.' : capNote(capped, [scanNote]),
      char_count: chars, ocr_cursor: ocrCursor, next_ord: file.next_ord + saved.length,
    });
    return { status, more: false };
  }
  await deps.save(file.id, saved, {
    status: 'extracting', char_count: chars, ocr_cursor: ocrCursor, next_ord: file.next_ord + saved.length,
  });
  return { status: 'extracting', more: true };
}
