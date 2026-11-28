/**
 * The sender's own words from a stored email body — quoted replies and forwarded
 * content removed — and whether those words end in a signature.
 *
 * Used by "Look up in my email" (emailLookup.ts). Extraction and verification
 * both run on ownText() output, never the raw body: a reply usually carries the
 * earlier thread, including OUR signatures, and verifyDetails() would happily
 * confirm Mike's own phone number as "literally in the email".
 *
 * Pure (no npm imports) so `deno test` covers it. The shapes handled here come
 * from real stored mail (see emailText_test.ts):
 *   - Gmail replies: "On Wed, Oct 21, 2026 at 9:41 AM Name <a@b> wrote:" then
 *     ">"-quoted lines; the header may wrap across two lines.
 *   - Apple Mail replies: "On Oct 13, 2026, at 6:16 PM, Name <a@b> wrote:" with
 *     the quote NOT ">"-prefixed.
 *   - Outlook: "From: … Sent: …" header blocks, often after a rule line.
 *   - Forwards: "---------- Forwarded message ---------", "Begin forwarded
 *     message:", "-----Original Message-----".
 *   - About a quarter of long inbound bodies are flattened HTML on ONE line
 *     (entities, inline CSS), so every marker is also matched mid-line.
 */

/** Decode the entities that survive in flattened bodies; normalise odd spaces. */
export function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/﻿/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

const DAY_OR_MONTH =
  '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\\d{1,4}[/.\\-])';

/**
 * Where quoted or forwarded content starts. Each is matched anywhere (not just
 * at a line start) because flattened bodies have no line breaks to anchor on.
 */
const MARKERS: RegExp[] = [
  // Gmail / Apple reply header. Starts with a weekday, month or numeric date so
  // prose like "On the call he wrote: …" can't trigger it; may wrap once, but
  // never across a blank line.
  new RegExp(`\\bOn ${DAY_OR_MONTH}(?:(?!\\n\\s*\\n)[\\s\\S]){0,250}?\\bwrote:`, 'i'),
  /-{2,}\s*Forwarded message\s*-{2,}/i,
  /\bBegin forwarded message:/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  // Outlook header block: From: <someone with an address> … Sent:/Date:. The
  // address requirement keeps a sentence starting "From:" from cutting the body.
  /\*?From:\*?\s*[^\n]{0,160}?(?:<[^>\s]+@[^>\s]+>|\[mailto:[^\]]+\]|\b[\w.+-]+@[\w-]+\.[\w.-]+)[\s\S]{0,200}?\*?(?:Sent|Date):\*?\s/i,
  // …and the same block when Outlook prints a name with no address ("From:
  // Arty Santos"): three header lines in a row, so prose can't match.
  /(?:^|\n)[ \t]*\*?From:\*?[^\n]*\n[ \t]*\*?(?:Sent|Date):\*?[^\n]*\n[ \t]*\*?(?:To|Cc|Subject):/i,
  // Inline ">" quoting with no header we recognised.
  /(?:^|\n)>/,
];

function firstMarker(text: string): { index: number; marker: number } | null {
  let best: { index: number; marker: number } | null = null;
  MARKERS.forEach((re, marker) => {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, marker };
  });
  return best;
}

/**
 * Gmail can put the sender's signature BELOW a ">"-quoted thread:
 *
 *     reply text
 *     On … wrote:
 *     > quoted
 *     > quoted
 *
 *     --
 *     Sender Name
 *
 * Only that exact shape is kept: a reply header, then nothing but ">" lines and
 * blanks, then a "--" delimiter. Anything else after the header is somebody
 * else's text (Apple Mail's quote isn't ">"-prefixed, so it never qualifies).
 */
function trailingSignature(afterHeader: string): string {
  const lines = afterHeader.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].startsWith('>'))) i++;
  if (i >= lines.length || !/^--\s*$/.test(lines[i])) return '';
  const sig = lines.slice(i + 1).join('\n');
  const next = firstMarker(sig);
  return (next ? sig.slice(0, next.index) : sig).trim();
}

/** The sender's own text: everything before the first quote/forward marker. */
export function ownText(body: string | null | undefined): string {
  if (!body) return '';
  const text = normalizeBody(body);
  const hit = firstMarker(text);
  if (!hit) return text.trim();

  // A rule line left dangling at the cut (Outlook's "_____" before From:) goes
  // too. Only at the very end: one ABOVE a signature (Mike's style) stays.
  let own = text.slice(0, hit.index).trim().replace(/(?:^|\s)[_\-=]{10,}$/, '').trim();
  if (hit.marker === 0) {
    const headerEnd = text.indexOf('wrote:', hit.index) + 'wrote:'.length;
    const sig = trailingSignature(text.slice(headerEnd).replace(/^[^\n]*\n?/, ''));
    if (sig) own = `${own}\n\n${sig}`.trim();
  }
  return own;
}

// A US-style 10-digit number in any of the usual separators, or an address.
const PHONE_RE = /\(?\b\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}\b/;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/;

/** How much of the end of the text counts as "the signature area". */
const SIGNATURE_TAIL_LINES = 20;
const SIGNATURE_TAIL_CHARS = 800;

/**
 * Does the sender's own text end with a signature worth extracting from? True
 * when its tail carries a phone number or an email address. A bare name ("--
 * Marah") or "Sent from my iPhone" is not one; the lookup moves on to an older
 * email instead.
 */
export function hasSignature(own: string): boolean {
  if (!own.trim()) return false;
  const lines = own.split('\n').filter((l) => l.trim() !== '');
  const tail = lines.slice(-SIGNATURE_TAIL_LINES).join('\n').slice(-SIGNATURE_TAIL_CHARS);
  return PHONE_RE.test(tail) || EMAIL_RE.test(tail);
}

/**
 * What the model sees and what verifyDetails() checks against: the end of the
 * sender's own text, where the signature is. Capped because flattened HTML can
 * open with kilobytes of CSS.
 */
export const EXTRACT_MAX_CHARS = 4000;

export function signatureSource(own: string): string {
  return own.length > EXTRACT_MAX_CHARS ? own.slice(-EXTRACT_MAX_CHARS) : own;
}
