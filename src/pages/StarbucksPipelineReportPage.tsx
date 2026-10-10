// Starbucks Pipeline Report — every board card in Pre-Submittal,
// Submitted-Reviewing, Negotiating LOI and At Lease/PSA, hand-ranked by which
// deal we think moves next. Drag rows to re-rank; Status / Package Status /
// Notes edit inline. Export to Excel writes the rows in the order shown.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import useStarbucksPipelineReport from '../hooks/useStarbucksPipelineReport';
import { BoardStage } from '../lib/starbucksBoard';
import {
  exportPipelineReport,
  LOI_STATUS_LABEL,
  LOI_STATUS_OPTIONS,
  loiStatusOf,
  PRE_STATUS_LABEL,
  PRE_STATUS_OPTIONS,
  preStatusOf,
  ReportField,
  ReportRow,
  saveLoiStatus,
  savePreStatus,
  statusKind,
} from '../lib/starbucksPipelineReport';

const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';
const ACCOUNT_KEY = 'sbPipelineReportAccount';

const STAGE_STYLE: Record<BoardStage, { bg: string; fg: string }> = {
  'Pre-Submittal': { bg: '#FFFFFF', fg: '#4A6B94' },
  'Submitted-Reviewing': { bg: '#E8EEF5', fg: '#4A6B94' },
  'Negotiating LOI': { bg: '#4A6B94', fg: '#FFFFFF' },
  'At Lease/PSA': { bg: '#002147', fg: '#FFFFFF' },
};

function loadAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || STARBUCKS_CLIENT_ID;
  } catch {
    return STARBUCKS_CLIENT_ID;
  }
}

export default function StarbucksPipelineReportPage() {
  const [accountId, setAccountIdState] = useState<string>(loadAccount);
  const { rows, accounts, loading, error, saveError, move, setField, resetOrder, refresh } =
    useStarbucksPipelineReport(accountId);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = 'Starbucks Pipeline Report | OVIS';
  }, []);

  function setAccountId(id: string) {
    setAccountIdState(id);
    try {
      localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      /* per-viewer convenience only */
    }
  }

  const accountName = useMemo(
    () => accounts.find((a) => a.clientId === accountId)?.filter ?? 'Starbucks',
    [accounts, accountId]
  );

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.stageLabel, (m.get(r.stageLabel) ?? 0) + 1);
    return m;
  }, [rows]);

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    move(result.source.index, result.destination.index);
  }

  async function onExport() {
    setExporting(true);
    try {
      await exportPipelineReport(rows, accountName);
    } finally {
      setExporting(false);
    }
  }

  function onResetOrder() {
    if (window.confirm('Reset the ranking to stage order (At Lease/PSA first)? Your drag order will be replaced.')) {
      resetOrder();
    }
  }

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="max-w-[1500px] mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#002147' }}>{accountName} Pipeline Report</h1>
            <p className="mt-1 text-sm" style={{ color: '#4A6B94' }}>
              Drag rows to rank by which deal we think is next — Excel exports in this order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 1 && (
              <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid #8FA9C8' }}>
                {accounts.map((a) => {
                  const active = a.clientId === accountId;
                  return (
                    <button
                      key={a.clientId}
                      onClick={() => setAccountId(a.clientId)}
                      className="px-3 py-1.5 text-sm font-medium"
                      style={{ backgroundColor: active ? '#002147' : 'transparent', color: active ? '#FFFFFF' : '#4A6B94' }}
                    >
                      {a.filter}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onClick={onResetOrder}
              disabled={rows.length === 0}
              className="px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50"
              style={{ border: '1px solid #8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
            >
              Reset order
            </button>
            <button
              onClick={onExport}
              disabled={exporting || rows.length === 0}
              className="px-4 py-1.5 text-sm font-semibold rounded-md disabled:opacity-50"
              style={{ backgroundColor: '#002147', color: '#FFFFFF' }}
            >
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(STAGE_STYLE) as BoardStage[]).map((s) => (
            <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-white" style={{ border: '1px solid #8FA9C8', color: '#002147' }}>
              {s}: <strong>{stageCounts.get(s) ?? 0}</strong>
            </span>
          ))}
          <span className="text-xs px-2.5 py-1" style={{ color: '#4A6B94' }}>{rows.length} total</span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md text-sm" style={{ border: '1px solid #A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}>
            {error}
          </div>
        )}
        {saveError && (
          <div className="mb-4 p-3 rounded-md text-sm" style={{ border: '1px solid #A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}>
            Couldn't save: {saveError}
          </div>
        )}

        <div className="bg-white rounded-lg overflow-x-auto" style={{ border: '1px solid #8FA9C8' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 1100 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: 150 }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
                <th />
                <th className="px-2 py-2.5 text-center font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Deal / Site Submit</th>
                <th className="px-3 py-2.5 text-left font-semibold">Stage</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">Package Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">Notes</th>
                <th className="px-3 py-2.5 text-center font-semibold">Map</th>
              </tr>
            </thead>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="pipeline-report">
                {(drop) => (
                  <tbody ref={drop.innerRef} {...drop.droppableProps}>
                    {loading && rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-10 text-center" style={{ color: '#8FA9C8' }}>Loading…</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-10 text-center" style={{ color: '#8FA9C8' }}>No sites in these stages.</td></tr>
                    ) : (
                      rows.map((r, i) => (
                        <Draggable key={r.id} draggableId={r.id} index={i}>
                          {(drag, snap) => (
                            <tr
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className="align-top"
                              style={{
                                ...drag.draggableProps.style,
                                backgroundColor: snap.isDragging ? '#E8EEF5' : i % 2 ? '#F8FAFC' : '#FFFFFF',
                                borderTop: '1px solid #E2E8F0',
                              }}
                            >
                              <td
                                {...drag.dragHandleProps}
                                className="px-2 py-2.5 text-center cursor-grab select-none"
                                style={{ color: '#8FA9C8', width: 36 }}
                                title="Drag to re-rank"
                              >
                                ⋮⋮
                              </td>
                              <td className="px-2 py-2.5 text-center font-semibold" style={{ color: '#002147', width: 44 }}>{i + 1}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium" style={{ color: '#002147' }}>{r.name}</div>
                                <div className="text-xs" style={{ color: '#4A6B94' }}>
                                  {r.city}
                                  {r.parked && <span className="ml-2 italic" style={{ color: '#A27B5C' }}>parked</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2.5" style={{ width: 150 }}>
                                <span
                                  className="inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={{ backgroundColor: STAGE_STYLE[r.stageLabel].bg, color: STAGE_STYLE[r.stageLabel].fg, border: '1px solid #8FA9C8' }}
                                >
                                  {r.stageLabel}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {statusKind(r) === 'text' ? (
                                  <EditableCell row={r} field="status" value={r.status} onSave={setField} multiline />
                                ) : (
                                  <BoardStatusCell row={r} onSaved={refresh} />
                                )}
                              </td>
                              <td className="px-2 py-1.5" style={{ width: 140 }}>
                                <EditableCell row={r} field="package_status" value={r.packageStatus} onSave={setField} />
                              </td>
                              <td className="px-2 py-1.5">
                                <EditableCell row={r} field="notes" value={r.notes} onSave={setField} multiline />
                              </td>
                              <td className="px-3 py-2.5 text-center" style={{ width: 80 }}>
                                {r.mapUrl ? (
                                  <a href={r.mapUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#4A6B94' }}>
                                    Map
                                  </a>
                                ) : (
                                  <span style={{ color: '#8FA9C8' }} title="No coordinates on the site submit or property">—</span>
                                )}
                              </td>
                            </tr>
                          )}
                        </Draggable>
                      ))
                    )}
                    {drop.placeholder}
                  </tbody>
                )}
              </Droppable>
            </DragDropContext>
          </table>
        </div>
      </div>
    </div>
  );
}

// Status for Pre-Submittal (what we're waiting on) and Negotiating LOI (whose
// court). Writes the card's board state — the deal board shows the change.
// Holds the picked value until the board refetch catches up.
function BoardStatusCell({ row, onSaved }: { row: ReportRow; onSaved: () => void }) {
  const isPre = statusKind(row) === 'pre';
  const current = isPre ? preStatusOf(row) : loiStatusOf(row);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPending(null);
  }, [current]);

  async function pick(v: string) {
    if (v === current) return;
    setPending(v);
    setErr(null);
    try {
      if (isPre) await savePreStatus(row, v as Parameters<typeof savePreStatus>[1]);
      else await saveLoiStatus(row, v as Parameters<typeof saveLoiStatus>[1]);
      onSaved();
    } catch (e: any) {
      setPending(null);
      setErr(e?.message ?? 'Failed to save');
    }
  }

  const value = pending ?? current;
  const options: string[] = isPre
    ? [...PRE_STATUS_OPTIONS, ...(current === 'll' ? ['ll'] : [])]
    : LOI_STATUS_OPTIONS;
  const label = (v: string) =>
    isPre ? PRE_STATUS_LABEL[v as keyof typeof PRE_STATUS_LABEL] : `Court: ${LOI_STATUS_LABEL[v as keyof typeof LOI_STATUS_LABEL]}`;
  const unset = value === 'unset';

  return (
    <div>
      <select
        value={value}
        onChange={(e) => pick(e.target.value)}
        disabled={pending !== null}
        className="w-full px-1.5 py-1 rounded text-sm bg-white focus:outline-none"
        style={{ color: unset ? '#8FA9C8' : '#002147', border: `1px solid ${unset ? '#A27B5C' : '#8FA9C8'}` }}
        title="Saved to the deal board (resets its clock)"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === 'unset' ? 'Not set' : label(o)}</option>
        ))}
      </select>
      {!isPre && row.ballInCourtParty && value === current && current !== 'unset' && (
        <div className="text-xs mt-0.5 px-1.5" style={{ color: '#4A6B94' }}>{row.ballInCourtParty}</div>
      )}
      {err && <div className="text-xs mt-0.5 px-1.5" style={{ color: '#A27B5C' }}>{err}</div>}
    </div>
  );
}

// Inline text cell: edits a local draft, saves on blur when changed. Enter
// saves a single-line cell; Escape reverts. Hoisted (not defined inline) so a
// parent re-render doesn't replace its DOM mid-edit.
function EditableCell({
  row,
  field,
  value,
  onSave,
  multiline = false,
}: {
  row: ReportRow;
  field: ReportField;
  value: string;
  onSave: (row: ReportRow, field: ReportField, value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  const cancelled = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  // Grow the textarea to its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft]);

  function commit() {
    editing.current = false;
    if (cancelled.current) { cancelled.current = false; setDraft(value); return; }
    if (draft.trim() !== value.trim()) onSave(row, field, draft);
  }

  const common = {
    value: draft,
    onFocus: () => { editing.current = true; },
    onBlur: commit,
    placeholder: '—',
    className: 'w-full px-1.5 py-1 rounded text-sm bg-transparent focus:bg-white focus:outline-none resize-none',
    style: { color: '#002147', border: '1px solid transparent' } as React.CSSProperties,
  };

  if (multiline) {
    return (
      <textarea
        {...common}
        ref={taRef}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLTextAreaElement).blur(); }
        }}
        onFocusCapture={(e) => { e.currentTarget.style.borderColor = '#8FA9C8'; }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
      />
    );
  }
  return (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      onFocusCapture={(e) => { e.currentTarget.style.borderColor = '#8FA9C8'; }}
      onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
    />
  );
}
