/**
 * RealEstateManagerField — the client-side Real Estate Manager (REM) tag on a site
 * submit / deal (e.g. which Starbucks REM owns this site). Drop-in row for the
 * SiteSubmitDataTab / DealDataTab field grids.
 *
 * Self-contained: loads its own current value and candidate contacts, and writes the
 * tag to BOTH the site submit and its linked deal so the two never disagree (it is a
 * tag, not snapshot economics). Candidates = contacts related to the client
 * (contact_client_relation) or whose primary client is the client.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface Props {
  clientId: string | null | undefined;
  siteSubmitId?: string | null;
  dealId?: string | null;
  isEditable: boolean;
}

interface ContactOption {
  id: string;
  name: string;
}

const contactName = (c: { first_name: string | null; last_name: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)';

export function RealEstateManagerField({ clientId, siteSubmitId, dealId, isEditable }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current value: the site submit is the source when there is one, else the deal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = siteSubmitId
        ? supabase.from('site_submit').select('real_estate_manager_id').eq('id', siteSubmitId).maybeSingle()
        : dealId
        ? supabase.from('deal').select('real_estate_manager_id').eq('id', dealId).maybeSingle()
        : null;
      if (!q) return;
      const { data } = await q;
      if (!cancelled) setValue((data as { real_estate_manager_id: string | null } | null)?.real_estate_manager_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteSubmitId, dealId]);

  // Candidates for this client (+ the current value, even if no longer related).
  useEffect(() => {
    if (!clientId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [rel, primary] = await Promise.all([
        supabase.from('contact_client_relation').select('contact:contact_id(id, first_name, last_name)').eq('client_id', clientId),
        supabase.from('contact').select('id, first_name, last_name').eq('client_id', clientId),
      ]);
      const byId = new Map<string, ContactOption>();
      for (const r of (rel.data || []) as any[]) if (r.contact) byId.set(r.contact.id, { id: r.contact.id, name: contactName(r.contact) });
      for (const c of (primary.data || []) as any[]) byId.set(c.id, { id: c.id, name: contactName(c) });
      if (!cancelled) setOptions([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Make sure the current value is selectable/displayable even if it isn't a related contact.
  useEffect(() => {
    if (!value || options.some((o) => o.id === value)) return;
    let cancelled = false;
    supabase
      .from('contact')
      .select('id, first_name, last_name')
      .eq('id', value)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setOptions((prev) => (prev.some((o) => o.id === data.id) ? prev : [...prev, { id: data.id, name: contactName(data) }]));
      });
    return () => {
      cancelled = true;
    };
  }, [value, options]);

  const save = async (next: string | null) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      if (siteSubmitId) {
        const { error: e } = await supabase.from('site_submit').update({ real_estate_manager_id: next }).eq('id', siteSubmitId);
        if (e) throw e;
      }
      // Linked deal: the one passed in, else whichever deal points at this site submit.
      const dealQ = dealId
        ? supabase.from('deal').update({ real_estate_manager_id: next }).eq('id', dealId)
        : siteSubmitId
        ? supabase.from('deal').update({ real_estate_manager_id: next }).eq('site_submit_id', siteSubmitId)
        : null;
      if (dealQ) {
        const { error: e } = await dealQ;
        if (e) throw e;
      }
    } catch (e: any) {
      setValue(prev);
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const currentName = options.find((o) => o.id === value)?.name;

  return (
    <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
      <span className="text-sm text-gray-500">Real Estate Mgr</span>
      {isEditable ? (
        <div>
          <select
            value={value ?? ''}
            onChange={(e) => save(e.target.value || null)}
            disabled={saving || !clientId}
            title={!clientId ? 'Set a client first' : undefined}
            className="w-full text-sm border rounded px-2 py-1"
            style={{ borderColor: '#8FA9C8', color: '#002147' }}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {error && <div className="text-xs mt-1" style={{ color: '#A27B5C' }}>{error}</div>}
        </div>
      ) : (
        <span className="text-sm font-medium text-gray-900">{currentName || '-'}</span>
      )}
    </div>
  );
}

export default RealEstateManagerField;
