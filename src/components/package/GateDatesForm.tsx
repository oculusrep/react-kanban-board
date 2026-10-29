import { useState } from 'react';
import { BRAND, GateDateRow, localDate, saveGateDates } from '../../lib/packageTracker';

interface GateDatesFormProps {
  dealId: string;
  current: GateDateRow | null;
  // Dates the progress view already derived (handoff backfill / court log), used as defaults.
  derivedFirstDraft?: string | null;
  derivedFirstResponse?: string | null;
  onDone?: () => void;
}

// Once-only gate dates (decision 2026-10-12): for deals whose court history
// can't be recovered. Saving records "answered" — a blank date means it hasn't
// happened yet, and from then on the live court log fills it in.
export default function GateDatesForm({ dealId, current, derivedFirstDraft, derivedFirstResponse, onDone }: GateDatesFormProps) {
  const toDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
  const [draft, setDraft] = useState(toDate(current?.first_draft_sent_on ?? derivedFirstDraft));
  const [response, setResponse] = useState(toDate(current?.first_response_on ?? derivedFirstResponse));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = localDate();

  const save = async () => {
    if (response && !draft) { setErr('A first response needs a draft-sent date.'); return; }
    if (response && draft && response < draft) { setErr('First response can’t be before the draft was sent.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await saveGateDates(dealId, draft || null, response || null);
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full text-xs px-2 py-1 rounded';
  return (
    <div className="space-y-2 text-xs" style={{ color: BRAND.navy }}>
      <p style={{ color: BRAND.steel }}>Leave a date blank if it hasn’t happened yet.</p>
      <label className="block">
        <span className="block mb-0.5">First LOI draft sent</span>
        <input type="date" max={today} value={draft} onChange={(e) => setDraft(e.target.value)}
               className={field} style={{ border: `1px solid ${BRAND.slate}` }} />
      </label>
      <label className="block">
        <span className="block mb-0.5">Landlord’s first response</span>
        <input type="date" max={today} value={response} onChange={(e) => setResponse(e.target.value)}
               className={field} style={{ border: `1px solid ${BRAND.slate}` }} />
      </label>
      {err && <p style={{ color: BRAND.terracotta }}>{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving}
                className="px-2.5 py-1 rounded text-white disabled:opacity-60" style={{ backgroundColor: BRAND.navy }}>
          {saving ? 'Saving…' : 'Save gate dates'}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="px-2.5 py-1 rounded" style={{ color: BRAND.steel }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
