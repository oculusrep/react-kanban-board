import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLayerManager } from './layers/LayerManager';
import MerchantCategoryTree, {
  type MerchantCategoryTreeBrand,
  type MerchantCategoryTreeCategory,
} from './MerchantCategoryTree';
import NewMerchantFavoriteModal from './NewMerchantFavoriteModal';

interface MerchantsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Map instance — used to zoom-gate the "Show all in viewport" toggle. */
  map?: google.maps.Map | null;
}

// Zoom threshold matching the MarkerClusterer breakdown in MerchantLayer —
// at zoom 13+ you're in a specific trade area, so unrestricted merchant
// display is useful. Below that it would dump too many pins.
const SHOW_ALL_MIN_ZOOM = 13;

interface FavoriteRow {
  id: string;
  name: string;
  brand_ids: Set<string>;
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

const MerchantsDrawer: React.FC<MerchantsDrawerProps> = ({ isOpen, onClose, map }) => {
  const {
    layerState,
    toggleLayer,
    merchantSelectedBrandIds,
    setMerchantSelectedBrandIds,
    toggleMerchantBrand,
    merchantShowAllInViewport,
    setMerchantShowAllInViewport,
  } = useLayerManager();

  const { userTableId } = useAuth();

  const [categories, setCategories] = useState<MerchantCategoryTreeCategory[]>([]);
  const [brands, setBrands] = useState<MerchantCategoryTreeBrand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSelectedPopover, setShowSelectedPopover] = useState(false);
  const selectedPopoverRef = useRef<HTMLDivElement>(null);
  const selectedPopoverAnchorRef = useRef<HTMLButtonElement>(null);

  const merchantsVisible = layerState.merchants?.isVisible ?? false;

  // Track map zoom so the "Show all in viewport" toggle can enable/disable
  // in real time as the user pans/zooms. Below SHOW_ALL_MIN_ZOOM the toggle
  // is disabled to prevent dumping 21k pins on a zoomed-out map.
  const [currentZoom, setCurrentZoom] = useState<number>(() => map?.getZoom() ?? 0);
  useEffect(() => {
    if (!map) return;
    const initial = map.getZoom();
    if (initial != null) setCurrentZoom(initial);
    const listener = map.addListener('zoom_changed', () => {
      const z = map.getZoom();
      if (z != null) setCurrentZoom(z);
    });
    return () => google.maps.event.removeListener(listener);
  }, [map]);
  const showAllEnabled = currentZoom >= SHOW_ALL_MIN_ZOOM;

  // Auto-disable the override when the user zooms out past the threshold —
  // otherwise a user could turn it on at zoom 13 and then zoom out to a
  // scale where 21k pins would render.
  useEffect(() => {
    if (merchantShowAllInViewport && !showAllEnabled) {
      setMerchantShowAllInViewport(false);
    }
  }, [merchantShowAllInViewport, showAllEnabled, setMerchantShowAllInViewport]);

  // Favorites state
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [newFavoriteOpen, setNewFavoriteOpen] = useState(false);
  const [editingFavorite, setEditingFavorite] = useState<{ id: string; name: string } | null>(null);
  // What the modal's tree should preload with. For "+ New" this is the
  // drawer's current selection; for "Edit" this is the favorite's own brand set.
  const [modalInitialBrandIds, setModalInitialBrandIds] = useState<Set<string>>(new Set());
  const [openMenuFavoriteId, setOpenMenuFavoriteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadFavorites = useCallback(async () => {
    setFavoritesLoading(true);
    setFavoritesError(null);
    try {
      // Supabase RLS filters to own + shared favorites automatically.
      const { data, error: qerr } = await supabase
        .from('merchant_favorite')
        .select('id, name, brands:merchant_favorite_brand(brand_id)')
        .order('name', { ascending: true });
      if (qerr) throw qerr;
      const rows: FavoriteRow[] = (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        brand_ids: new Set<string>((f.brands || []).map((b: any) => b.brand_id)),
      }));
      setFavorites(rows);
    } catch (e: any) {
      console.error('loadFavorites failed:', e);
      setFavoritesError(e?.message || 'Failed to load favorites');
    } finally {
      setFavoritesLoading(false);
    }
  }, []);

  // Load categories + brands on first open
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
            .select('id, name, category_id, logo_url, custom_logo_url')
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

  // Load favorites on first open
  useEffect(() => {
    if (!isOpen) return;
    loadFavorites();
  }, [isOpen, loadFavorites]);

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

  // Close favorite menu on outside click
  useEffect(() => {
    if (!openMenuFavoriteId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpenMenuFavoriteId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuFavoriteId]);

  const clearAll = () => setMerchantSelectedBrandIds(new Set());
  const selectAll = () => setMerchantSelectedBrandIds(new Set(brands.map((b) => b.id)));
  const allSelected =
    brands.length > 0 && merchantSelectedBrandIds.size === brands.length;

  // ─── Favorite helpers ────────────────────────────────────────────────

  // Tri-state per favorite: compare its brand_ids to the drawer's current selection.
  const favoriteState = (fav: FavoriteRow): { checked: boolean; indeterminate: boolean } => {
    if (fav.brand_ids.size === 0) return { checked: false, indeterminate: false };
    let hit = 0;
    for (const id of fav.brand_ids) if (merchantSelectedBrandIds.has(id)) hit++;
    if (hit === 0) return { checked: false, indeterminate: false };
    if (hit === fav.brand_ids.size) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  // Clicking a favorite unions its brand_ids into the selection; clicking
  // again (state = fully checked) removes exactly those.
  const applyFavorite = (fav: FavoriteRow) => {
    const { checked, indeterminate } = favoriteState(fav);
    const allSelected = checked && !indeterminate;
    const next = new Set(merchantSelectedBrandIds);
    if (allSelected) {
      for (const id of fav.brand_ids) next.delete(id);
    } else {
      for (const id of fav.brand_ids) next.add(id);
    }
    setMerchantSelectedBrandIds(next);
  };

  const saveNewFavorite = async (name: string, brandIds: Set<string>) => {
    if (!userTableId) throw new Error('You must be signed in to create favorites.');
    // 1. Insert the favorite row. owner_user_id is filled by a column DEFAULT
    //    (merchants_current_user_id()) so it always matches the RLS check,
    //    regardless of any stale userTableId in the client cache.
    const { data: favRow, error: favErr } = await supabase
      .from('merchant_favorite')
      .insert({ name })
      .select('id')
      .single();
    if (favErr) throw favErr;
    // 2. Insert the many-to-many rows.
    if (brandIds.size > 0) {
      const rows = Array.from(brandIds).map((brand_id) => ({
        favorite_id: favRow.id,
        brand_id,
      }));
      const { error: linkErr } = await supabase.from('merchant_favorite_brand').insert(rows);
      if (linkErr) throw linkErr;
    }
    await loadFavorites();
  };

  const saveEditedFavorite = async (name: string, brandIds: Set<string>) => {
    if (!editingFavorite) throw new Error('No favorite being edited.');
    const favId = editingFavorite.id;
    // 1. Update the name.
    const { error: nameErr } = await supabase
      .from('merchant_favorite')
      .update({ name })
      .eq('id', favId);
    if (nameErr) throw nameErr;
    // 2. Replace the brand set — delete-all + insert-all is simpler than
    //    diffing and RLS-safe (owner/edit-shared has DELETE on the links).
    const { error: delErr } = await supabase
      .from('merchant_favorite_brand')
      .delete()
      .eq('favorite_id', favId);
    if (delErr) throw delErr;
    if (brandIds.size > 0) {
      const rows = Array.from(brandIds).map((brand_id) => ({
        favorite_id: favId,
        brand_id,
      }));
      const { error: insErr } = await supabase.from('merchant_favorite_brand').insert(rows);
      if (insErr) throw insErr;
    }
    await loadFavorites();
  };

  const deleteFavorite = async (fav: FavoriteRow) => {
    if (!confirm(`Delete favorite "${fav.name}"? This can't be undone.`)) return;
    const { error: delErr } = await supabase
      .from('merchant_favorite')
      .delete()
      .eq('id', fav.id);
    if (delErr) {
      console.error('deleteFavorite failed:', delErr);
      alert(`Failed to delete: ${delErr.message}`);
      return;
    }
    setOpenMenuFavoriteId(null);
    await loadFavorites();
  };

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
                  {(b.custom_logo_url || b.logo_url) && (
                    <img
                      src={b.custom_logo_url || b.logo_url || undefined}
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

      {/* "Show all in viewport" toggle — zoom-gated. When ON, overrides brand
          filter and renders every merchant in the current viewport. */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${DARK.border}`,
          background: DARK.subtleBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: showAllEnabled ? DARK.textSecondary : DARK.textMuted,
            cursor: showAllEnabled ? 'pointer' : 'not-allowed',
            flex: 1,
            minWidth: 0,
          }}
          title={showAllEnabled ? 'Show every merchant in the current viewport' : 'Zoom in to enable'}
        >
          <button
            onClick={() => {
              if (!showAllEnabled) return;
              setMerchantShowAllInViewport(!merchantShowAllInViewport);
            }}
            disabled={!showAllEnabled}
            style={{
              position: 'relative',
              width: 36,
              height: 20,
              borderRadius: 999,
              border: 'none',
              padding: 0,
              cursor: showAllEnabled ? 'pointer' : 'not-allowed',
              background:
                merchantShowAllInViewport && showAllEnabled
                  ? DARK.accentStrong
                  : DARK.toggleOff,
              opacity: showAllEnabled ? 1 : 0.5,
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            aria-label="Toggle show all merchants in viewport"
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: merchantShowAllInViewport && showAllEnabled ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                transition: 'left 0.15s',
              }}
            />
          </button>
          <span
            style={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Show all in viewport
          </span>
        </label>
        {!showAllEnabled && (
          <span
            style={{
              fontSize: 11,
              color: DARK.textMuted,
              fontStyle: 'italic',
              flexShrink: 0,
            }}
          >
            Zoom in to enable
          </span>
        )}
      </div>

      {/* Favorites section — muted with the tree while override is ON, since
          applying a favorite can't affect the render either. */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${DARK.border}`,
          opacity: merchantShowAllInViewport ? 0.4 : 1,
          pointerEvents: merchantShowAllInViewport ? 'none' : 'auto',
          transition: 'opacity 0.15s',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: DARK.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Favorites
          </span>
          <button
            onClick={() => {
              setEditingFavorite(null);
              setModalInitialBrandIds(new Set(merchantSelectedBrandIds));
              setNewFavoriteOpen(true);
            }}
            disabled={brands.length === 0}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: DARK.accent,
              cursor: brands.length === 0 ? 'default' : 'pointer',
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            + New
          </button>
        </div>
        {favoritesLoading && (
          <div style={{ fontSize: 12, color: DARK.textMuted, padding: '4px 0' }}>
            Loading favorites…
          </div>
        )}
        {favoritesError && (
          <div style={{ fontSize: 12, color: DARK.errorText, padding: '4px 0' }}>
            {favoritesError}
          </div>
        )}
        {!favoritesLoading && !favoritesError && favorites.length === 0 && (
          <div style={{ fontSize: 12, color: DARK.textMuted, padding: '4px 0' }}>
            No favorites yet. Select brands below and click "+ New" to save them.
          </div>
        )}
        {!favoritesLoading &&
          !favoritesError &&
          favorites.map((fav) => {
            const { checked, indeterminate } = favoriteState(fav);
            const menuOpen = openMenuFavoriteId === fav.id;
            return (
              <div
                key={fav.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  fontSize: 13,
                  color: DARK.textSecondary,
                  position: 'relative',
                }}
              >
                <TriStateCheckbox
                  checked={checked}
                  indeterminate={indeterminate}
                  onChange={() => applyFavorite(fav)}
                  ariaLabel={`Apply favorite ${fav.name}`}
                />
                <span
                  onClick={() => applyFavorite(fav)}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={fav.name}
                >
                  {fav.name}
                </span>
                <span style={{ fontSize: 11, color: DARK.textMuted }}>
                  ({fav.brand_ids.size})
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuFavoriteId(menuOpen ? null : fav.id);
                  }}
                  aria-label={`Options for ${fav.name}`}
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
                  ⋯
                </button>
                {menuOpen && (
                  <div
                    ref={menuRef}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      background: DARK.popoverBg,
                      border: `1px solid ${DARK.popoverBorder}`,
                      borderRadius: 6,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      zIndex: 10003,
                      minWidth: 140,
                    }}
                  >
                    <button
                      onClick={() => {
                        setOpenMenuFavoriteId(null);
                        setEditingFavorite({ id: fav.id, name: fav.name });
                        setModalInitialBrandIds(new Set(fav.brand_ids));
                        setNewFavoriteOpen(true);
                      }}
                      style={menuItemStyle()}
                    >
                      Edit / rename
                    </button>
                    <button onClick={() => deleteFavorite(fav)} style={menuItemStyle(true)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
        {(brands.length > 0) && (
          <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
            {!allSelected && (
              <button
                onClick={selectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: DARK.accent,
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Select all ({brands.length})
              </button>
            )}
            {merchantSelectedBrandIds.size > 0 && (
              <button
                onClick={clearAll}
                style={{
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
        )}
      </div>

      {/* Body — muted + non-interactive while "Show all in viewport" is ON,
          since selection is being overridden and can't drive the render. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 0',
          opacity: merchantShowAllInViewport ? 0.4 : 1,
          pointerEvents: merchantShowAllInViewport ? 'none' : 'auto',
          transition: 'opacity 0.15s',
        }}
      >
        {loading && (
          <div style={{ padding: 16, fontSize: 13, color: DARK.textMuted, textAlign: 'center' }}>
            Loading brands…
          </div>
        )}
        {error && (
          <div style={{ padding: 16, fontSize: 13, color: DARK.errorText }}>{error}</div>
        )}
        {!loading && !error && (
          <MerchantCategoryTree
            categories={categories}
            brands={brands}
            selectedBrandIds={merchantSelectedBrandIds}
            onChange={setMerchantSelectedBrandIds}
            hideSearch
            externalSearch={search}
          />
        )}
      </div>

      <NewMerchantFavoriteModal
        isOpen={newFavoriteOpen}
        onClose={() => {
          setNewFavoriteOpen(false);
          setEditingFavorite(null);
        }}
        categories={categories}
        brands={brands}
        initialSelectedBrandIds={modalInitialBrandIds}
        editing={editingFavorite}
        onSave={editingFavorite ? saveEditedFavorite : saveNewFavorite}
      />
    </div>
  );
};

function menuItemStyle(destructive = false): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    color: destructive ? DARK.errorText : DARK.textSecondary,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

export default MerchantsDrawer;
