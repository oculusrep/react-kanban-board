import { useState, type CSSProperties, type ReactNode } from 'react';

// Quick-mode "is a Deep run worth it" recommendation, as stored on research_run
// by submit_research_report. Shapes match the ovis-research-mcp tool schema;
// every field is rendered defensively because the agent writes them.

export interface DensityEntry {
  municipality: string;
  meetings_in_window?: number | null;
  meetings_sampled?: number | null;
  meetings_with_residential?: number | null;
  extrapolated_count?: number | null;
  not_sampled_reason?: string | null;
}
export interface PermitEntry {
  municipality: string;
  result_count?: number | null;
  no_count_reason?: string | null;
}
export interface LeadEntry {
  name: string;
  seen_in: string;
  municipality?: string | null;
  note?: string | null;
}

export interface ResearchSignal {
  signal_strength: 'strong' | 'moderate' | 'weak' | null;
  signal_rationale: string | null;
  density_estimate: DensityEntry[] | null;
  permit_volume: PermitEntry[] | null;
  leads_not_pursued: LeadEntry[] | null;
}

const BADGE: Record<string, { label: string; style: CSSProperties }> = {
  strong: { label: 'Strong signal', style: { backgroundColor: '#002147', color: '#FFFFFF', border: '1px solid #002147' } },
  moderate: { label: 'Moderate signal', style: { backgroundColor: '#4A6B94', color: '#FFFFFF', border: '1px solid #4A6B94' } },
  weak: { label: 'Weak signal', style: { backgroundColor: '#FFFFFF', color: '#A27B5C', border: '1px solid #A27B5C' } },
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : '—');

function leadLine(l: LeadEntry) {
  return `${l.name} — ${l.seen_in}${l.municipality ? ` (${l.municipality})` : ''}${l.note ? ` — ${l.note}` : ''}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — text is still selectable */
        }
      }}
      className="text-xs px-2 py-0.5 rounded border shrink-0"
      style={{ borderColor: '#8FA9C8', color: copied ? '#002147' : '#4A6B94', backgroundColor: '#FFFFFF' }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="border-t" style={{ borderColor: '#E2E8F0' }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-1.5 text-xs font-medium flex justify-between items-center"
        style={{ color: '#002147' }}
      >
        <span>{title}</span>
        <span style={{ color: '#4A6B94' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

// First two sentences of the rationale, for the at-a-glance view. Splits only on
// terminal punctuation followed by whitespace and a capital/digit/quote, so
// decimals ("2.5 mi") don't split; an abbreviation like "St. Johns" may, which
// only costs a slightly shorter preview — the full text is one click away.
function firstTwoSentences(text: string): { head: string; rest: boolean } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const parts = flat.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  const head = parts.slice(0, 2).join(' ');
  return { head, rest: parts.length > 2 };
}

export interface StagedTotals {
  records: number;
  units: number;
  // Records with no unit count. Without this the units figure silently
  // understates whenever the agent couldn't source a count.
  noCount: number;
}

export function ResearchSignalPanel({ signal, totals }: { signal: ResearchSignal; totals?: StagedTotals }) {
  const leads = asArray<LeadEntry>(signal.leads_not_pursued);
  const density = asArray<DensityEntry>(signal.density_estimate);
  const permits = asArray<PermitEntry>(signal.permit_volume);
  // Display-only collapse: every field is still stored and reachable below.
  const [showFullRationale, setShowFullRationale] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [openLeads, setOpenLeads] = useState<Set<number>>(new Set());
  const [showSupporting, setShowSupporting] = useState(false);

  const badge = signal.signal_strength ? BADGE[signal.signal_strength] : null;
  const nothing = !badge && !signal.signal_rationale && !leads.length && !density.length && !permits.length;
  const preview = signal.signal_rationale ? firstTwoSentences(signal.signal_rationale) : null;
  const toggleLead = (i: number) =>
    setOpenLeads((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  return (
    <div className="border rounded-md" style={{ borderColor: '#8FA9C8', backgroundColor: '#FFFFFF' }}>
      <div className="px-3 py-2 space-y-1" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#002147' }}>Deep-run recommendation</span>
          {badge ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={badge.style}>{badge.label}</span>
          ) : (
            <span className="text-xs" style={{ color: '#8FA9C8' }}>no signal recorded</span>
          )}
        </div>
        {totals && (
          <div className="text-sm" style={{ color: '#4A6B94' }}>
            {totals.records.toLocaleString()} record{totals.records === 1 ? '' : 's'} · {totals.units.toLocaleString()} units
            {totals.noCount > 0 && <span style={{ color: '#A27B5C' }}> · {totals.noCount} with no count</span>}
          </div>
        )}
        {preview && (
          showFullRationale ? (
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#002147' }}>
              {signal.signal_rationale}{' '}
              <button type="button" onClick={() => setShowFullRationale(false)} className="text-xs underline" style={{ color: '#4A6B94' }}>less</button>
            </p>
          ) : (
            <div>
              <p className="text-sm line-clamp-2" style={{ color: '#002147' }}>{preview.head}</p>
              {(preview.rest || preview.head.length > 160) && (
                <button type="button" onClick={() => setShowFullRationale(true)} className="text-xs underline" style={{ color: '#4A6B94' }}>more</button>
              )}
            </div>
          )
        )}
        {nothing && (
          <p className="text-xs" style={{ color: '#4A6B94' }}>
            This Quick run didn't send a recommendation.
          </p>
        )}
      </div>

      {leads.length > 0 && (
        <div className="border-t px-3 py-1.5" style={{ borderColor: '#E2E8F0' }}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowLeads((v) => !v)}
                    className="text-left text-xs font-medium min-w-0 flex-1" style={{ color: '#002147' }}>
              <span style={{ color: '#4A6B94' }}>{showLeads ? '▾' : '▸'}</span> Leads not pursued ({leads.length})
              {!showLeads && (
                <span className="font-normal" style={{ color: '#4A6B94' }}>: {leads.map((l) => l.name).join(' · ')}</span>
              )}
            </button>
            <CopyButton text={leads.map(leadLine).join('\n')} label="Copy all" />
          </div>
          {showLeads && (
            <ul className="mt-1 space-y-1">
              {leads.map((l, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => toggleLead(i)} className="text-left min-w-0 select-text"
                            title="Show where it was seen">
                      <span className="text-xs" style={{ color: '#8FA9C8' }}>{openLeads.has(i) ? '▾' : '▸'} </span>
                      <span className="font-medium" style={{ color: '#002147' }}>{l.name}</span>
                      {l.municipality && <span style={{ color: '#8FA9C8' }}> · {l.municipality}</span>}
                    </button>
                    <CopyButton text={l.name} label="Copy" />
                  </div>
                  {openLeads.has(i) && (
                    <div className="pl-4 select-text">
                      <div className="text-xs" style={{ color: '#4A6B94' }}>Seen in: {l.seen_in}</div>
                      {l.note && <div className="text-xs" style={{ color: '#4A6B94' }}>{l.note}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(density.length > 0 || permits.length > 0) && (
        <Section title="Supporting data (agenda density, permit volume)" open={showSupporting} onToggle={() => setShowSupporting((v) => !v)}>
          {density.length > 0 && (
            <>
              <div className="text-xs font-medium mb-0.5" style={{ color: '#002147' }}>Agenda density estimate</div>
              <table className="w-full text-xs mb-2">
                <thead>
                  <tr style={{ color: '#4A6B94' }}>
                    <th className="text-left font-medium py-0.5">Municipality</th>
                    <th className="text-right font-medium">Meetings</th>
                    <th className="text-right font-medium">Sampled</th>
                    <th className="text-right font-medium">w/ residential</th>
                    <th className="text-right font-medium">Est. items</th>
                  </tr>
                </thead>
                <tbody style={{ color: '#002147' }}>
                  {density.map((d, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: '#E2E8F0' }}>
                      <td className="py-0.5">{d.municipality}</td>
                      {d.not_sampled_reason && d.meetings_sampled == null ? (
                        <td colSpan={4} className="text-right" style={{ color: '#A27B5C' }}>Not sampled — {d.not_sampled_reason}</td>
                      ) : (
                        <>
                          <td className="text-right">{n(d.meetings_in_window)}</td>
                          <td className="text-right">{n(d.meetings_sampled)}</td>
                          <td className="text-right">{n(d.meetings_with_residential)}</td>
                          <td className="text-right font-semibold">{n(d.extrapolated_count)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {permits.length > 0 && (
            <>
              <div className="text-xs font-medium mb-0.5" style={{ color: '#002147' }}>Permit volume</div>
              <ul className="text-xs space-y-0.5">
                {permits.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span style={{ color: '#002147' }}>{p.municipality}</span>
                    {typeof p.result_count === 'number' ? (
                      <span className="font-semibold" style={{ color: '#002147' }}>{p.result_count.toLocaleString()} results</span>
                    ) : (
                      <span style={{ color: '#A27B5C' }}>{p.no_count_reason || 'no count'}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
