import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface MerchantCategoryTreeCategory {
  id: string;
  name: string;
  display_order: number;
}

export interface MerchantCategoryTreeBrand {
  id: string;
  name: string;
  category_id: string | null;
  logo_url: string | null;
}

interface MerchantCategoryTreeProps {
  categories: MerchantCategoryTreeCategory[];
  brands: MerchantCategoryTreeBrand[];
  selectedBrandIds: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Optional external search input mode — when true, the internal search input is hidden.
   *  The drawer keeps its own search UX; the modal uses the built-in one. */
  hideSearch?: boolean;
  /** Optional externally-controlled search value (used when hideSearch=true). */
  externalSearch?: string;
  /** Start with all categories expanded. Useful in the New Favorite modal. */
  expandAllByDefault?: boolean;
}

// Dark-mode palette — mirrors MerchantsDrawer so tree looks native in either host.
const DARK = {
  border: '#334155',
  borderSubtle: '#1e293b',
  textPrimary: '#f1f5f9',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  accentStrong: '#60a5fa',
  inputBg: '#1e293b',
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

const MerchantCategoryTree: React.FC<MerchantCategoryTreeProps> = ({
  categories,
  brands,
  selectedBrandIds,
  onChange,
  hideSearch = false,
  externalSearch = '',
  expandAllByDefault = false,
}) => {
  const [internalSearch, setInternalSearch] = useState('');
  const search = hideSearch ? externalSearch : internalSearch;

  const brandsByCategory = useMemo(() => {
    const map = new Map<string, MerchantCategoryTreeBrand[]>();
    for (const b of brands) {
      const key = b.category_id || '_uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [brands]);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() =>
    expandAllByDefault ? new Set(categories.map((c) => c.id)) : new Set(),
  );

  // Keep expandAllByDefault in sync if categories arrive after mount.
  useEffect(() => {
    if (expandAllByDefault && categories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categories.map((c) => c.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length, expandAllByDefault]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedSearch) {
      return { cats: categories, brandsByCat: brandsByCategory };
    }
    const matchingCatIds = new Set<string>();
    const filteredBrandsByCat = new Map<string, MerchantCategoryTreeBrand[]>();
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
    for (const b of catBrands) if (selectedBrandIds.has(b.id)) selectedCount++;
    if (selectedCount === 0) return { checked: false, indeterminate: false };
    if (selectedCount === catBrands.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const toggleCategory = (catId: string) => {
    const catBrands = brandsByCategory.get(catId) || [];
    if (catBrands.length === 0) return;
    const { checked, indeterminate } = categoryState(catId);
    const allSelected = checked && !indeterminate;
    const next = new Set(selectedBrandIds);
    if (allSelected) {
      for (const b of catBrands) next.delete(b.id);
    } else {
      for (const b of catBrands) next.add(b.id);
    }
    onChange(next);
  };

  const toggleBrand = (brandId: string) => {
    const next = new Set(selectedBrandIds);
    if (next.has(brandId)) next.delete(brandId);
    else next.add(brandId);
    onChange(next);
  };

  return (
    <>
      {!hideSearch && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${DARK.border}` }}>
          <input
            type="text"
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
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
        </div>
      )}
      {filtered.cats.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: DARK.textMuted, textAlign: 'center' }}>
          No matches.
        </div>
      )}
      {filtered.cats.map((cat) => {
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
                  const sel = selectedBrandIds.has(b.id);
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
                        onChange={() => toggleBrand(b.id)}
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
    </>
  );
};

export default MerchantCategoryTree;
