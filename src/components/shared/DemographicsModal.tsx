/**
 * DemographicsModal - Shared modal component for displaying ESRI demographics data
 *
 * Used by:
 * - SiteSubmitDataTab (site submit sidebar)
 * - PropertyDetailsSlideoutContent (property slideout)
 * - PinDetailsSlideout (map property sidebar)
 *
 * Supports two modes:
 * - Fixed columns (property-level): 1 Mile | 3 Mile | 5 Mile | 10-Min Drive
 * - Dynamic columns (client-specific): built from clientDemographics.radii and drive_times
 */

import { createPortal } from 'react-dom';
import { ClientDemographicsData } from '../../hooks/usePropertyGeoenrichment';

// Demographics data interface - common fields across all usages
export interface DemographicsData {
  esri_enriched_at?: string | null;
  tapestry_segment_code?: string | null;
  tapestry_segment_name?: string | null;
  tapestry_segment_description?: string | null;
  tapestry_lifemodes?: string | null;
  // Population
  pop_1_mile?: number | null;
  pop_3_mile?: number | null;
  pop_5_mile?: number | null;
  pop_10min_drive?: number | null;
  // Households
  households_1_mile?: number | null;
  households_3_mile?: number | null;
  households_5_mile?: number | null;
  households_10min_drive?: number | null;
  // Income
  hh_income_median_1_mile?: number | null;
  hh_income_median_3_mile?: number | null;
  hh_income_median_5_mile?: number | null;
  hh_income_median_10min_drive?: number | null;
  hh_income_avg_1_mile?: number | null;
  hh_income_avg_3_mile?: number | null;
  hh_income_avg_5_mile?: number | null;
  hh_income_avg_10min_drive?: number | null;
  // Daytime Population
  daytime_pop_1_mile?: number | null;
  daytime_pop_3_mile?: number | null;
  daytime_pop_5_mile?: number | null;
  daytime_pop_10min_drive?: number | null;
  // Employees
  employees_1_mile?: number | null;
  employees_3_mile?: number | null;
  employees_5_mile?: number | null;
  employees_10min_drive?: number | null;
  // Median Age
  median_age_1_mile?: number | null;
  median_age_3_mile?: number | null;
  median_age_5_mile?: number | null;
  median_age_10min_drive?: number | null;
}

interface DemographicsModalProps {
  data: DemographicsData;
  clientDemographics?: ClientDemographicsData | null;
  onClose: () => void;
}

// Helper functions
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
};

/**
 * Build column definitions from radii and drive times
 */
function buildColumns(radii: number[], driveTimes: number[]) {
  const columns: { key: string; header: string }[] = [];
  for (const r of radii) {
    columns.push({ key: `${r}_mile`, header: `${r} Mile` });
  }
  for (const t of driveTimes) {
    columns.push({ key: `${t}min_drive`, header: `${t}-Min Drive` });
  }
  return columns;
}

/**
 * Dynamic demographics table that renders columns based on radii/drive times
 */
function DynamicDemographicsTable({ clientDemographics }: { clientDemographics: ClientDemographicsData }) {
  const columns = buildColumns(clientDemographics.radii, clientDemographics.drive_times);
  const d = clientDemographics.data;

  const metrics: { label: string; prefix: string; formatter: (v: number) => string }[] = [
    { label: 'Population', prefix: 'pop', formatter: (v) => formatNumber(v) },
    { label: 'Households', prefix: 'households', formatter: (v) => formatNumber(v) },
    { label: 'Daytime Pop', prefix: 'daytime_pop', formatter: (v) => formatNumber(v) },
    { label: 'Employees', prefix: 'employees', formatter: (v) => formatNumber(v) },
    { label: 'Avg HH Income', prefix: 'hh_income_avg', formatter: (v) => formatCurrency(v) },
    { label: 'Median HH Income', prefix: 'hh_income_median', formatter: (v) => formatCurrency(v) },
    { label: 'Median Age', prefix: 'median_age', formatter: (v) => v != null ? v.toFixed(1) : '-' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-3 pr-4 text-left font-semibold text-gray-700">Metric</th>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`py-3 ${i === columns.length - 1 ? 'pl-3' : 'px-3'} text-right font-semibold text-gray-700`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {metrics.map((metric) => (
            <tr key={metric.prefix} className="hover:bg-gray-50">
              <td className="py-2 pr-4 text-gray-600">{metric.label}</td>
              {columns.map((col, i) => {
                const value = d[`${metric.prefix}_${col.key}`];
                return (
                  <td
                    key={col.key}
                    className={`py-2 ${i === columns.length - 1 ? 'pl-3' : 'px-3'} text-right font-medium`}
                  >
                    {value != null ? metric.formatter(value as number) : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Fixed demographics table with standard 1/3/5 mile + 10-min columns
 */
function FixedDemographicsTable({ data }: { data: DemographicsData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-3 pr-4 text-left font-semibold text-gray-700">Metric</th>
            <th className="py-3 px-3 text-right font-semibold text-gray-700">1 Mile</th>
            <th className="py-3 px-3 text-right font-semibold text-gray-700">3 Mile</th>
            <th className="py-3 px-3 text-right font-semibold text-gray-700">5 Mile</th>
            <th className="py-3 pl-3 text-right font-semibold text-gray-700">10-Min Drive</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Population</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.pop_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.pop_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.pop_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatNumber(data.pop_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Households</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.households_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.households_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.households_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatNumber(data.households_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Daytime Pop</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.daytime_pop_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.daytime_pop_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.daytime_pop_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatNumber(data.daytime_pop_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Employees</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.employees_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.employees_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNumber(data.employees_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatNumber(data.employees_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Avg HH Income</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_avg_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_avg_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_avg_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatCurrency(data.hh_income_avg_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Median HH Income</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_median_1_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_median_3_mile)}</td>
            <td className="py-2 px-3 text-right font-medium">{formatCurrency(data.hh_income_median_5_mile)}</td>
            <td className="py-2 pl-3 text-right font-medium">{formatCurrency(data.hh_income_median_10min_drive)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 pr-4 text-gray-600">Median Age</td>
            <td className="py-2 px-3 text-right font-medium">
              {data.median_age_1_mile != null ? data.median_age_1_mile.toFixed(1) : '-'}
            </td>
            <td className="py-2 px-3 text-right font-medium">
              {data.median_age_3_mile != null ? data.median_age_3_mile.toFixed(1) : '-'}
            </td>
            <td className="py-2 px-3 text-right font-medium">
              {data.median_age_5_mile != null ? data.median_age_5_mile.toFixed(1) : '-'}
            </td>
            <td className="py-2 pl-3 text-right font-medium">
              {data.median_age_10min_drive != null ? data.median_age_10min_drive.toFixed(1) : '-'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function DemographicsModal({ data, clientDemographics, onClose }: DemographicsModalProps) {
  // Determine tapestry source: client demographics first, then property data
  const tapestryCode = clientDemographics?.tapestry?.code || data.tapestry_segment_code;
  const tapestryName = clientDemographics?.tapestry?.name || data.tapestry_segment_name;
  const tapestryLifemodes = clientDemographics?.tapestry?.lifemodes || data.tapestry_lifemodes;
  const tapestryDescription = clientDemographics?.tapestry?.description || data.tapestry_segment_description;
  const enrichedAt = clientDemographics?.enriched_at || data.esri_enriched_at;

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold" style={{ color: '#002147' }}>
            Demographics
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Tapestry Segment Card */}
          {tapestryCode && (
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #8FA9C8' }}>
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: '#002147' }}
                >
                  {tapestryCode}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{tapestryName}</div>
                  {tapestryLifemodes && (
                    <div className="text-sm" style={{ color: '#4A6B94' }}>{tapestryLifemodes}</div>
                  )}
                  {tapestryDescription && (
                    <p className="text-sm text-gray-600 mt-2">{tapestryDescription}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Demographics Table - dynamic or fixed */}
          {clientDemographics ? (
            <DynamicDemographicsTable clientDemographics={clientDemographics} />
          ) : (
            <FixedDemographicsTable data={data} />
          )}

          {/* Last Enriched */}
          {enrichedAt && (
            <div className="mt-4 text-xs text-gray-400 text-right">
              Data as of {formatDate(enrichedAt)}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
