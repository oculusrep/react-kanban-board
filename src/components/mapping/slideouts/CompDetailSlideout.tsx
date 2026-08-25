import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOverlayStack } from '../../../hooks/useOverlayStack';
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../utils/format';
import geocodingService from '../../../services/geocodingService';
import UserByIdDisplay from '../../shared/UserByIdDisplay';
import FileManager from '../../FileManager/FileManager';
import PortalChatTab from '../../portal/PortalChatTab';
import {
  CompProperty, LeaseComp, SaleComp, OperatingMemorandum, CompNote,
  SOURCE_TYPES, CONFIDENCE_LEVELS, SALE_CONDITIONS,
  LeaseType, LeaseField, LEASE_TYPE_OPTIONS, LEASE_TYPE_LABEL, LEASE_TYPE_FIELDS, RENT_BUMP_OPTIONS,
} from '../../../lib/compTypes';
import {
  allInRentPsf, effectiveRentPsf, monthsRemaining,
  capRateFromNoiPrice, pricePsf, salesPsf, buildRentSchedule, leaseExpiration,
} from '../../../lib/compCalculators';

type Tab = 'overview' | 'leases' | 'sales' | 'om' | 'files' | 'notes';

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

// Unified modern field styling (one look across the whole slideout).
const inputCls =
  'w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#002147]/15 focus:border-[#002147] transition-colors';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
// Header (dark) inputs — white fields on the black header for readability.
const hInputCls =
  'w-full px-3 py-2.5 text-sm rounded-lg bg-white text-gray-900 border border-transparent placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors';
const hLabelCls = 'block text-xs font-medium text-gray-300 mb-1';

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label, children, className,
}) => (
  <div className={className}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

// Lease/sale form controls share the same modern styling as the rest of the slideout.
const ffLabelCls = labelCls;
const ffInputCls = inputCls;

const TxtField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  type?: 'text' | 'date'; placeholder?: string; className?: string;
}> = ({ label, value, onChange, type = 'text', placeholder, className }) => (
  <div className={className}>
    <label className={ffLabelCls}>{label}</label>
    <input type={type} className={ffInputCls} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  </div>
);

const SelField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}> = ({ label, value, onChange, children, className }) => (
  <div className={className}>
    <label className={ffLabelCls}>{label}</label>
    <select className={ffInputCls} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
  </div>
);

const TxtAreaField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; rows?: number; className?: string; placeholder?: string;
}> = ({ label, value, onChange, rows = 2, className, placeholder }) => (
  <div className={className}>
    <label className={ffLabelCls}>{label}</label>
    <textarea className={ffInputCls} rows={rows} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  </div>
);

// Modern always-editable numeric input with an inline $ / % adornment and comma formatting on blur.
const NumField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  kind?: 'plain' | 'currency' | 'percent'; decimals?: number; className?: string; placeholder?: string;
}> = ({ label, value, onChange, kind = 'plain', decimals = 0, className, placeholder }) => {
  const [focused, setFocused] = useState(false);
  const n = value.trim() === '' ? null : Number(value.replace(/[^0-9.\-]/g, ''));
  const display = focused || value.trim() === '' || n == null || !isFinite(n)
    ? value
    : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        {kind === 'currency' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>}
        <input inputMode="decimal" placeholder={placeholder}
          className={`${inputCls} ${kind === 'currency' ? 'pl-7' : ''} ${kind === 'percent' ? 'pr-8' : ''}`}
          value={display}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))} />
        {kind === 'percent' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>}
      </div>
    </div>
  );
};

const fmtDateTime = (s: string | null): string =>
  s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

// Created / last-modified footer for a lease / sale / OM record.
const AuditFooter: React.FC<{
  created_by_id: string | null; created_at: string; updated_by_id: string | null; updated_at: string;
}> = ({ created_by_id, created_at, updated_by_id, updated_at }) => (
  <div className="text-[11px] text-gray-400 mt-2 pt-1.5 border-t border-gray-100">
    <span>Created{created_by_id && <UserByIdDisplay userId={created_by_id} />} · {fmtDateTime(created_at)}</span>
    {updated_by_id && (
      <span> · Modified<UserByIdDisplay userId={updated_by_id} /> · {fmtDateTime(updated_at)}</span>
    )}
  </div>
);

const fmtSchedDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Auto-calculated rent schedule for a lease (from commencement + rent + escalation + bump cadence).
const RentScheduleCard: React.FC<{
  commencementDate: string | null;
  annualBaseRent: number | null;
  escalationPct: number | null;
  bumpFrequency: string | null;
  termYears: number | null;
  optionCount?: number | null;
  optionTermYears?: number | null;
}> = (p) => {
  const schedule = buildRentSchedule({
    commencementDate: p.commencementDate,
    annualBaseRent: p.annualBaseRent,
    escalationPct: p.escalationPct,
    bumpFrequency: (p.bumpFrequency as any) || null,
    termYears: p.termYears,
    optionCount: p.optionCount ?? null,
    optionTermYears: p.optionTermYears ?? null,
  });
  if (!schedule || schedule.length === 0) return null;
  const current = schedule.find((s) => s.isCurrent);
  return (
    <div className="mt-3 border border-[#8FA9C8] rounded-lg overflow-hidden">
      <div className="bg-[#002147] text-white px-3 py-2 text-sm font-semibold flex items-center justify-between gap-2">
        <span>Rent Schedule</span>
        {current
          ? <span className="text-xs font-normal">Current: {formatCurrency(current.annualRent)}/yr · {formatCurrency(current.monthlyRent)}/mo</span>
          : <span className="text-xs font-normal text-gray-300">Not yet commenced</span>}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[#4A6B94] bg-[#8FA9C8]/10">
            <th className="text-left px-3 py-1.5 font-semibold">Period</th>
            <th className="text-right px-3 py-1.5 font-semibold">Annual</th>
            <th className="text-right px-3 py-1.5 font-semibold">Monthly</th>
            <th className="text-right px-3 py-1.5 font-semibold">Increase</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((s, i) => (
            <tr key={i} className={`border-t border-gray-100 ${
              s.isCurrent ? 'bg-yellow-50 font-semibold text-[#002147]'
              : s.isOption ? 'bg-[#8FA9C8]/10 text-gray-600' : 'text-gray-700'}`}>
              <td className="px-3 py-1.5">
                {s.isOption && <span className="text-[10px] text-[#4A6B94] font-semibold mr-1">{s.segment}</span>}
                {fmtSchedDate(s.periodStart)} – {fmtSchedDate(s.periodEnd)}
                {s.isCurrent && <span className="ml-1 text-[10px] text-yellow-700">(now)</span>}
              </td>
              <td className="px-3 py-1.5 text-right">{formatCurrency(s.annualRent)}</td>
              <td className="px-3 py-1.5 text-right">{formatCurrency(s.monthlyRent)}</td>
              <td className="px-3 py-1.5 text-right">{s.increasePct != null ? `+${s.increasePct}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Editable comp_property draft (shared by the header + overview body)
// ---------------------------------------------------------------------------
type DraftKey =
  | 'name' | 'address' | 'city' | 'state' | 'zip'
  | 'verified_latitude' | 'verified_longitude'
  | 'property_type_id' | 'building_sqft' | 'land_acres' | 'year_built'
  | 'anchor_tenant' | 'trade_area' | 'parcel_id'
  | 'source_type' | 'source_url' | 'source_reference' | 'confidence';
type Draft = Record<DraftKey, string>;

const emptyDraft: Draft = {
  name: '', address: '', city: '', state: '', zip: '',
  verified_latitude: '', verified_longitude: '',
  property_type_id: '', building_sqft: '', land_acres: '', year_built: '',
  anchor_tenant: '', trade_area: '', parcel_id: '',
  source_type: 'manual', source_url: '', source_reference: '', confidence: 'unverified',
};

function buildDraft(comp: CompProperty | null, createAt?: { lat: number; lng: number } | null): Draft {
  if (comp) {
    return {
      name: comp.name ?? '', address: comp.address ?? '', city: comp.city ?? '',
      state: comp.state ?? '', zip: comp.zip ?? '',
      verified_latitude: (comp.verified_latitude ?? comp.latitude)?.toString() ?? '',
      verified_longitude: (comp.verified_longitude ?? comp.longitude)?.toString() ?? '',
      property_type_id: comp.property_type_id ?? '',
      building_sqft: comp.building_sqft?.toString() ?? '',
      land_acres: comp.land_acres?.toString() ?? '',
      year_built: comp.year_built?.toString() ?? '',
      anchor_tenant: comp.anchor_tenant ?? '', trade_area: comp.trade_area ?? '',
      parcel_id: comp.parcel_id ?? '',
      source_type: comp.source_type, source_url: comp.source_url ?? '',
      source_reference: comp.source_reference ?? '', confidence: comp.confidence,
    };
  }
  return {
    ...emptyDraft,
    verified_latitude: createAt ? createAt.lat.toString() : '',
    verified_longitude: createAt ? createAt.lng.toString() : '',
  };
}

function draftToPayload(d: Draft): any {
  return {
    name: str(d.name), address: str(d.address), city: str(d.city), state: str(d.state), zip: str(d.zip),
    verified_latitude: num(d.verified_latitude), verified_longitude: num(d.verified_longitude),
    property_type_id: d.property_type_id || null,
    building_sqft: num(d.building_sqft), land_acres: num(d.land_acres), year_built: num(d.year_built),
    anchor_tenant: str(d.anchor_tenant), trade_area: str(d.trade_area), parcel_id: str(d.parcel_id),
    source_type: d.source_type, source_url: str(d.source_url),
    source_reference: str(d.source_reference), confidence: d.confidence,
  };
}

// ===========================================================================
// MAIN SLIDEOUT
// ===========================================================================
const CompDetailSlideout: React.FC<CompDetailSlideoutProps> = ({
  comp, createAt, onClose, onSaved, topOffset = 0,
}) => {
  const { zIndex, bringToFront } = useOverlayStack();
  const [tab, setTab] = useState<Tab>('overview');
  const [userId, setUserId] = useState<string | null>(null);

  const [current, setCurrent] = useState<CompProperty | null>(comp);
  const compId = current?.id ?? null;

  const [draft, setDraft] = useState<Draft>(() => buildDraft(comp, createAt));
  const [headerEditing, setHeaderEditing] = useState<boolean>(!comp); // new comp starts editable
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const geocodedRef = useRef(false);

  const [propertyTypes, setPropertyTypes] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [leases, setLeases] = useState<LeaseComp[]>([]);
  const [sales, setSales] = useState<SaleComp[]>([]);
  const [oms, setOms] = useState<OperatingMemorandum[]>([]);
  const [notes, setNotes] = useState<CompNote[]>([]);

  const setField = useCallback((k: DraftKey, v: string) => setDraft((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    setCurrent(comp);
    setDraft(buildDraft(comp, createAt));
    setHeaderEditing(!comp);
    geocodedRef.current = false;
  }, [comp, createAt]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    supabase.from('property_type').select('id, label').order('label')
      .then(({ data }) => setPropertyTypes((data as LookupOption[]) || []));
    supabase.from('merchant_brand').select('id, name').eq('is_active', true).order('name').limit(2000)
      .then(({ data }) => setBrands(((data as any[]) || []).map((b) => ({ id: b.id, label: b.name }))));
  }, []);

  // Reverse-geocode a freshly dropped comp to autofill the address block (fast entry).
  useEffect(() => {
    if (current || !createAt || geocodedRef.current) return;
    geocodedRef.current = true;
    setGeocoding(true);
    geocodingService.reverseGeocode(createAt.lat, createAt.lng)
      .then((r) => {
        if ('latitude' in r) {
          setDraft((p) => ({
            ...p,
            address: p.address || r.street_address || '',
            city: p.city || r.city || '',
            state: p.state || r.state || '',
            zip: p.zip || r.zip || '',
          }));
        }
      })
      .finally(() => setGeocoding(false));
  }, [current, createAt]);

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

  // Upsert the whole comp_property draft (used by both the header and the overview body).
  const saveComp = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    const payload = draftToPayload(draft);
    try {
      let saved: CompProperty;
      if (current) {
        payload.updated_by_id = userId;
        const { data, error } = await supabase.from('comp_property')
          .update(payload).eq('id', current.id).select('*').single();
        if (error) throw error;
        saved = data as CompProperty;
      } else {
        payload.created_by_id = userId;
        const { data, error } = await supabase.from('comp_property')
          .insert(payload).select('*').single();
        if (error) throw error;
        saved = data as CompProperty;
      }
      setCurrent(saved);
      onSaved?.(saved.id);
      return true;
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save comp');
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, current, userId, onSaved]);

  const deleteComp = useCallback(async () => {
    if (!current) return;
    if (!confirm('Delete this comp and all its leases, sales, OMs and notes? This cannot be undone.')) return;
    const { error } = await supabase.from('comp_property').delete().eq('id', current.id);
    if (error) { alert(`Failed to delete comp: ${error.message}`); return; }
    onSaved?.(current.id); // refresh the map layer (pin disappears)
    onClose();
  }, [current, onSaved, onClose]);

  return (
    <div
      onMouseDown={bringToFront}
      className="fixed right-0 bg-white border-l border-gray-200 shadow-xl flex flex-col w-[560px]"
      style={{ zIndex, top: `${67 + topOffset}px`, height: `calc(100vh - ${67 + topOffset}px - 20px)` }}
    >
      <CompHeader
        draft={draft}
        setField={setField}
        editing={headerEditing}
        isNew={!compId}
        geocoding={geocoding}
        saving={saving}
        saveError={saveError}
        current={current}
        onEdit={() => setHeaderEditing(true)}
        onCancel={() => { setDraft(buildDraft(current, createAt)); setHeaderEditing(false); setSaveError(null); }}
        onSave={async () => { const ok = await saveComp(); if (ok) setHeaderEditing(false); }}
        onDelete={deleteComp}
        onClose={onClose}
      />

      {!compId && (
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-[#4A6B94] bg-[#8FA9C8]/10 border border-[#8FA9C8] rounded p-3">
            Confirm the location above and click <b>Create Comp</b>. Property details, leases, sales,
            OMs and notes can be added once the comp exists.
          </p>
        </div>
      )}

      {compId && (
        <>
          <div className="flex border-b border-gray-200 px-3 flex-shrink-0">
            {([
              ['overview', 'Overview'],
              ['leases', `Leases (${leases.length})`],
              ['sales', `Sales (${sales.length})`],
              ['om', `OM (${oms.length})`],
              ['files', 'Files'],
              ['notes', 'Notes'],
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

          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'overview' && (
              <OverviewBody
                draft={draft} setField={setField} propertyTypes={propertyTypes}
                saving={saving} saveError={saveError} onSave={saveComp}
              />
            )}
            {tab === 'leases' && (
              <LeasesTab compId={compId} leases={leases} brands={brands} userId={userId}
                reload={() => { loadChildren(compId); onSaved?.(compId); }} />
            )}
            {tab === 'sales' && (
              <SalesTab compId={compId} sales={sales} buildingSqft={current?.building_sqft ?? null} userId={userId}
                reload={() => { loadChildren(compId); onSaved?.(compId); }} />
            )}
            {tab === 'om' && (
              <OmTab compId={compId} oms={oms} userId={userId}
                reload={() => { loadChildren(compId); onSaved?.(compId); }} />
            )}
            {tab === 'files' && (
              <FileManager entityType="comp_property" entityId={compId} />
            )}
            {tab === 'notes' && (
              <PortalChatTab siteSubmitId="" showInternalComments={true} compPropertyId={compId} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ===========================================================================
// HEADER — black, location display + pencil-to-edit (mirrors site submit/deal)
// ===========================================================================
const CompHeader: React.FC<{
  draft: Draft;
  setField: (k: DraftKey, v: string) => void;
  editing: boolean;
  isNew: boolean;
  geocoding: boolean;
  saving: boolean;
  saveError: string | null;
  current: CompProperty | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ draft, setField, editing, isNew, geocoding, saving, saveError, current, onEdit, onCancel, onSave, onDelete, onClose }) => {
  const cityLine = [draft.city, draft.state].filter(Boolean).join(', ') + (draft.zip ? ` ${draft.zip}` : '');
  const coordLine = draft.verified_latitude && draft.verified_longitude
    ? `${Number(draft.verified_latitude).toFixed(6)}, ${Number(draft.verified_longitude).toFixed(6)}`
    : null;

  return (
    <div className="flex-shrink-0 bg-black text-white px-5 py-4 border-b border-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <h2 className="text-xl font-bold text-white truncate">
                {draft.name || draft.address || 'Comp'}
              </h2>
              {draft.address && <p className="text-sm text-gray-300 truncate">{draft.address}</p>}
              {cityLine.trim() && <p className="text-sm text-gray-300">{cityLine}</p>}
              {coordLine && <p className="text-xs font-mono text-gray-400 mt-1">{coordLine}</p>}
            </>
          ) : (
            <h2 className="text-lg font-bold text-white">{isNew ? 'New Comp' : 'Edit Location'}</h2>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {!editing && (
            <button onClick={onEdit} title="Edit location"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {!editing && !isNew && current && (
            <button onClick={onDelete} title="Delete comp"
              className="p-2 rounded-lg bg-red-500/90 hover:bg-red-600 transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button onClick={onClose} title="Close"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Provenance badges (display mode) */}
      {!editing && current && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/15 text-gray-100 uppercase">{current.source_type}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded uppercase ${
            current.confidence === 'verified' ? 'bg-green-500/30 text-green-100'
            : current.confidence === 'reported' ? 'bg-yellow-500/30 text-yellow-100'
            : 'bg-white/10 text-gray-300'
          }`}>{current.confidence}</span>
        </div>
      )}

      {/* Created / last-modified audit */}
      {!editing && current && (
        <div className="text-[11px] text-gray-500 mt-1.5">
          Created{current.created_by_id && <UserByIdDisplay userId={current.created_by_id} />} · {fmtDateTime(current.created_at)}
          {current.updated_by_id && (
            <> · Modified<UserByIdDisplay userId={current.updated_by_id} /> · {fmtDateTime(current.updated_at)}</>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="mt-3 space-y-2">
          {geocoding && (
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Looking up address…
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className={hLabelCls}>Name / Center</label>
              <input className={hInputCls} value={draft.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Peachtree Crossing" />
            </div>
            <div className="col-span-2">
              <label className={hLabelCls}>Address</label>
              <input className={hInputCls} value={draft.address} onChange={(e) => setField('address', e.target.value)} />
            </div>
            <div>
              <label className={hLabelCls}>City</label>
              <input className={hInputCls} value={draft.city} onChange={(e) => setField('city', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={hLabelCls}>State</label>
                <input className={hInputCls} value={draft.state} onChange={(e) => setField('state', e.target.value)} />
              </div>
              <div>
                <label className={hLabelCls}>ZIP</label>
                <input className={hInputCls} value={draft.zip} onChange={(e) => setField('zip', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={hLabelCls}>Latitude</label>
              <input className={hInputCls} value={draft.verified_latitude} onChange={(e) => setField('verified_latitude', e.target.value)} />
            </div>
            <div>
              <label className={hLabelCls}>Longitude</label>
              <input className={hInputCls} value={draft.verified_longitude} onChange={(e) => setField('verified_longitude', e.target.value)} />
            </div>
          </div>
          {saveError && <p className="text-xs text-red-300">{saveError}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onSave} disabled={saving}
              className="flex-1 py-1.5 rounded bg-white text-black text-sm font-semibold hover:bg-gray-200 disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Create Comp' : 'Save'}
            </button>
            {!isNew && (
              <button onClick={onCancel} className="px-4 py-1.5 rounded border border-gray-500 text-sm text-white hover:bg-white/10">Cancel</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// OVERVIEW BODY — non-location attributes (+ collapsible "More Details")
// ===========================================================================
const OverviewBody: React.FC<{
  draft: Draft;
  setField: (k: DraftKey, v: string) => void;
  propertyTypes: LookupOption[];
  saving: boolean;
  saveError: string | null;
  onSave: () => Promise<boolean>;
}> = ({ draft, setField, propertyTypes, saving, saveError, onSave }) => {
  const [showMore, setShowMore] = useState(false);
  const bind = (k: DraftKey) => ({
    value: draft[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setField(k, e.target.value),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Property Type">
          <select className={inputCls} {...bind('property_type_id')}>
            <option value="">—</option>
            {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Building SF"><input className={inputCls} {...bind('building_sqft')} /></Field>
        <Field label="Land Acres"><input className={inputCls} {...bind('land_acres')} /></Field>
        <Field label="Source">
          <select className={inputCls} {...bind('source_type')}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Confidence">
          <select className={inputCls} {...bind('confidence')}>
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {/* Collapsible "More Details" */}
      <div className="border-t border-gray-200 pt-2">
        <button
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#4A6B94] hover:text-[#002147]"
        >
          <svg className={`w-4 h-4 transition-transform ${showMore ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          More Details
        </button>
        {showMore && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-3">
            <Field label="Year Built"><input className={inputCls} {...bind('year_built')} /></Field>
            <Field label="Anchor / Co-tenants"><input className={inputCls} {...bind('anchor_tenant')} /></Field>
            <Field label="Trade Area"><input className={inputCls} {...bind('trade_area')} /></Field>
            <Field label="Parcel ID"><input className={inputCls} {...bind('parcel_id')} /></Field>
            <Field label="Source URL" className="col-span-2"><input className={inputCls} {...bind('source_url')} /></Field>
            <Field label="Source Reference" className="col-span-2"><input className={inputCls} {...bind('source_reference')} placeholder="External listing / record id" /></Field>
          </div>
        )}
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-[#002147] text-white text-sm font-semibold shadow-sm hover:bg-[#00306a] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
};

// ===========================================================================
// LEASES TAB
// ===========================================================================
const emptyLease = {
  tenant_name: '', merchant_brand_id: '', suite: '', tenant_sqft: '', lease_type: '',
  annual_base_rent: '', nnn_psf: '', ti_annual: '',
  lease_commencement_date: '', lease_expiration_date: '',
  lease_term_years: '', escalation_pct: '', rent_bump_frequency: '',
  option_count: '', option_term_years: '5',
  reported_tenant_sales: '', occupancy_status: '', notes: '', source_type: 'manual', confidence: 'unverified',
};

const LeasesTab: React.FC<{
  compId: string; leases: LeaseComp[]; brands: LookupOption[]; userId: string | null; reload: () => void;
}> = ({ compId, leases, brands, userId, reload }) => {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ ...emptyLease });

  const startNew = () => { setF({ ...emptyLease }); setEditing('new'); };
  const startEdit = (l: LeaseComp) => {
    setF({
      tenant_name: l.tenant_name ?? '', merchant_brand_id: l.merchant_brand_id ?? '', suite: l.suite ?? '',
      tenant_sqft: l.tenant_sqft?.toString() ?? '', lease_type: l.lease_type ?? '',
      annual_base_rent: l.annual_base_rent?.toString() ?? '', nnn_psf: l.nnn_psf?.toString() ?? '',
      ti_annual: l.ti_annual?.toString() ?? '',
      lease_commencement_date: l.lease_commencement_date ?? '', lease_expiration_date: l.lease_expiration_date ?? '',
      lease_term_years: l.lease_term_years?.toString() ?? '', escalation_pct: l.escalation_pct?.toString() ?? '',
      rent_bump_frequency: l.rent_bump_frequency ?? '',
      option_count: l.option_count?.toString() ?? '', option_term_years: l.option_term_years?.toString() ?? '5',
      reported_tenant_sales: l.reported_tenant_sales?.toString() ?? '', occupancy_status: l.occupancy_status ?? '',
      notes: l.notes ?? '', source_type: l.source_type, confidence: l.confidence,
    });
    setEditing(l.id);
  };

  // Conditional entry fields for the selected lease type (Ground Lease / BTS / Multi-Tenant).
  const type = (f.lease_type || '') as LeaseType | '';
  const typeFields: LeaseField[] = type && LEASE_TYPE_FIELDS[type] ? LEASE_TYPE_FIELDS[type] : [];
  const has = (x: LeaseField) => typeFields.includes(x);

  // string / number binders for the property-styled controls
  const setV = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  // Expiration auto-derives from commencement + term when both are present.
  const derivedExp = leaseExpiration(f.lease_commencement_date || null, num(f.lease_term_years));

  const save = async () => {
    const sqft = has('tenant_sqft') ? num(f.tenant_sqft) : null;
    const annual = num(f.annual_base_rent);                 // Base Rent (Annual $); ground rent for ground lease
    const nnn = has('nnn_psf') ? num(f.nnn_psf) : null;     // NNN quoted PSF
    const tiAnnual = has('ti_annual') ? num(f.ti_annual) : null;
    const years = num(f.lease_term_years);
    // Derive PSF values so existing PSF-based comparisons/calculators still work.
    const baseP = annual != null && sqft != null && sqft !== 0 ? annual / sqft : null;
    const payload: any = {
      comp_property_id: compId,
      tenant_name: str(f.tenant_name), merchant_brand_id: f.merchant_brand_id || null,
      suite: has('suite') ? str(f.suite) : null,
      tenant_sqft: sqft,
      lease_type: f.lease_type || null,
      annual_base_rent: annual,
      base_rent_psf: baseP,
      nnn_psf: nnn,
      all_in_rent_psf: baseP != null ? allInRentPsf(baseP, nnn) : null,
      ti_annual: tiAnnual,
      ti_psf: tiAnnual != null && sqft != null && sqft !== 0 ? tiAnnual / sqft : null,
      lease_commencement_date: f.lease_commencement_date || null,
      // Explicit override wins; otherwise auto-derive from commencement + term.
      lease_expiration_date: f.lease_expiration_date || leaseExpiration(f.lease_commencement_date || null, years) || null,
      lease_term_years: years,
      lease_term_months: years != null ? Math.round(years * 12) : null,
      escalation_pct: num(f.escalation_pct),
      rent_bump_frequency: f.rent_bump_frequency || null,
      option_count: num(f.option_count),
      option_term_years: num(f.option_term_years),
      reported_tenant_sales: num(f.reported_tenant_sales),
      sales_psf: salesPsf(num(f.reported_tenant_sales), sqft),
      occupancy_status: f.occupancy_status || null,
      notes: str(f.notes),
      source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('lease_comp').insert(payload); }
    else { payload.updated_by_id = userId; await supabase.from('lease_comp').update(payload).eq('id', editing); }
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <TxtField label="Tenant Name" value={f.tenant_name} onChange={setV('tenant_name')} />
          <SelField label="Brand (known chain)" value={f.merchant_brand_id} onChange={setV('merchant_brand_id')}>
            <option value="">—</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </SelField>
          <SelField label="Lease Type" value={f.lease_type} onChange={setV('lease_type')}>
            <option value="">Select a type…</option>
            {LEASE_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelField>

          {/* Type-specific fields (from the field matrix) */}
          {has('suite') && <TxtField label="Suite" value={f.suite} onChange={setV('suite')} />}
          {has('tenant_sqft') && <NumField label="Tenant SF" value={f.tenant_sqft} onChange={setV('tenant_sqft')} />}
          {has('annual_base_rent') && (
            <NumField
              label={type === 'ground_lease' ? 'Annual Ground Rent' : 'Base Rent (Annual)'}
              kind="currency" value={f.annual_base_rent} onChange={setV('annual_base_rent')} />
          )}
          {has('nnn_psf') && <NumField label="NNN PSF" kind="currency" decimals={2} value={f.nnn_psf} onChange={setV('nnn_psf')} />}
          {has('ti_annual') && <NumField label="TI (Annual)" kind="currency" value={f.ti_annual} onChange={setV('ti_annual')} />}

          {/* Common lease terms */}
          <TxtField label="Commencement" type="date" value={f.lease_commencement_date} onChange={setV('lease_commencement_date')} />
          <NumField label="Lease Term (years)" value={f.lease_term_years} onChange={setV('lease_term_years')} />
          <div>
            <label className={labelCls}>
              Expiration{!f.lease_expiration_date && derivedExp ? ' (auto from term)' : ''}
            </label>
            <input type="date" className={inputCls}
              value={f.lease_expiration_date || derivedExp || ''}
              onChange={(e) => setV('lease_expiration_date')(e.target.value)} />
            {f.lease_expiration_date && derivedExp && f.lease_expiration_date !== derivedExp && (
              <button type="button" onClick={() => setV('lease_expiration_date')('')}
                className="text-[11px] text-[#4A6B94] hover:underline mt-1">
                Reset to auto ({fmtSchedDate(derivedExp)})
              </button>
            )}
          </div>
          <NumField label="Rent Escalation" kind="percent" decimals={2} value={f.escalation_pct} onChange={setV('escalation_pct')} />
          <SelField label="Rent Bumps" value={f.rent_bump_frequency} onChange={setV('rent_bump_frequency')}>
            <option value="">—</option>
            {RENT_BUMP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelField>
          <NumField label="Number of Options" value={f.option_count} onChange={setV('option_count')} />
          <NumField label="Option Term (years)" value={f.option_term_years} onChange={setV('option_term_years')} />
          <NumField label="Reported Tenant Sales (annual)" kind="currency" className="col-span-2" value={f.reported_tenant_sales} onChange={setV('reported_tenant_sales')} />
          <SelField label="Source" value={f.source_type} onChange={setV('source_type')}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelField>
          <SelField label="Confidence" value={f.confidence} onChange={setV('confidence')}>
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelField>
        </div>

        <TxtAreaField label="Notes" value={f.notes} onChange={setV('notes')} rows={2} placeholder="Any other notes on this lease…" />

        {!type && <p className="text-xs text-gray-400">Select a lease type to reveal the relevant rent fields.</p>}

        {/* Live calculators — derived PSF + remaining term */}
        {type && (() => {
          const sqft = num(f.tenant_sqft);
          const annual = num(f.annual_base_rent);
          const baseP = annual != null && sqft ? annual / sqft : null;
          return (
            <div className="text-xs text-[#4A6B94] bg-[#8FA9C8]/10 rounded p-2 space-y-0.5">
              {baseP != null && <div>Base rent PSF (annual ÷ SF): <b>${baseP.toFixed(2)}</b></div>}
              {baseP != null && <div>All-in rent PSF: <b>{dash(allInRentPsf(baseP, num(f.nnn_psf)), (n) => `$${n.toFixed(2)}`)}</b></div>}
              {baseP != null && <div>Effective rent PSF (escalated over term): <b>{dash(
                effectiveRentPsf({ baseRentPsf: baseP, termMonths: num(f.lease_term_years) != null ? num(f.lease_term_years)! * 12 : null, escalationPct: num(f.escalation_pct) }),
                (n) => `$${n.toFixed(2)}`)}</b></div>}
              <div>Months remaining: <b>{dash(monthsRemaining(f.lease_expiration_date || null))}</b></div>
            </div>
          );
        })()}
        <RentScheduleCard
          commencementDate={f.lease_commencement_date || null}
          annualBaseRent={num(f.annual_base_rent)}
          escalationPct={num(f.escalation_pct)}
          bumpFrequency={f.rent_bump_frequency || null}
          termYears={num(f.lease_term_years)}
          optionCount={num(f.option_count)}
          optionTermYears={num(f.option_term_years)}
        />

        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2.5 rounded-lg bg-[#002147] text-white text-sm font-semibold shadow-sm hover:bg-[#00306a]">Save Lease</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2.5 rounded-lg border border-dashed border-[#8FA9C8] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10 hover:border-[#4A6B94] transition-colors">+ Add Lease Comp</button>
      {leases.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No lease comps yet.</p>}
      {leases.map((l) => (
        <div key={l.id} className="border border-gray-200 rounded-xl p-3.5 text-sm hover:border-[#8FA9C8] transition-colors">
          <div className="flex justify-between items-start">
            <div className="font-semibold text-[#002147]">{l.tenant_name || 'Unnamed tenant'}{l.suite ? ` · ${l.suite}` : ''}</div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => startEdit(l)} className="text-[#4A6B94] hover:underline">Edit</button>
              <button onClick={() => del(l.id)} className="text-red-500 hover:underline">Delete</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600">
            <span>Type: {l.lease_type ? LEASE_TYPE_LABEL[l.lease_type] : '—'}</span>
            <span>SF: {dash(l.tenant_sqft)}</span>
            <span>Rent/yr: {dash(l.annual_base_rent, (n) => formatCurrency(n))}</span>
            <span>NNN PSF: {dash(l.nnn_psf, (n) => `$${n.toFixed(2)}`)}</span>
            <span>Exp: {l.lease_expiration_date ?? '—'}</span>
            <span>Remaining: {dash(monthsRemaining(l.lease_expiration_date))} mo</span>
          </div>
          {l.notes && <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">{l.notes}</p>}
          <RentScheduleCard
            commencementDate={l.lease_commencement_date}
            annualBaseRent={l.annual_base_rent}
            escalationPct={l.escalation_pct}
            bumpFrequency={l.rent_bump_frequency}
            termYears={l.lease_term_years}
            optionCount={l.option_count}
            optionTermYears={l.option_term_years}
          />
          <AuditFooter created_by_id={l.created_by_id} created_at={l.created_at} updated_by_id={l.updated_by_id} updated_at={l.updated_at} />
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
  broker: '', financing: '', sale_condition: '', occupancy_at_sale: '', notes: '', source_type: 'manual', confidence: 'unverified',
};

const SalesTab: React.FC<{
  compId: string; sales: SaleComp[]; buildingSqft: number | null; userId: string | null; reload: () => void;
}> = ({ compId, sales, buildingSqft, userId, reload }) => {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ ...emptySale });
  const setV = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const startNew = () => { setF({ ...emptySale }); setEditing('new'); };
  const startEdit = (s: SaleComp) => {
    setF({
      sale_date: s.sale_date ?? '', sale_price: s.sale_price?.toString() ?? '', cap_rate: s.cap_rate?.toString() ?? '',
      noi: s.noi?.toString() ?? '', buyer_name: s.buyer_name ?? '', seller_name: s.seller_name ?? '',
      broker: s.broker ?? '', financing: s.financing ?? '', sale_condition: s.sale_condition ?? '',
      occupancy_at_sale: s.occupancy_at_sale?.toString() ?? '', notes: s.notes ?? '',
      source_type: s.source_type, confidence: s.confidence,
    });
    setEditing(s.id);
  };

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
      occupancy_at_sale: num(f.occupancy_at_sale), notes: str(f.notes),
      source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('sale_comp').insert(payload); }
    else { payload.updated_by_id = userId; await supabase.from('sale_comp').update(payload).eq('id', editing); }
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <TxtField label="Sale Date" type="date" value={f.sale_date} onChange={setV('sale_date')} />
          <NumField label="Sale Price" kind="currency" value={f.sale_price} onChange={setV('sale_price')} />
          <NumField label="NOI" kind="currency" value={f.noi} onChange={setV('noi')} />
          <NumField label="Cap Rate (blank = auto)" kind="percent" decimals={2} value={f.cap_rate} onChange={setV('cap_rate')}
            placeholder={derivedCap != null ? derivedCap.toFixed(2) : ''} />
          <TxtField label="Buyer" value={f.buyer_name} onChange={setV('buyer_name')} />
          <TxtField label="Seller" value={f.seller_name} onChange={setV('seller_name')} />
          <TxtField label="Broker" value={f.broker} onChange={setV('broker')} />
          <NumField label="Occupancy % at Sale" kind="percent" value={f.occupancy_at_sale} onChange={setV('occupancy_at_sale')} />
          <TxtField label="Financing" className="col-span-2" value={f.financing} onChange={setV('financing')} />
          <SelField label="Sale Condition" value={f.sale_condition} onChange={setV('sale_condition')}>
            <option value="">—</option>
            {SALE_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelField>
          <SelField label="Source" value={f.source_type} onChange={setV('source_type')}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelField>
          <TxtAreaField label="Notes" className="col-span-2" value={f.notes} onChange={setV('notes')} rows={2} placeholder="Any other notes on this sale…" />
        </div>
        <div className="text-xs text-[#4A6B94] bg-[#8FA9C8]/10 rounded p-2 space-y-0.5">
          <div>Derived cap rate (NOI ÷ price): <b>{dash(derivedCap, (n) => `${n.toFixed(2)}%`)}</b></div>
          <div>Price PSF (÷ building SF): <b>{dash(derivedPpsf, (n) => `$${n.toFixed(0)}`)}</b></div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2.5 rounded-lg bg-[#002147] text-white text-sm font-semibold shadow-sm hover:bg-[#00306a]">Save Sale</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2.5 rounded-lg border border-dashed border-[#8FA9C8] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10 hover:border-[#4A6B94] transition-colors">+ Add Sale Comp</button>
      {sales.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No sale comps yet.</p>}
      {sales.map((s) => (
        <div key={s.id} className="border border-gray-200 rounded-xl p-3.5 text-sm hover:border-[#8FA9C8] transition-colors">
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
          {s.notes && <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">{s.notes}</p>}
          <AuditFooter created_by_id={s.created_by_id} created_at={s.created_at} updated_by_id={s.updated_by_id} updated_at={s.updated_at} />
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
  guidance: '', notes: '', source_url: '', source_type: 'om', confidence: 'reported',
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
      notes: o.notes ?? '', source_url: o.source_url ?? '', source_type: o.source_type, confidence: o.confidence,
    });
    setEditing(o.id);
  };

  const save = async () => {
    const payload: any = {
      comp_property_id: compId, title: str(f.title), broker_name: str(f.broker_name),
      brokerage: str(f.brokerage), list_date: f.list_date || null, asking_price: num(f.asking_price),
      asking_cap_rate: num(f.asking_cap_rate), guidance: str(f.guidance), notes: str(f.notes),
      source_url: str(f.source_url), source_type: f.source_type, confidence: f.confidence,
    };
    if (editing === 'new') { payload.created_by_id = userId; await supabase.from('operating_memorandum').insert(payload); }
    else { payload.updated_by_id = userId; await supabase.from('operating_memorandum').update(payload).eq('id', editing); }
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Field label="Title" className="col-span-2"><input className={inputCls} value={f.title} onChange={set('title')} /></Field>
          <Field label="Broker"><input className={inputCls} value={f.broker_name} onChange={set('broker_name')} /></Field>
          <Field label="Brokerage"><input className={inputCls} value={f.brokerage} onChange={set('brokerage')} /></Field>
          <Field label="List Date"><input type="date" className={inputCls} value={f.list_date} onChange={set('list_date')} /></Field>
          <Field label="Asking Price"><input className={inputCls} value={f.asking_price} onChange={set('asking_price')} /></Field>
          <Field label="Asking Cap %"><input className={inputCls} value={f.asking_cap_rate} onChange={set('asking_cap_rate')} /></Field>
          <Field label="Source URL"><input className={inputCls} value={f.source_url} onChange={set('source_url')} /></Field>
          <Field label="Guidance" className="col-span-2">
            <textarea className={inputCls} rows={3} value={f.guidance} onChange={set('guidance') as any} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <textarea className={inputCls} rows={2} value={f.notes} onChange={set('notes') as any} placeholder="Any other notes on this OM…" />
          </Field>
        </div>
        <p className="text-xs text-gray-400">OM PDF files attach via the property's Dropbox folder (Phase 2).</p>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2.5 rounded-lg bg-[#002147] text-white text-sm font-semibold shadow-sm hover:bg-[#00306a]">Save OM</button>
          <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={startNew} className="w-full py-2.5 rounded-lg border border-dashed border-[#8FA9C8] text-[#4A6B94] text-sm font-medium hover:bg-[#8FA9C8]/10 hover:border-[#4A6B94] transition-colors">+ Add Operating Memorandum</button>
      {oms.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No OMs yet.</p>}
      {oms.map((o) => (
        <div key={o.id} className="border border-gray-200 rounded-xl p-3.5 text-sm hover:border-[#8FA9C8] transition-colors">
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
          {o.notes && <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">{o.notes}</p>}
          <AuditFooter created_by_id={o.created_by_id} created_at={o.created_at} updated_by_id={o.updated_by_id} updated_at={o.updated_at} />
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
        <div key={n.id} className="border border-gray-200 rounded-xl p-3.5 text-sm hover:border-[#8FA9C8] transition-colors">
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
