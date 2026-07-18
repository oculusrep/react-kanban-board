import React from 'react';
import { createPortal } from 'react-dom';
import type { DemographicData } from '../../../hooks/usePropertyGeoenrichment';

// Fixed 4-column x 5-row demographics table styled for manual screenshotting
// (Cmd+Shift+4). Columns are hardcoded to the 5min / 7min / 10min drive-time
// catchments — the sibling of ScreenshotDemographicsModal, which shows the
// ring / mixed catchments. If a drive time wasn't fetched, its column shows "—".

interface Props {
  isOpen: boolean;
  onClose: () => void;
  demographics: DemographicData | null;
}

const GRID_LINE = '1px solid rgba(255, 255, 255, 0.18)';

const COLUMNS: Array<{ label: string; minutes: number }> = [
  { label: '5min', minutes: 5 },
  { label: '7min', minutes: 7 },
  { label: '10min', minutes: 10 },
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
  minutes: number,
): number | null {
  if (!demographics) return null;
  const v = (demographics as unknown as Record<string, number | null>)[
    `${prefix}_${minutes}min_drive`
  ];
  return v ?? null;
}

const DriveTimeDemosScreenshotModal: React.FC<Props> = ({
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
          backgroundColor: '#2F2F2F',
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
              <th
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  padding: '0 26px 16px 0',
                  textAlign: 'left',
                  borderBottom: GRID_LINE,
                }}
              >
                Drive Time Demos
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.minutes}
                  style={{
                    fontSize: '18px',
                    fontWeight: 400,
                    color: '#E5E7EB',
                    padding: '0 19px 16px',
                    textAlign: 'center',
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
                    padding: '9px 26px 9px 0',
                    whiteSpace: 'nowrap',
                    borderBottom: GRID_LINE,
                  }}
                >
                  {row.label}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.minutes}
                    style={{
                      fontSize: '16px',
                      color: '#FFFFFF',
                      padding: '9px 19px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                      borderBottom: GRID_LINE,
                    }}
                  >
                    {row.format(getValue(demographics, row.prefix, col.minutes))}
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

export default DriveTimeDemosScreenshotModal;
