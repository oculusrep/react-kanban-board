import React, { useRef, useState } from 'react';
import { invokeKnowledgeCapture } from './useKnowledgeCapture';

// Ask mode: a question in, an answer built only from Intel notes and attached
// file text. Every statement is cited, and every quote was checked word for word
// against its source by the edge function (ovis-knowledge-capture `ask`). When
// nothing in Intel answers it, that's what it says.
// Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  terracotta: '#A27B5C',
} as const;

interface AskSource {
  n: number;
  kind: 'note' | 'file';
  entry_id: string;
  file_id: string | null;
  filename: string | null;
  locator: string | null;
  entry_created_at: string;
  author_name: string | null;
  excerpt: string;
}

type AskResult =
  | {
      result: 'answered';
      statements: Array<{ text: string; citations: Array<{ n: number; quote: string }> }>;
      sources: AskSource[];
      searched: number;
    }
  | { result: 'nothing_found'; searched: number };

function easternDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  });
}

const SourceCard: React.FC<{ source: AskSource; onOpenFile: (id: string) => void; highlight: boolean }> = ({
  source, onOpenFile, highlight,
}) => {
  const [expanded, setExpanded] = useState(false);
  const meta = `${source.kind === 'file' ? 'attached to a note' : 'note'} filed ${easternDate(source.entry_created_at)}` +
    (source.author_name ? ` by ${source.author_name}` : '');
  return (
    <li
      id={`intel-source-${source.n}`}
      className="rounded px-2 py-1.5 text-[11px]"
      style={{
        backgroundColor: COLORS.white,
        border: `1px solid ${highlight ? COLORS.steel : '#E2E8F0'}`,
      }}
    >
      <div className="flex items-start gap-1.5">
        <span className="font-semibold" style={{ color: COLORS.steel }}>[{source.n}]</span>
        <div className="min-w-0 flex-1">
          {source.kind === 'file' ? (
            <div className="flex flex-wrap items-baseline gap-1">
              <button
                type="button"
                onClick={() => source.file_id && onOpenFile(source.file_id)}
                className="truncate font-medium underline"
                style={{ color: COLORS.steel }}
                title="Open the Dropbox copy (link valid 4 hours)"
              >
                {source.filename ?? 'file'}
              </button>
              {source.locator && <span style={{ color: COLORS.slate }}>{source.locator}</span>}
            </div>
          ) : (
            <span className="font-medium" style={{ color: COLORS.midnight }}>Intel note</span>
          )}
          <p className="text-[10px]" style={{ color: COLORS.slate }}>{meta}</p>
          <p className={`mt-0.5 whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`} style={{ color: COLORS.midnight }}>
            {source.excerpt}
          </p>
          {source.excerpt.length > 180 && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="text-[10px] underline" style={{ color: COLORS.slate }}>
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

export const IntelAsk: React.FC<{ open: boolean; onOpenFile: (fileId: string) => void }> = ({ open, onOpenFile }) => {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setAsked(q);
    try {
      setResult(await invokeKnowledgeCapture<AskResult>({ action: 'ask', question: q }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setBusy(false);
    }
  };

  const jumpTo = (n: number) => {
    setHighlight(n);
    document.getElementById(`intel-source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <>
      <form onSubmit={submit} className="flex-shrink-0 px-4 pt-3 pb-2" style={{ backgroundColor: COLORS.white }}>
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
          rows={3}
          tabIndex={open ? 0 : -1}
          placeholder={'Ask Intel, e.g. "What do we know about Chipotle\'s work letter?"'}
          className="w-full resize-none rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
        />
        <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: COLORS.steel }}>
          <span>{busy ? 'Searching Intel…' : 'Answers only from filed notes and attached files'}</span>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="rounded px-3 py-1 text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
          >
            Ask
          </button>
        </div>
      </form>

      {error && (
        <div className="mx-4 mt-2 flex-shrink-0 rounded px-2 py-1 text-xs"
          style={{ color: COLORS.terracotta, border: `1px solid ${COLORS.terracotta}`, backgroundColor: COLORS.white }}>
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ borderTop: `1px solid ${COLORS.slate}` }}>
        {!result && !busy && (
          <p className="py-2 text-center text-xs" style={{ color: COLORS.slate }}>
            I search notes and file contents by meaning, keywords, tags and linked records, and answer only from what I find — with sources.
          </p>
        )}
        {result?.result === 'nothing_found' && (
          <div className="rounded-md px-3 py-2 text-xs" style={{ border: `1px dashed ${COLORS.terracotta}`, backgroundColor: COLORS.white }}>
            <p className="font-medium" style={{ color: COLORS.midnight }}>Nothing in Intel answers that.</p>
            <p className="mt-0.5" style={{ color: COLORS.steel }}>
              {result.searched > 0
                ? `I looked at ${result.searched} possibly related item${result.searched === 1 ? '' : 's'}, but none of them says.`
                : 'No notes or files matched.'}
              {' '}Nothing here comes from outside Intel.
            </p>
          </div>
        )}
        {result?.result === 'answered' && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>{asked}</p>
            <ul className="mt-1 space-y-1.5">
              {result.statements.map((s, i) => (
                <li key={i} className="text-xs leading-relaxed" style={{ color: COLORS.midnight }}>
                  {s.text}{' '}
                  {[...new Set(s.citations.map((c) => c.n))].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => jumpTo(n)}
                      className="align-super text-[9px] font-semibold"
                      style={{ color: COLORS.steel }}
                      title={s.citations.filter((c) => c.n === n).map((c) => `"${c.quote}"`).join('\n')}
                    >
                      [{n}]
                    </button>
                  ))}
                </li>
              ))}
            </ul>
            <h3 className="mt-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.steel }}>Sources</h3>
            <ul className="mt-1 space-y-1">
              {result.sources.map((src) => (
                <SourceCard key={src.n} source={src} onOpenFile={onOpenFile} highlight={highlight === src.n} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
};
