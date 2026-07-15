import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from '../layers/LayerManager';
import type { TargetAreaRow } from '../layers/StarbucksTargetAreaLayer';

interface Props {
  isOpen: boolean;
  row: TargetAreaRow | null;
  onClose: () => void;
  /** Called after a successful save/delete so the parent can clear/refresh selection if needed. */
  onChanged?: () => void;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  orep: '#0000FF',
};

// PostgREST errors are plain objects, not Error instances.
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function formatUSD(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

// Currency-input helpers. The Model Yr1 Sales override is entered as whole dollars: we keep only
// digits and re-format with thousands separators as the user types, so what's typed and what's
// saved can't diverge (a plain text field silently dropped "$1,600,000" → 1600 before).
function digitsOnly(s: string): string {
  return s.replace(/[^0-9]/g, '');
}
function formatThousands(digits: string): string {
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1';
const inputCls =
  'w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

const StarbucksTargetAreaSlideout: React.FC<Props> = ({ isOpen, row, onClose, onChanged }) => {
  const { refreshLayer } = useLayerManager();

  const isOrep = row?.source === 'orep';

  const [nameDraft, setNameDraft] = useState('');
  const [orepNotesDraft, setOrepNotesDraft] = useState('');
  const [salesDraft, setSalesDraft] = useState(''); // string; '' = no override
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset drafts whenever a different feature is selected.
  useEffect(() => {
    setNameDraft(row?.name ?? '');
    setOrepNotesDraft(row?.orep_notes ?? '');
    setSalesDraft(row?.orep_model_yr1_sales != null ? formatThousands(String(Math.round(row.orep_model_yr1_sales))) : '');
    setSaveError('');
    setDeleteError('');
    setConfirmDelete(false);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !row) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const digits = digitsOnly(salesDraft);
      const orepSales: number | null = digits === '' ? null : Number(digits);

      const payload: Record<string, unknown> = {
        orep_notes: orepNotesDraft.trim() === '' ? null : orepNotesDraft.trim(),
        orep_model_yr1_sales: orepSales,
      };
      // Name is only OREP-owned on OREP-drawn rows (the guard trigger ignores it on Starbucks rows).
      if (isOrep) {
        const trimmedName = nameDraft.trim();
        if (trimmedName === '') throw new Error('Name is required.');
        payload.name = trimmedName;
      }

      const { error } = await supabase.from('starbucks_target_area').update(payload).eq('id', row.id);
      if (error) throw error;

      refreshLayer('starbucks_target_areas');
      onChanged?.();
      onClose();
    } catch (e) {
      setSaveError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isOrep) return; // only OREP-drawn polygons are deletable
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.from('starbucks_target_area').delete().eq('id', row.id);
      if (error) throw error;
      refreshLayer('starbucks_target_areas');
      onChanged?.();
      onClose();
    } catch (e) {
      setDeleteError(errMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const rawSales = formatUSD(row.model_yr1_sales);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[59] bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-white shadow-2xl z-[60] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span>🎯</span>
              <span className="text-sm font-semibold" style={{ color: BRAND.midnight }}>
                Target Area
              </span>
              {isOrep && (
                <span
                  className="text-[9px] font-semibold text-white px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: BRAND.orep }}
                >
                  OREP
                </span>
              )}
            </div>
            {!isOrep && (
              <div className="text-sm mt-1 truncate" style={{ color: BRAND.midnight }}>
                {row.name}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Editable name (OREP rows only) */}
          {isOrep && (
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                className={inputCls}
                placeholder="OREP target area name"
              />
            </div>
          )}

          {/* Read-only Starbucks context (Starbucks-sourced rows only) */}
          {!isOrep && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-1 text-[12px]" style={{ color: BRAND.steel }}>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Starbucks data (read-only)</div>
              <div><strong>Priority:</strong> {row.priority ?? '—'}</div>
              <div><strong>Store Type:</strong> {row.store_type ?? '—'}</div>
              <div><strong>RE Availability:</strong> {row.re_availability ?? '—'}</div>
              <div><strong>Market:</strong> {row.market_name ?? '—'}</div>
              <div><strong>SDM/MDM:</strong> {row.sdm_mdm ?? '—'}</div>
              <div><strong>Model Yr1 Sales:</strong> {rawSales}</div>
              {row.notes && <div className="italic pt-1">{row.notes}</div>}
            </div>
          )}

          {/* Editable: OREP Notes */}
          <div>
            <label className={labelCls}>OREP Notes</label>
            <textarea
              value={orepNotesDraft}
              onChange={e => setOrepNotesDraft(e.target.value)}
              rows={4}
              className={inputCls}
              placeholder="Add OREP notes…"
            />
          </div>

          {/* Editable: Model Yr1 Sales (override) */}
          <div>
            <label className={labelCls}>Model Yr1 Sales{!isOrep && <span className="text-gray-400 normal-case font-normal"> (OREP override)</span>}</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={salesDraft}
                onChange={e => setSalesDraft(formatThousands(digitsOnly(e.target.value)))}
                className={`${inputCls} pl-5`}
                placeholder={!isOrep && row.model_yr1_sales != null ? `Starbucks: ${rawSales}` : 'e.g. 1,600,000'}
              />
            </div>
            {salesDraft.trim() !== '' && (
              <div className="text-[11px] mt-1 font-medium" style={{ color: BRAND.steel }}>
                = {formatUSD(Number(digitsOnly(salesDraft)))}
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-gray-400">
                {!isOrep
                  ? 'Blank = use the Starbucks value. An entry overrides it and survives re-imports.'
                  : 'Enter the modeled Year-1 sales for this OREP area.'}
              </span>
              {salesDraft.trim() !== '' && (
                <button onClick={() => setSalesDraft('')} className="text-[11px] text-blue-600 hover:underline flex-shrink-0 ml-2">
                  Clear
                </button>
              )}
            </div>
          </div>

          {saveError && <div className="text-[12px] text-red-600">{saveError}</div>}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-200 p-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 text-sm py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 text-sm py-2 rounded text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.midnight }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {isOrep && (
            <div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-[12px] text-red-600 hover:underline py-1"
                >
                  Delete this OREP target area
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-600 flex-1">Delete permanently?</span>
                  <button onClick={() => setConfirmDelete(false)} className="text-[12px] text-gray-500 hover:underline">
                    No
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[12px] text-white bg-red-600 rounded px-2 py-1 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </div>
              )}
              {deleteError && <div className="text-[12px] text-red-600 mt-1">{deleteError}</div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default StarbucksTargetAreaSlideout;
