import React, { useState, useMemo, useCallback } from 'react';
import type { ClassifyResult } from '../../hooks/useStreetLightTraffic';

interface TrafficSpendModalProps {
  classifyResult: ClassifyResult;
  costPerSegment?: number;
  remainingQuota?: number | null;
  onClose: () => void;
  onConfirm: (selectedSegmentIds: string[]) => Promise<void>;
}

const COST_PER_SEGMENT = 0.10; // matches DB default; override via prop

const TrafficSpendModal: React.FC<TrafficSpendModalProps> = ({
  classifyResult,
  costPerSegment = COST_PER_SEGMENT,
  remainingQuota = null,
  onClose,
  onConfirm,
}) => {
  const { up_to_date, stale, new: newSegments } = classifyResult;

  // Selected IDs (checkboxes) — only stale + new are selectable
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);

  // Sorted stale list: cached AADT descending (nulls last)
  const sortedStale = useMemo(
    () =>
      [...stale].sort((a, b) => {
        if (a.aadt === null && b.aadt === null) return 0;
        if (a.aadt === null) return 1;
        if (b.aadt === null) return -1;
        return b.aadt - a.aadt;
      }),
    [stale]
  );

  const toggleSegment = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const all = [...stale.map((s) => s.id), ...newSegments.map((s) => s.id)];
    setSelectedIds(new Set(all));
  }, [stale, newSegments]);

  const selectAllInterstate = useCallback(() => {
    const interstates = [
      ...stale.filter((s) => s.road_type?.toLowerCase().includes('interstate')).map((s) => s.id),
      ...newSegments.filter((s) => s.road_type?.toLowerCase().includes('interstate')).map((s) => s.id),
    ];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      interstates.forEach((id) => next.add(id));
      return next;
    });
  }, [stale, newSegments]);

  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const selectedCount = selectedIds.size;
  const estimatedCost = selectedCount * costPerSegment;

  const afterSpendRemaining =
    remainingQuota !== null ? remainingQuota - estimatedCost : null;

  const handleConfirm = async () => {
    if (selectedCount === 0 || isConfirming) return;
    setIsConfirming(true);
    try {
      await onConfirm(Array.from(selectedIds));
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        fontFamily: 'sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 560,
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Load AADT Data</h2>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>
            Select segments to fetch AADT from StreetLight. Each segment costs ${costPerSegment.toFixed(2)}.
          </p>
        </div>

        {/* Quick picks */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={selectAll} style={quickPickStyle}>Select all</button>
          <button onClick={selectAllInterstate} style={quickPickStyle}>Select all interstate</button>
          {selectedCount > 0 && (
            <button onClick={clearAll} style={{ ...quickPickStyle, color: '#ef4444', borderColor: '#fca5a5' }}>
              Clear selection
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>

          {/* Up-to-date (collapsed) */}
          <CollapsibleBucket
            title="Up to date"
            count={up_to_date.length}
            defaultOpen={false}
            color="#22c55e"
            note="Already have fresh data — no cost to refresh"
          >
            {up_to_date.map((seg) => (
              <div key={seg.id} style={rowStyle}>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>✓</span>
                <SegmentLabel seg={seg} />
                {seg.aadt !== null && (
                  <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>
                    {seg.aadt.toLocaleString()} AADT
                  </span>
                )}
              </div>
            ))}
          </CollapsibleBucket>

          {/* Stale (expanded) */}
          <CollapsibleBucket
            title="Stale data"
            count={sortedStale.length}
            defaultOpen={true}
            color="#eab308"
            note="Have data but it's outdated — select to refresh"
          >
            {sortedStale.map((seg) => (
              <label key={seg.id} style={{ ...rowStyle, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(seg.id)}
                  onChange={() => toggleSegment(seg.id)}
                  style={{ marginRight: 8 }}
                />
                <SegmentLabel seg={seg} />
                {seg.aadt !== null && (
                  <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>
                    {seg.aadt.toLocaleString()} AADT
                  </span>
                )}
              </label>
            ))}
            {sortedStale.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>None</div>
            )}
          </CollapsibleBucket>

          {/* Never queried (expanded) */}
          <CollapsibleBucket
            title="Never queried"
            count={newSegments.length}
            defaultOpen={true}
            color="#9ca3af"
            note="No data yet — select to fetch for the first time"
          >
            {newSegments.map((seg) => (
              <label key={seg.id} style={{ ...rowStyle, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(seg.id)}
                  onChange={() => toggleSegment(seg.id)}
                  style={{ marginRight: 8 }}
                />
                <SegmentLabel seg={seg} />
              </label>
            ))}
            {newSegments.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>None</div>
            )}
          </CollapsibleBucket>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f9fafb',
          }}
        >
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>
              Selected: {selectedCount} segment{selectedCount !== 1 ? 's' : ''} — ${estimatedCost.toFixed(2)}
            </span>
            {afterSpendRemaining !== null && (
              <div style={{ color: afterSpendRemaining < 0 ? '#ef4444' : '#6b7280', marginTop: 2 }}>
                Remaining after spend: ${afterSpendRemaining.toFixed(2)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0 || isConfirming}
              style={{
                ...confirmBtnStyle,
                opacity: selectedCount === 0 || isConfirming ? 0.5 : 1,
                cursor: selectedCount === 0 || isConfirming ? 'not-allowed' : 'pointer',
              }}
            >
              {isConfirming
                ? 'Loading…'
                : `Spend ${selectedCount} segment${selectedCount !== 1 ? 's' : ''} ($${estimatedCost.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CollapsibleBucketProps {
  title: string;
  count: number;
  defaultOpen: boolean;
  color: string;
  note?: string;
  children: React.ReactNode;
}

const CollapsibleBucket: React.FC<CollapsibleBucketProps> = ({
  title,
  count,
  defaultOpen,
  color,
  note,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '6px 0',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{open ? '▼' : '▶'}</span>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {title}
          <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>({count})</span>
        </span>
        {note && <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 4 }}>— {note}</span>}
      </button>

      {open && (
        <div style={{ paddingLeft: 18, maxHeight: 240, overflowY: 'auto', marginBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
};

interface SegmentLabelProps {
  seg: { id: string; road_name?: string | null; road_type?: string | null };
}

const SegmentLabel: React.FC<SegmentLabelProps> = ({ seg }) => (
  <span style={{ fontSize: 13, flexGrow: 1 }}>
    <span style={{ fontWeight: seg.road_name ? 500 : 400, color: seg.road_name ? '#111827' : '#9ca3af' }}>
      {seg.road_name ?? `Segment ${seg.id.substring(0, 8)}`}
    </span>
    {seg.road_type && (
      <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: 12 }}>{seg.road_type}</span>
    )}
  </span>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '5px 0',
  gap: 6,
  borderBottom: '1px solid #f9fafb',
};

const quickPickStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#374151',
};

const cancelBtnStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '7px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
};

const confirmBtnStyle: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '7px 16px',
  fontWeight: 600,
  fontSize: 13,
  fontFamily: 'inherit',
};

export default TrafficSpendModal;
