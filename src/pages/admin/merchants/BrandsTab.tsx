import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import {
  BRAND_COLOR_DARK,
  BRAND_COLOR_LIGHT,
  BRAND_COLOR_MED,
  BRAND_COLOR_WARN,
  buildLogoUrl,
  LogoVariant,
} from './shared';

interface MerchantBrand {
  id: string;
  name: string;
  category_id: string;
  brandfetch_domain: string | null;
  logo_url: string | null;
  logo_fetched_at: string | null;
  logo_variant: LogoVariant;
  is_active: boolean;
  brandfetch_logo_status: 'unknown' | 'ok' | 'miss';
  brandfetch_checked_at: string | null;
  // Admin-uploaded logo (Layer 3 escape hatch). When set, overrides logo_url
  // at render time on the map. See MERCHANTS_ADMIN_ROADMAP.md §6 Layer 3.
  custom_logo_url: string | null;
  custom_logo_uploaded_at: string | null;
  // Override for the ingest-time name check and render-time name filter. Set
  // when Google Places' actual display name differs from OVIS's brand.name
  // (e.g. "Truist Bank" vs "Truist"). NULL = fall back to brand.name.
  places_display_name: string | null;
  merchant_category?: { name: string } | null;
}

const CUSTOM_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB — matches ClientOverviewTab

// 'no_logo' = nothing at all (no domain set) OR domain set but Brandfetch
// has no real asset (status='miss'). 'brandfetch_miss' filters down to JUST
// the latter — the actionable ones where admin can try a different domain.
type LogoFilter = 'all' | 'has_logo' | 'no_logo' | 'brandfetch_miss';

export default function BrandsTab() {
  const { userTableId } = useAuth();
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
  // Inline places_display_name editor state. Separate from editingBrandId so
  // the two edit modes don't clobber each other.
  const [editingDisplayNameId, setEditingDisplayNameId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string>('');
  const [uploadingBrandId, setUploadingBrandId] = useState<string | null>(null);
  // Hidden per-brand file inputs — clicked programmatically by the Upload button
  // so we don't have to render a visible <input type=file> that can't be styled.
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

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
          .select(
            'id, name, category_id, brandfetch_domain, logo_url, logo_fetched_at, logo_variant, is_active, brandfetch_logo_status, brandfetch_checked_at, custom_logo_url, custom_logo_uploaded_at, places_display_name, merchant_category(name)',
          )
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

  // A brand "has a real logo" iff it has a URL set AND Brandfetch isn't
  // returning the placeholder. Status 'unknown' is treated as has-logo
  // (innocent until proven otherwise) — the cron will fill it in.
  const hasRealLogo = (b: MerchantBrand) =>
    !!b.logo_url && b.brandfetch_logo_status !== 'miss';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands.filter((b) => {
      if (
        q &&
        !b.name.toLowerCase().includes(q) &&
        !(b.brandfetch_domain ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      if (logoFilter === 'has_logo' && !hasRealLogo(b)) return false;
      if (logoFilter === 'no_logo' && hasRealLogo(b)) return false;
      if (logoFilter === 'brandfetch_miss' && b.brandfetch_logo_status !== 'miss') return false;
      if (categoryFilter && b.category_id !== categoryFilter) return false;
      return true;
    });
  }, [brands, search, logoFilter, categoryFilter]);

  const stats = useMemo(() => {
    const total = brands.length;
    const withLogo = brands.filter(hasRealLogo).length;
    const miss = brands.filter((b) => b.brandfetch_logo_status === 'miss').length;
    return { total, withLogo, noLogo: total - withLogo, miss };
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
      const nextLogoUrl = nextDomain ? buildLogoUrl(nextDomain, brand.logo_variant) : null;
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({
          brandfetch_domain: nextDomain,
          logo_url: nextLogoUrl,
          logo_fetched_at: nextDomain ? new Date().toISOString() : null,
          // Reset to 'unknown' until verify confirms. Avoids showing stale
          // 'miss' / 'ok' badge while the new URL is being checked.
          brandfetch_logo_status: 'unknown',
          brandfetch_checked_at: null,
        })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? {
                ...b,
                brandfetch_domain: nextDomain,
                logo_url: nextLogoUrl,
                logo_fetched_at: nextDomain ? new Date().toISOString() : null,
                brandfetch_logo_status: 'unknown',
                brandfetch_checked_at: null,
              }
            : b,
        ),
      );
      setEditingBrandId(null);
      setEditingDomain('');

      // Kick off immediate re-verify if a domain was set. Fire-and-forget;
      // we re-fetch the brand row when the function returns and patch state
      // so the admin sees the verified status without a manual reload.
      if (nextDomain) {
        verifyBrand(brand.id);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed';
      alert(`Save failed: ${message}`);
    } finally {
      setSavingBrandId(null);
    }
  };

  // Hit the Edge Function in brandIds mode so the new logo URL is checked
  // server-side immediately. Function updates merchant_brand in place; we
  // re-fetch the row when it returns and patch local state so the badge
  // updates without a manual reload.
  const verifyBrand = async (brandId: string) => {
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(
        `${projectUrl}/functions/v1/merchant-logo-refresh?brandIds=${brandId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
          body: '{}',
        },
      );
      if (!res.ok) {
        console.warn('verifyBrand: function returned HTTP', res.status);
        return;
      }
      const { data, error } = await supabase
        .from('merchant_brand')
        .select('brandfetch_logo_status, brandfetch_checked_at, logo_url, logo_fetched_at')
        .eq('id', brandId)
        .single();
      if (error || !data) return;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brandId
            ? {
                ...b,
                brandfetch_logo_status: data.brandfetch_logo_status,
                brandfetch_checked_at: data.brandfetch_checked_at,
                logo_url: data.logo_url,
                logo_fetched_at: data.logo_fetched_at,
              }
            : b,
        ),
      );
    } catch (e) {
      console.warn('verifyBrand failed:', e);
    }
  };

  const changeVariant = async (brand: MerchantBrand, variant: LogoVariant) => {
    if (!brand.brandfetch_domain) {
      // No domain = no URL to rebuild. Just persist the variant choice for later.
      setSavingBrandId(brand.id);
      try {
        const { error: updErr } = await supabase
          .from('merchant_brand')
          .update({ logo_variant: variant })
          .eq('id', brand.id);
        if (updErr) throw updErr;
        setBrands((prev) =>
          prev.map((b) => (b.id === brand.id ? { ...b, logo_variant: variant } : b)),
        );
      } catch (e: unknown) {
        alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`);
      } finally {
        setSavingBrandId(null);
      }
      return;
    }
    setSavingBrandId(brand.id);
    try {
      const nextLogoUrl = buildLogoUrl(brand.brandfetch_domain, variant);
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({
          logo_variant: variant,
          logo_url: nextLogoUrl,
          logo_fetched_at: new Date().toISOString(),
        })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? {
                ...b,
                logo_variant: variant,
                logo_url: nextLogoUrl,
                logo_fetched_at: new Date().toISOString(),
              }
            : b,
        ),
      );
    } catch (e: unknown) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingBrandId(null);
    }
  };

  // ── Places display-name override ───────────────────────────────────────
  //
  // For brands where Google Places' display name differs from OVIS's
  // brand.name — "Truist Bank" -> "Truist", "Dunkin' Donuts" -> "Dunkin'",
  // "Apple Store" -> "Apple", "Verizon Wireless" -> "Verizon". The
  // render-time filter and ingest guard both use this when set.

  const startEditDisplayName = (brand: MerchantBrand) => {
    setEditingDisplayNameId(brand.id);
    setEditingDisplayName(brand.places_display_name ?? '');
  };

  const cancelEditDisplayName = () => {
    setEditingDisplayNameId(null);
    setEditingDisplayName('');
  };

  const saveDisplayName = async (brand: MerchantBrand) => {
    const trimmed = editingDisplayName.trim();
    const next = trimmed || null;
    setSavingBrandId(brand.id);
    try {
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({ places_display_name: next })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) => (b.id === brand.id ? { ...b, places_display_name: next } : b)),
      );
      setEditingDisplayNameId(null);
      setEditingDisplayName('');
    } catch (e: unknown) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingBrandId(null);
    }
  };

  // ── Custom logo upload / remove ────────────────────────────────────────
  //
  // Files land in the existing `assets` bucket (public read) under
  // `merchant-logos/{brandId}-{ts}.{ext}`. We do NOT delete previous files
  // on replace — the URL just gets overwritten on the row. Trade-off: small
  // Storage leak for atomicity and rollback safety. Cleanup can be a batch
  // job later if it ever matters.

  const uploadCustomLogo = async (brand: MerchantBrand, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (PNG, SVG, JPG, WebP).');
      return;
    }
    if (file.size > CUSTOM_LOGO_MAX_BYTES) {
      alert('Image must be under 2 MB.');
      return;
    }
    setUploadingBrandId(brand.id);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `merchant-logos/${brand.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
      const customUrl = urlData.publicUrl;
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({
          custom_logo_url: customUrl,
          custom_logo_uploaded_at: nowIso,
          custom_logo_uploaded_by: userTableId,
        })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? { ...b, custom_logo_url: customUrl, custom_logo_uploaded_at: nowIso }
            : b,
        ),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      alert(`Upload failed: ${message}`);
    } finally {
      setUploadingBrandId(null);
    }
  };

  const removeCustomLogo = async (brand: MerchantBrand) => {
    if (!brand.custom_logo_url) return;
    if (!confirm(`Remove custom logo for "${brand.name}"? Pin will revert to the Brandfetch logo.`)) {
      return;
    }
    setUploadingBrandId(brand.id);
    try {
      const { error: updErr } = await supabase
        .from('merchant_brand')
        .update({
          custom_logo_url: null,
          custom_logo_uploaded_at: null,
          custom_logo_uploaded_by: null,
        })
        .eq('id', brand.id);
      if (updErr) throw updErr;
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? { ...b, custom_logo_url: null, custom_logo_uploaded_at: null }
            : b,
        ),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Remove failed';
      alert(`Remove failed: ${message}`);
    } finally {
      setUploadingBrandId(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total brands" value={stats.total} />
        <StatCard label="With logo" value={stats.withLogo} accent={BRAND_COLOR_MED} />
        <StatCard
          label="Brandfetch miss"
          value={stats.miss}
          accent={stats.miss > 0 ? BRAND_COLOR_WARN : BRAND_COLOR_LIGHT}
        />
        <StatCard
          label="Needs attention"
          value={stats.noLogo}
          accent={stats.noLogo > 0 ? BRAND_COLOR_WARN : BRAND_COLOR_LIGHT}
        />
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
            <option value="no_logo">Missing logo (any reason)</option>
            <option value="brandfetch_miss">Brandfetch returned nothing</option>
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

        {loading && (
          <div className="p-8 text-center text-gray-500 text-sm">Loading brands…</div>
        )}
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
                    <th className="px-4 py-3">Places name</th>
                    <th className="px-4 py-3 w-28">Variant</th>
                    <th className="px-4 py-3 w-44">Custom logo</th>
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
                          <DisplayNameCell
                            brand={brand}
                            editing={editingDisplayNameId === brand.id}
                            saving={savingBrandId === brand.id}
                            value={editingDisplayName}
                            onChange={setEditingDisplayName}
                            onStart={() => startEditDisplayName(brand)}
                            onSave={() => saveDisplayName(brand)}
                            onCancel={cancelEditDisplayName}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={brand.logo_variant}
                            onChange={(e) => changeVariant(brand, e.target.value as LogoVariant)}
                            disabled={isSaving}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            title="Which Brandfetch asset to request. Override to 'icon' for brands whose full logo is unreadable at pin size."
                          >
                            <option value="auto">Auto</option>
                            <option value="icon">Icon</option>
                            <option value="logo">Logo</option>
                            <option value="symbol">Symbol</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <CustomLogoCell
                            brand={brand}
                            uploading={uploadingBrandId === brand.id}
                            fileInputRef={(el) => {
                              if (el) fileInputRefs.current.set(brand.id, el);
                              else fileInputRefs.current.delete(brand.id);
                            }}
                            onPickFile={(file) => uploadCustomLogo(brand, file)}
                            onClickUpload={() => fileInputRefs.current.get(brand.id)?.click()}
                            onRemove={() => removeCustomLogo(brand)}
                          />
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
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">
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

      <div className="mt-6 text-xs text-gray-500 space-y-1">
        <div>
          <strong>Domain:</strong> Brandfetch resolves brands by their primary web domain. For US
          regional variants (e.g. ALDI US vs ALDI Süd), set the domain you want the pin to use.
          Press Enter to save or Escape to cancel.
        </div>
        <div>
          <strong>Variant:</strong> "Auto" lets Brandfetch pick. Override to "Icon" or "Symbol" when
          the full logo is unreadable at pin size (wordmarks like DUNKIN' / SUBWAY are common
          cases). Changing variant saves and updates the preview immediately.
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? BRAND_COLOR_DARK }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function LogoPreview({ brand }: { brand: MerchantBrand }) {
  // imgFailed is a client-side belt-and-suspenders fallback for cases where the
  // DB still says 'ok' but the browser fetch fails. Resets on URL change.
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [brand.logo_url, brand.custom_logo_url]);

  const fallbackLetter = brand.name.charAt(0).toUpperCase();
  // Preview shows what the map pin will show: custom logo wins over Brandfetch.
  const activeUrl = brand.custom_logo_url || brand.logo_url;
  const usingCustom = !!brand.custom_logo_url;

  // Three states:
  //   1. No URL at all                       — neutral dark circle
  //   2. Brandfetch miss / img fetch failed  — warning circle + ! badge (only when NOT using custom)
  //   3. Logo loaded                         — show it (with a small "C" badge if custom)
  const noUrl = !activeUrl;
  const brandfetchMiss =
    !noUrl && !usingCustom && (brand.brandfetch_logo_status === 'miss' || imgFailed);

  if (noUrl || brandfetchMiss) {
    const bg = brandfetchMiss ? BRAND_COLOR_WARN : BRAND_COLOR_DARK;
    const tooltip = brandfetchMiss
      ? 'Brandfetch has no logo for this domain — try a different domain, or upload a custom logo'
      : 'No logo set';
    return (
      <div className="relative w-12 h-12">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
          style={{ backgroundColor: bg }}
          title={tooltip}
        >
          {fallbackLetter}
        </div>
        {brandfetchMiss && (
          <div
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center text-[10px] font-bold leading-none"
            style={{ borderColor: BRAND_COLOR_WARN, color: BRAND_COLOR_WARN }}
            title={tooltip}
            aria-label="Brandfetch returned no logo"
          >
            !
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-12 h-12">
      <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
        <img
          src={activeUrl!}
          alt={`${brand.name} logo`}
          className="w-10 h-10 object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      </div>
      {usingCustom && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center text-[10px] font-bold leading-none"
          style={{ borderColor: BRAND_COLOR_MED, color: BRAND_COLOR_MED }}
          title="Custom logo (admin upload). Overrides Brandfetch."
          aria-label="Custom uploaded logo"
        >
          C
        </div>
      )}
    </div>
  );
}

interface DisplayNameCellProps {
  brand: MerchantBrand;
  editing: boolean;
  saving: boolean;
  value: string;
  onChange: (v: string) => void;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function DisplayNameCell({
  brand,
  editing,
  saving,
  value,
  onChange,
  onStart,
  onSave,
  onCancel,
}: DisplayNameCellProps) {
  if (editing) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={`Default: ${brand.name}`}
          autoFocus
          disabled={saving}
          className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          title="Google Places' display name for this brand. Blank = fall back to brand name."
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="px-2 py-1 text-xs font-medium text-white rounded disabled:opacity-50"
          style={{ backgroundColor: BRAND_COLOR_DARK }}
        >
          {saving ? '…' : 'OK'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-2 py-1 text-xs text-gray-600 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onStart}
      className="text-xs text-left hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 w-full"
      title="Override the name Places uses for this brand (e.g. 'Truist' for 'Truist Bank'). Click to edit."
    >
      {brand.places_display_name ? (
        <span className="font-mono" style={{ color: BRAND_COLOR_MED }}>
          {brand.places_display_name}
        </span>
      ) : (
        <span className="italic text-gray-400">= {brand.name}</span>
      )}
    </button>
  );
}

interface CustomLogoCellProps {
  brand: MerchantBrand;
  uploading: boolean;
  fileInputRef: (el: HTMLInputElement | null) => void;
  onPickFile: (file: File) => void;
  onClickUpload: () => void;
  onRemove: () => void;
}

function CustomLogoCell({
  brand,
  uploading,
  fileInputRef,
  onPickFile,
  onClickUpload,
  onRemove,
}: CustomLogoCellProps) {
  const has = !!brand.custom_logo_url;
  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = ''; // allow picking the same file again after replace
        }}
      />
      <button
        onClick={onClickUpload}
        disabled={uploading}
        className="px-2 py-1 text-xs text-white rounded hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: has ? BRAND_COLOR_MED : BRAND_COLOR_DARK }}
        title={has ? 'Replace the current custom logo' : 'Upload a custom logo (overrides Brandfetch on the map)'}
      >
        {uploading ? 'Uploading…' : has ? 'Replace' : 'Upload'}
      </button>
      {has && (
        <button
          onClick={onRemove}
          disabled={uploading}
          className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-50"
          style={{ borderColor: BRAND_COLOR_LIGHT, color: BRAND_COLOR_MED }}
          title="Remove the custom logo and revert to Brandfetch"
        >
          Remove
        </button>
      )}
    </div>
  );
}
