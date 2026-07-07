import React from 'react';
import { createPortal } from 'react-dom';
import type { DemographicData } from '../../../hooks/usePropertyGeoenrichment';

// Fixed 4-column x 5-row demographics table styled for manual screenshotting
// (Cmd+Shift+4). Columns are hardcoded to 1mi / 3mi / 5min / 10min — if the
// user didn't request one of those catchments, that column shows "—".

interface Props {
  isOpen: boolean;
  onClose: () => void;
  demographics: DemographicData | null;
}

type CatchmentKey = '1_mile' | '3_mile' | '5min_drive' | '10min_drive';

const GRID_LINE = '1px solid rgba(255, 255, 255, 0.18)';

const COLUMNS: Array<{ label: string; suffix: CatchmentKey }> = [
  { label: '1mi', suffix: '1_mile' },
  { label: '3mi', suffix: '3_mile' },
  { label: '5min', suffix: '5min_drive' },
  { label: '10min', suffix: '10min_drive' },
];

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

const ROWS: Array<{
  label: string;
  prefix: string;
  format: (v: number | null | undefined) => string;
}> = [
  { label: 'Population', prefix: 'pop', format: formatNumber },
  { label: 'Median HH Income', prefix: 'hh_income_median', format: formatCurrency },
  { label: 'Population Median Age', prefix: 'median_age', format: formatAge },
  { label: 'Education % Some College', prefix: 'educ_some_college_plus_pct', format: formatPercent },
  { label: 'Total Employees', prefix: 'employees', format: formatNumber },
];

function getValue(
  demographics: DemographicData | null,
  prefix: string,
  suffix: CatchmentKey,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_${suffix}`
  ];
  return v ?? null;
}

const ScreenshotDemographicsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  demographics,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-lg shadow-2xl"
        style={{
          backgroundColor: '#1F1F1F',
          color: '#FFFFFF',
          padding: '32px 40px',
          minWidth: '560px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-3 text-lg leading-none"
          style={{ color: '#9CA3AF' }}
        >
          ×
        </button>

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: GRID_LINE }} />
              {COLUMNS.map((col) => (
                <th
                  key={col.suffix}
                  style={{
                    fontSize: '18px',
                    fontWeight: 400,
                    color: '#E5E7EB',
                    padding: '0 24px 16px',
                    textAlign: 'right',
                    borderBottom: GRID_LINE,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.prefix}>
                <td
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    padding: '18px 32px 18px 0',
                    whiteSpace: 'nowrap',
                    borderBottom: GRID_LINE,
                  }}
                >
                  {row.label}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.suffix}
                    style={{
                      fontSize: '16px',
                      color: '#FFFFFF',
                      padding: '18px 24px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      borderBottom: GRID_LINE,
                    }}
                  >
                    {row.format(getValue(demographics, row.prefix, col.suffix))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
};

export default ScreenshotDemographicsModal;
