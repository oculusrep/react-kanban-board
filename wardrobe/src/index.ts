// Wardrobe Worker: MCP server (/mcp/<token>), JSON API for the web page (/api/*),
// authenticated photo serving (/photos/*) and the static web page (public/).
import { analyzePhoto } from './ai';
import { LOGOUT_COOKIE, isAuthorized, loginCookie, tokenConfigured, tokenMatches } from './auth';
import {
  Ctx, META, SearchFilters, addItem, deleteItem, getItem, logWear, searchItems, updateItem,
} from './db';
import { handleMcp } from './mcp';
import { InputError } from './model';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const notFound = () => json({ error: 'not found' }, 404);

function ctxFor(env: Env, url: URL): Ctx {
  return { db: env.DB, origin: url.origin, timeZone: env.TIMEZONE || 'America/New_York' };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      // ---- MCP: /mcp/<token> (connector URL) or /mcp with Authorization: Bearer ----
      if (path === '/mcp' || path.startsWith('/mcp/')) {
        const pathToken = path.startsWith('/mcp/') ? decodeURIComponent(path.slice(5)) : null;
        const ok = pathToken !== null
          ? await tokenMatches(pathToken, env.WARDROBE_TOKEN)
          : await isAuthorized(req, env.WARDROBE_TOKEN);
        // 404 (not 401) so connector clients don't try to start an OAuth flow.
        if (!ok) return notFound();
        return handleMcp(req, { ...ctxFor(env, url), photos: env.PHOTOS });
      }

      if (path.startsWith('/api/')) return await handleApi(req, env, url);

      if (path.startsWith('/photos/')) {
        if (!(await isAuthorized(req, env.WARDROBE_TOKEN))) return new Response('Unauthorized', { status: 401 });
        const obj = await env.PHOTOS.get(path.slice(1));
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
            'Cache-Control': 'private, max-age=604800, immutable',
            ETag: obj.httpEtag,
          },
        });
      }

      if (path.startsWith('/.well-known/')) return new Response('Not found', { status: 404 });
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof InputError) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: 'internal error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // Same-origin check for state-changing requests (cookie is SameSite=Strict too).
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'bad origin' }, 403);
  }

  if (path === '/api/login' && method === 'POST') {
    if (!tokenConfigured(env.WARDROBE_TOKEN)) return json({ error: 'WARDROBE_TOKEN is not set on the Worker (needs 24+ characters)' }, 503);
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (!(await tokenMatches(token, env.WARDROBE_TOKEN))) return json({ error: 'wrong token' }, 401);
    return json({ ok: true }, 200, { 'Set-Cookie': await loginCookie(env.WARDROBE_TOKEN!) });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': LOGOUT_COOKIE });

  if (!(await isAuthorized(req, env.WARDROBE_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const ctx = ctxFor(env, url);

  if (path === '/api/session' && method === 'GET') return json({ ok: true, ...META });

  if (path === '/api/items' && method === 'GET') {
    const p = Object.fromEntries(url.searchParams) as Record<string, string>;
    const f: SearchFilters = {
      ...p,
      min_price: p.min_price ? Number(p.min_price) : undefined,
      max_price: p.max_price ? Number(p.max_price) : undefined,
      limit: p.limit ? Number(p.limit) : undefined,
      offset: p.offset ? Number(p.offset) : undefined,
    };
    for (const k of Object.keys(f) as (keyof SearchFilters)[]) if (f[k] === '' ) delete f[k];
    return json(await searchItems(ctx, f));
  }
  if (path === '/api/items' && method === 'POST') {
    return json(await addItem(ctx, await req.json()), 201);
  }

  const itemMatch = path.match(/^\/api\/items\/([\w-]+)(\/wear)?$/);
  if (itemMatch) {
    const [, id, wear] = itemMatch;
    if (wear && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { date?: string; note?: string };
      const res = await logWear(ctx, [id], body.date, body.note);
      return res.items[0] ? json(res.items[0]) : notFound();
    }
    if (wear) return json({ error: 'method not allowed' }, 405);
    if (method === 'GET') { const i = await getItem(ctx, id); return i ? json(i) : notFound(); }
    if (method === 'PATCH') {
      const before = await getItem(ctx, id);
      if (!before) return notFound();
      const after = await updateItem(ctx, id, await req.json());
      if (before.photo_key && after && before.photo_key !== after.photo_key) await env.PHOTOS.delete(before.photo_key);
      return after ? json(after) : notFound();
    }
    if (method === 'DELETE') {
      const i = await deleteItem(ctx, id);
      if (!i) return notFound();
      if (i.photo_key) await env.PHOTOS.delete(i.photo_key);
      return json({ deleted: true, id });
    }
  }

  // Upload: raw image bytes in the body. Returns { photo_key }.
  if (path === '/api/photos' && method === 'POST') {
    const type = (req.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(type)) return json({ error: `upload must be one of ${IMAGE_TYPES.join(', ')}` }, 415);
    const len = Number(req.headers.get('Content-Length') ?? 0);
    if (len > MAX_UPLOAD_BYTES) return json({ error: 'photo too large (max 8 MB)' }, 413);
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'photo empty or too large (max 8 MB)' }, 413);
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const key = `photos/${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
    return json({ photo_key: key, photo_url: `${url.origin}/${key}` }, 201);
  }

  // Discard an upload that was never saved to an item.
  const photoMatch = path.match(/^\/api\/photos\/(photos\/[A-Za-z0-9._-]+)$/);
  if (photoMatch && method === 'DELETE') {
    const key = photoMatch[1];
    const inUse = await env.DB.prepare('SELECT 1 FROM items WHERE photo_key = ?').bind(key).first();
    if (inUse) return json({ error: 'photo belongs to an item' }, 409);
    await env.PHOTOS.delete(key);
    return json({ deleted: true });
  }

  // AI auto-fill from an uploaded photo.
  if (path === '/api/analyze' && method === 'POST') {
    const { photo_key } = (await req.json().catch(() => ({}))) as { photo_key?: string };
    if (!photo_key || !/^photos\/[A-Za-z0-9._-]+$/.test(photo_key)) return json({ error: 'photo_key required' }, 400);
    const obj = await env.PHOTOS.get(photo_key);
    if (!obj) return notFound();
    try {
      const suggestion = await analyzePhoto(env.AI, await obj.arrayBuffer(), obj.httpMetadata?.contentType ?? 'image/jpeg');
      return json(suggestion);
    } catch (e) {
      console.error('analyze failed', e);
      return json({ error: `auto-fill unavailable: ${(e as Error).message}` }, 502);
    }
  }

  return notFound();
}
