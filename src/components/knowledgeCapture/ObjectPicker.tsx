import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { KnowledgeLink, ObjectType } from './useKnowledgeCapture';

// Adds a link the AI didn't propose. Searches the same four object types the edge
// function does, straight from the browser (RLS already scopes what this user can
// read), so the picker is instant and costs no model tokens.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
} as const;

const PER_TYPE_LIMIT = 5;
const DEBOUNCE_MS = 250;

interface Hit extends KnowledgeLink {
  context: string;
}

const TYPE_LABEL: Record<ObjectType, string> = {
  account: 'Account',
  deal: 'Deal',
  property: 'Property',
  contact: 'Contact',
};

const compact = (parts: Array<string | null | undefined>) =>
  parts.filter((p) => p && String(p).trim()).join(' · ');

/** Escapes the ilike wildcards so a typed % doesn't widen the search. */
const like = (q: string) => `%${q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;

async function search(query: string): Promise<Hit[]> {
  const p = like(query);

  const [accounts, deals, properties, contacts] = await Promise.all([
    supabase.from('client').select('id, client_name, billing_city, billing_state')
      .ilike('client_name', p).limit(PER_TYPE_LIMIT),
    supabase.from('deal').select('id, deal_name, client:client_id(client_name)')
      .ilike('deal_name', p).limit(PER_TYPE_LIMIT),
    supabase.from('property').select('id, property_name, address, city')
      .or(`property_name.ilike.${p},address.ilike.${p}`).limit(PER_TYPE_LIMIT),
    supabase.from('contact').select('id, first_name, last_name, company')
      .or(`first_name.ilike.${p},last_name.ilike.${p},company.ilike.${p}`).limit(PER_TYPE_LIMIT),
  ]);

  const hits: Hit[] = [];

  for (const row of accounts.data ?? []) {
    hits.push({
      object_type: 'account',
      object_id: row.id,
      object_name: row.client_name ?? '(unnamed account)',
      context: compact([row.billing_city, row.billing_state]),
    });
  }
  for (const row of deals.data ?? []) {
    const client = row.client as { client_name?: string | null } | null;
    hits.push({
      object_type: 'deal',
      object_id: row.id,
      object_name: row.deal_name ?? '(unnamed deal)',
      context: compact([client?.client_name]),
    });
  }
  for (const row of properties.data ?? []) {
    hits.push({
      object_type: 'property',
      object_id: row.id,
      object_name: row.property_name || row.address || '(unnamed property)',
      context: compact([row.address, row.city]),
    });
  }
  for (const row of contacts.data ?? []) {
    hits.push({
      object_type: 'contact',
      object_id: row.id,
      object_name: compact([row.first_name, row.last_name]).replace(' · ', ' ') || '(unnamed contact)',
      context: compact([row.company]),
    });
  }

  return hits;
}

export const ObjectPicker: React.FC<{
  onPick: (link: KnowledgeLink) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await search(q);
        if (!cancelled) setHits(results);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  return (
    <div
      className="mt-1.5 rounded-md p-2"
      style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.slate}` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Close the picker only — the panel's own Esc handler must not also fire.
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search accounts, deals, properties, contacts…"
        className="w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1"
        style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
      />

      <div className="mt-1.5 max-h-40 overflow-y-auto">
        {query.trim().length < 2 ? (
          <p className="px-1 py-1 text-[11px]" style={{ color: COLORS.slate }}>
            Type at least two characters.
          </p>
        ) : searching && hits.length === 0 ? (
          <p className="px-1 py-1 text-[11px]" style={{ color: COLORS.slate }}>Searching…</p>
        ) : hits.length === 0 ? (
          <p className="px-1 py-1 text-[11px]" style={{ color: COLORS.slate }}>
            Nothing matched. The note can stay general knowledge.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {hits.map((hit) => (
              <li key={`${hit.object_type}:${hit.object_id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({
                      object_type: hit.object_type,
                      object_id: hit.object_id,
                      object_name: hit.object_name,
                    });
                    onClose();
                  }}
                  className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-50"
                >
                  <span
                    className="flex-shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: COLORS.bg, color: COLORS.steel, border: `1px solid ${COLORS.slate}` }}
                  >
                    {TYPE_LABEL[hit.object_type]}
                  </span>
                  <span className="min-w-0 truncate" style={{ color: COLORS.midnight }}>
                    {hit.object_name}
                  </span>
                  {hit.context && (
                    <span className="min-w-0 truncate text-[10px]" style={{ color: COLORS.slate }}>
                      {hit.context}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
