import React, { useState, useEffect, useCallback } from 'react';
import { useOverlayStack } from '../../../hooks/useOverlayStack';
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../utils/format';
import {
  CompProperty, LeaseComp, SaleComp, OperatingMemorandum, CompNote,
  SOURCE_TYPES, CONFIDENCE_LEVELS, LEASE_TYPES, OCCUPANCY_STATUSES, SALE_CONDITIONS,
} from '../../../lib/compTypes';
import {
  allInRentPsf, effectiveRentPsf, monthsRemaining,
  capRateFromNoiPrice, pricePsf, salesPsf,
} from '../../../lib/compCalculators';

type Tab = 'overview' | 'leases' | 'sales' | 'om' | 'notes';

interface CompDetailSlideoutProps {
  comp: CompProperty | null;                      // existing comp being viewed/edited
  createAt?: { lat: number; lng: number } | null; // dropping a new comp at these coords
  onClose: () => void;
  onSaved?: (compId: string) => void;             // fired after any change that affects the map
  topOffset?: number;
}

interface LookupOption { id: string; label: string; }

const num = (v: string): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.replace(/[$,%\s]/g, ''));
  return isFinite(n) ? n : null;
};
const str = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const dash = (v: number | null | undefined, fn?: (n: number) => string): string =>
  v == null ? '—' : fn ? fn(v) : String(v);

// ---------------------------------------------------------------------------
// Small styled input helpers
// ---------------------------------------------------------------------------
const inputCls =
  'w-full px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:outline-none focus:ring-1 focus:ring-[#002147]';
const labelCls = 'block text-[11px] font-semibold text-[#4A6B94] uppercase tracking-wide mb-0.5';

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label, children, className,
}) => (
  <div className={className}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

const CompDetailSlideout: React.FC<CompDetailSlideoutProps> = ({
  comp, createAt, onClose, onSaved, topOffset = 0,
}) => {
  const { zIndex, bringToFront } = useOverlayStack();
  const [tab, setTab] = useState<Tab>('overview');
  const [userId, setUserId] = useState<string | null>(null);

  // The comp currently being edited (null while creating, until first save).
  const [current, setCurrent] = useState<CompProperty | null>(comp);
  const compId = current?.id ?? null;

  const [propertyTypes, setPropertyTypes] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);

  const [leases, setLeases] = useState<LeaseComp[]>([]);
  const [sales, setSales] = useState<SaleComp[]>([]);
  const [oms, setOms] = useState<OperatingMemorandum[]>([]);
  const [notes, setNotes] = useState<CompNote[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCurrent(comp); }, [comp]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    supabase.from('property_type').select('id, label').order('label')
      .then(({ data }) => setPropertyTypes((data as LookupOption[]) || []));
    supabase.from('merchant_brand').select('id, name').eq('is_active', true).order('name').limit(2000)
      .then(({ data }) => setBrands(((data as any[]) || []).map((b) => ({ id: b.id, label: b.name }))));
  }, []);

  const loadChildren = useCallback(async (id: string) => {
    const [l, s, o, n] = await Promise.all([
      supabase.from('lease_comp').select('*').eq('comp_property_id', id).order('created_at', { ascending: false }),
      supabase.from('sale_comp').select('*').eq('comp_property_id', id).order('sale_date', { ascending: false }),
      supabase.from('operating_memorandum').select('*').eq('comp_property_id', id).order('list_date', { ascending: false }),
      supabase.from('comp_note').select('*').eq('comp_property_id', id).order('created_at', { ascending: false }),
    ]);
    setLeases((l.data as LeaseComp[]) || []);
    setSales((s.data as SaleComp[]) || []);
    setOms((o.data as OperatingMemorandum[]) || []);
    setNotes((n.data as CompNote[]) || []);
  }, []);

  useEffect(() => {
    if (compId) loadChildren(compId);
    else { setLeases([]); setSales([]); setOms([]); setNotes([]); }
  }, [compId, loadChildren]);

  const headerTitle = current?.name || current?.address || (createAt ? 'New Comp' : 'Comp');
  const headerSub = [current?.address, current?.city, current?.state].filter(Boolean).join(', ');

  return (
    <div
      onMouseDown={bringToFront}
      className="fixed right-0 bg-white border-l border-gray-200 shadow-xl flex flex-col w-[560px]"
      style={{ zIndex, top: `${67 + topOffset}px`, height: `calc(100vh - ${67 + topOffset}px - 20px)` }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#002147]">{headerTitle}</h2>
          {headerSub && <p className="text-sm text-gray-500 mt-0.5">{headerSub}</p>}
          {current && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#8FA9C8]/20 text-[#4A6B94] uppercase">
                {current.source_type}
              </span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded uppercase ${
                current.confidence === 'verified' ? 'bg-green-100 text-green-700'
                : current.confidence === 'reported' ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-500'
              }`}>{current.confidence}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs (hidden until the comp exists — must save the location first) */}
      {compId && (
        <div className="flex border-b border-gray-200 px-3">
          {([
            ['overview', 'Overview'],
            ['leases', `Leases (${leases.length})`],
            ['sales', `Sales (${sales.length})`],
            ['om', `OM (${oms.length})`],
            ['notes', `Notes (${notes.length})`],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === key ? 'border-[#002147] text-[#002147]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {(!compId || tab === 'overview') && (
          <OverviewTab
            current={current}
            createAt={createAt}
            propertyTypes={propertyTypes}
            userId={userId}
            saving={saving}
            setSaving={setSaving}
            onSavedComp={(saved) => {
              setCurrent(saved);
              onSaved?.(saved.id);
            }}
          />
        )}

        {compId && tab === 'leases' && (
          <LeasesTab
            compId={compId} leases={leases} brands={brands} userId={userId}
            reload={() => { loadChildren(compId); onSaved?.(compId); }}
          />
        )}
        {compId && tab === 'sales' && (
          <SalesTab
            compId={compId} sales={sales} buildingSqft={current?.building_sqft ?? null} userId={userId}
            reload={() => { loadChildren(compId); onSaved?.(compId); }}
          />
        )}
        {compId && tab === 'om' && (
          <OmTab
            compId={compId} oms={oms} userId={userId}
            reload={() => { loadChildren(compId); onSaved?.(compId); }}
          />
        )}
        {compId && tab === 'notes' && (
          <NotesTab
            compId={compId} notes={notes} userId={userId}
            reload={() => loadChildren(compId)}
          />
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// OVERVIEW TAB — create / edit comp_property
// ===========================================================================
const OverviewTab: React.FC<{
  current: CompProperty | null;
  createAt?: { lat: number; lng: number } | null;
  propertyTypes: LookupOption[];
  userId: string | null;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSavedComp: (saved: CompProperty) => void;
}> = ({ current, createAt, propertyTypes, userId, saving, setSaving, onSavedComp }) => {
  const [f, setF] = useState({
    name: '', address: '', city: '', state: '', zip: '', county: '',
    property_type_id: '', building_sqft: '', land_acres: '', year_built: '',
    anchor_tenant: '', trade_area: '', parcel_id: '',
    verified_latitude: '', verified_longitude: '',
    source_type: 'manual', source_url: '', source_reference: '', confidence: 'unverified',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current) {
      setF({
        name: current.name ?? '', address: current.address ?? '', city: current.city ?? '',
        state: current.state ?? '', zip: current.zip ?? '', county: current.county ?? '',
        property_type_id: current.property_type_id ?? '',
        building_sqft: current.building_sqft?.toString() ?? '',
        land_acres: current.land_acres?.toString() ?? '',
        year_built: current.year_built?.toString() ?? '',
        anchor_tenant: current.anchor_tenant ?? '', trade_area: current.trade_area ?? '',
        parcel_id: current.parcel_id ?? '',
        verified_latitude: (current.verified_latitude ?? current.latitude)?.toString() ?? '',
        verified_longitude: (current.verified_longitude ?? current.longitude)?.toString() ?? '',
        source_type: current.source_type, source_url: current.source_url ?? '',
        source_reference: current.source_reference ?? '', confidence: current.confidence,
      });
    } else if (createAt) {
      setF((prev) => ({
        ...prev,
        verified_latitude: createAt.lat.toString(),
        verified_longitude: createAt.lng.toString(),
      }));
    }
  }, [current, createAt]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload: any = {
      name: str(f.name), address: str(f.address), city: str(f.city), state: str(f.state),
      zip: str(f.zip), county: str(f.county),
      property_type_id: f.property_type_id || null,
      building_sqft: num(f.building_sqft), land_acres: num(f.land_acres), year_built: num(f.year_built),
      anchor_tenant: str(f.anchor_tenant), trade_area: str(f.trade_area), parcel_id: str(f.parcel_id),
      verified_latitude: num(f.verified_latitude), verified_longitude: num(f.verified_longitude),
      source_type: f.source_type, source_url: str(f.source_url),
      source_reference: str(f.source_reference), confidence: f.confidence,
    };
    try {
      if (current) {
        const { data, error } = await supabase.from('comp_property')
          .update(payload).eq('id', current.id).select('*').single();
        if (error) throw error;
        onSavedComp(data as CompProperty);
      } else {
        payload.created_by_id = userId;
        const { data, error } = await supabase.from('comp_property')
          .insert(payload).select('*').single();
        if (error) throw error;
        onSavedComp(data as CompProperty);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save comp');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!current && (
        <p className="text-sm text-[#4A6B94] bg-[#8FA9C8]/10 border border-[#8FA9C8] rounded p-2">
          Enter the location details and save to create the comp. Leases, sales and OMs can be added afterward.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name / Center" className="col-span-2"><input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Peachtree Crossing" /></Field>
        <Field label="Address" className="col-span-2"><input className={inputCls} value={f.address} onChange={set('address')} /></Field>
        <Field label="City"><input className={inputCls} value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><input className={inputCls} value={f.state} onChange={set('state')} /></Field>
        <Field label="ZIP"><input className={inputCls} value={f.zip} onChange={set('zip')} /></Field>
        <Field label="County"><input className={inputCls} value={f.county} onChange={set('county')} /></Field>
        <Field label="Property Type">
          <select className={inputCls} value={f.property_type_id} onChange={set('property_type_id')}>
            <option value="">—</option>
            {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Year Built"><input className={inputCls} value={f.year_built} onChange={set('year_built')} /></Field>
        <Field label="Building SF"><input className={inputCls} value={f.building_sqft} onChange={set('building_sqft')} /></Field>
        <Field label="Land Acres"><input className={inputCls} value={f.land_acres} onChange={set('land_acres')} /></Field>
        <Field label="Anchor / Co-tenants" className="col-span-2"><input className={inputCls} value={f.anchor_tenant} onChange={set('anchor_tenant')} /></Field>
        <Field label="Trade Area"><input className={inputCls} value={f.trade_area} onChange={set('trade_area')} /></Field>
        <Field label="Parcel ID"><input className={inputCls} value={f.parcel_id} onChange={set('parcel_id')} /></Field>
        <Field label="Latitude"><input className={inputCls} value={f.verified_latitude} onChange={set('verified_latitude')} /></Field>
        <Field label="Longitude"><input className={inputCls} value={f.verified_longitude} onChange={set('verified_longitude')} /></Field>
      </div>

      <div className="border-t border-gray-200 pt-3 grid grid-cols-2 gap-3">
        <Field label="Source">
          <select className={inputCls} value={f.source_type} onChange={set('source_type')}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Confidence">
          <select className={inputCls} value={f.confidence} onChange={set('confidence')}>
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Source URL" className="col-span-2"><input className={inputCls} value={f.source_url} onChange={set('source_url')} /></Field>
        <Field label="Source Reference" className="col-span-2"><input className={inputCls} value={f.source_reference} onChange={set('source_reference')} placeholder="External listing / record id" /></Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded bg-[#002147] text-white text-sm font-semibold hover:bg-[#00306a] disabled:opacity-50"
      >
        {saving ? 'Saving…' : current ? 'Save Changes' : 'Create Comp'}
      </button>
    </div>
  );
};

// ===========================================================================
// LEASES TAB
// ===========================================================================
const emptyLease = {
  tenant_name: '', merchant_brand_id: '', suite: '', tenant_sqft: '', lease_type: '',
  base_rent_psf: '', nnn_psf: '', lease_commencement_date: '', lease_expiration_date: '',
  lease_term_months: '', escalation_pct: '', free_rent_months: '', ti_psf: '',
  reported_tenant_sales: '', occupancy_status: '', source_type: 'manual', confidence: 'unverified',
};

const LeasesTab: React.FC<{
  compId: string; leases: LeaseComp[]; brands: LookupOption[]; userId: string | null; reload: () => void;
}> = ({ compId, leases, brands, userId, reload }) => {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ ...emptyLease });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const startNew = () => { setF({ ...emptyLease }); setEditing('new'); };
  const startEdit = (l: LeaseComp) => {
    setF({
      tenant_name: l.tenant_name ?? '', merchant_brand_id: l.merchant_brand_id ?? '', suite: l.suite ?? '',
      tenant_sqft: l.tenant_sqft?.toString() ?? '', lease_type: l.lease_type ?? '',
      base_rent_psf: l.base_rent_psf?.toString() ?? '', nnn_psf: l.nnn_psf?.toString() ?? '',
      lease_commencement_date: l.lease_commencement_date ?? '', lease_expiration_date: l.lease_expiration_date ?? '',
      lease_term_months: l.lease_term_months?.toString() ?? '', escalation_pct: l.escalation_pct?.toString() ?? '',
      free_rent_months: l.free_rent_months?.toString() ?? '', ti_psf: l.ti_psf?.toString() ?? '',
      reported_tenant_sales: l.reported_tenant_sales?.toString() ?? '', occupancy_status: l.occupancy_status ?? '',
      source_type: l.source_type, confidence: l.confidence,
    });
    setEditing(l.id);
  };

  const save = async () => {
    const base = num(f.base_rent_psf);
    const nnn = num(f.nnn_psf);
    const sqft = num(f.tenant_sqft);
    const payload: any = {
      comp_property_id: compId,
      tenant_name: str(f.tenant_name), merchant_brand_id: f.merchant_brand_id || null, suite: str(f.suite),
      tenant_sqft: sqft, lease_type: f.lease_type || null,
      base_rent_psf: base, nnn_psf: nnn,
      all_in_rent_psf: allInRentPsf(base, nnn),
      annual_base_rent: base != null && sqft != null ? base * sqft : null,
      lease_commencement_date: f.lease_commencement_date || null,
      lease_expiration_date: f.lease_expiration_date || null,
      lease_term_months: num(f.lease_term_months), escalation_pct: num(f.escalation_pct),
      free_rent_months: num(f.free_rent_months), ti_psf: num(f.ti_psf),
      reported_tenant_sales: num(f.reported_tenant_sales),
      sales_psf: salesPsf(num(f.reported_tenant_sales), sqft),
      occupancy_status: f.occupancy_status || null,
      source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('lease_comp').insert(payload); }
    else await supabase.from('lease_comp').update(payload).eq('id', editing);
    setEditing(null);
    reload();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this lease comp?')) return;
    await supabase.from('lease_comp').delete().eq('id', id);
    reload();
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tenant Name"><input className={inputCls} value={f.tenant_name} onChange={set('tenant_name')} /></Field>
          <Field label="Brand (known chain)">
            <select className={inputCls} value={f.merchant_brand_id} onChange={set('merchant_brand_id')}>
              <option value="">—</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <Field label="Suite"><input className={inputCls} value={f.suite} onChange={set('suite')} /></Field>
          <Field label="Tenant SF"><input className={inputCls} value={f.tenant_sqft} onChange={set('tenant_sqft')} /></Field>
          <Field label="Lease Type">
            <select className={inputCls} value={f.lease_type} onChange={set('lease_type')}>
              <option value="">—</option>
              {LEASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Occupancy">
            <select className={inputCls} value={f.occupancy_status} onChange={set('occupancy_status')}>
              <option value="">—</option>
              {OCCUPANCY_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Base Rent PSF"><input className={inputCls} value={f.base_rent_psf} onChange={set('base_rent_psf')} /></Field>
          <Field label="NNN PSF"><input className={inputCls} value={f.nnn_psf} onChange={set('nnn_psf')} /></Field>
          <Field label="Commencement"><input type="date" className={inputCls} value={f.lease_commencement_date} onChange={set('lease_commencement_date')} /></Field>
          <Field label="Expiration"><input type="date" className={inputCls} value={f.lease_expiration_date} onChange={set('lease_expiration_date')} /></Field>
          <Field label="Term (months)"><input className={inputCls} value={f.lease_term_months} onChange={set('lease_term_months')} /></Field>
          <Field label="Escalation %/yr"><input className={inputCls} value={f.escalation_pct} onChange={set('escalation_pct')} /></Field>
          <Field label="Free Rent (months)"><input className={inputCls} value={f.free_rent_months} onChange={set('free_rent_months')} /></Field>
          <Field label="TI PSF"><input className={inputCls} value={f.ti_psf} onChange={set('ti_psf')} /></Field>
          <Field label="Reported Tenant Sales (annual)" className="col-span-2"><input className={inputCls} value={f.reported_tenant_sales} onChange={set('reported_tenant_sales')} /></Field>
          <Field label="Source">
            <select className={inputCls} value={f.source_type} onChange={set('source_type')}>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Confidence">
            <select className={inputCls} value={f.confidence} onChange={set('confidence')}>
              {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        {/* Live calculators */}
        <div className="text-xs text-[#4A6B94] bg-[#8FA9C8]/10 rounded p-2 space-y-0.5">
          <div>All-in rent PSF: <b>{dash(allInRentPsf(num(f.base_rent_psf), num(f.nnn_psf)), (n) => `$${n.toFixed(2)}`)}</b></div>
          <div>Effective rent PSF (net of free rent + escalations): <b>{dash(
            effectiveRentPsf({ baseRentPsf: num(f.base_rent_psf), termMonths: num(f.lease_term_months), escalationPct: num(f.escalation_pct), freeRentMonths: num(f.free_rent_months) }),
            (n) => `$${n.toFixed(2)}`)}</b></div>
          <div>Months remaining: <b>{dash(monthsRemaining(f.lease_expiration_date || null))}</b></div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2 rounded bg-[#002147] text-white text-sm font-semibold hover:bg-[#00306a]">Save Lease</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-gray-300 text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2 rounded border border-dashed border-[#4A6B94] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10">+ Add Lease Comp</button>
      {leases.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No lease comps yet.</p>}
      {leases.map((l) => (
        <div key={l.id} className="border border-gray-200 rounded p-3 text-sm">
          <div className="flex justify-between items-start">
            <div className="font-semibold text-[#002147]">{l.tenant_name || 'Unnamed tenant'}{l.suite ? ` · ${l.suite}` : ''}</div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => startEdit(l)} className="text-[#4A6B94] hover:underline">Edit</button>
              <button onClick={() => del(l.id)} className="text-red-500 hover:underline">Delete</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600">
            <span>SF: {dash(l.tenant_sqft)}</span>
            <span>Base: {dash(l.base_rent_psf, (n) => `$${n.toFixed(2)}`)}</span>
            <span>NNN: {dash(l.nnn_psf, (n) => `$${n.toFixed(2)}`)}</span>
            <span>All-in: {dash(l.all_in_rent_psf, (n) => `$${n.toFixed(2)}`)}</span>
            <span>Type: {l.lease_type ?? '—'}</span>
            <span>Exp: {l.lease_expiration_date ?? '—'}</span>
            <span>Remaining: {dash(monthsRemaining(l.lease_expiration_date))} mo</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================================================
// SALES TAB
// ===========================================================================
const emptySale = {
  sale_date: '', sale_price: '', cap_rate: '', noi: '', buyer_name: '', seller_name: '',
  broker: '', financing: '', sale_condition: '', occupancy_at_sale: '', source_type: 'manual', confidence: 'unverified',
};

const SalesTab: React.FC<{
  compId: string; sales: SaleComp[]; buildingSqft: number | null; userId: string | null; reload: () => void;
}> = ({ compId, sales, buildingSqft, userId, reload }) => {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ ...emptySale });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const startNew = () => { setF({ ...emptySale }); setEditing('new'); };
  const startEdit = (s: SaleComp) => {
    setF({
      sale_date: s.sale_date ?? '', sale_price: s.sale_price?.toString() ?? '', cap_rate: s.cap_rate?.toString() ?? '',
      noi: s.noi?.toString() ?? '', buyer_name: s.buyer_name ?? '', seller_name: s.seller_name ?? '',
      broker: s.broker ?? '', financing: s.financing ?? '', sale_condition: s.sale_condition ?? '',
      occupancy_at_sale: s.occupancy_at_sale?.toString() ?? '', source_type: s.source_type, confidence: s.confidence,
    });
    setEditing(s.id);
  };

  // Derive cap rate from NOI/price when the user didn't type one.
  const derivedCap = capRateFromNoiPrice(num(f.noi), num(f.sale_price));
  const derivedPpsf = pricePsf(num(f.sale_price), buildingSqft);

  const save = async () => {
    const price = num(f.sale_price);
    const payload: any = {
      comp_property_id: compId,
      sale_date: f.sale_date || null, sale_price: price,
      cap_rate: num(f.cap_rate) ?? derivedCap,
      noi: num(f.noi), price_psf: pricePsf(price, buildingSqft),
      buyer_name: str(f.buyer_name), seller_name: str(f.seller_name), broker: str(f.broker),
      financing: str(f.financing), sale_condition: f.sale_condition || null,
      occupancy_at_sale: num(f.occupancy_at_sale), source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('sale_comp').insert(payload); }
    else await supabase.from('sale_comp').update(payload).eq('id', editing);
    setEditing(null);
    reload();
  };
  const del = async (id: string) => {
    if (!confirm('Delete this sale comp?')) return;
    await supabase.from('sale_comp').delete().eq('id', id);
    reload();
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sale Date"><input type="date" className={inputCls} value={f.sale_date} onChange={set('sale_date')} /></Field>
          <Field label="Sale Price"><input className={inputCls} value={f.sale_price} onChange={set('sale_price')} /></Field>
          <Field label="NOI"><input className={inputCls} value={f.noi} onChange={set('noi')} /></Field>
          <Field label="Cap Rate % (blank = auto)"><input className={inputCls} value={f.cap_rate} onChange={set('cap_rate')} placeholder={derivedCap != null ? derivedCap.toFixed(2) : ''} /></Field>
          <Field label="Buyer"><input className={inputCls} value={f.buyer_name} onChange={set('buyer_name')} /></Field>
          <Field label="Seller"><input className={inputCls} value={f.seller_name} onChange={set('seller_name')} /></Field>
          <Field label="Broker"><input className={inputCls} value={f.broker} onChange={set('broker')} /></Field>
          <Field label="Occupancy % at Sale"><input className={inputCls} value={f.occupancy_at_sale} onChange={set('occupancy_at_sale')} /></Field>
          <Field label="Financing" className="col-span-2"><input className={inputCls} value={f.financing} onChange={set('financing')} /></Field>
          <Field label="Sale Condition">
            <select className={inputCls} value={f.sale_condition} onChange={set('sale_condition')}>
              <option value="">—</option>
              {SALE_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select className={inputCls} value={f.source_type} onChange={set('source_type')}>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="text-xs text-[#4A6B94] bg-[#8FA9C8]/10 rounded p-2 space-y-0.5">
          <div>Derived cap rate (NOI ÷ price): <b>{dash(derivedCap, (n) => `${n.toFixed(2)}%`)}</b></div>
          <div>Price PSF (÷ building SF): <b>{dash(derivedPpsf, (n) => `$${n.toFixed(0)}`)}</b></div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2 rounded bg-[#002147] text-white text-sm font-semibold hover:bg-[#00306a]">Save Sale</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-gray-300 text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2 rounded border border-dashed border-[#4A6B94] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10">+ Add Sale Comp</button>
      {sales.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No sale comps yet.</p>}
      {sales.map((s) => (
        <div key={s.id} className="border border-gray-200 rounded p-3 text-sm">
          <div className="flex justify-between items-start">
            <div className="font-semibold text-[#002147]">{s.sale_date ?? 'Undated'} · {dash(s.sale_price, (n) => formatCurrency(n))}</div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => startEdit(s)} className="text-[#4A6B94] hover:underline">Edit</button>
              <button onClick={() => del(s.id)} className="text-red-500 hover:underline">Delete</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600">
            <span>Cap: {dash(s.cap_rate, (n) => `${n.toFixed(2)}%`)}</span>
            <span>NOI: {dash(s.noi, (n) => formatCurrency(n))}</span>
            <span>$/SF: {dash(s.price_psf, (n) => `$${n.toFixed(0)}`)}</span>
            <span className="col-span-3">Buyer: {s.buyer_name ?? '—'} · Seller: {s.seller_name ?? '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================================================
// OM TAB
// ===========================================================================
const emptyOm = {
  title: '', broker_name: '', brokerage: '', list_date: '', asking_price: '', asking_cap_rate: '',
  guidance: '', source_url: '', source_type: 'om', confidence: 'reported',
};

const OmTab: React.FC<{
  compId: string; oms: OperatingMemorandum[]; userId: string | null; reload: () => void;
}> = ({ compId, oms, userId, reload }) => {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ ...emptyOm });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const startNew = () => { setF({ ...emptyOm }); setEditing('new'); };
  const startEdit = (o: OperatingMemorandum) => {
    setF({
      title: o.title ?? '', broker_name: o.broker_name ?? '', brokerage: o.brokerage ?? '',
      list_date: o.list_date ?? '', asking_price: o.asking_price?.toString() ?? '',
      asking_cap_rate: o.asking_cap_rate?.toString() ?? '', guidance: o.guidance ?? '',
      source_url: o.source_url ?? '', source_type: o.source_type, confidence: o.confidence,
    });
    setEditing(o.id);
  };

  const save = async () => {
    const payload: any = {
      comp_property_id: compId, title: str(f.title), broker_name: str(f.broker_name),
      brokerage: str(f.brokerage), list_date: f.list_date || null, asking_price: num(f.asking_price),
      asking_cap_rate: num(f.asking_cap_rate), guidance: str(f.guidance), source_url: str(f.source_url),
      source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('operating_memorandum').insert(payload); }
    else await supabase.from('operating_memorandum').update(payload).eq('id', editing);
    setEditing(null);
    reload();
  };
  const del = async (id: string) => {
    if (!confirm('Delete this OM?')) return;
    await supabase.from('operating_memorandum').delete().eq('id', id);
    reload();
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><input className={inputCls} value={f.title} onChange={set('title')} /></Field>
          <Field label="Broker"><input className={inputCls} value={f.broker_name} onChange={set('broker_name')} /></Field>
          <Field label="Brokerage"><input className={inputCls} value={f.brokerage} onChange={set('brokerage')} /></Field>
          <Field label="List Date"><input type="date" className={inputCls} value={f.list_date} onChange={set('list_date')} /></Field>
          <Field label="Asking Price"><input className={inputCls} value={f.asking_price} onChange={set('asking_price')} /></Field>
          <Field label="Asking Cap %"><input className={inputCls} value={f.asking_cap_rate} onChange={set('asking_cap_rate')} /></Field>
          <Field label="Source URL"><input className={inputCls} value={f.source_url} onChange={set('source_url')} /></Field>
          <Field label="Guidance / Notes" className="col-span-2">
            <textarea className={inputCls} rows={3} value={f.guidance} onChange={set('guidance') as any} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">OM PDF files attach via the property's Dropbox folder (Phase 2).</p>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2 rounded bg-[#002147] text-white text-sm font-semibold hover:bg-[#00306a]">Save OM</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-gray-300 text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2 rounded border border-dashed border-[#4A6B94] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10">+ Add Operating Memorandum</button>
      {oms.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No OMs yet.</p>}
      {oms.map((o) => (
        <div key={o.id} className="border border-gray-200 rounded p-3 text-sm">
          <div className="flex justify-between items-start">
            <div className="font-semibold text-[#002147]">{o.title || 'Untitled OM'}</div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => startEdit(o)} className="text-[#4A6B94] hover:underline">Edit</button>
              <button onClick={() => del(o.id)} className="text-red-500 hover:underline">Delete</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600">
            <span>Broker: {o.broker_name ?? '—'}</span>
            <span>List: {o.list_date ?? '—'}</span>
            <span>Asking: {dash(o.asking_price, (n) => formatCurrency(n))}</span>
            <span>Cap: {dash(o.asking_cap_rate, (n) => `${n.toFixed(2)}%`)}</span>
            {o.source_url && <a href={o.source_url} target="_blank" rel="noreferrer" className="col-span-2 text-[#4A6B94] hover:underline truncate">{o.source_url}</a>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================================================
// NOTES TAB
// ===========================================================================
const NotesTab: React.FC<{
  compId: string; notes: CompNote[]; userId: string | null; reload: () => void;
}> = ({ compId, notes, userId, reload }) => {
  const [body, setBody] = useState('');
  const add = async () => {
    if (!body.trim()) return;
    await supabase.from('comp_note').insert({ comp_property_id: compId, body: body.trim(), created_by_id: userId });
    setBody('');
    reload();
  };
  const del = async (id: string) => {
    await supabase.from('comp_note').delete().eq('id', id);
    reload();
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea className={inputCls} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" />
        <button onClick={add} className="px-4 rounded bg-[#002147] text-white text-sm font-semibold hover:bg-[#00306a]">Add</button>
      </div>
      {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No notes yet.</p>}
      {notes.map((n) => (
        <div key={n.id} className="border border-gray-200 rounded p-3 text-sm">
          <div className="flex justify-between items-start gap-2">
            <p className="text-gray-700 whitespace-pre-wrap flex-1">{n.body}</p>
            <button onClick={() => del(n.id)} className="text-red-500 hover:underline text-xs">Delete</button>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

export default CompDetailSlideout;
