// Minimal stateless MCP server over Streamable HTTP (JSON responses, no SSE stream).
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http
// Each POST carries one JSON-RPC message (or a batch); we reply with application/json.
import {
  Ctx, META, SearchFilters, SuggestInput, addItem, deleteItem, getItem, logWear,
  searchItems, suggestOutfitCandidates, updateItem,
} from './db';
import { CATEGORIES, FORMALITIES, InputError, SEASONS } from './model';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'wardrobe', title: 'Wardrobe', version: '0.1.0' };

const INSTRUCTIONS = `Personal wardrobe database for one person.
- Use search_items / list_items to find items; ids are needed for update_item, delete_item and log_wear.
- For outfit help, call suggest_outfit_candidates with season/formality/weather (or temperature), then assemble outfits from the returned candidates yourself.
- When the user says they wore something, call log_wear (defaults to today).
- Photos are added from the wardrobe web page; photo_url values require the owner's login to view.`;

type Json = Record<string, unknown>;
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: Json;
  run: (ctx: Ctx, args: Json) => Promise<unknown>;
}

const itemProps: Json = {
  name: { type: 'string', description: 'e.g. "Navy oxford shirt"' },
  category: { type: 'string', enum: [...CATEGORIES] },
  brand: { type: 'string' },
  color: { type: 'string' },
  size: { type: 'string' },
  season: {
    description: "Seasons it suits: 'all', or any of spring/summer/fall/winter (array or comma-separated string)",
    anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string', enum: [...SEASONS, 'all'] } }],
  },
  formality: { type: 'string', enum: [...FORMALITIES] },
  purchase_date: { type: 'string', description: 'YYYY-MM-DD' },
  price: { type: 'number', minimum: 0 },
  notes: { type: 'string' },
  last_worn: { type: 'string', description: 'YYYY-MM-DD' },
  times_worn: { type: 'integer', minimum: 0 },
};

const filterProps: Json = {
  query: { type: 'string', description: 'Free text matched against name, brand, color, category, size and notes' },
  category: { type: 'string', enum: [...CATEGORIES] },
  color: { type: 'string' },
  brand: { type: 'string' },
  season: { type: 'string', enum: [...SEASONS], description: "Items suitable for this season (includes 'all'-season items)" },
  formality: { type: 'string', enum: [...FORMALITIES] },
  min_price: { type: 'number' },
  max_price: { type: 'number' },
  not_worn_since: { type: 'string', description: 'YYYY-MM-DD; only items not worn on/after this date (or never)' },
  sort: { type: 'string', enum: META.sorts },
  limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  offset: { type: 'integer', minimum: 0, default: 0 },
};

const TOOLS: Tool[] = [
  {
    name: 'add_item',
    title: 'Add clothing item',
    description: 'Add a clothing item to the wardrobe. Only name is required. Returns the saved item with its id.',
    inputSchema: { type: 'object', properties: itemProps, required: ['name'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: (ctx, a) => addItem(ctx, a),
  },
  {
    name: 'update_item',
    title: 'Update clothing item',
    description: 'Update fields on an existing item. Pass only the fields to change; null clears a field.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...itemProps }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, { id, ...rest }) => {
      const item = await updateItem(ctx, String(id), rest);
      if (!item) throw new InputError(`no item with id ${id}`);
      return item;
    },
  },
  {
    name: 'delete_item',
    title: 'Delete clothing item',
    description: 'Permanently delete an item, its wear history and its photo. Confirm with the user first.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, { id }) => {
      const item = await deleteItem(ctx, String(id));
      if (!item) throw new InputError(`no item with id ${id}`);
      if (item.photo_key) await (ctx as McpCtx).photos.delete(item.photo_key);
      return { deleted: true, id: item.id, name: item.name };
    },
  },
  {
    name: 'search_items',
    title: 'Search wardrobe',
    description: 'Search items by free text and/or filters (category, color, brand, season, formality, price, not worn since).',
    inputSchema: { type: 'object', properties: filterProps },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (ctx, a) => searchItems(ctx, a as SearchFilters),
  },
  {
    name: 'list_items',
    title: 'List wardrobe',
    description: 'List items, optionally by category, with sorting and paging. Pass id to fetch a single item.',
    inputSchema: {
      type: 'object',
      properties: {
        category: filterProps.category, sort: filterProps.sort, limit: filterProps.limit, offset: filterProps.offset,
        id: { type: 'string', description: 'Return just this one item' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      if (a.id) {
        const item = await getItem(ctx, String(a.id));
        if (!item) throw new InputError(`no item with id ${a.id}`);
        return { items: [item], total: 1 };
      }
      return searchItems(ctx, { category: a.category as string, sort: a.sort as string, limit: a.limit as number, offset: a.offset as number });
    },
  },
  {
    name: 'log_wear',
    title: 'Log worn items',
    description: 'Record that one or more items were worn (increments times_worn and updates last_worn). Date defaults to today.',
    inputSchema: {
      type: 'object',
      properties: {
        item_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        note: { type: 'string', description: 'Optional, e.g. the occasion' },
      },
      required: ['item_ids'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: (ctx, a) => {
      const ids = Array.isArray(a.item_ids) ? a.item_ids : [a.item_ids];
      return logWear(ctx, ids as string[], a.date as string | undefined, a.note as string | undefined);
    },
  },
  {
    name: 'suggest_outfit_candidates',
    title: 'Outfit candidates',
    description:
      'Return candidate items grouped by category (top, bottom, dress, outerwear, shoes, accessory) that fit the season, formality and weather, ' +
      'least-recently-worn first. You then pick the actual outfit. Give weather as words ("rainy, 48F") and/or a temperature.',
    inputSchema: {
      type: 'object',
      properties: {
        season: { type: 'string', enum: [...SEASONS] },
        formality: { type: 'string', enum: [...FORMALITIES] },
        weather: { type: 'string', description: 'e.g. "hot and sunny", "rainy", "cold and windy"' },
        temperature_f: { type: 'number' },
        temperature_c: { type: 'number' },
        exclude_worn_within_days: { type: 'integer', minimum: 0, description: 'Skip items worn in the last N days' },
        per_category: { type: 'integer', minimum: 1, maximum: 25, default: 6 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (ctx, a) => suggestOutfitCandidates(ctx, a as SuggestInput),
  },
];

export interface McpCtx extends Ctx {
  photos: R2Bucket;
}

interface RpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Json;
}

const rpcResult = (id: RpcMessage['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: RpcMessage['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function callTool(ctx: McpCtx, params: Json) {
  const tool = TOOLS.find((t) => t.name === params.name);
  if (!tool) return null;
  try {
    const data = await tool.run(ctx, (params.arguments as Json) ?? {});
    const structured = data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data };
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: structured, isError: false };
  } catch (e) {
    const msg = e instanceof InputError ? e.message : `Internal error: ${(e as Error).message}`;
    if (!(e instanceof InputError)) console.error('tool error', tool.name, e);
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}

async function handleMessage(ctx: McpCtx, msg: RpcMessage): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    // Responses from the client (to server requests we never send) and junk are ignored/rejected.
    return msg && 'id' in msg && !('result' in msg || 'error' in msg) ? rpcError(msg.id, -32600, 'Invalid Request') : null;
  }
  const isNotification = msg.id === undefined;
  if (isNotification) return null; // notifications/initialized, cancelled, etc.

  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations: { title, ...annotations } })),
      });
    case 'tools/call': {
      const res = await callTool(ctx, msg.params ?? {});
      return res ? rpcResult(msg.id, res) : rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
    }
    case 'resources/list':
      return rpcResult(msg.id, { resources: [] });
    case 'prompts/list':
      return rpcResult(msg.id, { prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function handleMcp(req: Request, ctx: McpCtx): Promise<Response> {
  if (req.method === 'GET') {
    // We don't offer a server-initiated SSE stream; spec says return 405.
    return new Response('SSE stream not supported; POST JSON-RPC to this URL.', { status: 405, headers: { Allow: 'POST' } });
  }
  if (req.method === 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleMessage(ctx, m as RpcMessage)))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0], {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const TOOL_NAMES = TOOLS.map((t) => t.name);
