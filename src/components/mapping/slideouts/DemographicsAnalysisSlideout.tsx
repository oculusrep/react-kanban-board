import React, { useEffect, useMemo, useState } from 'react';
import {
  usePropertyGeoenrichment,
  GeoenrichmentResult,
  DemographicData,
} from '../../../hooks/usePropertyGeoenrichment';
import DemographicRingsOverlay from '../layers/DemographicRingsOverlay';
import DemographicIsochronesOverlay from '../layers/DemographicIsochronesOverlay';

// Phases 1+2 of the demographic-layers feature: rings and drive-time
// isochrones. Custom-polygon mode will be added as a third selector in
// this same shell. See docs/DEMOGRAPHIC_RING_LAYERS_PLAN.md.

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  border: '#EAEEF3',
};

const AVAILABLE_RADII = [1, 2, 3, 5, 10] as const;
const DEFAULT_RADII = [1, 3, 5];

const AVAILABLE_DRIVE_TIMES = [5, 10, 15] as const;
const DEFAULT_DRIVE_TIMES = [5, 10, 15];

const METRIC_ROWS: Array<{
  label: string;
  prefix: string;
  format: (n: number | null | undefined) => string;
}> = [
  { label: 'Population', prefix: 'pop', format: (n) => formatNumber(n) },
  { label: 'Daytime pop', prefix: 'daytime_pop', format: (n) => formatNumber(n) },
  { label: 'Households', prefix: 'households', format: (n) => formatNumber(n) },
  { label: 'Median HH inc.', prefix: 'hh_income_median', format: (n) => formatCurrency(n) },
  { label: 'Avg HH inc.', prefix: 'hh_income_avg', format: (n) => formatCurrency(n) },
  { label: 'Employees', prefix: 'employees', format: (n) => formatNumber(n) },
  { label: 'Median age', prefix: 'median_age', format: (n) => formatAge(n) },
];

interface Props {
  isOpen: boolean;
  map: google.maps.Map | null;
  coordinates: { lat: number; lng: number } | null;
  onClose: () => void;
}

const formatNumber = (n: number | null | undefined) =>
  n == null ? '—' : Math.round(n).toLocaleString();

const formatCurrency = (n: number | null | undefined) =>
  n == null
    ? '—'
    : n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

const formatAge = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1);

function getRingValue(
  demographics: DemographicData | null,
  prefix: string,
  miles: number,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_${miles}_mile`
  ];
  return v ?? null;
}

function getDriveTimeValue(
  demographics: DemographicData | null,
  prefix: string,
  minutes: number,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_${minutes}min_drive`
  ];
  return v ?? null;
}

const DemographicsAnalysisSlideout: React.FC<Props> = ({
  isOpen,
  map,
  coordinates,
  onClose,
}) => {
  const [selectedRadii, setSelectedRadii] = useState<number[]>(DEFAULT_RADII);
  const [selectedDriveTimes, setSelectedDriveTimes] =
    useState<number[]>(DEFAULT_DRIVE_TIMES);
  const [result, setResult] = useState<GeoenrichmentResult | null>(null);
  const { isEnriching, enrichError, enrichLocation, clearError } =
    usePropertyGeoenrichment();

  // Reset state whenever a new location is opened.
  useEffect(() => {
    if (isOpen && coordinates) {
      setResult(null);
      setSelectedRadii(DEFAULT_RADII);
      setSelectedDriveTimes(DEFAULT_DRIVE_TIMES);
      clearError();
    }
  }, [isOpen, coordinates?.lat, coordinates?.lng]);

  const sortedRadii = useMemo(
    () => [...selectedRadii].sort((a, b) => a - b),
    [selectedRadii],
  );

  const sortedDriveTimes = useMemo(
    () => [...selectedDriveTimes].sort((a, b) => a - b),
    [selectedDriveTimes],
  );

  if (!isOpen || !coordinates) return null;

  const toggleRadius = (r: number) => {
    setSelectedRadii((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
    // Demographics now reflect a different radius set — clear stale stats.
    setResult(null);
  };

  const toggleDriveTime = (m: number) => {
    setSelectedDriveTimes((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
    // Drive-time polygons + stats both depend on the API response, so a
    // selection change after a fetch only filters what's already loaded;
    // we don't invalidate the result here (unlike radii, which would
    // require a re-fetch to draw a new ring set).
  };

  const handleFetch = async () => {
    if (!coordinates || (selectedRadii.length === 0 && selectedDriveTimes.length === 0)) {
      return;
    }
    clearError();
    const r = await enrichLocation(
      coordinates.lat,
      coordinates.lng,
      sortedRadii,
      sortedDriveTimes,
    );
    if (r) setResult(r);
  };

  const tapestry = result?.tapestry;
  const demographics = result?.demographics ?? null;

  return (
    <>
      <DemographicRingsOverlay
        map={map}
        center={coordinates}
        radiiMiles={sortedRadii}
        isVisible
      />
      <DemographicIsochronesOverlay
        map={map}
        isochrones={result?.isochrones ?? null}
        selectedDriveTimes={sortedDriveTimes}
        isVisible
      />

      <aside
        className="fixed top-0 right-0 h-full w-[420px] z-[50] shadow-2xl flex flex-col"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <header
          className="px-5 py-4 border-b flex items-start justify-between"
          style={{ borderColor: BRAND.border }}
        >
          <div className="min-w-0">
            <div
              className="text-xs uppercase tracking-wide"
              style={{ color: BRAND.slate }}
            >
              Demographics
            </div>
            <h2
              className="text-lg font-semibold mt-0.5"
              style={{ color: BRAND.midnight }}
            >
              Ad-hoc location
            </h2>
            <div
              className="text-xs font-mono mt-1"
              style={{ color: BRAND.steel }}
            >
              {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: BRAND.steel }}
            >
              Ring radii (miles)
            </div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_RADII.map((r) => {
                const active = selectedRadii.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRadius(r)}
                    className="px-3 py-1.5 text-sm rounded-full border transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: BRAND.midnight,
                            color: '#FFFFFF',
                            borderColor: BRAND.midnight,
                          }
                        : {
                            backgroundColor: 'transparent',
                            color: BRAND.slate,
                            borderColor: BRAND.slate,
                          }
                    }
                  >
                    {r} mi
                  </button>
                );
              })}
            </div>

            <div
              className="text-xs font-semibold uppercase tracking-wide mt-4 mb-2"
              style={{ color: BRAND.steel }}
            >
              Drive times (minutes)
            </div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_DRIVE_TIMES.map((m) => {
                const active = selectedDriveTimes.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleDriveTime(m)}
                    className="px-3 py-1.5 text-sm rounded-full border transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: BRAND.steel,
                            color: '#FFFFFF',
                            borderColor: BRAND.steel,
                          }
                        : {
                            backgroundColor: 'transparent',
                            color: BRAND.slate,
                            borderColor: BRAND.slate,
                          }
                    }
                  >
                    {m} min
                  </button>
                );
              })}
            </div>
            <div
              className="text-[11px] mt-1.5"
              style={{ color: BRAND.slate }}
            >
              Drive-time polygons cost more ESRI credits than rings — keep this list
              tight.
            </div>

            <button
              type="button"
              onClick={handleFetch}
              disabled={
                isEnriching ||
                (selectedRadii.length === 0 && selectedDriveTimes.length === 0)
              }
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: BRAND.midnight, color: '#FFFFFF' }}
            >
              {isEnriching ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Fetching ESRI demographics…
                </>
              ) : result ? (
                'Refresh demographics'
              ) : (
                'Fetch demographics'
              )}
            </button>
            {enrichError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {enrichError}
                <button onClick={clearError} className="ml-2 underline">
                  Dismiss
                </button>
              </div>
            )}
          </section>

          {tapestry?.code && (
            <section
              className="rounded-md p-3 border"
              style={{ borderColor: BRAND.border, backgroundColor: '#F8FAFC' }}
            >
              <div
                className="text-xs uppercase tracking-wide mb-1"
                style={{ color: BRAND.slate }}
              >
                Tapestry segment
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: BRAND.midnight }}
              >
                {tapestry.code} — {tapestry.name}
              </div>
              {tapestry.lifemodes && (
                <div className="text-xs mt-0.5" style={{ color: BRAND.steel }}>
                  {tapestry.lifemodes}
                </div>
              )}
            </section>
          )}

          {demographics && sortedRadii.length > 0 && (
            <section>
              <div
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: BRAND.steel }}
              >
                Demographics by ring
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: BRAND.slate }}>
                      <th className="text-left font-medium pb-1.5">Metric</th>
                      {sortedRadii.map((r) => (
                        <th
                          key={r}
                          className="text-right font-medium pb-1.5 pl-2"
                        >
                          {r} mi
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ROWS.map((row) => (
                      <tr
                        key={row.prefix}
                        className="border-t"
                        style={{ borderColor: BRAND.border }}
                      >
                        <td
                          className="py-1.5 text-left"
                          style={{ color: BRAND.steel }}
                        >
                          {row.label}
                        </td>
                        {sortedRadii.map((r) => (
                          <td
                            key={r}
                            className="py-1.5 text-right pl-2 font-medium"
                            style={{ color: BRAND.midnight }}
                          >
                            {row.format(getRingValue(demographics, row.prefix, r))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {demographics && sortedDriveTimes.length > 0 && (
            <section>
              <div
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: BRAND.steel }}
              >
                Demographics by drive time
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: BRAND.slate }}>
                      <th className="text-left font-medium pb-1.5">Metric</th>
                      {sortedDriveTimes.map((m) => (
                        <th
                          key={m}
                          className="text-right font-medium pb-1.5 pl-2"
                        >
                          {m} min
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ROWS.map((row) => (
                      <tr
                        key={row.prefix}
                        className="border-t"
                        style={{ borderColor: BRAND.border }}
                      >
                        <td
                          className="py-1.5 text-left"
                          style={{ color: BRAND.steel }}
                        >
                          {row.label}
                        </td>
                        {sortedDriveTimes.map((m) => (
                          <td
                            key={m}
                            className="py-1.5 text-right pl-2 font-medium"
                            style={{ color: BRAND.midnight }}
                          >
                            {row.format(getDriveTimeValue(demographics, row.prefix, m))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {demographics && (
            <div className="text-[11px]" style={{ color: BRAND.slate }}>
              Source: ESRI GeoEnrichment · ad-hoc lookup, nothing saved.
            </div>
          )}

          {!demographics && !isEnriching && !enrichError && (
            <div
              className="text-sm italic text-center py-4"
              style={{ color: BRAND.slate }}
            >
              Pick your ring radii and click <strong>Fetch demographics</strong> to
              call ESRI.
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default DemographicsAnalysisSlideout;
