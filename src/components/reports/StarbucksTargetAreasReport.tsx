import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface TargetArea {
  id: string;
  name: string | null;
  market_name: string | null;
  priority: number | null;
  model_yr1_sales: number | null;
  notes: string | null;
  source: string | null;
  orep_notes: string | null;
  orep_model_yr1_sales: number | null;
}

// Effective Model Yr1 Sales — OREP override when set, else the raw Starbucks value.
const effSales = (r: TargetArea): number | null =>
  r.orep_model_yr1_sales ?? r.model_yr1_sales;

type SortKey = 'name' | 'market_name' | 'priority' | 'model_yr1_sales';
type SortDir = 'asc' | 'desc';

export default function StarbucksTargetAreasReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TargetArea[]>([]);

  // Filters
  const [marketFilter, setMarketFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [minSales, setMinSales] = useState<string>('');
  const [maxSales, setMaxSales] = useState<string>('');
  const [notesOnly, setNotesOnly] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      const all: TargetArea[] = [];

      while (hasMore) {
        const { data, error: err } = await supabase
          .from('starbucks_target_area')
          .select('id, name, market_name, priority, model_yr1_sales, notes, source, orep_notes, orep_model_yr1_sales')
          .range(offset, offset + PAGE_SIZE - 1);

        if (err) throw err;

        all.push(...((data || []) as TargetArea[]));
        hasMore = (data?.length || 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      setRows(all);
    } catch (err: any) {
      console.error('Error fetching starbucks target areas:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const markets = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.market_name) set.add(r.market_name); });
    return Array.from(set).sort();
  }, [rows]);

  const priorities = useMemo(() => {
    const set = new Set<number>();
    rows.forEach(r => { if (r.priority != null) set.add(r.priority); });
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  const filtered = useMemo(() => {
    const min = minSales ? parseFloat(minSales) : null;
    const max = maxSales ? parseFloat(maxSales) : null;
    const term = search.trim().toLowerCase();

    let out = rows.filter(r => {
      if (marketFilter && r.market_name !== marketFilter) return false;
      if (priorityFilter !== '' && String(r.priority ?? '') !== priorityFilter) return false;
      if (min != null && (effSales(r) ?? -Infinity) < min) return false;
      if (max != null && (effSales(r) ?? Infinity) > max) return false;
      if (notesOnly && !((r.notes && r.notes.trim()) || (r.orep_notes && r.orep_notes.trim()))) return false;
      if (term) {
        const hay = `${r.name ?? ''} ${r.market_name ?? ''} ${r.notes ?? ''} ${r.orep_notes ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      // Sort by the effective (override-aware) sales when sorting on that column.
      const av = sortKey === 'model_yr1_sales' ? effSales(a) : a[sortKey];
      const bv = sortKey === 'model_yr1_sales' ? effSales(b) : b[sortKey];

      // Push nulls to the end regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });

    return out;
  }, [rows, marketFilter, priorityFilter, minSales, maxSales, notesOnly, search, sortKey, sortDir]);

  const totalSales = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (effSales(r) || 0), 0);
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'model_yr1_sales' ? 'desc' : 'asc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-gray-700 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const clearFilters = () => {
    setMarketFilter('');
    setPriorityFilter('');
    setMinSales('');
    setMaxSales('');
    setNotesOnly(false);
    setSearch('');
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const priorityBadge = (priority: number | null) => {
    if (priority == null) return <span className="text-gray-400">-</span>;
    const styles: Record<number, string> = {
      1: 'bg-red-100 text-red-800 border-red-200',
      2: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      3: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    const cls = styles[priority] || 'bg-gray-100 text-gray-800 border-gray-200';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
        P{priority}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error loading report</h3>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gradient-to-r rounded-lg p-6 text-white" style={{ background: 'linear-gradient(to right, #002147, #4A6B94)' }}>
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-medium opacity-90">Starbucks GA Target Areas</h2>
            <p className="text-3xl font-bold mt-1">{filtered.length.toLocaleString()} <span className="text-base font-normal opacity-75">of {rows.length.toLocaleString()}</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Total Model Yr1 Sales (filtered)</p>
            <p className="text-2xl font-semibold">{formatCurrency(totalSales)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search (name, market, notes)</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Market</label>
            <select
              value={marketFilter}
              onChange={e => setMarketFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All markets</option>
              {markets.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All priorities</option>
              {priorities.map(p => <option key={p} value={p}>P{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Min Yr1 Sales</label>
            <input
              type="number"
              value={minSales}
              onChange={e => setMinSales(e.target.value)}
              placeholder="e.g. 1000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Yr1 Sales</label>
            <input
              type="number"
              value={maxSales}
              onChange={e => setMaxSales(e.target.value)}
              placeholder="e.g. 2000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={notesOnly}
              onChange={e => setNotesOnly(e.target.checked)}
              className="rounded border-gray-300 mr-2"
            />
            Only rows with notes
          </label>
          <button
            onClick={clearFilters}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => toggleSort('market_name')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                >
                  Market{sortArrow('market_name')}
                </th>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                >
                  Target Area{sortArrow('name')}
                </th>
                <th
                  onClick={() => toggleSort('priority')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                >
                  Priority{sortArrow('priority')}
                </th>
                <th
                  onClick={() => toggleSort('model_yr1_sales')}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                >
                  Model Yr1 Sales{sortArrow('model_yr1_sales')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    No target areas match the current filters.
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{r.market_name || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{r.name || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-sm">{priorityBadge(r.priority)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: '#4A6B94' }}>
                    {formatCurrency(effSales(r))}
                    {r.orep_model_yr1_sales != null && (
                      <span className="ml-1 text-[10px] font-semibold" style={{ color: '#0000FF' }} title="OREP override">OREP</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                    {r.orep_notes ? (
                      <span><span className="text-[10px] font-semibold mr-1" style={{ color: '#0000FF' }}>OREP:</span>{r.orep_notes}</span>
                    ) : r.notes ? r.notes : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}
