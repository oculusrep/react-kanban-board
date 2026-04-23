import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { BRAND_COLOR_DARK, BRAND_COLOR_LIGHT, BRAND_COLOR_MED } from './shared';

interface MerchantCategory {
  id: string;
  name: string;
  display_order: number;
  refresh_frequency_days: number;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CategoryWithCount extends MerchantCategory {
  brand_count: number;
}

export default function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRefreshDays, setEditRefreshDays] = useState(30);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Create state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRefreshDays, setNewRefreshDays] = useState(30);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: cats, error: catErr } = await supabase
        .from('merchant_category')
        .select('id, name, display_order, refresh_frequency_days, last_refreshed_at, created_at, updated_at')
        .order('display_order');
      if (catErr) throw catErr;

      // Count brands per category. Cheap enough to do in one query.
      const { data: brandCounts, error: countErr } = await supabase
        .from('merchant_brand')
        .select('category_id');
      if (countErr) throw countErr;

      const countMap = new Map<string, number>();
      for (const row of brandCounts ?? []) {
        countMap.set(row.category_id, (countMap.get(row.category_id) ?? 0) + 1);
      }

      const withCounts: CategoryWithCount[] = (cats ?? []).map((c) => ({
        ...c,
        brand_count: countMap.get(c.id) ?? 0,
      }));

      setCategories(withCounts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const startEdit = (cat: CategoryWithCount) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditRefreshDays(cat.refresh_frequency_days);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditRefreshDays(30);
  };

  const saveEdit = async (cat: CategoryWithCount) => {
    const name = editName.trim();
    if (!name) {
      alert('Category name is required.');
      return;
    }
    if (editRefreshDays < 1 || editRefreshDays > 365) {
      alert('Refresh frequency must be between 1 and 365 days.');
      return;
    }
    setSavingId(cat.id);
    try {
      const { error: updErr } = await supabase
        .from('merchant_category')
        .update({ name, refresh_frequency_days: editRefreshDays })
        .eq('id', cat.id);
      if (updErr) throw updErr;
      setCategories((prev) =>
        prev.map((c) =>
          c.id === cat.id ? { ...c, name, refresh_frequency_days: editRefreshDays } : c,
        ),
      );
      cancelEdit();
    } catch (e: unknown) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingId(null);
    }
  };

  const deleteCategory = async (cat: CategoryWithCount) => {
    if (cat.brand_count > 0) {
      alert(
        `Cannot delete "${cat.name}" — ${cat.brand_count} brand${
          cat.brand_count === 1 ? '' : 's'
        } still assigned. Reassign or delete the brands first.`,
      );
      return;
    }
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    setSavingId(cat.id);
    try {
      const { error: delErr } = await supabase
        .from('merchant_category')
        .delete()
        .eq('id', cat.id);
      if (delErr) throw delErr;
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } catch (e: unknown) {
      alert(`Delete failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingId(null);
    }
  };

  const createCategory = async () => {
    const name = newName.trim();
    if (!name) {
      alert('Category name is required.');
      return;
    }
    if (newRefreshDays < 1 || newRefreshDays > 365) {
      alert('Refresh frequency must be between 1 and 365 days.');
      return;
    }
    // Pick next display_order = max + 100 so new categories land at the end.
    const maxDisplayOrder = categories.reduce((max, c) => Math.max(max, c.display_order), 0);
    try {
      const { data, error: insErr } = await supabase
        .from('merchant_category')
        .insert({
          name,
          refresh_frequency_days: newRefreshDays,
          display_order: maxDisplayOrder + 100,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      setCategories((prev) => [...prev, { ...(data as MerchantCategory), brand_count: 0 }]);
      setCreating(false);
      setNewName('');
      setNewRefreshDays(30);
    } catch (e: unknown) {
      alert(`Create failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  };

  const moveCategory = async (cat: CategoryWithCount, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    // Swap display_order via two updates. Not atomic but the UI refetches, and
    // worst case a partial failure leaves a recoverable state (just re-drag).
    setSavingId(cat.id);
    try {
      const { error: e1 } = await supabase
        .from('merchant_category')
        .update({ display_order: other.display_order })
        .eq('id', cat.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('merchant_category')
        .update({ display_order: cat.display_order })
        .eq('id', other.id);
      if (e2) throw e2;
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id === cat.id) return { ...c, display_order: other.display_order };
          if (c.id === other.id) return { ...c, display_order: cat.display_order };
          return c;
        }),
      );
    } catch (e: unknown) {
      alert(`Reorder failed: ${e instanceof Error ? e.message : 'unknown'}`);
      loadData();
    } finally {
      setSavingId(null);
    }
  };

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.display_order - b.display_order),
    [categories],
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm font-medium text-white rounded hover:opacity-90"
          style={{ backgroundColor: BRAND_COLOR_DARK }}
        >
          + Add Category
        </button>
      </div>

      {loading && <div className="p-8 text-center text-gray-500 text-sm">Loading categories…</div>}
      {error && (
        <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded m-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 w-20">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 w-28">Brand count</th>
                <th className="px-4 py-3 w-40">Refresh (days)</th>
                <th className="px-4 py-3 w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {creating && (
                <tr className="bg-blue-50">
                  <td className="px-4 py-3 text-xs text-gray-400">new</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createCategory();
                        if (e.key === 'Escape') setCreating(false);
                      }}
                      placeholder="Category name"
                      autoFocus
                      className="w-full px-2 py-1 border border-blue-400 rounded text-sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400">0</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={newRefreshDays}
                      onChange={(e) => setNewRefreshDays(parseInt(e.target.value, 10) || 30)}
                      className="w-20 px-2 py-1 border border-blue-400 rounded text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={createCategory}
                        className="px-2 py-1 text-xs font-medium text-white rounded"
                        style={{ backgroundColor: BRAND_COLOR_DARK }}
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setCreating(false);
                          setNewName('');
                          setNewRefreshDays(30);
                        }}
                        className="px-2 py-1 text-xs text-gray-600 rounded border border-gray-300 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {sorted.map((cat, idx) => {
                const isEditing = editingId === cat.id;
                const isSaving = savingId === cat.id;
                return (
                  <tr key={cat.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveCategory(cat, 'up')}
                          disabled={idx === 0 || isSaving}
                          className="px-1 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveCategory(cat, 'down')}
                          disabled={idx === sorted.length - 1 || isSaving}
                          className="px-1 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <span className="ml-1 font-mono text-gray-400">{cat.display_order}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(cat);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          className="w-full px-2 py-1 border border-blue-400 rounded text-sm"
                        />
                      ) : (
                        <span className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
                          {cat.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {cat.brand_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={editRefreshDays}
                          onChange={(e) =>
                            setEditRefreshDays(parseInt(e.target.value, 10) || 30)
                          }
                          className="w-20 px-2 py-1 border border-blue-400 rounded text-sm"
                        />
                      ) : (
                        <span className="text-gray-600">
                          {cat.refresh_frequency_days} days
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveEdit(cat)}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs font-medium text-white rounded disabled:opacity-50"
                            style={{ backgroundColor: BRAND_COLOR_DARK }}
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs text-gray-600 rounded border border-gray-300 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(cat)}
                            className="px-2 py-1 text-xs text-white rounded hover:opacity-90"
                            style={{ backgroundColor: BRAND_COLOR_MED }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCategory(cat)}
                            disabled={cat.brand_count > 0 || isSaving}
                            className="px-2 py-1 text-xs text-gray-600 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              cat.brand_count > 0
                                ? `${cat.brand_count} brands still assigned`
                                : 'Delete category'
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && !creating && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No categories yet. Click "+ Add Category" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div
        className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100 bg-gray-50"
        style={{ borderTopColor: BRAND_COLOR_LIGHT }}
      >
        Tip: Categories drive the checkbox grouping users see in the map's Merchants drawer.
        "Refresh (days)" controls how often background jobs re-verify brands in this category
        against Google Places. 30 days is the recommended default.
      </div>
    </div>
  );
}
