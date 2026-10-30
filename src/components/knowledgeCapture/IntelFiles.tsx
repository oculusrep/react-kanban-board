import React from 'react';
import { type DraftFile, formatBytes, type IntelFile } from './useIntelFiles';

// Attachment chips for the Intel panel: files waiting to be filed with the note,
// and files on filed notes with where their indexing stands.
// Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  terracotta: '#A27B5C',
} as const;

const PaperclipIcon: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15.2 7.8l-6.4 6.4a2 2 0 102.8 2.8l6.4-6.4a4 4 0 10-5.6-5.6l-6.4 6.4a6 6 0 108.5 8.5l6.4-6.4" />
  </svg>
);

export const DraftFileList: React.FC<{ drafts: DraftFile[]; onRemove: (localId: string) => void }> = ({ drafts, onRemove }) => {
  if (drafts.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1">
        {drafts.map((d) => (
          <span
            key={d.localId}
            className="inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1.5 pr-1 text-[11px]"
            style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
            title={d.file.name}
          >
            <span style={{ color: COLORS.steel }}><PaperclipIcon /></span>
            <span className="min-w-0 max-w-[220px] truncate">{d.file.name}</span>
            <span style={{ color: COLORS.slate }}>{formatBytes(d.file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(d.localId)}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label={`Remove ${d.file.name}`}
            >
              <svg className="h-2.5 w-2.5" fill="none" stroke={COLORS.steel} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px]" style={{ color: COLORS.slate }}>
        Uploaded to Dropbox when you file the note.
      </p>
    </div>
  );
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'waiting',
  uploading: 'uploading…',
  upload_failed: 'upload failed',
  pending: 'indexing…',
  extracting: 'indexing…',
  done: 'searchable',
  truncated: 'partly searchable',
  no_text: 'no text found',
  unsupported: 'stored, not searchable',
  failed: 'could not read',
};

const WARN = new Set(['upload_failed', 'truncated', 'no_text', 'failed']);

export const FileChips: React.FC<{
  files: IntelFile[];
  onOpen: (fileId: string) => void;
  onRetry?: (file: IntelFile) => void;
  canRetry?: (localId: string) => boolean;
}> = ({ files, onOpen, onRetry, canRetry }) => {
  if (files.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {files.map((f) => {
        const openable = !!f.id && f.status !== 'uploading' && f.status !== 'upload_failed' && f.status !== 'queued';
        return (
          <li key={f.localId} className="flex flex-wrap items-center gap-1 text-[10px]">
            <span style={{ color: COLORS.steel }}><PaperclipIcon /></span>
            {openable ? (
              <button
                type="button"
                onClick={() => onOpen(f.id!)}
                className="max-w-[220px] truncate underline"
                style={{ color: COLORS.steel }}
                title={`Open ${f.filename} (link valid 4 hours)`}
              >
                {f.filename}
              </button>
            ) : (
              <span className="max-w-[220px] truncate" style={{ color: COLORS.midnight }}>{f.filename}</span>
            )}
            <span
              style={{ color: WARN.has(f.status) ? COLORS.terracotta : COLORS.slate }}
              title={f.status_note ?? undefined}
            >
              · {STATUS_LABEL[f.status] ?? f.status}
            </span>
            {f.status === 'upload_failed' && onRetry && canRetry?.(f.localId) && (
              <button type="button" onClick={() => onRetry(f)} className="underline" style={{ color: COLORS.steel }}>
                retry
              </button>
            )}
            {f.status_note && WARN.has(f.status) && (
              <span className="basis-full pl-4" style={{ color: COLORS.terracotta }}>{f.status_note}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export { PaperclipIcon };
