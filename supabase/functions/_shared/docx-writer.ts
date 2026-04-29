/**
 * .docx Writer — Tracked-changes generator (V1)
 *
 * Given an inbound .docx and a list of decisions, produces an outbound .docx
 * with Mike's counter-redlines as native Word tracked changes.
 *
 * V1 strategy: APPEND-ONLY tracked insertions.
 *
 *   For each clause Mike has a final_text on:
 *     1. After the clause's last body paragraph, splice in NEW paragraphs
 *        wrapped in <w:ins author="…" date="…"> containing Mike's preferred
 *        text. Word renders these as tracked insertions.
 *     2. On the heading paragraph, add <w:commentRangeStart> /
 *        <w:commentRangeEnd> / <w:commentReference> with the rationale, and
 *        append a corresponding <w:comment> to word/comments.xml.
 *
 * This V1 does NOT delete the landlord's existing text. The output is a doc
 * where landlord's redlines remain intact AND Mike's counter is shown as a
 * tracked insertion right after the affected clause. Reviewable in Word and
 * finalizable manually before sending to the landlord.
 *
 * V2 will add full counter-redline semantics: reject landlord's pending
 * tracked changes within the affected clauses + wholesale-replace the body
 * with a single tracked deletion + insertion, producing a "clean" counter.
 *
 * The append-only approach is intentionally chosen for V1 because:
 *   - It cannot corrupt the original document (additive only)
 *   - Mike can review Word's natural tracked-change UX before finalizing
 *   - The OOXML mutation surface is small and well-bounded
 */

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { XMLParser, XMLBuilder } from 'https://esm.sh/fast-xml-parser@4.5.0';

// ============================================================================
// TYPES
// ============================================================================

export interface DocxDecision {
  /** Heading paragraph index (matches docx-parser's ParsedParagraph.index). */
  heading_paragraph_index: number;
  /** Body paragraph indices for this clause; the last one is where we splice in. */
  body_paragraph_indices: number[];
  /** Mike's preferred text — inserted as a tracked w:ins after the body. */
  final_text: string | null;
  /** Optional comment text — anchored on the heading paragraph. */
  final_comment_text: string | null;
  /** Heading label, included in the comment and tracked-change author metadata. */
  heading: string;
  /** Optional position label for the inserted paragraph's leading marker. */
  position_label?: string;
}

export interface WriteOptions {
  /** Author shown on tracked changes and comments. Defaults to "OVIS Tenant Counter". */
  author?: string;
  /** ISO date string for tracked-change timestamps. Defaults to now. */
  date?: string;
  /** Initials shown on Word comments (Word likes 1-3 chars). */
  initials?: string;
}

export interface WriteResult {
  /** The output .docx as bytes. */
  bytes: Uint8Array;
  /** How many decisions were applied (had final_text). */
  insertions_applied: number;
  /** How many comments were added. */
  comments_added: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function applyDecisionsToDocx(
  inputBytes: Uint8Array | ArrayBuffer,
  decisions: DocxDecision[],
  options: WriteOptions = {},
): Promise<WriteResult> {
  const author = options.author ?? 'OVIS Tenant Counter';
  const date = options.date ?? new Date().toISOString();
  const initials = (options.initials ?? 'OVIS').slice(0, 5);

  const bytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  const zip = await JSZip.loadAsync(bytes);

  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Invalid .docx: word/document.xml missing');

  // ------------------------------------------------------------------------
  // Allocate fresh tracked-change IDs that don't collide with existing ones.
  // ------------------------------------------------------------------------
  const nextChangeId = makeIdAllocator(documentXml);
  const nextCommentId = makeCommentIdAllocator(await zip.file('word/comments.xml')?.async('string'));

  // ------------------------------------------------------------------------
  // Parse document.xml in preserveOrder mode so we can mutate the body's
  // paragraph list in-place (insert new <w:p> nodes, add comment markers to
  // existing heading paragraphs).
  // ------------------------------------------------------------------------
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    parseTagValue: false,
    trimValues: false,
  });
  // deno-lint-ignore no-explicit-any
  const documentTree = xmlParser.parse(documentXml) as any[];

  const body = findBodyArray(documentTree);
  if (!body) throw new Error('Invalid .docx: <w:body> not found');

  // Build paragraph-index → body-position lookup. Indices match the parser's
  // ordering: zero-based, in document order, only counting w:p elements.
  const paragraphPositions = indexParagraphPositions(body);

  let insertionsApplied = 0;
  let commentsAdded = 0;
  const newComments: Array<{ id: string; author: string; initials: string; date: string; text: string }> = [];

  // We iterate decisions in REVERSE document order because each insertion
  // shifts subsequent body positions. Reverse ordering keeps the previously
  // computed positions valid as we mutate.
  const decisionsByLastBody = [...decisions]
    .filter((d) => d.final_text || d.final_comment_text)
    .sort((a, b) => {
      const aPos = a.body_paragraph_indices.at(-1) ?? a.heading_paragraph_index;
      const bPos = b.body_paragraph_indices.at(-1) ?? b.heading_paragraph_index;
      return bPos - aPos;
    });

  for (const dec of decisionsByLastBody) {
    // -------------------------------- ADD COMMENT --------------------------
    if (dec.final_comment_text && dec.final_comment_text.trim()) {
      const commentId = String(nextCommentId());
      const headingPos = paragraphPositions.get(dec.heading_paragraph_index);
      if (headingPos !== undefined) {
        const headingNode = body[headingPos];
        const inner = getInner(headingNode);
        if (Array.isArray(inner)) {
          // commentRangeStart at start, commentRangeEnd + commentReference at end.
          const startMarker = makeNode('w:commentRangeStart', { '@_w:id': commentId });
          const endMarker = makeNode('w:commentRangeEnd', { '@_w:id': commentId });
          const refRun = makeNode('w:r', undefined, [
            makeNode('w:rPr', undefined, [makeNode('w:rStyle', { '@_w:val': 'CommentReference' }, [])]),
            makeNode('w:commentReference', { '@_w:id': commentId }),
          ]);

          // Insert the start marker after the paragraph properties (if any),
          // and the end marker + reference run at the end of the paragraph.
          const pPrIdx = inner.findIndex((c: unknown) => getTagName(c) === 'w:pPr');
          if (pPrIdx >= 0) {
            inner.splice(pPrIdx + 1, 0, startMarker);
          } else {
            inner.unshift(startMarker);
          }
          inner.push(endMarker, refRun);
        }

        newComments.push({
          id: commentId,
          author,
          initials,
          date,
          text: `[${dec.heading}] ${dec.final_comment_text}`,
        });
        commentsAdded++;
      }
    }

    // -------------------------------- INSERT NEW PARAGRAPH -----------------
    if (dec.final_text && dec.final_text.trim()) {
      const lastBodyIdx = dec.body_paragraph_indices.at(-1) ?? dec.heading_paragraph_index;
      const insertAfterPos = paragraphPositions.get(lastBodyIdx);
      if (insertAfterPos !== undefined) {
        const insId = String(nextChangeId());
        const newParagraphs = buildInsertedParagraphs(dec.final_text, dec.position_label, {
          insId,
          author,
          date,
        });
        // Insert AFTER the last body paragraph.
        body.splice(insertAfterPos + 1, 0, ...newParagraphs);
        insertionsApplied++;
        // Update lookup positions for paragraphs that shifted right.
        for (const [idx, pos] of paragraphPositions.entries()) {
          if (pos > insertAfterPos) paragraphPositions.set(idx, pos + newParagraphs.length);
        }
      }
    }
  }

  // ------------------------------------------------------------------------
  // Serialize document.xml back
  // ------------------------------------------------------------------------
  const xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    suppressEmptyNode: false,
    suppressBooleanAttributes: false,
    format: false,
  });
  let outputDocXml = xmlBuilder.build(documentTree) as string;

  // fast-xml-parser drops the standalone XML declaration if it was present
  // in the source; re-add it to keep Word happy.
  if (documentXml.startsWith('<?xml') && !outputDocXml.startsWith('<?xml')) {
    const declMatch = documentXml.match(/^<\?xml[^?]*\?>/);
    if (declMatch) outputDocXml = declMatch[0] + outputDocXml;
  }

  zip.file('word/document.xml', outputDocXml);

  // ------------------------------------------------------------------------
  // Update word/comments.xml — append new comments (creating file + rels +
  // content-types entries if it didn't exist).
  // ------------------------------------------------------------------------
  if (newComments.length > 0) {
    await ensureCommentsPart(zip);
    const existingCommentsXml = await zip.file('word/comments.xml')!.async('string');
    const updatedCommentsXml = appendCommentsToXml(existingCommentsXml, newComments);
    zip.file('word/comments.xml', updatedCommentsXml);
  }

  const outBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return {
    bytes: outBytes,
    insertions_applied: insertionsApplied,
    comments_added: commentsAdded,
  };
}

// ============================================================================
// INTERNAL — Tree walk helpers (mirrors docx-parser.ts conventions)
// ============================================================================

function findBodyArray(documentTree: unknown): unknown[] | null {
  for (const node of asArray(documentTree)) {
    if (getTagName(node) === 'w:document') {
      const inner = getInner(node);
      if (Array.isArray(inner)) {
        for (const child of inner) {
          if (getTagName(child) === 'w:body') {
            const body = getInner(child);
            return Array.isArray(body) ? body : null;
          }
        }
      }
    }
  }
  return null;
}

function indexParagraphPositions(body: unknown[]): Map<number, number> {
  const out = new Map<number, number>();
  let pIdx = 0;
  for (let i = 0; i < body.length; i++) {
    if (getTagName(body[i]) === 'w:p') {
      out.set(pIdx, i);
      pIdx++;
    }
  }
  return out;
}

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

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

// ============================================================================
// INTERNAL — XML node builders for preserveOrder shape
// ============================================================================

// preserveOrder nodes look like: { "<tag>": [<children>], ":@": { ...attrs } }
// or for empty elements:        { "<tag>": [] }
// or for text:                  { "#text": "..." }
function makeNode(
  tag: string,
  attrs?: Record<string, string | undefined> | undefined,
  children: unknown[] = [],
): Record<string, unknown> {
  const node: Record<string, unknown> = { [tag]: children };
  if (attrs) {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'string') cleaned[k] = v;
    }
    if (Object.keys(cleaned).length > 0) node[':@'] = cleaned;
  }
  return node;
}

function makeText(text: string): Record<string, unknown> {
  return { '#text': text };
}

function makeRunWithText(
  text: string,
  rPrChildren: unknown[] = [],
): Record<string, unknown> {
  // Preserve whitespace so leading/trailing spaces survive Word's collapse.
  return makeNode('w:r', undefined, [
    rPrChildren.length > 0 ? makeNode('w:rPr', undefined, rPrChildren) : null,
    makeNode('w:t', { '@_xml:space': 'preserve' }, [makeText(text)]),
  ].filter(Boolean) as unknown[]);
}

function buildInsertedParagraphs(
  text: string,
  positionLabel: string | undefined,
  meta: { insId: string; author: string; date: string },
): unknown[] {
  // Split on blank lines so multi-paragraph proposed text becomes multiple
  // paragraphs. Within a paragraph, single newlines become soft line breaks.
  const paragraphTexts = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (paragraphTexts.length === 0) return [];

  const paragraphs: unknown[] = [];
  for (let i = 0; i < paragraphTexts.length; i++) {
    const isFirst = i === 0;
    const paraText = paragraphTexts[i];

    // Build runs inside a single <w:ins> wrapper so the entire paragraph is
    // tracked as one insertion.
    const runs: unknown[] = [];

    if (isFirst && positionLabel) {
      // Bold prefix marker so the reviewer can see "[OVIS Counter — Position X]".
      runs.push(
        makeRunWithText(`[OVIS Counter — ${positionLabel}] `, [
          makeNode('w:b', undefined, []),
        ]),
      );
    }

    // Convert single newlines to <w:br/> within the same run group.
    const segments = paraText.split('\n');
    for (let s = 0; s < segments.length; s++) {
      runs.push(makeRunWithText(segments[s]));
      if (s < segments.length - 1) {
        runs.push(makeNode('w:r', undefined, [makeNode('w:br', undefined, [])]));
      }
    }

    const insWrapper = makeNode(
      'w:ins',
      { '@_w:id': meta.insId, '@_w:author': meta.author, '@_w:date': meta.date },
      runs,
    );

    paragraphs.push(makeNode('w:p', undefined, [insWrapper]));
  }
  return paragraphs;
}

// ============================================================================
// INTERNAL — ID allocators (avoid colliding with existing tracked-change IDs)
// ============================================================================

function makeIdAllocator(documentXml: string): () => number {
  let max = 0;
  const re = /<w:(?:ins|del|moveTo|moveFrom)\b[^>]*\bw:id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(documentXml)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let next = max + 1;
  return () => next++;
}

function makeCommentIdAllocator(commentsXml: string | undefined): () => number {
  if (!commentsXml) return ((x = 0) => () => x++)();
  let max = -1;
  const re = /<w:comment\b[^>]*\bw:id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(commentsXml)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let next = max + 1;
  return () => next++;
}

// ============================================================================
// INTERNAL — Comments part management
// ============================================================================

const COMMENTS_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function ensureCommentsPart(zip: JSZip): Promise<void> {
  // Create word/comments.xml if missing
  if (!zip.file('word/comments.xml')) {
    zip.file(
      'word/comments.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="${COMMENTS_NS}"></w:comments>`,
    );
  }

  // Update word/_rels/document.xml.rels to declare the comments relationship
  const relsPath = 'word/_rels/document.xml.rels';
  const relsXml = await zip.file(relsPath)?.async('string');
  if (relsXml && !relsXml.includes('comments.xml')) {
    // Find the highest rId to allocate a new one.
    const rIdMatches = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
    const nextRId = (rIdMatches.length > 0 ? Math.max(...rIdMatches) : 0) + 1;
    const newRel =
      `<Relationship Id="rId${nextRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`;
    const updated = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);
    zip.file(relsPath, updated);
  }

  // Update [Content_Types].xml to declare the comments part type
  const ctPath = '[Content_Types].xml';
  const ctXml = await zip.file(ctPath)?.async('string');
  if (ctXml && !ctXml.includes('comments+xml')) {
    const newOverride =
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`;
    const updated = ctXml.replace('</Types>', `${newOverride}</Types>`);
    zip.file(ctPath, updated);
  }
}

interface CommentToAdd {
  id: string;
  author: string;
  initials: string;
  date: string;
  text: string;
}

function appendCommentsToXml(existing: string, comments: CommentToAdd[]): string {
  const newCommentXml = comments
    .map((c) => {
      // Escape XML special chars in text + attrs.
      const safeText = escapeXml(c.text);
      const safeAuthor = escapeXmlAttr(c.author);
      const safeInitials = escapeXmlAttr(c.initials);
      // Split text on newlines into multiple <w:p>/<w:r> for readability.
      const paras = safeText
        .split(/\n+/)
        .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`)
        .join('');
      return `<w:comment w:id="${c.id}" w:author="${safeAuthor}" w:date="${c.date}" w:initials="${safeInitials}">${paras}</w:comment>`;
    })
    .join('');
  if (existing.includes('</w:comments>')) {
    return existing.replace('</w:comments>', `${newCommentXml}</w:comments>`);
  }
  // Construct from scratch if existing is malformed.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="${COMMENTS_NS}">${newCommentXml}</w:comments>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(s: string): string {
  return escapeXml(s).replace(/"/g, '&quot;');
}
