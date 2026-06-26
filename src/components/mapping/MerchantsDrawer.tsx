import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useLayerManager } from './layers/LayerManager';

interface MerchantsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DrawerCategory {
  id: string;
  name: string;
  display_order: number;
}

interface DrawerBrand {
  id: string;
  name: string;
  category_id: string | null;
  logo_url: string | null;
}

// Dark-mode palette for the drawer. Colors picked to stay legible on dark
// backgrounds; brand-blue accents stay close to OVIS palette (Light Slate
// Blue) which already reads well against deep midnight blue.
const DARK = {
  panelBg: '#0f172a',         // slate-900
  subtleBg: '#1e293b',        // slate-800 (sub-bars)
  border: '#334155',          // slate-700
  borderSubtle: '#1e293b',    // slate-800 (zebra dividers)
  textPrimary: '#f1f5f9',     // slate-100
  textSecondary: '#e2e8f0',   // slate-200
  textMuted: '#94a3b8',       // slate-400
  accent: '#8FA9C8',          // OVIS Light Slate Blue (works on dark)
  accentStrong: '#60a5fa',    // blue-400 — for toggles & checkbox fill
  toggleOff: '#475569',       // slate-600
  inputBg: '#1e293b',
  popoverBg: '#1e293b',
  popoverBorder: '#334155',
  errorText: '#fca5a5',       // red-300
};

interface TriStateCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

const TriStateCheckbox: React.FC<TriStateCheckboxProps> = ({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      style={{ width: 16, height: 16, accentColor: DARK.accentStrong, cursor: 'pointer' }}
    />
  );
};

const MerchantsDrawer: React.FC<MerchantsDrawerProps> = ({ isOpen, onClose }) => {
  const {
    layerState,
    toggleLayer,
    merchantSelectedBrandIds,
    setMerchantSelectedBrandIds,
    toggleMerchantBrand,
  } = useLayerManager();

  const [categories, setCategories] = useState<DrawerCategory[]>([]);
  const [brands, setBrands] = useState<DrawerBrand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showSelectedPopover, setShowSelectedPopover] = useState(false);
  const selectedPopoverRef = useRef<HTMLDivElement>(null);
  const selectedPopoverAnchorRef = useRef<HTMLButtonElement>(null);

  const merchantsVisible = layerState.merchants?.isVisible ?? false;

  useEffect(() => {
    if (!isOpen || brands.length > 0) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [catRes, brandRes] = await Promise.all([
          supabase
            .from('merchant_category')
            .select('id, name, display_order')
            .order('display_order', { ascending: true }),
          supabase
            .from('merchant_brand')
            .select('id, name, category_id, logo_url')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        ]);
        if (catRes.error) throw catRes.error;
        if (brandRes.error) throw brandRes.error;
        setCategories(catRes.data || []);
        setBrands(brandRes.data || []);
      } catch (e: any) {
        console.error('MerchantsDrawer load failed:', e);
        setError(e.message || 'Failed to load merchants');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, brands.length]);

  const brandsByCategory = useMemo(() => {
    const map = new Map<string, DrawerBrand[]>();
    for (const b of brands) {
      const key = b.category_id || '_uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [brands]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedSearch) {
      return { cats: categories, brandsByCat: brandsByCategory };
    }
    const matchingCatIds = new Set<string>();
    const filteredBrandsByCat = new Map<string, DrawerBrand[]>();
    for (const cat of categories) {
      const catMatches = cat.name.toLowerCase().includes(normalizedSearch);
      const catBrands = brandsByCategory.get(cat.id) || [];
      const matchedBrands = catMatches
        ? catBrands
        : catBrands.filter((b) => b.name.toLowerCase().includes(normalizedSearch));
      if (matchedBrands.length > 0) {
        matchingCatIds.add(cat.id);
        filteredBrandsByCat.set(cat.id, matchedBrands);
      }
    }
    return {
      cats: categories.filter((c) => matchingCatIds.has(c.id)),
      brandsByCat: filteredBrandsByCat,
    };
  }, [categories, brandsByCategory, normalizedSearch]);

  useEffect(() => {
    if (!normalizedSearch) return;
    setExpandedCategories(new Set(filtered.cats.map((c) => c.id)));
  }, [normalizedSearch, filtered.cats]);

  const selectedBrandList = useMemo(() => {
    return brands
      .filter((b) => merchantSelectedBrandIds.has(b.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [brands, merchantSelectedBrandIds]);

  useEffect(() => {
    if (merchantSelectedBrandIds.size === 0) setShowSelectedPopover(false);
  }, [merchantSelectedBrandIds.size]);

  useEffect(() => {
    if (!showSelectedPopover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        selectedPopoverRef.current?.contains(target) ||
        selectedPopoverAnchorRef.current?.contains(target)
      ) {
        return;
      }
      setShowSelectedPopover(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSelectedPopover]);

  const toggleCategoryExpanded = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categoryState = (catId: string): { checked: boolean; indeterminate: boolean } => {
    const catBrands = filtered.brandsByCat.get(catId) || brandsByCategory.get(catId) || [];
    if (catBrands.length === 0) return { checked: false, indeterminate: false };
    let selectedCount = 0;
    for (const b of catBrands) if (merchantSelectedBrandIds.has(b.id)) selectedCount++;
    if (selectedCount === 0) return { checked: false, indeterminate: false };
    if (selectedCount === catBrands.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const toggleCategory = (catId: string) => {
    const catBrands = brandsByCategory.get(catId) || [];
    if (catBrands.length === 0) return;
    const { checked, indeterminate } = categoryState(catId);
    const allSelected = checked && !indeterminate;
    const next = new Set(merchantSelectedBrandIds);
    if (allSelected) {
      for (const b of catBrands) next.delete(b.id);
    } else {
      for (const b of catBrands) next.add(b.id);
    }
    setMerchantSelectedBrandIds(next);
  };

  const clearAll = () => setMerchantSelectedBrandIds(new Set());

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 12,
        bottom: 12,
        width: 360,
        background: DARK.panelBg,
        border: `1px solid ${DARK.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10001,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: DARK.textPrimary,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${DARK.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🏬</span>
          <span style={{ fontWeight: 600, fontSize: 15, color: DARK.textPrimary }}>Merchants</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: DARK.textMuted,
            fontSize: 22,
            lineHeight: 1,
            padding: 0,
            width: 24,
            height: 24,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Visibility toggle row */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${DARK.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: DARK.subtleBg,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: DARK.textSecondary,
            cursor: 'pointer',
          }}
        >
          <button
            onClick={() => toggleLayer('merchants')}
            style={{
              position: 'relative',
              width: 36,
              height: 20,
              borderRadius: 999,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              background: merchantsVisible ? DARK.accentStrong : DARK.toggleOff,
              transition: 'background 0.15s',
            }}
            aria-label="Toggle merchants layer"
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: merchantsVisible ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                transition: 'left 0.15s',
              }}
            />
          </button>
          <span style={{ fontWeight: 500 }}>Show on map</span>
        </label>
        <div style={{ position: 'relative' }}>
          <button
            ref={selectedPopoverAnchorRef}
            onClick={() => {
              if (merchantSelectedBrandIds.size === 0) return;
              setShowSelectedPopover((v) => !v);
            }}
            disabled={merchantSelectedBrandIds.size === 0}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: merchantSelectedBrandIds.size === 0 ? DARK.textMuted : DARK.accent,
              cursor: merchantSelectedBrandIds.size === 0 ? 'default' : 'pointer',
              textDecoration: merchantSelectedBrandIds.size === 0 ? 'none' : 'underline',
              fontFamily: 'inherit',
            }}
          >
            {merchantSelectedBrandIds.size} brand{merchantSelectedBrandIds.size === 1 ? '' : 's'}
          </button>

          {showSelectedPopover && selectedBrandList.length > 0 && (
            <div
              ref={selectedPopoverRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: 240,
                maxHeight: 300,
                overflowY: 'auto',
                background: DARK.popoverBg,
                border: `1px solid ${DARK.popoverBorder}`,
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 10002,
              }}
            >
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${DARK.border}`,
                  fontSize: 11,
                  fontWeight: 600,
                  color: DARK.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                Selected brands
              </div>
              {selectedBrandList.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    fontSize: 13,
                    color: DARK.textSecondary,
                    borderBottom: `1px solid ${DARK.borderSubtle}`,
                  }}
                >
                  {b.logo_url && (
                    <img
                      src={b.logo_url}
                      alt=""
                      style={{
                        width: 18,
                        height: 18,
                        objectFit: 'contain',
                        flexShrink: 0,
                      }}
                      loading="lazy"
                    />
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </span>
                  <button
                    onClick={() => toggleMerchantBrand(b.id)}
                    title={`Remove ${b.name}`}
                    aria-label={`Remove ${b.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: DARK.textMuted,
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '0 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search + clear */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${DARK.border}` }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brands or categories…"
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 13,
            border: `1px solid ${DARK.border}`,
            borderRadius: 6,
            outline: 'none',
            boxSizing: 'border-box',
            background: DARK.inputBg,
            color: DARK.textPrimary,
          }}
        />
        {merchantSelectedBrandIds.size > 0 && (
          <button
            onClick={clearAll}
            style={{
              marginTop: 6,
              background: 'none',
              border: 'none',
              color: DARK.accent,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Clear all selections
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading && (
          <div style={{ padding: 16, fontSize: 13, color: DARK.textMuted, textAlign: 'center' }}>
            Loading brands…
          </div>
        )}
        {error && (
          <div style={{ padding: 16, fontSize: 13, color: DARK.errorText }}>{error}</div>
        )}
        {!loading && !error && filtered.cats.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: DARK.textMuted, textAlign: 'center' }}>
            No matches.
          </div>
        )}
        {!loading &&
          !error &&
          filtered.cats.map((cat) => {
            const catBrands = filtered.brandsByCat.get(cat.id) || [];
            const { checked, indeterminate } = categoryState(cat.id);
            const expanded = expandedCategories.has(cat.id);
            return (
              <div key={cat.id} style={{ borderBottom: `1px solid ${DARK.borderSubtle}` }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleCategoryExpanded(cat.id)}
                >
                  <span
                    style={{
                      width: 12,
                      display: 'inline-block',
                      color: DARK.textMuted,
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {expanded ? '▾' : '▸'}
                  </span>
                  <TriStateCheckbox
                    checked={checked}
                    indeterminate={indeterminate}
                    onChange={() => toggleCategory(cat.id)}
                    ariaLabel={`Toggle ${cat.name}`}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      color: DARK.textPrimary,
                    }}
                  >
                    {cat.name}
                  </span>
                  <span style={{ fontSize: 12, color: DARK.textMuted }}>({catBrands.length})</span>
                </div>
                {expanded && (
                  <div style={{ paddingBottom: 6 }}>
                    {catBrands.map((b) => {
                      const sel = merchantSelectedBrandIds.has(b.id);
                      return (
                        <label
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 14px 4px 42px',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: DARK.textSecondary,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggleMerchantBrand(b.id)}
                            style={{
                              width: 14,
                              height: 14,
                              accentColor: DARK.accentStrong,
                              cursor: 'pointer',
                            }}
                          />
                          {b.logo_url && (
                            <img
                              src={b.logo_url}
                              alt=""
                              style={{
                                width: 18,
                                height: 18,
                                objectFit: 'contain',
                                flexShrink: 0,
                              }}
                              loading="lazy"
                            />
                          )}
                          <span style={{ flex: 1 }}>{b.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default MerchantsDrawer;
