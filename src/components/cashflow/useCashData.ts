import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { loadCashData, type CashData } from "../../../supabase/functions/_shared/cashflow/data.ts";

// Types + loader live in supabase/functions/_shared/cashflow/data.ts (shared with ovis-mcp).
export * from "../../../supabase/functions/_shared/cashflow/data.ts";

export function useCashData() {
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadCashData(supabase));
    } catch (e: any) {
      console.error("Cash tab load failed:", e);
      setError(e?.message || "Failed to load cash data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
