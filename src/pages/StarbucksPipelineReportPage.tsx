// Starbucks Pipeline Report — every board card in Pre-Submittal,
// Submitted-Reviewing, Negotiating LOI and At Lease/PSA, hand-ranked by which
// deal we think moves next. Drag rows to re-rank (also while filtered);
// Package Status / Notes edit inline; Status (Pre-Submittal) and Court edit the
// board's own state. Export to Excel writes the rows shown, in the order shown.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parseISO } from 'date-fns';
import useStarbucksPipelineReport from '../hooks/useStarbucksPipelineReport';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import { ACCOUNT_ALL, BOARD_STAGES, BoardStage } from '../lib/starbucksBoard';
import {
  COURT_LABEL,
  courtClock,
  courtOf,
  CourtValue,
  exportPipelineReport,
  localDateStamp,
  PRE_STATUS_LABEL,
  PRE_STATUS_OPTIONS,
  preStatusOf,
  ReportField,
  ReportRow,
  saveCourt,
  savePreStatus,
  statusKind,
  statusText,
} from '../lib/starbucksPipelineReport';

const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';
const ACCOUNT_KEY = 'sbPipelineReportAccount';
const FILTER_KEY = 'sbPipelineReportFilters';

const STAGE_STYLE: Record<BoardStage, { bg: string; fg: string }> = {
  'Pre-Submittal': { bg: '#FFFFFF', fg: '#4A6B94' },
  'Submitted-Reviewing': { bg: '#E8EEF5', fg: '#4A6B94' },
  'Negotiating LOI': { bg: '#4A6B94', fg: '#FFFFFF' },
  'At Lease/PSA': { bg: '#002147', fg: '#FFFFFF' },
};

const COURT_VALUES: CourtValue[] = ['us', 'them', 'unset'];

interface Filters {
  search: string;
  stages: BoardStage[];   // empty = all
  status: string;         // '' = all; else an exact statusText
  courts: CourtValue[];   // empty = all
  minDays: string;        // '' = any
}
const NO_FILTERS: Filters = { search: '', stages: [], status: '', courts: [], minDays: '' };

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* per-viewer convenience only */
  }
}
function loadAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || STARBUCKS_CLIENT_ID;
  } catch {
    return STARBUCKS_CLIENT_ID;
  }
}

function toggle<T>(xs: T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

function matches(r: ReportRow, f: Filters): boolean {
  if (f.stages.length && !f.stages.includes(r.stageLabel)) return false;
  if (f.status && statusText(r) !== f.status) return false;
  if (f.courts.length && !f.courts.includes(courtOf(r))) return false;
  if (f.minDays !== '') {
    const c = courtClock(r);
    if (!c || c.days < Number(f.minDays)) return false;
  }
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [r.name, r.city, r.notes, r.packageStatus, r.ballInCourtParty, statusText(r)].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function filterNote(f: Filters): string | undefined {
  const parts: string[] = [];
  if (f.stages.length) parts.push(f.stages.join(', '));
  if (f.status) parts.push(f.status);
  if (f.courts.length) parts.push(`Court: ${f.courts.map((c) => COURT_LABEL[c]).join('/')}`);
  if (f.minDays !== '') parts.push(`${f.minDays}+ days in court`);
  if (f.search.trim()) parts.push(`"${f.search.trim()}"`);
  return parts.length ? `filtered: ${parts.join(' · ')}` : undefined;
}

interface CourtEdit {
  row: ReportRow;
  rect: DOMRect;
}

export default function StarbucksPipelineReportPage() {
  const navigate = useNavigate();
  const [accountId, setAccountIdState] = useState<string>(loadAccount);
  const { rows, accounts, loading, error, saveError, move, setField, resetOrder, refresh } =
    useStarbucksPipelineReport(accountId);
  const [filters, setFiltersState] = useState<Filters>(() => readStore(FILTER_KEY, NO_FILTERS));
  const [exporting, setExporting] = useState(false);
  const [courtEdit, setCourtEdit] = useState<CourtEdit | null>(null);
  const [sidebar, setSidebar] = useState<{ siteSubmitId: string | null; dealId: string | null } | null>(null);

  useEffect(() => {
    document.title = 'Starbucks Pipeline Report | OVIS';
  }, []);

  function setAccountId(id: string) {
    setAccountIdState(id);
    writeStore(ACCOUNT_KEY, id);
  }
  function setFilters(next: Filters) {
    setFiltersState(next);
    writeStore(FILTER_KEY, next);
  }

  const isAll = accountId === ACCOUNT_ALL;
  const accountName = isAll ? 'All Starbucks' : accounts.find((a) => a.clientId === accountId)?.filter ?? 'Starbucks';
  const title = isAll ? 'Starbucks Pipeline Report' : `${accountName} Pipeline Report`;

  const rank = useMemo(() => new Map(rows.map((r, i) => [r.id, i + 1])), [rows]);
  const visible = useMemo(() => rows.filter((r) => matches(r, filters)), [rows, filters]);
  const filtered = visible.length !== rows.length;

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.stageLabel, (m.get(r.stageLabel) ?? 0) + 1);
    return m;
  }, [rows]);
  const statusOptions = useMemo(() => {
    const seen = new Set(rows.map(statusText));
    // stage order, then alphabetical within a stage
    return [...seen].sort((a, b) => {
      const sa = BOARD_STAGES.findIndex((s) => a.startsWith(s));
      const sb = BOARD_STAGES.findIndex((s) => b.startsWith(s));
      return sa !== sb ? sa - sb : a.localeCompare(b);
    });
  }, [rows]);

  // Drop position is in the VISIBLE list; re-rank against the visible
  // neighbours so hidden rows keep their place in the full order.
  function onDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return;
    const ids = visible.map((r) => r.id);
    const [id] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, id);
    const at = result.destination.index;
    move(id, ids[at - 1] ?? null, ids[at + 1] ?? null);
  }

  async function onExport() {
    setExporting(true);
    try {
      await exportPipelineReport(visible, { title, showAccount: isAll, filterNote: filterNote(filters) });
    } finally {
      setExporting(false);
    }
  }

  function onResetOrder() {
    if (window.confirm('Reset the ranking to stage order (At Lease/PSA first)? Your drag order will be replaced.')) {
      resetOrder();
    }
  }

  const seg = (active: boolean) => ({
    backgroundColor: active ? '#002147' : 'transparent',
    color: active ? '#FFFFFF' : '#4A6B94',
  });

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#002147' }}>{title}</h1>
            <p className="mt-1 text-sm" style={{ color: '#4A6B94' }}>
              Drag rows to rank by which deal we think is next — Excel exports the rows shown, in this order.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 && (
              <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid #8FA9C8' }}>
                <button onClick={() => setAccountId(ACCOUNT_ALL)} className="px-3 py-1.5 text-sm font-medium" style={seg(isAll)}>
                  All
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.clientId}
                    onClick={() => setAccountId(a.clientId)}
                    className="px-3 py-1.5 text-sm font-medium"
                    style={seg(a.clientId === accountId)}
                  >
                    {a.filter}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate('/starbucks-board')}
              className="px-3 py-1.5 text-sm font-medium rounded-md"
              style={{ border: '1px solid #8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
            >
              📺 Deal Board
            </button>
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
              disabled={exporting || visible.length === 0}
              className="px-4 py-1.5 text-sm font-semibold rounded-md disabled:opacity-50"
              style={{ backgroundColor: '#002147', color: '#FFFFFF' }}
            >
              {exporting ? 'Exporting…' : filtered ? `Export ${visible.length} to Excel` : 'Export to Excel'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ border: '1px solid #8FA9C8' }}>
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search name, city, notes…"
            className="px-2.5 py-1.5 rounded text-sm w-56 focus:outline-none"
            style={{ border: '1px solid #8FA9C8', color: '#002147' }}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8FA9C8' }}>Stage</span>
            {BOARD_STAGES.map((s) => {
              const on = filters.stages.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => setFilters({ ...filters, stages: toggle(filters.stages, s) })}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ border: '1px solid #8FA9C8', ...seg(on), color: on ? '#FFFFFF' : '#002147' }}
                >
                  {s} <strong>{stageCounts.get(s) ?? 0}</strong>
                </button>
              );
            })}
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-2 py-1.5 rounded text-sm bg-white focus:outline-none"
            style={{ border: '1px solid #8FA9C8', color: filters.status ? '#002147' : '#4A6B94' }}
          >
            <option value="">All statuses</option>
            {statusOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8FA9C8' }}>Court</span>
            {COURT_VALUES.map((c) => {
              const on = filters.courts.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => setFilters({ ...filters, courts: toggle(filters.courts, c) })}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ border: '1px solid #8FA9C8', ...seg(on), color: on ? '#FFFFFF' : '#002147' }}
                >
                  {COURT_LABEL[c]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: '#4A6B94' }}>
            <span className="font-semibold uppercase tracking-wide" style={{ color: '#8FA9C8' }}>Days ≥</span>
            <input
              type="number"
              min={0}
              value={filters.minDays}
              onChange={(e) => setFilters({ ...filters, minDays: e.target.value })}
              className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
              style={{ border: '1px solid #8FA9C8', color: '#002147' }}
            />
          </label>
          <span className="text-xs ml-auto" style={{ color: '#4A6B94' }}>
            {filtered ? `${visible.length} of ${rows.length}` : `${rows.length} total`}
          </span>
          {filtered && (
            <button onClick={() => setFilters(NO_FILTERS)} className="text-xs underline" style={{ color: '#4A6B94' }}>
              Clear filters
            </button>
          )}
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
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 1250 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: 270 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
                <th />
                <th className="px-2 py-2.5 text-center font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Deal / Site Submit</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">Court</th>
                <th className="px-3 py-2.5 text-center font-semibold">Days in Court</th>
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
                      <tr><td colSpan={9} className="px-3 py-10 text-center" style={{ color: '#8FA9C8' }}>Loading…</td></tr>
                    ) : visible.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-10 text-center" style={{ color: '#8FA9C8' }}>
                        {rows.length ? 'No sites match these filters.' : 'No sites in these stages.'}
                      </td></tr>
                    ) : (
                      visible.map((r, i) => (
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
                              <td className="px-2 py-2.5 text-center font-semibold" style={{ color: '#002147', width: 44 }}>{rank.get(r.id)}</td>
                              <td className="px-3 py-2.5">
                                <button
                                  onClick={() => setSidebar({ siteSubmitId: r.siteSubmitId, dealId: r.siteSubmitId ? null : r.dealId })}
                                  className="text-left font-medium hover:underline"
                                  style={{ color: '#002147' }}
                                  title={r.siteSubmitId ? 'Open site submit' : 'Open deal'}
                                >
                                  {r.name}
                                </button>
                                <div className="text-xs" style={{ color: '#4A6B94' }}>
                                  {r.city}
                                  {isAll && <span className="ml-2 font-semibold" style={{ color: '#8FA9C8' }}>{r.accountToken}</span>}
                                  {r.parked && <span className="ml-2 italic" style={{ color: '#A27B5C' }}>parked</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2" style={{ width: 270 }}>
                                <span
                                  className="inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={{ backgroundColor: STAGE_STYLE[r.stageLabel].bg, color: STAGE_STYLE[r.stageLabel].fg, border: '1px solid #8FA9C8' }}
                                >
                                  {r.stageLabel}
                                </span>
                                {statusKind(r) === 'pre' && (
                                  <div className="mt-1.5">
                                    <PreStatusCell row={r} onSaved={refresh} />
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2" style={{ width: 130 }}>
                                <CourtCell row={r} onEdit={(rect) => setCourtEdit({ row: r, rect })} />
                              </td>
                              <td className="px-2 py-2 text-center" style={{ width: 100 }}>
                                <DaysCell row={r} onEdit={(rect) => setCourtEdit({ row: r, rect })} />
                              </td>
                              <td className="px-2 py-1.5" style={{ width: 140 }}>
                                <EditableCell row={r} field="package_status" value={r.packageStatus} onSave={setField} />
                              </td>
                              <td className="px-2 py-1.5">
                                <EditableCell row={r} field="notes" value={r.notes} onSave={setField} multiline />
                              </td>
                              <td className="px-3 py-2.5 text-center" style={{ width: 64 }}>
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

      {courtEdit && (
        <CourtEditor
          // re-seed when a different row is opened
          key={courtEdit.row.id}
          row={rows.find((r) => r.id === courtEdit.row.id) ?? courtEdit.row}
          rect={courtEdit.rect}
          onClose={() => setCourtEdit(null)}
          onSaved={() => { setCourtEdit(null); refresh(); }}
        />
      )}

      {/* The same slideout the map opens: site submit (with its deal tab), or
          the deal directly when a card has no site submit. */}
      <SiteSubmitSidebar
        siteSubmitId={sidebar?.siteSubmitId ?? null}
        dealId={sidebar?.dealId ?? null}
        isOpen={sidebar !== null}
        onClose={() => setSidebar(null)}
        context="deal"
        onStatusChange={() => refresh()}
        onDataUpdate={() => refresh()}
      />
    </div>
  );
}

// Who owes, plus the party label. Click to edit court / party / start date.
function CourtCell({ row, onEdit }: { row: ReportRow; onEdit: (rect: DOMRect) => void }) {
  const c = courtOf(row);
  return (
    <button
      onClick={(e) => onEdit(e.currentTarget.getBoundingClientRect())}
      className="w-full text-left px-1.5 py-1 rounded hover:bg-[#F8FAFC]"
      style={{ border: `1px solid ${c === 'unset' ? '#A27B5C' : '#8FA9C8'}` }}
      title="Change court or when it started"
    >
      <span className="text-sm font-medium" style={{ color: c === 'unset' ? '#8FA9C8' : '#002147' }}>{COURT_LABEL[c]}</span>
      {row.ballInCourtParty && c !== 'unset' && (
        <div className="text-xs truncate" style={{ color: '#4A6B94' }}>{row.ballInCourtParty}</div>
      )}
    </button>
  );
}

// Days on the board clock + the start date; warm/hot use the board's thresholds.
function DaysCell({ row, onEdit }: { row: ReportRow; onEdit: (rect: DOMRect) => void }) {
  const c = courtClock(row);
  if (!c) {
    return (
      <span className="text-xs" style={{ color: '#8FA9C8' }} title={row.heat === 'no_history' ? 'No touch history yet' : 'Court not set'}>
        —
      </span>
    );
  }
  const late = row.heat === 'hot' || row.heat === 'warm';
  return (
    <button
      onClick={(e) => onEdit(e.currentTarget.getBoundingClientRect())}
      className="px-2 py-0.5 rounded hover:bg-[#F8FAFC]"
      title={`${row.heat === 'hot' ? 'Overdue on the board clock. ' : row.heat === 'warm' ? 'Getting stale. ' : ''}Click to correct the start date`}
    >
      <div className="text-sm" style={{ color: late ? '#A27B5C' : '#002147', fontWeight: row.heat === 'hot' ? 700 : 500 }}>{c.days}d</div>
      {row.ballInCourtSince && (
        <div className="text-[11px]" style={{ color: '#8FA9C8' }}>since {format(new Date(row.ballInCourtSince), 'M/d/yy')}</div>
      )}
    </button>
  );
}

// Court popover: who owes, the party, and when the court started — so a court
// that changed on a date nobody recorded (LOI comments came back on the 3rd)
// can be corrected here. Writes the board's state; the board shows it.
function CourtEditor({ row, rect, onClose, onSaved }: { row: ReportRow; rect: DOMRect; onClose: () => void; onSaved: () => void }) {
  const initialSince = row.ballInCourtSince ? localDateStamp(new Date(row.ballInCourtSince)) : localDateStamp();
  const [court, setCourt] = useState<CourtValue>(courtOf(row));
  const [party, setParty] = useState(row.ballInCourtParty ?? '');
  const [since, setSince] = useState(initialSince);
  const [sinceTouched, setSinceTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A new court starts today unless a date is picked.
  function pickCourt(c: CourtValue) {
    setCourt(c);
    if (!sinceTouched) setSince(c === courtOf(row) ? initialSince : localDateStamp());
  }

  const dirty = court !== courtOf(row) || (party.trim() || null) !== (row.ballInCourtParty ?? null) || since !== initialSince;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await saveCourt(row, { court, party, since });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
      setSaving(false);
    }
  }

  const width = 280;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + 330 < window.innerHeight;
  const pos = below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-lg p-3"
        style={{ left, width, border: '1px solid #8FA9C8', ...pos }}
      >
        <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA9C8' }}>Ball in court</div>
        <div className="flex gap-1.5 mb-2">
          {COURT_VALUES.map((c) => (
            <button
              key={c}
              onClick={() => pickCourt(c)}
              className="flex-1 text-sm py-1 rounded"
              style={{
                border: '1px solid #8FA9C8',
                backgroundColor: court === c ? '#002147' : 'transparent',
                color: court === c ? '#FFFFFF' : '#4A6B94',
              }}
            >
              {c === 'unset' ? 'Clear' : COURT_LABEL[c]}
            </button>
          ))}
        </div>
        <input
          value={party}
          onChange={(e) => setParty(e.target.value)}
          placeholder="Who specifically? (Landlord, Seller…)"
          disabled={court === 'unset'}
          className="w-full px-2 py-1.5 rounded text-sm mb-3 focus:outline-none disabled:opacity-50"
          style={{ border: '1px solid #8FA9C8', color: '#002147' }}
        />
        <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA9C8' }}>Court started</div>
        <DatePicker
          selected={parseISO(since)}
          onChange={(d) => { setSince(d ? format(d, 'yyyy-MM-dd') : localDateStamp()); setSinceTouched(true); }}
          dateFormat="MM/dd/yyyy"
          maxDate={new Date()}
          popperProps={{ strategy: 'fixed' }}
          className="w-full px-2 py-1.5 rounded text-sm border border-[#8FA9C8] text-[#002147]"
        />
        <div className="text-[11px] mt-1" style={{ color: '#4A6B94' }}>
          The board's clock counts from this date.
        </div>
        {err && <div className="text-xs mt-2" style={{ color: '#A27B5C' }}>{err}</div>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded" style={{ color: '#4A6B94' }}>Cancel</button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm font-semibold rounded disabled:opacity-50"
            style={{ backgroundColor: '#002147', color: '#FFFFFF' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

// Pre-Submittal status (what we're waiting on). Writes the card's board state —
// the deal board shows the change. Holds the pick until the refetch catches up.
function PreStatusCell({ row, onSaved }: { row: ReportRow; onSaved: () => void }) {
  const current = preStatusOf(row);
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
      await savePreStatus(row, v as Parameters<typeof savePreStatus>[1]);
      onSaved();
    } catch (e: any) {
      setPending(null);
      setErr(e?.message ?? 'Failed to save');
    }
  }

  const value = pending ?? current;
  const options: string[] = [...PRE_STATUS_OPTIONS, ...(current === 'll' ? ['ll'] : [])];
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
          <option key={o} value={o}>{PRE_STATUS_LABEL[o as keyof typeof PRE_STATUS_LABEL]}</option>
        ))}
      </select>
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
