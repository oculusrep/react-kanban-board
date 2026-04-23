import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Spec: docs/MERCHANTS_LAYER_SPEC.md §7
// Phase 1 "Brands" tab only. Categories, Closure Alerts, and Ingestion
// Activity tabs are pending (see docs/MERCHANTS_ADMIN_ROADMAP.md).

interface MerchantBrand {
  id: string;
  name: string;
  category_id: string;
  brandfetch_domain: string | null;
  logo_url: string | null;
  logo_fetched_at: string | null;
  is_active: boolean;
  merchant_category?: { name: string } | null;
}

type LogoFilter = 'all' | 'has_logo' | 'no_logo';

const BRAND_COLOR_DARK = '#002147';
const BRAND_COLOR_MED = '#4A6B94';
const BRAND_COLOR_LIGHT = '#8FA9C8';

const BRANDFETCH_CLIENT_ID = (import.meta.env.VITE_BRANDFETCH_CLIENT_ID as string) || '';

function buildLogoUrl(domain: string): string {
  return `https://cdn.brandfetch.io/${domain}/w/128/h/128?c=${BRANDFETCH_CLIENT_ID}`;
}

export default function MerchantAdminBrandsPage() {
  const [brands, setBrands] = useState<MerchantBrand[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [logoFilter, setLogoFilter] = useState<LogoFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingDomain, setEditingDomain] = useState<string>('');
  const [savingBrandId, setSavingBrandId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Admin · Merchants · Brands | OVIS';
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const PAGE_SIZE = 1000;
      let allBrands: MerchantBrand[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('merchant_brand')
          .select('id, name, category_id, brandfetch_domain, logo_url, logo_fetched_at, is_active, merchant_category(name)')
          .order('name')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        allBrands = allBrands.concat((data as unknown as MerchantBrand[]) ?? []);
        hasMore = (data?.length ?? 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      const { data: cats, error: catErr } = await supabase
        .from('merchant_category')
        .select('id, name')
        .order('display_order');
      if (catErr) throw catErr;

      setBrands(allBrands);
      setCategories(cats ?? []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load brands';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands.filter((b) => {
      if (q && !b.name.toLowerCase().includes(q) && !(b.brandfetch_domain ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (logoFilter === 'has_logo' && !b.logo_url) return false;
      if (logoFilter === 'no_logo' && b.logo_url) return false;
      if (categoryFilter && b.category_id !== categoryFilter) return false;
      return true;
    });
  }, [brands, search, logoFilter, categoryFilter]);

  const stats = useMemo(() => {
    const total = brands.length;
    const withLogo = brands.filter((b) => b.logo_url).length;
    return { total, withLogo, noLogo: total - withLogo };
  }, [brands]);

  const startEdit = (brand: MerchantBrand) => {
    setEditingBrandId(brand.id);
    setEditingDomain(brand.brandfetch_domain ?? '');
  };

  const cancelEdit = () => {
    setEditingBrandId(null);
    setEditingDomain('');
  };

  const saveDomain = async (brand: MerchantBrand) => {
    const trimmed = editingDomain.trim().toLowerCase();
    setSavingBrandId(brand.id);
    try {
      const nextDomain = trimmed || null;
      const nextLogoUrl = nextDomain ? buildLogoUrl(nextDomain) : null;
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({
          brandfetch_domain: nextDomain,
          logo_url: nextLogoUrl,
          logo_fetched_at: nextDomain ? new Date().toISOString() : null,
        })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? { ...b, brandfetch_domain: nextDomain, logo_url: nextLogoUrl, logo_fetched_at: nextDomain ? new Date().toISOString() : null }
            : b,
        ),
      );
      setEditingBrandId(null);
      setEditingDomain('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed';
      alert(`Save failed: ${message}`);
    } finally {
      setSavingBrandId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" style={{ color: BRAND_COLOR_DARK }}>
            Merchants — Brands
          </h1>
          <p className="text-gray-600 mt-1 text-sm">
            Review and correct brand logos for the Merchants map layer. Edit a brand's domain to update
            which logo shows on the map.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label="Total brands" value={stats.total} />
          <StatCard label="With logo" value={stats.withLogo} accent={BRAND_COLOR_MED} />
          <StatCard label="Needs attention" value={stats.noLogo} accent={stats.noLogo > 0 ? '#A27B5C' : BRAND_COLOR_LIGHT} />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 grid grid-cols-1 md:grid-cols-[1fr_200px_200px] gap-3">
            <input
              type="text"
              placeholder="Search by brand name or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={logoFilter}
              onChange={(e) => setLogoFilter(e.target.value as LogoFilter)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All brands</option>
              <option value="has_logo">Has logo</option>
              <option value="no_logo">Missing logo</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {loading && <div className="p-8 text-center text-gray-500 text-sm">Loading brands…</div>}
          {error && (
            <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded m-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                Showing {filtered.length} of {brands.length} brand{brands.length === 1 ? '' : 's'}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <th className="px-4 py-3 w-20">Logo</th>
                      <th className="px-4 py-3">Brand</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Brandfetch domain</th>
                      <th className="px-4 py-3 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((brand) => {
                      const isEditing = editingBrandId === brand.id;
                      const isSaving = savingBrandId === brand.id;
                      return (
                        <tr key={brand.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <LogoPreview brand={brand} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
                              {brand.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {brand.merchant_category?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingDomain}
                                onChange={(e) => setEditingDomain(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveDomain(brand);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                placeholder="e.g. starbucks.com"
                                autoFocus
                                className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : brand.brandfetch_domain ? (
                              <span className="font-mono text-xs" style={{ color: BRAND_COLOR_MED }}>
                                {brand.brandfetch_domain}
                              </span>
                            ) : (
                              <span className="text-xs italic text-gray-400">not set</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => saveDomain(brand)}
                                  disabled={isSaving}
                                  className="px-2 py-1 text-xs font-medium text-white rounded disabled:opacity-50"
                                  style={{ backgroundColor: BRAND_COLOR_DARK }}
                                >
                                  {isSaving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  disabled={isSaving}
                                  className="px-2 py-1 text-xs text-gray-600 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(brand)}
                                className="px-2 py-1 text-xs text-white rounded hover:opacity-90"
                                style={{ backgroundColor: BRAND_COLOR_MED }}
                              >
                                Edit domain
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                          No brands match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Tip: Brandfetch resolves brands by their primary web domain. For US regional variants
          (e.g. ALDI US vs ALDI Süd), set the domain you want the pin to use. Press Enter to save
          or Escape to cancel.
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div
        className="text-3xl font-bold mt-1"
        style={{ color: accent ?? BRAND_COLOR_DARK }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function LogoPreview({ brand }: { brand: MerchantBrand }) {
  const [failed, setFailed] = useState(false);
  const fallbackLetter = brand.name.charAt(0).toUpperCase();

  const showFallback = !brand.logo_url || failed;

  if (showFallback) {
    return (
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
        style={{ backgroundColor: BRAND_COLOR_DARK }}
        title={brand.logo_url ? 'Logo failed to load' : 'No logo set'}
      >
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
      <img
        src={brand.logo_url!}
        alt={`${brand.name} logo`}
        className="w-10 h-10 object-contain"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
