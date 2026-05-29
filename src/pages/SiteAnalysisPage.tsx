import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePermissions } from '../hooks/usePermissions';
import { geocodingService } from '../services/geocodingService';
import SiteSubmitSelector from '../components/SiteSubmitSelector';

// Starbucks Site Analysis — enrich a proposed site and compare it against the
// top analogous existing stores (same store type, same state) by demographics.
// Backed by the esri-geoenrich edge function + find_analogous_stores RPC.

const NAVY = '#002147';
const STEEL = '#4A6B94';

type StoreType = 'DT' | 'Cafe' | 'DTO';
type InputMode = 'site_submit' | 'address';

type Demographics = Record<string, number | null>;

interface Tapestry { code: string | null; name: string | null }

interface Analog {
  store_number: string;
  store_name: string | null;
  city: string | null;
  state: string | null;
  store_type: string | null;
  tapestry_code: string | null;
  tapestry_name: string | null;
  match_score: number;
  distance: number;
  demographics: Demographics;
}

interface Subject {
  label: string;
  latitude: number;
  longitude: number;
  state: string | null;
  demographics: Demographics;
  tapestry: Tapestry | null;
}

// Nearby-store counts keyed by store_type for one location.
interface CountRow {
  store_type: string;
  within_1mi: number;
  within_3mi: number;
  within_5min: number;
  within_10min: number;
}
type NearbyByType = Record<string, CountRow>;
interface Nearby {
  subject: NearbyByType;
  analogs: Record<string, NearbyByType>;
}

const STORE_TYPES = ['DT', 'Cafe', 'DTO'] as const;

const AREAS = [
  { key: '1_mile', label: '1 mile', countField: 'within_1mi' },
  { key: '3_mile', label: '3 mile', countField: 'within_3mi' },
  { key: '5min_drive', label: '5 min drive', countField: 'within_5min' },
  { key: '10min_drive', label: '10 min drive', countField: 'within_10min' },
] as const;

const METRICS = [
  { prefix: 'pop', label: 'Population', fmt: fmtInt },
  { prefix: 'median_age', label: 'Median age', fmt: fmtAge },
  { prefix: 'hh_income_median', label: 'Median HH income', fmt: fmtMoney },
  { prefix: 'educ_some_college_plus_pct', label: 'Some college+ %', fmt: fmtPct },
  { prefix: 'employees', label: 'Employees (daytime)', fmt: fmtInt },
] as const;

function fmtInt(v: number | null | undefined) {
  return v == null ? '—' : Math.round(v).toLocaleString();
}
function fmtMoney(v: number | null | undefined) {
  return v == null ? '—' : '$' + Math.round(v).toLocaleString();
}
function fmtPct(v: number | null | undefined) {
  return v == null ? '—' : v.toFixed(1) + '%';
}
function fmtAge(v: number | null | undefined) {
  return v == null ? '—' : v.toFixed(1);
}

function scoreColor(score: number): string {
  if (score >= 80) return '#1B7F4B';
  if (score >= 65) return STEEL;
  return '#A27B5C';
}

// Small "i" icon that reveals the match-score methodology on hover or click.
function ScoreInfo() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-label="How the match score is calculated"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none text-white cursor-help"
        style={{ backgroundColor: STEEL }}
      >
        i
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 p-3 rounded-md shadow-lg border border-gray-200 bg-white text-left z-50" style={{ whiteSpace: 'normal' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: NAVY }}>How the match score works</div>
          <p className="text-xs font-normal text-gray-600 leading-snug">
            We compare <span className="font-medium">20 data points</span> — 5 metrics
            (population, median age, median HH income, some-college %, employees) across 4 trade
            areas (1mi, 3mi, 5min, 10min). Each gap is standardized by that metric's standard
            deviation across the candidate pool, so every metric counts equally. The standardized
            gaps combine into one distance, mapped to 0–100:
            {' '}<span className="font-medium">100 = identical profile</span>; ~50 ≈ one standard
            deviation off per metric on average.
          </p>
        </div>
      )}
    </span>
  );
}

export default function SiteAnalysisPage() {
  const { hasPermission, loading: permsLoading } = usePermissions();

  const [inputMode, setInputMode] = useState<InputMode>('site_submit');
  const [siteSubmitId, setSiteSubmitId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [storeType, setStoreType] = useState<StoreType>('DT');
  const [sameStateOnly, setSameStateOnly] = useState(true);
  const [sameTapestryOnly, setSameTapestryOnly] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [analogs, setAnalogs] = useState<Analog[]>([]);
  const [nearby, setNearby] = useState<Nearby | null>(null);

  useEffect(() => {
    document.title = 'Site Analysis | OVIS';
  }, []);

  if (permsLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }
  if (!hasPermission('can_view_site_analysis')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">You don't have access to Starbucks site analysis.</div>
      </div>
    );
  }

  async function resolveSubjectLocation(): Promise<{ label: string; lat: number; lng: number; state: string | null }> {
    if (inputMode === 'address') {
      if (!address.trim()) throw new Error('Enter an address to analyze.');
      const result = await geocodingService.geocodeAddress(address.trim());
      if (!('latitude' in result)) {
        throw new Error('Could not geocode that address.');
      }
      return {
        label: result.formatted_address || address.trim(),
        lat: result.latitude,
        lng: result.longitude,
        state: result.state ?? null,
      };
    }

    if (!siteSubmitId) throw new Error('Select a site submit to analyze.');
    const { data: ss, error: ssErr } = await supabase
      .from('site_submit')
      .select('id, site_submit_name, code, property_id, sf_property_latitude, sf_property_longitude, verified_latitude, verified_longitude')
      .eq('id', siteSubmitId)
      .single();
    if (ssErr || !ss) throw new Error('Could not load that site submit.');

    let propState: string | null = null;
    let propLat: number | null = null;
    let propLng: number | null = null;
    if (ss.property_id) {
      const { data: prop } = await supabase
        .from('property')
        .select('latitude, longitude, verified_latitude, verified_longitude, state')
        .eq('id', ss.property_id)
        .single();
      if (prop) {
        propState = prop.state ?? null;
        propLat = prop.verified_latitude ?? prop.latitude ?? null;
        propLng = prop.verified_longitude ?? prop.longitude ?? null;
      }
    }

    const lat = ss.verified_latitude ?? ss.sf_property_latitude ?? propLat;
    const lng = ss.verified_longitude ?? ss.sf_property_longitude ?? propLng;
    if (lat == null || lng == null) throw new Error('This site submit has no coordinates to analyze.');

    return {
      label: ss.site_submit_name || ss.code || 'Selected site',
      lat,
      lng,
      state: propState,
    };
  }

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    setSubject(null);
    setAnalogs([]);
    setNearby(null);
    try {
      const loc = await resolveSubjectLocation();

      // 1. Enrich the subject site (1mi + 3mi rings, 5min + 10min drive, with education)
      const { data: enrich, error: enrichErr } = await supabase.functions.invoke('esri-geoenrich', {
        body: {
          property_id: siteSubmitId || 'subject',
          latitude: loc.lat,
          longitude: loc.lng,
          custom_radii: [1, 3],
          custom_drive_times: [5, 10],
          include_education: true,
        },
      });
      if (enrichErr) throw new Error(`Enrichment failed: ${enrichErr.message}`);
      if (!enrich?.success || !enrich.demographics) {
        throw new Error(`Enrichment failed: ${enrich?.error ?? 'no data returned'}`);
      }
      const subjectDemographics = enrich.demographics as Demographics;
      const subjectTapestry: Tapestry | null = enrich.tapestry?.code
        ? { code: enrich.tapestry.code, name: enrich.tapestry.name ?? null }
        : null;
      const iso = (enrich.isochrones ?? {}) as Record<string, unknown>;

      // 2. Find the top 3 analogous stores (optionally constrained to the subject's Tapestry segment)
      const { data: matches, error: rpcErr } = await supabase.rpc('find_analogous_stores', {
        p_subject: subjectDemographics,
        p_store_type: storeType,
        p_state: sameStateOnly ? loc.state : null,
        p_limit: 3,
        p_tapestry_code: sameTapestryOnly ? (subjectTapestry?.code ?? null) : null,
      });
      if (rpcErr) throw new Error(`Match failed: ${rpcErr.message}`);
      const analogList = (matches ?? []) as Analog[];

      // 3. Nearby Starbucks counts by type — subject (live isochrones) + each analog (stored isochrones)
      const toByType = (rows: CountRow[] | null): NearbyByType =>
        (rows ?? []).reduce((acc, r) => { acc[r.store_type] = r; return acc; }, {} as NearbyByType);

      const [subjCounts, ...analogCounts] = await Promise.all([
        supabase.rpc('count_nearby_stores_by_type', {
          p_lat: loc.lat,
          p_lng: loc.lng,
          p_iso_5min: iso['5min_drive'] ?? null,
          p_iso_10min: iso['10min_drive'] ?? null,
          p_exclude_store: null,
        }),
        ...analogList.map((a) =>
          supabase.rpc('count_nearby_for_store', { p_store_number: a.store_number })
        ),
      ]);

      const nearbyData: Nearby = { subject: toByType(subjCounts.data as CountRow[]), analogs: {} };
      analogList.forEach((a, i) => {
        nearbyData.analogs[a.store_number] = toByType(analogCounts[i]?.data as CountRow[]);
      });

      setSubject({
        label: loc.label,
        latitude: loc.lat,
        longitude: loc.lng,
        state: loc.state,
        demographics: subjectDemographics,
        tapestry: subjectTapestry,
      });
      setAnalogs(analogList);
      setNearby(nearbyData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setRunning(false);
    }
  }

  const canRun = inputMode === 'address' ? address.trim().length > 0 : !!siteSubmitId;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1" style={{ color: NAVY }}>Starbucks Site Analysis</h1>
        <p className="text-sm text-gray-500 mb-6">
          Compare a proposed site to the top 3 demographically analogous existing stores of the same type.
        </p>

        {/* Input panel */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputMode('site_submit')}
              className="px-3 py-1.5 rounded-md text-sm font-medium"
              style={inputMode === 'site_submit'
                ? { backgroundColor: NAVY, color: '#fff' }
                : { backgroundColor: 'transparent', color: STEEL, border: '1px solid #8FA9C8' }}
            >
              Existing site submit
            </button>
            <button
              onClick={() => setInputMode('address')}
              className="px-3 py-1.5 rounded-md text-sm font-medium"
              style={inputMode === 'address'
                ? { backgroundColor: NAVY, color: '#fff' }
                : { backgroundColor: 'transparent', color: STEEL, border: '1px solid #8FA9C8' }}
            >
              Address
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {inputMode === 'site_submit' ? (
                <SiteSubmitSelector value={siteSubmitId} onChange={setSiteSubmitId} label="Subject site" />
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Subject address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="1234 Peachtree St, Atlanta, GA"
                    className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-[#4A6B94] focus:ring-[#4A6B94]"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Store type</label>
                <select
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as StoreType)}
                  className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-[#4A6B94] focus:ring-[#4A6B94]"
                >
                  <option value="DT">DT (Drive-Thru)</option>
                  <option value="Cafe">Cafe</option>
                  <option value="DTO">DTO</option>
                </select>
              </div>
              <div className="flex flex-col justify-end pb-1 gap-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sameStateOnly}
                    onChange={(e) => setSameStateOnly(e.target.checked)}
                  />
                  Same state only
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sameTapestryOnly}
                    onChange={(e) => setSameTapestryOnly(e.target.checked)}
                  />
                  Same Tapestry segment
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={runAnalysis}
              disabled={!canRun || running}
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: NAVY }}
            >
              {running ? 'Analyzing…' : 'Find analogous stores'}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm rounded-md px-3 py-2" style={{ color: '#8a3b2e', backgroundColor: '#f8ede9', border: '1px solid #e3c4b8' }}>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {subject && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <div className="text-sm text-gray-500">
                Subject: <span className="font-medium text-gray-800">{subject.label}</span>
                {subject.state && <span className="text-gray-400"> · {subject.state}</span>}
                <span className="text-gray-400"> · {storeType}</span>
                {subject.tapestry?.code && (
                  <span className="text-gray-400"> · Tapestry {subject.tapestry.code} {subject.tapestry.name}</span>
                )}
              </div>
              {analogs.length < 3 && (
                <div className="text-xs mt-1" style={{ color: '#A27B5C' }}>
                  Only {analogs.length} matching {storeType} store{analogs.length === 1 ? '' : 's'} found
                  {sameStateOnly && subject.state ? ` in ${subject.state}` : ''}.
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: '#f4f6f9' }}>
                    <th className="px-4 py-2 font-semibold" style={{ color: NAVY }}>Metric</th>
                    <th className="px-4 py-2 font-semibold text-right" style={{ color: NAVY }}>
                      Subject
                    </th>
                    {analogs.map((a) => (
                      <th key={a.store_number} className="px-4 py-2 font-semibold text-right" style={{ color: NAVY }}>
                        <div>#{a.store_number}</div>
                        <div className="font-normal text-xs text-gray-500">{a.store_name}</div>
                        <div className="font-normal text-xs text-gray-400">{a.city}{a.state ? `, ${a.state}` : ''}</div>
                        <div className="mt-1">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-white text-xs font-semibold"
                            style={{ backgroundColor: scoreColor(Number(a.match_score)) }}
                          >
                            {Number(a.match_score).toFixed(0)}% match
                          </span>
                          <ScoreInfo />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100" style={{ backgroundColor: '#fafbfc' }}>
                    <td className="px-4 py-1.5 text-gray-600">Tapestry segment (1-mi)</td>
                    <td className="px-4 py-1.5 text-right">
                      {subject.tapestry?.code ? (
                        <span title={subject.tapestry.name ?? ''}>
                          <span className="font-medium text-gray-900">{subject.tapestry.code}</span>{' '}
                          <span className="text-xs text-gray-500">{subject.tapestry.name}</span>
                        </span>
                      ) : '—'}
                    </td>
                    {analogs.map((a) => {
                      const match = !!subject.tapestry?.code && a.tapestry_code === subject.tapestry.code;
                      return (
                        <td key={a.store_number + '-tap'} className="px-4 py-1.5 text-right">
                          <span title={a.tapestry_name ?? ''}>
                            <span className="font-medium" style={{ color: match ? '#1B7F4B' : '#374151' }}>
                              {a.tapestry_code ?? '—'}
                            </span>{' '}
                            <span className="text-xs text-gray-500">{a.tapestry_name}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {AREAS.map((area) => (
                    <Fragment key={area.key}>
                      <tr>
                        <td
                          colSpan={2 + analogs.length}
                          className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide"
                          style={{ color: STEEL }}
                        >
                          {area.label}
                        </td>
                      </tr>
                      {METRICS.map((m) => {
                        const col = `${m.prefix}_${area.key}`;
                        return (
                          <tr key={col} className="border-t border-gray-100">
                            <td className="px-4 py-1.5 text-gray-600">{m.label}</td>
                            <td className="px-4 py-1.5 text-right font-medium text-gray-900">
                              {m.fmt(subject.demographics[col])}
                            </td>
                            {analogs.map((a) => (
                              <td key={a.store_number + col} className="px-4 py-1.5 text-right text-gray-700">
                                {m.fmt(a.demographics?.[col] as number | null)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Nearby Starbucks counts by type */}
        {subject && nearby && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className="px-5 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold" style={{ color: NAVY }}>Nearby Starbucks (count by type)</div>
              <div className="text-xs text-gray-500">
                Existing stores around each location. Analog counts exclude the store itself.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: '#f4f6f9' }}>
                    <th className="px-4 py-2 font-semibold" style={{ color: NAVY }}>Type</th>
                    <th className="px-4 py-2 font-semibold text-right" style={{ color: NAVY }}>Subject</th>
                    {analogs.map((a) => (
                      <th key={a.store_number} className="px-4 py-2 font-semibold text-right" style={{ color: NAVY }}>
                        #{a.store_number}
                        <div className="font-normal text-xs text-gray-400">{a.city}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((area) => (
                    <Fragment key={area.key}>
                      <tr>
                        <td
                          colSpan={2 + analogs.length}
                          className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide"
                          style={{ color: STEEL }}
                        >
                          {area.label}
                        </td>
                      </tr>
                      {STORE_TYPES.map((t) => {
                        const subjN = nearby.subject[t]?.[area.countField] ?? 0;
                        return (
                          <tr key={area.key + t} className="border-t border-gray-100">
                            <td className="px-4 py-1.5 text-gray-600">{t}</td>
                            <td className="px-4 py-1.5 text-right font-medium" style={{ color: subjN === 0 ? '#cbd5e1' : '#111827' }}>
                              {subjN}
                            </td>
                            {analogs.map((a) => {
                              const n = nearby.analogs[a.store_number]?.[t]?.[area.countField] ?? 0;
                              return (
                                <td key={a.store_number + area.key + t} className="px-4 py-1.5 text-right" style={{ color: n === 0 ? '#cbd5e1' : '#374151' }}>
                                  {n}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
