// components/SiteSubmitSelector.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type AnyRow = Record<string, any>;

function pickLabel(r: AnyRow) {
  const main =
    r.reference_code ??
    r.Reference_Code__c ??
    r.title ??
    r.Name ??             // common SF text field
    r.site_submit_name ??
    r.property_name ??
    r.sf_id ??
    r.id;

  const addr =
    r.address_line1 ??
    r.Address__c ??
    r.address1 ??
    r.street ??
    null;

  const city = r.city ?? r.City__c ?? null;
  const state = r.state ?? r.State__c ?? null;

  const parts = [addr, city, state].filter(Boolean);
  return {
    id: r.id as string,
    label: String(main ?? "Site Submit"),
    sub: parts.length ? parts.join(", ") : undefined,
  };
}

export default function SiteSubmitSelector({
  valueId,
  onChange,
  disabled,
  label = "Site Submit (optional)",
}: {
  valueId: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [current, setCurrent] = useState<{ id: string; label: string; sub?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Load current selected row (for label)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!valueId) {
        setCurrent(null);
        return;
      }
      const { data, error } = await supabase.from("site_submit").select("*").eq("id", valueId).maybeSingle();
      if (!active) return;
      if (error || !data) setCurrent(null);
      else setCurrent(pickLabel(data));
    })();
    return () => {
      active = false;
    };
  }, [valueId]);

  // Load a reasonable slice of site_submit for client-side search
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // We avoid server-side filters because column names vary; fetch a slice and filter client-side.
      const { data, error } = await supabase.from("site_submit").select("*").limit(200);
      if (!cancelled) {
        if (!error && Array.isArray(data)) setAllRows(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side filter
  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = allRows.filter((r) => !current || r.id !== current.id);
    if (!term) return rows.slice(0, 50).map(pickLabel);
    return rows
      .filter((r) => {
        const { label, sub } = pickLabel(r);
        const hay = (label + " " + (sub ?? "") + " " + (r.sf_id ?? "")).toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 50)
      .map(pickLabel);
  }, [allRows, query, current]);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          className="w-full rounded-xl border border-gray-300 p-2 outline-none focus:ring focus:ring-blue-200"
          placeholder={current ? current.label : "Search by ref, title, address, or SF ID"}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {current ? (
          <button
            type="button"
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
            onClick={() => onChange(null)}
            disabled={disabled}
            title="Clear"
          >
            Clear
          </button>
        ) : null}
      </div>

      {current?.sub ? <div className="mt-1 text-xs text-gray-500">{current.sub}</div> : null}

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-md max-h-72 overflow-auto">
          {loading ? (
            <div className="p-3 text-sm text-gray-500">Loading…</div>
          ) : options.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No matches.</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full text-left p-3 hover:bg-gray-50"
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                {opt.sub ? <div className="text-xs text-gray-500">{opt.sub}</div> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
