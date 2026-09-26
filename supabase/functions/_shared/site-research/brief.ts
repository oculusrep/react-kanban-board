/**
 * brief_pass and record_qa: two passes that read the FINISHED record and add nothing to it.
 *
 * The deep pass writes the record. The brief is written afterwards, from that record, for two
 * reasons (decided 2026-09-26): a pass that reads a finished record cannot cherry-pick what it
 * researched, and the brief wording can be re-tuned by re-running the brief alone — no repeat of
 * $2.85 of research. record_qa answers a question from the same stored record, citing the section.
 *
 * Neither pass gets tools or web search: whatever is not in the record cannot be claimed.
 */

export const BRIEF_PROMPT_KEY = 'brief_pass';
export const RECORD_QA_PROMPT_KEY = 'record_qa';
export const BRIEF_MAX_WORDS = 200;

export interface RecordForBrief {
  site_submit_name: string | null;
  archetype_primary: string | null;
  archetype_secondary: string | null;
  story_carriers: string[];
  /** The deep pass report, in full, as stored. */
  record: string;
  /** The first pass report, for the category scan the record builds on. */
  first_pass: string | null;
  record_written_at: string | null;
}

/** Sections the record is expected to carry; the Q&A cites by these names. */
export const RECORD_SECTIONS = [
  'VERDICT', 'HEADLINE', 'WHY HERE', 'OBJECTIONS', 'GENERATOR CALLOUTS', 'SLIDE GUIDANCE', 'BACKUP',
] as const;

/** Split a stored record into its **SECTION** blocks, in order, for display and for citing. */
export function splitRecordSections(record: string): Array<{ heading: string; body: string }> {
  const out: Array<{ heading: string; body: string }> = [];
  const re = /^\*\*([A-Z][A-Z '\u2019-]+)\*\*\s*$/gm;
  const marks: Array<{ heading: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(record)) !== null) marks.push({ heading: m[1].trim(), start: m.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const body = record.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : record.length).trim();
    if (body) out.push({ heading: marks[i].heading, body });
  }
  if (out.length === 0 && record.trim()) out.push({ heading: 'RECORD', body: record.trim() });
  return out;
}

const header = (r: RecordForBrief) => [
  `Site: ${r.site_submit_name ?? '(unnamed)'}`,
  `Archetype on the record: ${r.archetype_primary ?? '(none)'}${r.archetype_secondary ? ` / ${r.archetype_secondary}` : ''}`,
  `Story carriers on the record: ${r.story_carriers.length ? r.story_carriers.join('; ') : '(none)'}`,
  r.record_written_at ? `Record written: ${r.record_written_at}` : null,
].filter(Boolean).join('\n');

/** The user turn for a brief run: the whole record, and nothing else to work from. */
export function briefOpening(r: RecordForBrief): string {
  return [
    'Write the brief for this site from the record below. The record is everything you have; you have no tools and no way to look anything up.',
    '',
    header(r),
    '',
    '## The record (deep pass)',
    r.record,
    ...(r.first_pass ? ['', '## First pass report (the category scan the record builds on)', r.first_pass] : []),
    '',
    'Write the brief now, following your instructions.',
  ].join('\n');
}

/** The user turn for a record question: the question, then the record it must be answered from. */
export function recordQaOpening(question: string, r: RecordForBrief): string {
  return [
    `Question: ${question}`,
    '',
    'Answer from the record below and nothing else. You have no tools and no way to look anything up.',
    '',
    header(r),
    '',
    '## The record (deep pass)',
    r.record,
    ...(r.first_pass ? ['', '## First pass report', r.first_pass] : []),
  ].join('\n');
}

/** Words in the brief, for the length check the worker logs. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
