// Starbucks Pipeline Report — data hook.
// Membership comes from the deal board (useStarbucksBoard): every card in the
// four board stages, parked ones included. This hook adds what the board
// doesn't carry — deal / site submit names, map coordinates — and the report's
// own fields + order from starbucks_pipeline_report_row.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import useStarbucksBoard from './useStarbucksBoard';
import { Account, accountFor, BoardDeal, BoardStage } from '../lib/starbucksBoard';
import {
  compareReportRows,
  googleMapsUrl,
  ReportField,
  ReportRow,
  saveReportField,
  saveReportOrder,
} from '../lib/starbucksPipelineReport';

const PAGE_SIZE = 1000;
const IN_CHUNK = 100; // keep .in() URLs short

type One<T> = T | T[] | null;
function embed<T>(v: One<T> | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface PropertyCoords {
  verified_latitude: number | null;
  verified_longitude: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface Extra {
  name: string | null;
  mapUrl: string | null;
}

interface StoredRow {
  site_submit_id: string | null;
  deal_id: string | null;
  sort_order: number | null;
  package_status: string | null;
  notes: string | null;
}

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += IN_CHUNK) out.push(xs.slice(i, i + IN_CHUNK));
  return out;
}

function propertyUrl(p: PropertyCoords | null): string | null {
  if (!p) return null;
  return (
    googleMapsUrl(p.verified_latitude, p.verified_longitude) ??
    googleMapsUrl(p.latitude, p.longitude)
  );
}

async function fetchExtras(cards: BoardDeal[]): Promise<Map<string, Extra>> {
  const out = new Map<string, Extra>();
  const siteIds = cards.map((c) => c.siteSubmitId).filter((x): x is string => !!x);
  const orphanDealIds = cards.filter((c) => !c.siteSubmitId && c.dealId).map((c) => c.dealId!);

  for (const ids of chunks(siteIds)) {
    const { data, error } = await supabase
      .from('site_submit')
      .select(`
        id, site_submit_name,
        verified_latitude, verified_longitude, sf_property_latitude, sf_property_longitude,
        property:property!site_submit_property_id_fkey ( verified_latitude, verified_longitude, latitude, longitude ),
        deal:deal!deal_site_submit_fk ( deal_name )
      `)
      .in('id', ids);
    if (error) throw error;
    for (const r of (data as any[]) ?? []) {
      // Coordinate priority: site_submit verified → property verified →
      // site_submit sf_property → property raw.
      const p = embed<PropertyCoords>(r.property);
      const url =
        googleMapsUrl(r.verified_latitude, r.verified_longitude) ??
        googleMapsUrl(p?.verified_latitude, p?.verified_longitude) ??
        googleMapsUrl(r.sf_property_latitude, r.sf_property_longitude) ??
        googleMapsUrl(p?.latitude, p?.longitude);
      const dealName = embed<{ deal_name: string | null }>(r.deal)?.deal_name ?? null;
      out.set(r.id, { name: dealName || r.site_submit_name || null, mapUrl: url });
    }
  }

  for (const ids of chunks(orphanDealIds)) {
    const { data, error } = await supabase
      .from('deal')
      .select('id, deal_name, property:property_id ( verified_latitude, verified_longitude, latitude, longitude )')
      .in('id', ids);
    if (error) throw error;
    for (const r of (data as any[]) ?? []) {
      out.set(r.id, { name: r.deal_name, mapUrl: propertyUrl(embed<PropertyCoords>(r.property)) });
    }
  }
  return out;
}

async function fetchStoredRows(): Promise<StoredRow[]> {
  const rows: StoredRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('starbucks_pipeline_report_row')
      .select('site_submit_id, deal_id, sort_order, package_status, notes')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data as StoredRow[]) ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export interface PipelineReportData {
  rows: ReportRow[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  saveError: string | null;
  // Re-rank one row next to its new visible neighbours. Works in a filtered
  // view: hidden rows keep their positions in the full order.
  move: (id: string, afterId: string | null, beforeId: string | null) => void;
  setField: (row: ReportRow, field: ReportField, value: string) => void;
  resetOrder: () => void;
  refresh: () => void;   // re-read board state after a status write
}

export default function useStarbucksPipelineReport(accountFilter: string): PipelineReportData {
  const board = useStarbucksBoard(accountFilter);
  const [extras, setExtras] = useState<Map<string, Extra>>(new Map());
  const [stored, setStored] = useState<StoredRow[]>([]);
  const [order, setOrder] = useState<string[] | null>(null); // local order after a drag
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // bumps a re-read of names / coords

  // Every card in the four stages: columns, both bands, and the parking lot.
  const cards = useMemo(() => {
    const byId = new Map<string, BoardDeal>();
    for (const d of [
      ...board.columns.flatMap((c) => c.deals),
      ...board.ready,
      ...board.toClassify,
      ...board.parked,
    ]) byId.set(d.id, d);
    return [...byId.values()];
  }, [board.columns, board.ready, board.toClassify, board.parked]);

  const parkedIds = useMemo(() => new Set(board.parked.map((d) => d.id)), [board.parked]);
  const idKey = useMemo(() => cards.map((c) => c.id).sort().join(','), [cards]);

  useEffect(() => {
    if (board.loading) return;
    let cancelled = false;
    setExtrasLoading(true);
    Promise.all([fetchExtras(cards), fetchStoredRows()])
      .then(([ex, st]) => {
        if (cancelled) return;
        setExtras(ex);
        setStored(st);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load report');
        // eslint-disable-next-line no-console
        console.error('useStarbucksPipelineReport:', e);
      })
      .finally(() => {
        if (!cancelled) setExtrasLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // idKey stands in for `cards` — refetch only when membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, board.loading, nonce]);

  const rows = useMemo<ReportRow[]>(() => {
    const bySite = new Map<string, StoredRow>();
    const byDeal = new Map<string, StoredRow>();
    for (const s of stored) {
      if (s.site_submit_id) bySite.set(s.site_submit_id, s);
      else if (s.deal_id) byDeal.set(s.deal_id, s);
    }
    const built = cards.map<ReportRow>((c) => {
      const s = c.siteSubmitId ? bySite.get(c.siteSubmitId) : c.dealId ? byDeal.get(c.dealId) : undefined;
      const ex = extras.get(c.siteSubmitId ?? c.dealId ?? '');
      return {
        id: c.id,
        siteSubmitId: c.siteSubmitId,
        dealId: c.dealId,
        name: ex?.name || c.name,
        city: c.city,
        stageLabel: c.stageLabel as BoardStage,
        clientId: c.clientId,
        accountToken: c.accountToken,
        accountName: accountFor(c.clientId, c.clientName).filter,
        parked: parkedIds.has(c.id),
        mapUrl: ex?.mapUrl ?? null,
        sortOrder: s?.sort_order ?? null,
        ballInCourt: c.ballInCourt,
        ballInCourtParty: c.ballInCourtParty,
        ballInCourtSince: c.ballInCourtSince,
        blockedOn: c.blockedOn,
        needsPricing: c.needsPricing,
        needsSitePlan: c.needsSitePlan,
        days: c.days,
        heat: c.heat,
        packageStatus: s?.package_status ?? '',
        notes: s?.notes ?? '',
      };
    });
    built.sort(compareReportRows);
    if (!order) return built;
    // After a drag, the local order wins; cards new since then go to the end.
    const pos = new Map(order.map((id, i) => [id, i]));
    return built
      .map((r, i) => ({ r, k: pos.get(r.id) ?? order.length + i }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
  }, [cards, extras, stored, order, parkedIds]);

  const move = useCallback(
    (id: string, afterId: string | null, beforeId: string | null) => {
      const next = rows.filter((r) => r.id !== id);
      const moved = rows.find((r) => r.id === id);
      if (!moved) return;
      let at = afterId ? next.findIndex((r) => r.id === afterId) + 1 : beforeId ? next.findIndex((r) => r.id === beforeId) : 0;
      if (at < 0) at = 0;
      next.splice(at, 0, moved);
      if (next.every((r, i) => r.id === rows[i].id)) return;
      setOrder(next.map((r) => r.id));
      setSaveError(null);
      saveReportOrder(next).catch((e) => setSaveError(e?.message ?? 'Failed to save order'));
    },
    [rows]
  );

  const setField = useCallback((row: ReportRow, field: ReportField, value: string) => {
    const keyMatches = (s: StoredRow) =>
      row.siteSubmitId ? s.site_submit_id === row.siteSubmitId : s.deal_id === row.dealId;
    setStored((prev) => {
      const v = value.trim() || null;
      const hit = prev.find(keyMatches);
      if (hit) return prev.map((s) => (keyMatches(s) ? { ...s, [field]: v } : s));
      return [
        ...prev,
        {
          site_submit_id: row.siteSubmitId,
          deal_id: row.siteSubmitId ? null : row.dealId,
          sort_order: null,
          package_status: null,
          notes: null,
          [field]: v,
        },
      ];
    });
    setSaveError(null);
    saveReportField(row, field, value).catch((e) => setSaveError(e?.message ?? 'Failed to save'));
  }, []);

  // Drop the manual ranking: back to stage order (furthest along first).
  const resetOrder = useCallback(() => {
    const ranked = [...rows].sort((a, b) => compareReportRows({ ...a, sortOrder: null }, { ...b, sortOrder: null }));
    setOrder(ranked.map((r) => r.id));
    setSaveError(null);
    saveReportOrder(ranked).catch((e) => setSaveError(e?.message ?? 'Failed to save order'));
  }, [rows]);

  return {
    rows,
    accounts: board.accounts,
    loading: board.loading || extrasLoading,
    error: board.error ?? error,
    saveError,
    move,
    setField,
    resetOrder,
    refresh: () => {
      board.refresh();
      setNonce((n) => n + 1);
    },
  };
}
