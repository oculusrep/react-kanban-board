import React from 'react';
import { createPortal } from 'react-dom';
import type {
  GeoenrichmentResult,
  DemographicData,
} from '../../../hooks/usePropertyGeoenrichment';

// "View All" modal for the on-map Demographics Here slideout.
// Renders rings, drive-times, and (if present) a custom polygon as a
// single wide table — radii and drive-times across the top, metrics
// down the side. Modelled after the existing shared DemographicsModal
// but with dynamic columns driven by the user's current selections,
// so the modal stays in sync with the slideout.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coordinates: { lat: number; lng: number } | null;
  ringResult: GeoenrichmentResult | null;
  polygonResult: GeoenrichmentResult | null;
  selectedRadii: number[];
  selectedDriveTimes: number[];
}

const formatNumber = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString();

const formatCurrency = (v: number | null | undefined) =>
  v == null
    ? '—'
    : v.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

const formatAge = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(1);

const formatPercent = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toFixed(1)}%`;

const METRIC_ROWS: Array<{
  label: string;
  prefix: string;
  format: (v: number | null | undefined) => string;
}> = [
  { label: 'Population', prefix: 'pop', format: formatNumber },
  { label: 'Daytime pop', prefix: 'daytime_pop', format: formatNumber },
  { label: 'Households', prefix: 'households', format: formatNumber },
  { label: 'Median HH inc.', prefix: 'hh_income_median', format: formatCurrency },
  { label: 'Avg HH inc.', prefix: 'hh_income_avg', format: formatCurrency },
  { label: 'Employees', prefix: 'employees', format: formatNumber },
  { label: 'Median age', prefix: 'median_age', format: formatAge },
  { label: 'Some college+ %', prefix: 'educ_some_college_plus_pct', format: formatPercent },
];

function getValue(
  demographics: DemographicData | null | undefined,
  prefix: string,
  suffix: string,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_${suffix}`
  ];
  return v ?? null;
}

const DemographicsAnalysisModal: React.FC<Props> = ({
  isOpen,
  onClose,
  coordinates,
  ringResult,
  polygonResult,
  selectedRadii,
  selectedDriveTimes,
}) => {
  if (!isOpen) return null;

  const sortedRadii = [...selectedRadii].sort((a, b) => a - b);
  const sortedDriveTimes = [...selectedDriveTimes].sort((a, b) => a - b);

  type Column = { key: string; label: string; suffix: string; source: 'rings' | 'polygon' };
  const columns: Column[] = [];

  if (ringResult?.demographics) {
    for (const r of sortedRadii) {
      columns.push({
        key: `ring_${r}`,
        label: `${r} mi`,
        suffix: `${r}_mile`,
        source: 'rings',
      });
    }
    for (const m of sortedDriveTimes) {
      columns.push({
        key: `dt_${m}`,
        label: `${m} min`,
        suffix: `${m}min_drive`,
        source: 'rings',
      });
    }
  }
  if (polygonResult?.demographics) {
    columns.push({
      key: 'polygon',
      label: 'Polygon',
      suffix: 'polygon',
      source: 'polygon',
    });
  }

  const tapestry =
    polygonResult?.tapestry?.code ? polygonResult.tapestry : ringResult?.tapestry;

  const cachedNotes: string[] = [];
  if (ringResult?.cached_at) cachedNotes.push(`rings cached`);
  if (polygonResult?.cached_at) cachedNotes.push(`polygon cached`);

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: '#002147' }}>
              Demographics
            </h2>
            {coordinates && (
              <div className="text-xs font-mono mt-0.5" style={{ color: '#4A6B94' }}>
                {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {tapestry?.code && (
            <div
              className="mb-6 p-4 rounded-lg"
              style={{ backgroundColor: '#f8fafc', border: '1px solid #8FA9C8' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: '#002147' }}
                >
                  {tapestry.code}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{tapestry.name}</div>
                  {tapestry.lifemodes && (
                    <div className="text-sm" style={{ color: '#4A6B94' }}>
                      {tapestry.lifemodes}
                    </div>
                  )}
                  {tapestry.description && (
                    <p className="text-sm text-gray-600 mt-2">{tapestry.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {columns.length === 0 ? (
            <div className="text-sm italic text-center text-gray-500 py-8">
              No demographics fetched yet. Use the slideout to pick radii / drive times /
              draw a polygon, then click Fetch.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-3 pr-4 text-left font-semibold text-gray-700">
                      Metric
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="py-3 px-3 text-right font-semibold text-gray-700"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {METRIC_ROWS.map((row) => (
                    <tr key={row.prefix} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-600">{row.label}</td>
                      {columns.map((col) => {
                        const source =
                          col.source === 'polygon'
                            ? polygonResult?.demographics
                            : ringResult?.demographics;
                        return (
                          <td
                            key={col.key}
                            className="py-2 px-3 text-right font-medium"
                          >
                            {row.format(getValue(source, row.prefix, col.suffix))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 text-xs text-gray-400 text-right">
            Source: ESRI GeoEnrichment · ad-hoc lookup, nothing saved.
            {cachedNotes.length > 0 && (
              <span style={{ color: '#065F46' }}> · {cachedNotes.join(', ')}</span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DemographicsAnalysisModal;
