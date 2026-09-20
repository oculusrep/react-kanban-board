/**
 * Read-only OVIS lookups for Knowledge Capture, plus the id verification the
 * server does before anything is filed.
 *
 * Four searches, one per linkable object type. Each returns an id, a display
 * name and just enough context to tell two similar records apart — a bare name
 * list makes the model guess between "Starbucks" and "Starbucks - JW (Coastal GA)".
 *
 * 'account' is the public.client table. OVIS has no `account` table; the name
 * comes from the Salesforce heritage and is what the object_type column stores.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { type CleanLink, isObjectType, OBJECT_TYPES, type ObjectType, type ProposedLink, type VerifiedLink } from './types.ts';

export { isObjectType, OBJECT_TYPES };
export type { CleanLink, ObjectType, ProposedLink, VerifiedLink };

/** Results per search. Enough to disambiguate, small enough to stay cheap. */
const SEARCH_LIMIT = 8;

/** PostgREST `ilike` pattern. Escapes the wildcards so a literal % can't widen the search. */
function pattern(query: string): string {
  return `%${query.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

function requireQuery(input: Record<string, unknown>): string {
  const q = typeof input.query === 'string' ? input.query.trim() : '';
  if (!q) throw new Error('query is required');
  return q;
}

const compact = (parts: Array<string | null | undefined>): string =>
  parts.filter((p) => p && String(p).trim()).join(' · ');

// ---------------------------------------------------------------------------
// Tool definitions (sent to the model)
// ---------------------------------------------------------------------------
const querySchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Part of a name to search for, case-insensitive. Keep it short — "Hoschton", not "the Hoschton deal".',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

export const TOOL_DEFINITIONS: Array<Record<string, unknown>> = [
  {
    name: 'search_accounts',
    description:
      'Search OVIS accounts (clients, landlords, tenants, brokerages) by name. Returns id, name, ' +
      'parent account and location. Parent matters: "Starbucks" and its child accounts like ' +
      '"Starbucks - JW (Coastal GA)" are different records.',
    input_schema: querySchema,
  },
  {
    name: 'search_deals',
    description:
      'Search OVIS deals by deal name. Returns id, name, account, stage and the property address. ' +
      'A deal is one specific transaction — prefer it over the account when the note is about a site.',
    input_schema: querySchema,
  },
  {
    name: 'search_properties',
    description:
      'Search OVIS properties by property name or street address. Returns id, name, address and city.',
    input_schema: querySchema,
  },
  {
    name: 'search_contacts',
    description:
      'Search OVIS contacts by first name, last name, company or email. Returns id, name, title, ' +
      'company and the account they belong to.',
    input_schema: querySchema,
  },
];

export interface SearchHit {
  object_type: ObjectType;
  object_id: string;
  object_name: string;
  context: string;
}

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------
async function searchAccounts(service: SupabaseClient, query: string): Promise<SearchHit[]> {
  const { data, error } = await service
    .from('client')
    .select('id, client_name, billing_city, billing_state, is_active_client, parent:parent_id(client_name)')
    .ilike('client_name', pattern(query))
    .limit(SEARCH_LIMIT);
  if (error) throw new Error(`account search failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const parent = (row.parent ?? null) as { client_name?: string | null } | null;
    return {
      object_type: 'account' as const,
      object_id: String(row.id),
      object_name: (row.client_name as string | null) ?? '(unnamed account)',
      context: compact([
        parent?.client_name ? `child of ${parent.client_name}` : null,
        compact([row.billing_city as string, row.billing_state as string]) || null,
        row.is_active_client === false ? 'inactive' : null,
      ]),
    };
  });
}

async function searchDeals(service: SupabaseClient, query: string): Promise<SearchHit[]> {
  const { data, error } = await service
    .from('deal')
    .select(`
      id, deal_name,
      client:client_id(client_name),
      stage:stage_id(label),
      property:property_id(address, city, state)
    `)
    .ilike('deal_name', pattern(query))
    .limit(SEARCH_LIMIT);
  if (error) throw new Error(`deal search failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const client = (row.client ?? null) as { client_name?: string | null } | null;
    const stage = (row.stage ?? null) as { label?: string | null } | null;
    const property = (row.property ?? null) as Record<string, string | null> | null;
    return {
      object_type: 'deal' as const,
      object_id: String(row.id),
      object_name: (row.deal_name as string | null) ?? '(unnamed deal)',
      context: compact([
        client?.client_name,
        stage?.label ? `stage: ${stage.label}` : null,
        property ? compact([property.address, property.city, property.state]) || null : null,
      ]),
    };
  });
}

async function searchProperties(service: SupabaseClient, query: string): Promise<SearchHit[]> {
  const p = pattern(query);
  const { data, error } = await service
    .from('property')
    .select('id, property_name, address, city, state')
    .or(`property_name.ilike.${p},address.ilike.${p}`)
    .limit(SEARCH_LIMIT);
  if (error) throw new Error(`property search failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    object_type: 'property' as const,
    object_id: String(row.id),
    // Plenty of properties carry an address but no name.
    object_name: (row.property_name as string | null) || (row.address as string | null) ||
      '(unnamed property)',
    context: compact([row.address as string, row.city as string, row.state as string]),
  }));
}

async function searchContacts(service: SupabaseClient, query: string): Promise<SearchHit[]> {
  const p = pattern(query);
  const { data, error } = await service
    .from('contact')
    .select('id, first_name, last_name, title, company, email, client:client_id(client_name)')
    .or(`first_name.ilike.${p},last_name.ilike.${p},company.ilike.${p},email.ilike.${p}`)
    .limit(SEARCH_LIMIT);
  if (error) throw new Error(`contact search failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const client = (row.client ?? null) as { client_name?: string | null } | null;
    const name = compact([row.first_name as string, row.last_name as string]).replace(' · ', ' ');
    return {
      object_type: 'contact' as const,
      object_id: String(row.id),
      object_name: name || (row.email as string | null) || '(unnamed contact)',
      context: compact([row.title as string, row.company as string, client?.client_name, row.email as string]),
    };
  });
}

/**
 * Tool executor for the loop. Service-role reads: the caller is already gated to
 * internal users, and these are the same rows they can read in the UI.
 */
export function createExecutor(service: SupabaseClient) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    const query = requireQuery(input);
    switch (name) {
      case 'search_accounts':
        return { results: await searchAccounts(service, query) };
      case 'search_deals':
        return { results: await searchDeals(service, query) };
      case 'search_properties':
        return { results: await searchProperties(service, query) };
      case 'search_contacts':
        return { results: await searchContacts(service, query) };
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
// Every id that reaches the client, and every id that reaches the database, is
// looked up here first. Two reasons: a model can hallucinate a plausible uuid,
// and the conversation (including its proposal) round-trips through the browser,
// so by the time it comes back to be filed it is user input, not our output.
const NAME_SELECT: Record<ObjectType, { table: string; select: string; name: (r: Record<string, unknown>) => string }> = {
  account: {
    table: 'client',
    select: 'id, client_name',
    name: (r) => (r.client_name as string | null) ?? '(unnamed account)',
  },
  deal: {
    table: 'deal',
    select: 'id, deal_name',
    name: (r) => (r.deal_name as string | null) ?? '(unnamed deal)',
  },
  property: {
    table: 'property',
    select: 'id, property_name, address',
    name: (r) =>
      (r.property_name as string | null) || (r.address as string | null) || '(unnamed property)',
  },
  contact: {
    table: 'contact',
    select: 'id, first_name, last_name, email',
    name: (r) =>
      compact([r.first_name as string, r.last_name as string]).replace(' · ', ' ') ||
      (r.email as string | null) || '(unnamed contact)',
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keep only the links that exist, with their live names. Unknown types, malformed
 * ids and rows that don't exist are dropped and reported in `dropped` so the
 * caller can tell the user instead of silently filing less than they saw.
 */
export async function verifyLinks(
  service: SupabaseClient,
  links: ProposedLink[],
): Promise<{ links: VerifiedLink[]; dropped: ProposedLink[] }> {
  const verified: VerifiedLink[] = [];
  const dropped: ProposedLink[] = [];

  // Group by type so each type costs one query however many links it has.
  const byType = new Map<ObjectType, Set<string>>();
  for (const link of links ?? []) {
    const id = typeof link?.object_id === 'string' ? link.object_id.trim() : '';
    if (!isObjectType(link?.object_type) || !UUID_RE.test(id)) {
      dropped.push(link);
      continue;
    }
    const set = byType.get(link.object_type) ?? new Set<string>();
    set.add(id);
    byType.set(link.object_type, set);
  }

  for (const [objectType, ids] of byType) {
    const cfg = NAME_SELECT[objectType];
    const { data, error } = await service
      .from(cfg.table)
      .select(cfg.select)
      .in('id', [...ids]);
    if (error) throw new Error(`${objectType} verification failed: ${error.message}`);

    const found = new Map<string, string>();
    // Cast through unknown: supabase-js types a dynamic select string as a
    // possible error shape, which doesn't overlap a plain row object.
    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      found.set(String(row.id), cfg.name(row));
    }
    for (const id of ids) {
      const name = found.get(id);
      if (name === undefined) {
        dropped.push({ object_type: objectType, object_id: id });
        continue;
      }
      verified.push({ object_type: objectType, object_id: id, object_name: name });
    }
  }

  return { links: verified, dropped };
}
