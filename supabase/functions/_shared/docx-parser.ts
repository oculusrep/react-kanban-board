/**
 * .docx Parser — Legal Orchestration
 *
 * Reads a Microsoft Word .docx file (OOXML zip container) and extracts a
 * clean paragraph-by-paragraph view including text, tracked changes
 * (insertions/deletions), and comment anchors.
 *
 * Used by the inbound LOI processing pipeline:
 *   parseDocx() -> identifyClauseBoundaries() -> matchClausesToPlaybook()
 *
 * Why hand-rolled? `docxtemplater` is templating-focused; `mammoth` lossily
 * converts to HTML. We need fidelity to OOXML structure (especially `<w:ins>`
 * and `<w:del>` elements) and we need write-back support later, so a focused
 * parser/serializer pair is the right architecture.
 *
 * V1 scope: read-side only. Sufficient for clause matching and silent-acceptance
 * detection. The write-side (tracked-change generator) lands in Week 3.
 */

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.5.0';

// ============================================================================
// TYPES
// ============================================================================

/** A single text run within a paragraph. Insert/delete state reflects whether the run sits inside a w:ins / w:del element. */
export interface ParsedRun {
  text: string;
  is_inserted: boolean;
  is_deleted: boolean;
  insertion_author?: string;
  deletion_author?: string;
}

/** A paragraph — the smallest unit clause matching cares about. */
export interface ParsedParagraph {
  /** Zero-based position in the document body. Stable identifier across rounds. */
  index: number;
  /** Paragraph style (e.g., "Heading1"). Empty if no style applied. */
  style: string;
  runs: ParsedRun[];
  /** Visible text after track-changes are accepted (insertions kept, deletions removed). */
  visible_text: string;
  /** Text as it would have been before any pending tracked changes (insertions removed, deletions restored). */
  original_text: string;
  /** All text including both insertions and deletions, as a debug view. */
  raw_text: string;
  has_insertions: boolean;
  has_deletions: boolean;
  insertions: string[];
  deletions: string[];
  comment_ids: string[];
}

/** Top-level parsed document. */
export interface ParsedDocx {
  paragraphs: ParsedParagraph[];
  /** comment_id -> comment text. */
  comments: Record<string, string>;
  /** All authors who made tracked changes anywhere in the document. */
  authors: string[];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parse a .docx file and return its paragraph/comment structure.
 *
 * @param file — the .docx as bytes (Edge Function: from req.arrayBuffer or
 *   Storage download; tests: from fs.readFileSync converted to Uint8Array).
 */
export async function parseDocx(file: Uint8Array | ArrayBuffer): Promise<ParsedDocx> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  const zip = await JSZip.loadAsync(bytes);

  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error('Invalid .docx: word/document.xml missing');
  }

  const commentsXml = await zip.file('word/comments.xml')?.async('string');

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    parseTagValue: false,
    trimValues: false,
    // Keep namespaces so we can tell w:ins from w:del etc.
    removeNSPrefix: false,
  });

  const documentTree = xmlParser.parse(documentXml);
  const commentsTree = commentsXml ? xmlParser.parse(commentsXml) : null;

  const paragraphs = extractParagraphs(documentTree);
  const comments = extractComments(commentsTree);
  const authors = collectAuthors(paragraphs);

  return { paragraphs, comments, authors };
}

// ============================================================================
// INTERNAL — Paragraph extraction
// ============================================================================

/**
 * Walk the parsed XML tree and extract paragraphs from <w:body>.
 *
 * fast-xml-parser with preserveOrder returns nested arrays of one-key objects.
 * Each node looks like: { "w:p": [ <child>, <child>, ... ], ":@": { <attrs> } }.
 * We descend into w:document -> w:body -> w:p* and produce ParsedParagraph rows.
 */
function extractParagraphs(documentTree: unknown): ParsedParagraph[] {
  const body = findElement(documentTree, 'w:body');
  if (!body) return [];

  const paragraphs: ParsedParagraph[] = [];
  let index = 0;

  for (const child of asArray(body)) {
    const tagName = getTagName(child);
    if (tagName === 'w:p') {
      paragraphs.push(buildParagraph(child, index++));
    }
    // Skip w:sectPr, w:tbl (V1 doesn't process tables — handles the rent
    // schedule case in Week 3).
  }

  return paragraphs;
}

/**
 * Recursively walk a paragraph node and assemble its runs.
 *
 * The OOXML spec allows runs to be nested inside w:ins / w:del wrappers, and
 * those wrappers can themselves be nested. We track inserted/deleted state
 * via context flags as we descend, so a run inside <w:ins><w:r/></w:ins> is
 * correctly tagged is_inserted=true.
 */
function buildParagraph(paragraphNode: unknown, index: number): ParsedParagraph {
  const runs: ParsedRun[] = [];
  const insertions: string[] = [];
  const deletions: string[] = [];
  const commentIds = new Set<string>();
  let style = '';

  walkParagraphChildren(paragraphNode, { isInserted: false, isDeleted: false }, (event) => {
    if (event.type === 'run') {
      runs.push(event.run);
      if (event.run.is_inserted && event.run.text) insertions.push(event.run.text);
      if (event.run.is_deleted && event.run.text) deletions.push(event.run.text);
    } else if (event.type === 'comment') {
      commentIds.add(event.commentId);
    } else if (event.type === 'style') {
      style = event.style;
    }
  });

  const visibleParts: string[] = [];
  const originalParts: string[] = [];
  const rawParts: string[] = [];
  for (const run of runs) {
    if (run.is_deleted) {
      originalParts.push(run.text);
      rawParts.push(run.text);
    } else if (run.is_inserted) {
      visibleParts.push(run.text);
      rawParts.push(run.text);
    } else {
      visibleParts.push(run.text);
      originalParts.push(run.text);
      rawParts.push(run.text);
    }
  }

  return {
    index,
    style,
    runs,
    visible_text: visibleParts.join(''),
    original_text: originalParts.join(''),
    raw_text: rawParts.join(''),
    has_insertions: insertions.length > 0,
    has_deletions: deletions.length > 0,
    insertions,
    deletions,
    comment_ids: [...commentIds],
  };
}

interface WalkContext {
  isInserted: boolean;
  isDeleted: boolean;
}

type WalkEvent =
  | { type: 'run'; run: ParsedRun }
  | { type: 'comment'; commentId: string }
  | { type: 'style'; style: string };

function walkParagraphChildren(
  node: unknown,
  ctx: WalkContext,
  emit: (event: WalkEvent) => void,
): void {
  for (const child of asArray(node)) {
    const tagName = getTagName(child);
    const innerArray = getInner(child);
    const attrs = getAttrs(child);

    switch (tagName) {
      case 'w:pPr': {
        // Look for <w:pStyle w:val="..."/> inside paragraph properties.
        for (const pPrChild of asArray(innerArray)) {
          if (getTagName(pPrChild) === 'w:pStyle') {
            const styleVal = getAttrs(pPrChild)?.['@_w:val'];
            if (typeof styleVal === 'string') emit({ type: 'style', style: styleVal });
          }
        }
        break;
      }

      case 'w:r': {
        emit({
          type: 'run',
          run: buildRun(innerArray, ctx),
        });
        break;
      }

      case 'w:ins': {
        const author = (attrs?.['@_w:author'] ?? '') as string;
        // Recurse with isInserted=true; the run-builder will tag accordingly.
        walkParagraphChildren(innerArray, { ...ctx, isInserted: true }, (event) => {
          if (event.type === 'run' && author) {
            event.run.insertion_author = author;
          }
          emit(event);
        });
        break;
      }

      case 'w:del': {
        const author = (attrs?.['@_w:author'] ?? '') as string;
        walkParagraphChildren(innerArray, { ...ctx, isDeleted: true }, (event) => {
          if (event.type === 'run' && author) {
            event.run.deletion_author = author;
          }
          emit(event);
        });
        break;
      }

      case 'w:commentRangeStart':
      case 'w:commentRangeEnd':
      case 'w:commentReference': {
        const commentId = attrs?.['@_w:id'];
        if (typeof commentId === 'string') {
          emit({ type: 'comment', commentId });
        }
        break;
      }

      default:
        // Skip unrecognized elements but keep descending — runs may live deep
        // inside structural containers we don't model explicitly.
        if (innerArray !== undefined) {
          walkParagraphChildren(innerArray, ctx, emit);
        }
    }
  }
}

/**
 * Build a ParsedRun from the inner content of a <w:r> element. Concatenates
 * <w:t>, <w:tab>, <w:br>, etc. into a single text string per run.
 */
function buildRun(runInner: unknown, ctx: WalkContext): ParsedRun {
  const textParts: string[] = [];

  for (const child of asArray(runInner)) {
    const tagName = getTagName(child);
    const inner = getInner(child);

    switch (tagName) {
      case 'w:t': {
        const text = collectText(inner);
        if (text) textParts.push(text);
        break;
      }
      case 'w:delText': {
        const text = collectText(inner);
        if (text) textParts.push(text);
        break;
      }
      case 'w:tab':
        textParts.push('\t');
        break;
      case 'w:br':
        textParts.push('\n');
        break;
      // w:rPr (run properties) — skipped; not needed for clause matching
      default:
        break;
    }
  }

  return {
    text: textParts.join(''),
    is_inserted: ctx.isInserted,
    is_deleted: ctx.isDeleted,
  };
}

// ============================================================================
// INTERNAL — Comments
// ============================================================================

function extractComments(commentsTree: unknown): Record<string, string> {
  const comments: Record<string, string> = {};
  if (!commentsTree) return comments;

  const root = findElement(commentsTree, 'w:comments');
  if (!root) return comments;

  for (const child of asArray(root)) {
    if (getTagName(child) !== 'w:comment') continue;
    const attrs = getAttrs(child);
    const commentId = attrs?.['@_w:id'];
    if (typeof commentId !== 'string') continue;

    const textParts: string[] = [];
    walkParagraphChildren(getInner(child), { isInserted: false, isDeleted: false }, (event) => {
      if (event.type === 'run' && event.run.text) textParts.push(event.run.text);
    });

    comments[commentId] = textParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  return comments;
}

function collectAuthors(paragraphs: ParsedParagraph[]): string[] {
  const authors = new Set<string>();
  for (const p of paragraphs) {
    for (const r of p.runs) {
      if (r.insertion_author) authors.add(r.insertion_author);
      if (r.deletion_author) authors.add(r.deletion_author);
    }
  }
  return [...authors];
}

// ============================================================================
// INTERNAL — preserveOrder tree helpers
// ============================================================================
//
// fast-xml-parser with preserveOrder=true produces a structure like:
//   [ { "w:document": [ <child1>, <child2>, ... ], ":@": { ... attrs ... } }, ... ]
// Each node has exactly ONE non-attribute key (the tag name) plus an optional
// ":@" key holding attributes.

function getTagName(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== ':@') return key;
  }
  return undefined;
}

function getInner(node: unknown): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== ':@') return obj[key];
  }
  return undefined;
}

function getAttrs(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  return (obj[':@'] as Record<string, unknown> | undefined) ?? undefined;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** Find the first element with the given tag anywhere in the tree (DFS). */
function findElement(tree: unknown, tagName: string): unknown {
  if (!tree) return undefined;
  for (const node of asArray(tree)) {
    if (getTagName(node) === tagName) return getInner(node);
    const result = findElement(getInner(node), tagName);
    if (result !== undefined) return result;
  }
  return undefined;
}

/** Collect text from a node's inner content. preserveOrder text nodes appear as { "#text": "..." } objects. */
function collectText(inner: unknown): string {
  const parts: string[] = [];
  for (const child of asArray(inner)) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') parts.push(obj['#text'] as string);
  }
  return parts.join('');
}
