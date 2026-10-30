/**
 * Intel attachments — the pure rules: which files are accepted, where they go in
 * Dropbox, and how their text is cut into chunks for search.
 *
 * No network here, so `deno test` covers all of it. Dropbox calls are in
 * dropbox.ts; the extraction step that uses these is extract.ts.
 * Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md
 */

/** Everything Intel stores lives under here. The Dropbox helpers refuse any other path. */
export const INTEL_BASE = '/Salesforce Documents/Intel';
export const GENERAL_FOLDER = 'General';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_ENTRY = 10;

/** Text indexed per file. Beyond this the file is stored but marked truncated. */
export const MAX_INDEXED_CHARS = 300_000;
/** Spreadsheet rows read per sheet. */
export const MAX_SHEET_ROWS = 5_000;

/** ~1,500 tokens per chunk, with a little overlap so a sentence cut at a boundary is still findable. */
export const CHUNK_CHARS = 6_000;
export const CHUNK_OVERLAP = 300;

export type FileKind = 'pdf' | 'docx' | 'sheet' | 'image' | 'stored';

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'sheet',
  xlsm: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  tif: 'image',
  tiff: 'image',
  // Old binary Word: accepted and stored, but there's no reader for it here.
  doc: 'stored',
};

export const ACCEPTED_EXTENSIONS = Object.keys(KIND_BY_EXT);

export function fileExt(filename: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : '';
}

export function fileKind(ext: string): FileKind | null {
  return KIND_BY_EXT[ext.toLowerCase()] ?? null;
}

/** Why a file isn't indexed, for the status note. Null when it is. */
export function unindexedReason(kind: FileKind): string | null {
  if (kind === 'image') return 'Image: stored and linked, not searchable.';
  if (kind === 'stored') return 'Old .doc format: stored and linked, not searchable. Save it as .docx to make it searchable.';
  return null;
}

export type UploadCheck = { ok: true; ext: string; kind: FileKind } | { ok: false; error: string };

export function checkUpload(filename: unknown, size: unknown): UploadCheck {
  const name = typeof filename === 'string' ? filename.trim() : '';
  if (!name) return { ok: false, error: 'A file name is required.' };
  const ext = fileExt(name);
  const kind = fileKind(ext);
  if (!kind) return { ok: false, error: `${name}: only PDF, Word, Excel/CSV and image files can be attached.` };
  const bytes = typeof size === 'number' ? size : Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: `${name} is empty.` };
  if (bytes > MAX_FILE_BYTES) return { ok: false, error: `${name} is over the 50 MB limit.` };
  return { ok: true, ext, kind };
}

/**
 * One Dropbox path segment: the characters Dropbox (and Windows sync clients)
 * reject removed, whitespace collapsed, no leading/trailing dots or spaces.
 * Same character set as src/services/dropboxService.ts.
 */
export function cleanSegment(raw: string, maxLength = 80): string {
  const s = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return s;
}

/** A file name kept readable: segment rules, but the extension survives truncation. */
export function cleanFileName(raw: string): string {
  const ext = fileExt(raw);
  const stem = ext ? raw.trim().slice(0, -(ext.length + 1)) : raw;
  const cleanStem = cleanSegment(stem, 120) || 'file';
  return ext ? `${cleanStem}.${ext}` : cleanStem;
}

/** YYYY-MM-DD in Eastern Time — the OVIS convention for dates. */
export function easternDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Fallback short title: the note's first six words. */
export function shortTitleFrom(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}$%&'.\- ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join(' ').replace(/[.\s]+$/, '');
}

/** The model's short title if it's usable, else the note's first words, else "Note". */
export function pickShortTitle(proposed: unknown, cleanText: string): string {
  const fromModel = typeof proposed === 'string' ? cleanSegment(proposed, 60) : '';
  if (fromModel) return fromModel;
  return cleanSegment(shortTitleFrom(cleanText), 60) || 'Note';
}

/**
 * The client folder under Intel. A client actually named "General" must not
 * share the folder used for notes with no client.
 */
export function clientSegment(clientName: string | null | undefined): string {
  if (!clientName) return GENERAL_FOLDER;
  const seg = cleanSegment(clientName) || GENERAL_FOLDER;
  return seg.toLowerCase() === GENERAL_FOLDER.toLowerCase() ? `${seg} (client)` : seg;
}

/** "name", "name (1)", "name (2)" … — Dropbox's own autorename convention. */
export function freeName(name: string, taken: Set<string>): string {
  const lower = (s: string) => s.toLowerCase();
  if (!taken.has(lower(name))) return name;
  const ext = fileExt(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 1; i < 1000; i++) {
    const candidate = ext ? `${stem} (${i}).${ext}` : `${stem} (${i})`;
    if (!taken.has(lower(candidate))) return candidate;
  }
  throw new Error('no free name');
}

/** True when `path` is inside the Intel area (and has no traversal). */
export function withinIntel(path: string): boolean {
  if (path.includes('..') || path.includes('//')) return false;
  return path.toLowerCase().startsWith(`${INTEL_BASE.toLowerCase()}/`);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface Chunk {
  locator: string | null;
  content: string;
}

/** Collapse runs of blank space but keep paragraph breaks. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cut text into pieces of at most `size` characters, preferring a paragraph
 * break, then a sentence end, then a space. Each piece after the first starts
 * with the last `overlap` characters of the one before.
 */
export function splitText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const t = tidyText(text);
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + size, t.length);
    if (end < t.length) {
      const window = t.slice(start, end);
      const minCut = Math.floor(size * 0.5);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
      const space = window.lastIndexOf(' ');
      const cut = para >= minCut ? para : sentence >= minCut ? sentence + 1 : space >= minCut ? space : -1;
      if (cut > 0) end = start + cut;
    }
    const piece = t.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

function pageLocator(first: number, last: number): string {
  return first === last ? `p. ${first}` : `p. ${first}–${last}`;
}

/** PDF pages → chunks that remember which pages they came from. */
export function chunkPages(pages: Array<{ page: number; text: string }>, size = CHUNK_CHARS): Chunk[] {
  const out: Chunk[] = [];
  let buf = '';
  let first = 0;
  let last = 0;
  const flush = () => {
    if (buf.trim()) out.push({ locator: pageLocator(first, last), content: buf.trim() });
    buf = '';
  };
  for (const { page, text } of pages) {
    const t = tidyText(text);
    if (!t) continue;
    if (t.length > size) {
      flush();
      for (const piece of splitText(t, size)) out.push({ locator: pageLocator(page, page), content: piece });
      continue;
    }
    // A gap (pages read in another pass) starts a new chunk, so "p. 1–4" never
    // claims a page the chunk doesn't contain.
    if (buf && (buf.length + t.length + 2 > size || page !== last + 1)) flush();
    if (!buf) first = page;
    buf = buf ? `${buf}\n\n${t}` : t;
    last = page;
  }
  flush();
  return out;
}

/** Plain text (a Word document, one sheet) → chunks with a fixed locator. */
export function chunkPlain(text: string, locator: string | null, size = CHUNK_CHARS): Chunk[] {
  return splitText(text, size).map((content) => ({ locator, content }));
}

/**
 * A sheet's rows as text a search can match and a reader can quote: the first
 * row is taken as headers, and each later row becomes "Header: value | …".
 */
export function sheetText(rows: unknown[][]): string {
  const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((v) => cell(v) !== ''));
  if (nonEmpty.length === 0) return '';
  const headers = nonEmpty[0].map(cell);
  const lines = [headers.filter(Boolean).join(' | ')];
  for (const row of nonEmpty.slice(1)) {
    const parts: string[] = [];
    row.forEach((v, i) => {
      const value = cell(v);
      if (!value) return;
      parts.push(headers[i] ? `${headers[i]}: ${value}` : value);
    });
    if (parts.length) lines.push(parts.join(' | '));
  }
  return lines.join('\n');
}

/**
 * Apply the per-file character cap to a step's new chunks. Returns the chunks
 * that fit and whether the cap was hit.
 */
export function capChunks(chunks: Chunk[], charsSoFar: number): { kept: Chunk[]; chars: number; capped: boolean } {
  const kept: Chunk[] = [];
  let chars = charsSoFar;
  for (const c of chunks) {
    if (chars + c.content.length > MAX_INDEXED_CHARS) return { kept, chars, capped: true };
    kept.push(c);
    chars += c.content.length;
  }
  return { kept, chars, capped: false };
}
