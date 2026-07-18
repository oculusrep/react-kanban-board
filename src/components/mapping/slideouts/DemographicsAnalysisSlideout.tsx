import React, { useEffect, useMemo, useState } from 'react';
import {
  usePropertyGeoenrichment,
  GeoenrichmentResult,
  DemographicData,
} from '../../../hooks/usePropertyGeoenrichment';
import DemographicRingsOverlay from '../layers/DemographicRingsOverlay';
import DemographicIsochronesOverlay from '../layers/DemographicIsochronesOverlay';
import DemographicPolygonOverlay from '../layers/DemographicPolygonOverlay';
import DemographicsAnalysisModal from './DemographicsAnalysisModal';
import ScreenshotDemographicsModal from './ScreenshotDemographicsModal';
import DriveTimeDemosScreenshotModal from './DriveTimeDemosScreenshotModal';
import MunicipalUnitsScreenshotModal from './MunicipalUnitsScreenshotModal';
import { useDemographicsStyleDefaults } from '../../../hooks/useDemographicsStyleDefaults';

// All three modes of the demographic-layers feature:
//   - rings (around the right-clicked point)
//   - drive-time isochrones (ESRI Service Area polygons)
//   - custom polygon (user-drawn arbitrary shape)
// See docs/DEMOGRAPHIC_RING_LAYERS_PLAN.md.

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  border: '#EAEEF3',
};

const AVAILABLE_RADII = [1, 2, 3, 5, 10] as const;
const DEFAULT_RADII = [1, 3, 5];

const AVAILABLE_DRIVE_TIMES = [5, 7, 10, 15] as const;
const DEFAULT_DRIVE_TIMES = [5, 10, 15];

// The "DT Demos" screenshot button always pulls these three drive-time
// catchments from ESRI, independent of the user's selected drive times.
const DT_DEMOS_DRIVE_TIMES = [5, 7, 10];

// All ring + drive-time overlays default to red. The user can recolor
// per-item via the Layer style panel.
const DEFAULT_OVERLAY_COLOR = '#DC2626';
const DEFAULT_STROKE_OPACITY = 0.85;
const DEFAULT_FILL_OPACITY = 0.1;
const DEFAULT_STROKE_WEIGHT = 2;

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
  { label: 'Some college+ %', prefix: 'educ_some_college_plus_pct', format: (n) => formatPercent(n) },
];

interface Props {
  isOpen: boolean;
  map: google.maps.Map | null;
  coordinates: { lat: number; lng: number } | null;
  onClose: () => void;
  // Optional prefilled state when opened from a cached-demographics pin
  // click. The slideout skips its initial reset and seeds rings or polygon
  // state from the cached row.
  prefilled?: PrefilledCacheState | null;
}

export interface PrefilledCacheState {
  mode: 'rings' | 'polygon';
  result: GeoenrichmentResult;
  // Rings mode:
  radii?: number[];
  driveTimes?: number[];
  // Polygon mode:
  polygonCoordinates?: number[][][];
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

const formatPercent = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toFixed(1)}%`;

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

function getPolygonValue(
  demographics: DemographicData | null,
  prefix: string,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_polygon`
  ];
  return v ?? null;
}

// Short relative-time string for the cached badge. We round generously
// because the precise minute the cache was populated isn't meaningful
// to the user — they want "fresh", "today", "a few days ago".
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

interface CachedBadgeProps {
  cachedAt: string;
  onRefresh: () => void;
  disabled: boolean;
}

const CachedBadge: React.FC<CachedBadgeProps> = ({ cachedAt, onRefresh, disabled }) => {
  // Soft mint background to distinguish "this didn't cost you" from
  // the rest of the slideout, but not loud enough to be alarming.
  return (
    <div
      className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-xs"
      style={{
        backgroundColor: '#ECFDF5',
        borderColor: '#A7F3D0',
        color: '#065F46',
      }}
    >
      <span>
        ✓ Cached · pulled {relativeTime(cachedAt)} · no ESRI credit charged
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled}
        className="underline whitespace-nowrap disabled:opacity-50"
      >
        Refresh from ESRI
      </button>
    </div>
  );
};

const DemographicsAnalysisSlideout: React.FC<Props> = ({
  isOpen,
  map,
  coordinates,
  onClose,
  prefilled,
}) => {
  // User-persisted style defaults (localStorage). Falls back to the
  // hardcoded red palette when nothing has been saved.
  const { defaults: styleDefaults, saveAsDefaults, resetToFactory } =
    useDemographicsStyleDefaults();

  const [selectedRadii, setSelectedRadii] = useState<number[]>(DEFAULT_RADII);
  const [selectedDriveTimes, setSelectedDriveTimes] =
    useState<number[]>(DEFAULT_DRIVE_TIMES);
  const [result, setResult] = useState<GeoenrichmentResult | null>(null);
  // Polygon-mode state lives separately from rings/drive-times so the
  // two flows don't clobber each other's results.
  const [polygonDrawing, setPolygonDrawing] = useState(false);
  const [polygonCoords, setPolygonCoords] = useState<number[][][] | null>(null);
  const [polygonResult, setPolygonResult] = useState<GeoenrichmentResult | null>(null);

  // Per-item colors keyed by selector value (ring radius or drive-time
  // minutes). Unset keys fall back to DEFAULT_OVERLAY_COLOR. Persisting
  // across selection toggles means re-checking a ring keeps your chosen
  // color.
  const [ringColors, setRingColors] = useState<Record<number, string>>(
    styleDefaults.ringColors,
  );
  // Drive-time bands support per-band fill color, line color, and fill
  // opacity. Line color defaults to the fill color when unset, so a user
  // who only picks one color still gets a matching outline.
  const [driveTimeFillColors, setDriveTimeFillColors] = useState<Record<number, string>>(
    styleDefaults.driveTimeFillColors,
  );
  const [driveTimeLineColors, setDriveTimeLineColors] = useState<Record<number, string>>(
    styleDefaults.driveTimeLineColors,
  );
  const [driveTimeFillOpacities, setDriveTimeFillOpacities] = useState<Record<number, number>>(
    styleDefaults.driveTimeFillOpacities,
  );
  const [polygonColor, setPolygonColor] = useState(styleDefaults.polygonColor);
  const [strokeOpacity, setStrokeOpacity] = useState(styleDefaults.strokeOpacity);
  const [fillOpacity, setFillOpacity] = useState(styleDefaults.fillOpacity);
  const [strokeWeight, setStrokeWeight] = useState(styleDefaults.strokeWeight);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  // DT Demos runs its own ESRI pull for 5/7/10-min drive times, isolated
  // from the main result + map overlays so it never disturbs them.
  const [showDTDemosModal, setShowDTDemosModal] = useState(false);
  const [dtDemosData, setDtDemosData] = useState<DemographicData | null>(null);
  const [dtDemosLoading, setDtDemosLoading] = useState(false);
  const [showMunicipalUnitsModal, setShowMunicipalUnitsModal] = useState(false);
  // The Demo Map / DT Demos / Units screenshot boxes share one header dropdown.
  const [showBoxesMenu, setShowBoxesMenu] = useState(false);
  // Minimize collapses the body but keeps the slideout open — overlays
  // stay mounted on the map so rings/isochrones/polygon remain visible
  // while the user works on other things.
  const [minimized, setMinimized] = useState(false);

  const { isEnriching, enrichError, enrichLocation, enrichPolygon, clearError } =
    usePropertyGeoenrichment();

  // Reset state whenever a new location is opened. Prefilled cache
  // clicks seed the relevant slice of state instead of clearing it.
  // Style fields seed from the user's saved defaults (or the factory red
  // palette if none have been saved).
  useEffect(() => {
    if (!isOpen || !coordinates) return;

    setRingColors(styleDefaults.ringColors);
    setDriveTimeFillColors(styleDefaults.driveTimeFillColors);
    setDriveTimeLineColors(styleDefaults.driveTimeLineColors);
    setDriveTimeFillOpacities(styleDefaults.driveTimeFillOpacities);
    setPolygonColor(styleDefaults.polygonColor);
    setStrokeOpacity(styleDefaults.strokeOpacity);
    setFillOpacity(styleDefaults.fillOpacity);
    setStrokeWeight(styleDefaults.strokeWeight);
    setShowStylePanel(false);
    setShowModal(false);
    setShowDTDemosModal(false);
    setDtDemosData(null);
    setShowBoxesMenu(false);
    setMinimized(false);
    clearError();

    if (prefilled?.mode === 'rings') {
      setResult(prefilled.result);
      setSelectedRadii(prefilled.radii ?? DEFAULT_RADII);
      setSelectedDriveTimes(prefilled.driveTimes ?? []);
      setPolygonDrawing(false);
      setPolygonCoords(null);
      setPolygonResult(null);
    } else if (prefilled?.mode === 'polygon') {
      setResult(null);
      setSelectedRadii([]);
      setSelectedDriveTimes([]);
      setPolygonDrawing(false);
      setPolygonCoords(prefilled.polygonCoordinates ?? null);
      setPolygonResult(prefilled.result);
    } else {
      setResult(null);
      setSelectedRadii(DEFAULT_RADII);
      setSelectedDriveTimes(DEFAULT_DRIVE_TIMES);
      setPolygonDrawing(false);
      setPolygonCoords(null);
      setPolygonResult(null);
    }
  }, [isOpen, coordinates?.lat, coordinates?.lng, prefilled]);

  const sortedRadii = useMemo(
    () => [...selectedRadii].sort((a, b) => a - b),
    [selectedRadii],
  );

  const sortedDriveTimes = useMemo(
    () => [...selectedDriveTimes].sort((a, b) => a - b),
    [selectedDriveTimes],
  );

  const ringStyles = useMemo(
    () =>
      sortedRadii.map((miles) => ({
        miles,
        color: ringColors[miles] ?? DEFAULT_OVERLAY_COLOR,
      })),
    [sortedRadii, ringColors],
  );

  const driveTimeStyles = useMemo(
    () =>
      sortedDriveTimes.map((minutes) => {
        const fillColor = driveTimeFillColors[minutes] ?? DEFAULT_OVERLAY_COLOR;
        return {
          minutes,
          fillColor,
          // Line color falls back to the band's fill color so single-color
          // edits stay coherent without forcing two pickers per band.
          lineColor: driveTimeLineColors[minutes] ?? fillColor,
          // Per-band fill opacity overrides the slideout's global fill
          // opacity for this isochrone only.
          fillOpacity: driveTimeFillOpacities[minutes] ?? fillOpacity,
        };
      }),
    [sortedDriveTimes, driveTimeFillColors, driveTimeLineColors, driveTimeFillOpacities, fillOpacity],
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

  const handleFetch = async (forceRefresh = false) => {
    if (!coordinates || (selectedRadii.length === 0 && selectedDriveTimes.length === 0)) {
      return;
    }
    clearError();
    const r = await enrichLocation(
      coordinates.lat,
      coordinates.lng,
      sortedRadii,
      sortedDriveTimes,
      forceRefresh,
    );
    if (r) setResult(r);
  };

  // "DT Demos" — pull the same demographic metrics for the 5/7/10-min
  // drive-time catchments and open the screenshot-ready dark table. This
  // runs its own ESRI call (default radii keep the ring request valid;
  // those columns are ignored) and caches the result locally so re-opening
  // doesn't re-fetch. Selected drive times, the main result, and the map
  // overlays are all left untouched.
  const handleDTDemos = async () => {
    if (!coordinates) return;
    if (dtDemosData) {
      setShowDTDemosModal(true);
      return;
    }
    clearError();
    setDtDemosLoading(true);
    const r = await enrichLocation(
      coordinates.lat,
      coordinates.lng,
      DEFAULT_RADII,
      DT_DEMOS_DRIVE_TIMES,
      false,
    );
    setDtDemosLoading(false);
    if (r) {
      setDtDemosData(r.demographics);
      setShowDTDemosModal(true);
    }
  };

  const handlePolygonComplete = (coords: number[][][]) => {
    setPolygonDrawing(false);
    setPolygonCoords(coords);
    setPolygonResult(null);
  };

  const handleClearPolygon = () => {
    setPolygonDrawing(false);
    setPolygonCoords(null);
    setPolygonResult(null);
  };

  const handleFetchPolygon = async (forceRefresh = false) => {
    if (!polygonCoords) return;
    clearError();
    const r = await enrichPolygon(polygonCoords, forceRefresh);
    if (r) setPolygonResult(r);
  };

  const tapestry = result?.tapestry;
  const demographics = result?.demographics ?? null;

  return (
    <>
      <DemographicRingsOverlay
        map={map}
        center={coordinates}
        rings={ringStyles}
        fillOpacity={fillOpacity}
        strokeOpacity={strokeOpacity}
        strokeWeight={strokeWeight}
        isVisible
      />
      <DemographicIsochronesOverlay
        map={map}
        isochrones={result?.isochrones ?? null}
        bands={driveTimeStyles}
        strokeOpacity={strokeOpacity}
        strokeWeight={strokeWeight}
        isVisible
      />
      <DemographicPolygonOverlay
        map={map}
        drawingActive={polygonDrawing}
        coordinates={polygonCoords}
        color={polygonColor}
        fillOpacity={fillOpacity}
        strokeOpacity={strokeOpacity}
        strokeWeight={strokeWeight}
        onComplete={handlePolygonComplete}
      />

      <DemographicsAnalysisModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        coordinates={coordinates}
        ringResult={result}
        polygonResult={polygonResult}
        selectedRadii={sortedRadii}
        selectedDriveTimes={sortedDriveTimes}
      />

      <ScreenshotDemographicsModal
        isOpen={showScreenshotModal}
        onClose={() => setShowScreenshotModal(false)}
        demographics={demographics}
      />

      <DriveTimeDemosScreenshotModal
        isOpen={showDTDemosModal}
        onClose={() => setShowDTDemosModal(false)}
        demographics={dtDemosData}
      />

      <MunicipalUnitsScreenshotModal
        isOpen={showMunicipalUnitsModal}
        onClose={() => setShowMunicipalUnitsModal(false)}
        coordinates={coordinates}
        isochrones={result?.isochrones ?? {}}
      />

      <aside
        data-demographics-slideout="true"
        className={
          minimized
            ? 'fixed top-4 right-4 z-[50] shadow-2xl rounded-lg overflow-hidden'
            : 'fixed top-0 right-0 h-full w-[420px] z-[50] shadow-2xl flex flex-col'
        }
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <header
          className={
            minimized
              ? 'px-4 py-2 flex items-center justify-between gap-3'
              : 'px-5 py-4 border-b flex items-start justify-between'
          }
          style={{ borderColor: BRAND.border }}
        >
          <div className="min-w-0">
            <div
              className="text-xs uppercase tracking-wide"
              style={{ color: BRAND.slate }}
            >
              Demographics
              {minimized && (result || polygonResult) && (
                <span
                  className="ml-2 normal-case tracking-normal"
                  style={{ color: BRAND.steel }}
                >
                  · overlays on map
                </span>
              )}
            </div>
            {!minimized && (
              <h2
                className="text-lg font-semibold mt-0.5"
                style={{ color: BRAND.midnight }}
              >
                Ad-hoc location
              </h2>
            )}
            <div
              className="text-xs font-mono mt-1"
              style={{ color: BRAND.steel }}
            >
              {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!minimized && (result || polygonResult) && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="text-xs font-medium hover:underline"
                style={{ color: BRAND.steel }}
              >
                View All →
              </button>
            )}
            {!minimized && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBoxesMenu((o) => !o)}
                  className="text-xs font-medium hover:underline"
                  style={{ color: BRAND.steel }}
                  title="Screenshot-ready boxes: Demo Map, DT Demos, Units"
                >
                  {dtDemosLoading ? 'Boxes…' : 'Boxes ▾'}
                </button>
                {showBoxesMenu && (
                  <>
                    {/* Click-away backdrop */}
                    <div
                      className="fixed inset-0 z-[55]"
                      onClick={() => setShowBoxesMenu(false)}
                    />
                    <div
                      className="absolute right-0 mt-1 z-[56] py-1 rounded-md border shadow-lg"
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderColor: BRAND.border,
                        minWidth: '160px',
                      }}
                    >
                      <button
                        type="button"
                        disabled={!result}
                        onClick={() => {
                          setShowScreenshotModal(true);
                          setShowBoxesMenu(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: BRAND.midnight }}
                        title="Screenshot-ready dark table (1mi / 3mi / 5min / 10min)"
                      >
                        Demo Map
                      </button>
                      <button
                        type="button"
                        disabled={dtDemosLoading}
                        onClick={() => {
                          handleDTDemos();
                          setShowBoxesMenu(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
                        style={{ color: BRAND.midnight }}
                        title="Pull drive-time demographics from ESRI (5min / 7min / 10min)"
                      >
                        {dtDemosLoading ? 'DT Demos…' : 'DT Demos'}
                      </button>
                      <button
                        type="button"
                        disabled={!result}
                        onClick={() => {
                          setShowMunicipalUnitsModal(true);
                          setShowBoxesMenu(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: BRAND.midnight }}
                        title="Total housing units by stage for municipal projects in each catchment"
                      >
                        Units
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              aria-label={minimized ? 'Expand' : 'Minimize'}
              title={
                minimized
                  ? 'Expand — bring the panel back'
                  : 'Minimize — keep overlays on map, hide panel'
              }
            >
              {minimized ? '▢' : '–'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              aria-label="Close"
              title="Close — remove overlays from map"
            >
              ×
            </button>
          </div>
        </header>

        {!minimized && (
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

            {/* Collapsible layer-style panel: per-item colors + global opacity/weight. */}
            <div className="mt-4 border-t pt-3" style={{ borderColor: BRAND.border }}>
              <button
                type="button"
                onClick={() => setShowStylePanel((v) => !v)}
                className="text-xs font-semibold uppercase tracking-wide hover:underline"
                style={{ color: BRAND.steel }}
              >
                {showStylePanel ? '▾' : '▸'} Layer style
              </button>

              {showStylePanel && (
                <div className="mt-2 space-y-3">
                  {sortedRadii.length > 0 && (
                    <div>
                      <div className="text-[11px] mb-1" style={{ color: BRAND.slate }}>
                        Ring colors
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sortedRadii.map((r) => (
                          <label
                            key={r}
                            className="flex items-center gap-1.5 text-xs"
                            style={{ color: BRAND.steel }}
                          >
                            <input
                              type="color"
                              value={ringColors[r] ?? DEFAULT_OVERLAY_COLOR}
                              onChange={(e) =>
                                setRingColors((prev) => ({ ...prev, [r]: e.target.value }))
                              }
                              className="w-7 h-5 border border-gray-300 rounded cursor-pointer"
                            />
                            {r} mi
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {sortedDriveTimes.length > 0 && (
                    <div>
                      <div className="text-[11px] mb-1" style={{ color: BRAND.slate }}>
                        Drive-time styles
                      </div>
                      <div className="space-y-1.5">
                        {sortedDriveTimes.map((m) => {
                          const fillColor = driveTimeFillColors[m] ?? DEFAULT_OVERLAY_COLOR;
                          const lineColor = driveTimeLineColors[m] ?? fillColor;
                          const bandFillOpacity = driveTimeFillOpacities[m] ?? fillOpacity;
                          return (
                            <div
                              key={m}
                              className="grid items-center gap-2 text-xs"
                              style={{
                                color: BRAND.steel,
                                gridTemplateColumns: '3rem auto auto 1fr 2.5rem',
                              }}
                            >
                              <span>{m} min</span>
                              <label className="flex items-center gap-1" title="Fill color">
                                <span className="text-[10px]" style={{ color: BRAND.slate }}>F</span>
                                <input
                                  type="color"
                                  value={fillColor}
                                  onChange={(e) =>
                                    setDriveTimeFillColors((prev) => ({
                                      ...prev,
                                      [m]: e.target.value,
                                    }))
                                  }
                                  className="w-6 h-5 border border-gray-300 rounded cursor-pointer"
                                />
                              </label>
                              <label className="flex items-center gap-1" title="Line color">
                                <span className="text-[10px]" style={{ color: BRAND.slate }}>L</span>
                                <input
                                  type="color"
                                  value={lineColor}
                                  onChange={(e) =>
                                    setDriveTimeLineColors((prev) => ({
                                      ...prev,
                                      [m]: e.target.value,
                                    }))
                                  }
                                  className="w-6 h-5 border border-gray-300 rounded cursor-pointer"
                                />
                              </label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(bandFillOpacity * 100)}
                                onChange={(e) =>
                                  setDriveTimeFillOpacities((prev) => ({
                                    ...prev,
                                    [m]: Number(e.target.value) / 100,
                                  }))
                                }
                                className="w-full"
                                title="Fill opacity"
                              />
                              <span className="text-[10px] text-right" style={{ color: BRAND.slate }}>
                                {Math.round(bandFillOpacity * 100)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] mb-1" style={{ color: BRAND.slate }}>
                      Polygon color
                    </div>
                    <input
                      type="color"
                      value={polygonColor}
                      onChange={(e) => setPolygonColor(e.target.value)}
                      className="w-7 h-5 border border-gray-300 rounded cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs" style={{ color: BRAND.steel }}>
                      Fill opacity: {Math.round(fillOpacity * 100)}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(fillOpacity * 100)}
                        onChange={(e) => setFillOpacity(Number(e.target.value) / 100)}
                        className="w-full"
                      />
                    </label>
                    <label className="text-xs" style={{ color: BRAND.steel }}>
                      Line opacity: {Math.round(strokeOpacity * 100)}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(strokeOpacity * 100)}
                        onChange={(e) => setStrokeOpacity(Number(e.target.value) / 100)}
                        className="w-full"
                      />
                    </label>
                    <label className="text-xs" style={{ color: BRAND.steel }}>
                      Line weight: {strokeWeight}px
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={strokeWeight}
                        onChange={(e) => setStrokeWeight(Number(e.target.value))}
                        className="w-full"
                      />
                    </label>
                  </div>

                  {/* Save / reset row. "Save as default" persists the
                      current colors + opacity to localStorage so every
                      future point opens with them. "Reset" reverts the
                      current session to whatever is saved (or the
                      factory red palette if nothing has been saved). */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        saveAsDefaults({
                          ringColors,
                          driveTimeFillColors,
                          driveTimeLineColors,
                          driveTimeFillOpacities,
                          polygonColor,
                          strokeOpacity,
                          fillOpacity,
                          strokeWeight,
                        })
                      }
                      className="text-[11px] px-2.5 py-1 rounded font-medium"
                      style={{ backgroundColor: BRAND.midnight, color: '#FFFFFF' }}
                      title="Save these colors as your default for every new point"
                    >
                      Save as my default
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRingColors(styleDefaults.ringColors);
                          setDriveTimeFillColors(styleDefaults.driveTimeFillColors);
                          setDriveTimeLineColors(styleDefaults.driveTimeLineColors);
                          setDriveTimeFillOpacities(styleDefaults.driveTimeFillOpacities);
                          setPolygonColor(styleDefaults.polygonColor);
                          setStrokeOpacity(styleDefaults.strokeOpacity);
                          setFillOpacity(styleDefaults.fillOpacity);
                          setStrokeWeight(styleDefaults.strokeWeight);
                        }}
                        className="text-[11px] px-2.5 py-1 rounded font-medium border"
                        style={{ borderColor: BRAND.slate, color: BRAND.steel }}
                        title="Revert this point's colors to your saved defaults"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetToFactory();
                          setRingColors({});
                          setDriveTimeFillColors({});
                          setDriveTimeLineColors({});
                          setDriveTimeFillOpacities({});
                          setPolygonColor(DEFAULT_OVERLAY_COLOR);
                          setStrokeOpacity(DEFAULT_STROKE_OPACITY);
                          setFillOpacity(DEFAULT_FILL_OPACITY);
                          setStrokeWeight(DEFAULT_STROKE_WEIGHT);
                        }}
                        className="text-[10px] underline"
                        style={{ color: BRAND.slate }}
                        title="Clear your saved defaults and revert to the original red palette"
                      >
                        Clear saved
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleFetch(false)}
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
            {result?.cached_at && (
              <CachedBadge
                cachedAt={result.cached_at}
                onRefresh={() => handleFetch(true)}
                disabled={isEnriching}
              />
            )}
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

          {/* ───── Custom polygon (Phase 3) ───── */}
          <section
            className="pt-4 border-t"
            style={{ borderColor: BRAND.border }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: BRAND.steel }}
            >
              Custom polygon
            </div>
            <div
              className="text-[11px] mb-2"
              style={{ color: BRAND.slate }}
            >
              Draw any shape on the map and get demographics for the exact area.
              Polygons over 200 vertices are rejected — keep it simple.
            </div>

            <div className="flex flex-wrap gap-2">
              {!polygonCoords && !polygonDrawing && (
                <button
                  type="button"
                  onClick={() => setPolygonDrawing(true)}
                  className="px-3 py-1.5 text-sm rounded-md border transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: BRAND.steel,
                    borderColor: BRAND.steel,
                  }}
                >
                  Draw polygon
                </button>
              )}
              {polygonDrawing && (
                <>
                  <span
                    className="px-3 py-1.5 text-sm italic"
                    style={{ color: BRAND.steel }}
                  >
                    Click on the map to add points · double-click to finish
                  </span>
                  <button
                    type="button"
                    onClick={() => setPolygonDrawing(false)}
                    className="px-3 py-1.5 text-sm rounded-md border"
                    style={{
                      backgroundColor: 'transparent',
                      color: BRAND.slate,
                      borderColor: BRAND.slate,
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
              {polygonCoords && !polygonDrawing && (
                <>
                  <button
                    type="button"
                    onClick={() => handleFetchPolygon(false)}
                    disabled={isEnriching}
                    className="px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50"
                    style={{ backgroundColor: BRAND.midnight, color: '#FFFFFF' }}
                  >
                    {isEnriching
                      ? 'Fetching…'
                      : polygonResult
                        ? 'Refresh polygon stats'
                        : 'Fetch polygon demographics'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearPolygon}
                    disabled={isEnriching}
                    className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-50"
                    style={{
                      backgroundColor: 'transparent',
                      color: BRAND.slate,
                      borderColor: BRAND.slate,
                    }}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>

            {polygonResult?.cached_at && (
              <CachedBadge
                cachedAt={polygonResult.cached_at}
                onRefresh={() => handleFetchPolygon(true)}
                disabled={isEnriching}
              />
            )}

            {polygonCoords && (
              <div
                className="text-[11px] mt-2 font-mono"
                style={{ color: BRAND.slate }}
              >
                {(polygonCoords[0]?.length ?? 1) - 1} vertices
              </div>
            )}

            {polygonResult?.demographics && (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: BRAND.slate }}>
                      <th className="text-left font-medium pb-1.5">Metric</th>
                      <th className="text-right font-medium pb-1.5 pl-2">
                        Polygon
                      </th>
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
                        <td
                          className="py-1.5 text-right pl-2 font-medium"
                          style={{ color: BRAND.midnight }}
                        >
                          {row.format(getPolygonValue(polygonResult.demographics, row.prefix))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {polygonResult.tapestry?.code && (
                  <div
                    className="text-[11px] mt-2"
                    style={{ color: BRAND.steel }}
                  >
                    Tapestry: <strong>{polygonResult.tapestry.code}</strong> —{' '}
                    {polygonResult.tapestry.name}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        )}
      </aside>
    </>
  );
};

export default DemographicsAnalysisSlideout;
