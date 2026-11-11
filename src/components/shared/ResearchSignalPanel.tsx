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

export function ResearchSignalPanel({ signal }: { signal: ResearchSignal }) {
  const leads = asArray<LeadEntry>(signal.leads_not_pursued);
  const density = asArray<DensityEntry>(signal.density_estimate);
  const permits = asArray<PermitEntry>(signal.permit_volume);
  const [showLeads, setShowLeads] = useState(true);
  const [showDensity, setShowDensity] = useState(false);
  const [showPermits, setShowPermits] = useState(false);

  const badge = signal.signal_strength ? BADGE[signal.signal_strength] : null;
  const nothing = !badge && !signal.signal_rationale && !leads.length && !density.length && !permits.length;

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
        {signal.signal_rationale && (
          <p className="text-sm whitespace-pre-wrap" style={{ color: '#002147' }}>{signal.signal_rationale}</p>
        )}
        {nothing && (
          <p className="text-xs" style={{ color: '#4A6B94' }}>
            This Quick run didn't send a recommendation.
          </p>
        )}
      </div>

      {leads.length > 0 && (
        <Section title={`Leads not pursued (${leads.length})`} open={showLeads} onToggle={() => setShowLeads((v) => !v)}>
          <div className="flex justify-end mb-1">
            <CopyButton text={leads.map(leadLine).join('\n')} label="Copy all" />
          </div>
          <ul className="space-y-1.5">
            {leads.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0 select-text">
                  <div className="font-medium" style={{ color: '#002147' }}>
                    {l.name}
                    {l.municipality && <span className="font-normal" style={{ color: '#8FA9C8' }}> · {l.municipality}</span>}
                  </div>
                  <div className="text-xs" style={{ color: '#4A6B94' }}>Seen in: {l.seen_in}</div>
                  {l.note && <div className="text-xs" style={{ color: '#4A6B94' }}>{l.note}</div>}
                </div>
                <CopyButton text={l.name} label="Copy" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {density.length > 0 && (
        <Section title="Agenda density estimate" open={showDensity} onToggle={() => setShowDensity((v) => !v)}>
          <table className="w-full text-xs">
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
        </Section>
      )}

      {permits.length > 0 && (
        <Section title="Permit volume" open={showPermits} onToggle={() => setShowPermits((v) => !v)}>
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
        </Section>
      )}
    </div>
  );
}
