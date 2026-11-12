/**
 * RealEstateManagerField — the client-side Real Estate Manager (REM) tag on a site
 * submit / deal (e.g. which Starbucks REM owns this site). Drop-in row for the
 * SiteSubmitDataTab / DealDataTab field grids.
 *
 * Self-contained: loads its own current value and candidate contacts, and writes the
 * tag to BOTH the site submit and its linked deal so the two never disagree (it is a
 * tag, not snapshot economics).
 *
 * Starbucks only (for now): renders nothing for any other client. Candidates are the
 * account's contacts holding the "Site Selector" role (contact_client_role). No REM
 * (null) is a real state — "Unassigned" — and is filterable as such.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';
export const REM_ROLE_NAME = 'Site Selector';
export const UNASSIGNED_LABEL = 'Unassigned';
/** Filter sentinel for "no REM" (real_estate_manager_id IS NULL). */
export const REM_UNASSIGNED = '__unassigned';

interface Props {
  clientId: string | null | undefined;
  siteSubmitId?: string | null;
  dealId?: string | null;
  isEditable: boolean;
}

export interface ContactOption {
  id: string;
  name: string;
}

const contactName = (c: { first_name: string | null; last_name: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)';

/** The account's active Site Selector contacts — the REM choices. */
export function useRemOptions(clientId: string | null | undefined): ContactOption[] {
  const [options, setOptions] = useState<ContactOption[]>([]);
  useEffect(() => {
    if (!clientId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('contact_client_role')
        .select('contact:contact_id(id, first_name, last_name), role:role_id(role_name)')
        .eq('client_id', clientId)
        .eq('is_active', true);
      const byId = new Map<string, ContactOption>();
      for (const r of (data || []) as any[]) if (r.contact && r.role?.role_name === REM_ROLE_NAME) byId.set(r.contact.id, { id: r.contact.id, name: contactName(r.contact) });
      if (!cancelled) setOptions([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);
  return options;
}

/** Write the REM tag to the site submit AND its linked deal (dealId given, else by site_submit_id). */
export async function saveRealEstateManager(
  siteSubmitId: string | null | undefined,
  dealId: string | null | undefined,
  rem: string | null
): Promise<void> {
  if (siteSubmitId) {
    const { error } = await supabase.from('site_submit').update({ real_estate_manager_id: rem }).eq('id', siteSubmitId);
    if (error) throw error;
  }
  const dealQ = dealId
    ? supabase.from('deal').update({ real_estate_manager_id: rem }).eq('id', dealId)
    : siteSubmitId
    ? supabase.from('deal').update({ real_estate_manager_id: rem }).eq('site_submit_id', siteSubmitId)
    : null;
  if (dealQ) {
    const { error } = await dealQ;
    if (error) throw error;
  }
}

export function RealEstateManagerField(props: Props) {
  if (props.clientId !== STARBUCKS_CLIENT_ID) return null;
  return <RealEstateManagerRow {...props} />;
}

function RealEstateManagerRow({ clientId, siteSubmitId, dealId, isEditable }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const roleOptions = useRemOptions(clientId);
  const [extra, setExtra] = useState<ContactOption | null>(null);
  const options = extra && !roleOptions.some((o) => o.id === extra.id) ? [...roleOptions, extra] : roleOptions;
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

  // Keep the current value displayable even if that contact has since lost the Site Selector role.
  useEffect(() => {
    if (!value || roleOptions.some((o) => o.id === value)) return;
    let cancelled = false;
    supabase
      .from('contact')
      .select('id, first_name, last_name')
      .eq('id', value)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setExtra({ id: data.id, name: contactName(data) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, roleOptions]);

  const save = async (next: string | null) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      await saveRealEstateManager(siteSubmitId, dealId, next);
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
            <option value="">{UNASSIGNED_LABEL}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {error && <div className="text-xs mt-1" style={{ color: '#A27B5C' }}>{error}</div>}
        </div>
      ) : (
        <span className="text-sm font-medium text-gray-900">{currentName || UNASSIGNED_LABEL}</span>
      )}
    </div>
  );
}

export default RealEstateManagerField;
