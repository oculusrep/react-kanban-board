// Pure rules for Intel attachments in the browser — no imports, so they can be
// unit tested (supabase/functions/_shared/knowledge-capture/intelFileRules_test.ts, run with deno). The edge function
// enforces the same caps; these only stop a doomed upload early.
// Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 10;
export const ACCEPTED_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'xlsx', 'xlsm', 'xls', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'tif', 'tiff',
];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export type FileStatus =
  | 'queued' | 'uploading' | 'upload_failed' | 'pending' | 'extracting'
  | 'done' | 'truncated' | 'no_text' | 'unsupported' | 'failed';

/** Statuses that mean "this file didn't make it — re-attach it". */
export const FAILED_STATUSES: ReadonlySet<FileStatus> = new Set<FileStatus>(['upload_failed', 'failed']);

export function ext(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Which of `incoming` can be attached, given `existing` files already on the
 * note (drafts for a new note; uploaded files for a filed one). Same caps
 * either way: allowed types, 50 MB each, 10 per note; exact repeats skipped.
 */
export function screenFiles<F extends { name: string; size: number }>(
  incoming: F[],
  existing: Array<{ name: string; size: number }>,
): { accepted: F[]; refused: string[] } {
  const accepted: F[] = [];
  const refused: string[] = [];
  for (const file of incoming) {
    if (!ACCEPTED_EXTENSIONS.includes(ext(file.name))) {
      refused.push(`${file.name}: only PDF, Word, Excel/CSV and images can be attached.`);
    } else if (file.size > MAX_FILE_BYTES) {
      refused.push(`${file.name} is over 50 MB.`);
    } else if (file.size === 0) {
      refused.push(`${file.name} is empty.`);
    } else if (existing.length + accepted.length >= MAX_FILES) {
      refused.push(`${file.name}: a note takes at most ${MAX_FILES} files.`);
    } else if (![...existing, ...accepted].some((d) => d.name === file.name && d.size === file.size)) {
      accepted.push(file);
    }
  }
  return { accepted, refused };
}

/** What went wrong, and what to do about it, for a file that didn't make it. */
export function failureMessage(f: { status: FileStatus; status_note: string | null }): string | null {
  if (f.status === 'upload_failed') {
    return `${f.status_note || 'The upload did not finish.'} It is not saved or searchable — delete it and attach the file again.`;
  }
  if (f.status === 'failed') {
    const why = (f.status_note || '').replace(/^Could not read this file:\s*/i, '');
    return `Could not index this file${why ? ` (${why})` : ''}. It is in Dropbox but Ask can't search it — delete it and attach it again.`;
  }
  return null;
}
