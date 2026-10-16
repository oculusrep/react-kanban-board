/**
 * Dropbox proxy — the only place OVIS's browser code reaches Dropbox through.
 *
 * WHY THIS EXISTS (2026-10-16): the frontend used to build a Dropbox client from
 * VITE_DROPBOX_* env vars, which Vite inlines into the public JS bundle. The app
 * key, app secret and refresh token were readable by anyone who loaded the login
 * page. The credentials now live only in edge-function secrets, and every request
 * is authorized here first.
 *
 * Callers (user JWT, gateway verify_jwt on):
 *   internal user  — public.is_internal_user() (admin, broker_full, broker_lite, va):
 *                    every op, anywhere under /Salesforce Documents.
 *   portal user    — must name the record it is browsing ({ scope: { entityType,
 *                    entityId } }). The record is re-read through a USER-SCOPED
 *                    client, so the existing portal RLS on property / deal /
 *                    site_submit decides access. Paths must sit inside that record's
 *                    dropbox_mapping folder, and only portal-visible entries are
 *                    listed or linked (same rule as PortalFilesTab.isFileVisible:
 *                    exact override, else longest parent-folder override, else
 *                    property = visible, deal / site_submit = hidden).
 *                    Upload: deal folders only, and only when the caller's contact
 *                    has portal_can_upload_deal_files. The upload is shared to the
 *                    portal (portal_file_visibility row) here, server-side.
 *   anyone else    — 403 (coach, users with no OVIS or portal record).
 *
 * Uploads never pass through this function: it returns a one-time Dropbox
 * temporary upload link and the browser POSTs the bytes straight to it
 * (Content-Type: application/octet-stream; Dropbox answers with CORS *). That link
 * only returns a content hash, not the final path, so this function picks a
 * non-colliding name up front ("name (1).ext", like Dropbox autorename) and
 * commits with autorename off.
 *
 * Longpoll is not proxied: /2/files/list_folder/longpoll is a no-auth endpoint and
 * the browser calls it directly with a cursor obtained here.
 *
 * API reference: https://www.dropbox.com/developers/documentation/http/documentation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = '/Salesforce Documents';
const API = 'https://api.dropboxapi.com/2/';

type EntityType = 'property' | 'deal' | 'site_submit';
const ENTITY_TABLE: Record<EntityType, string> = {
  property: 'property',
  deal: 'deal',
  site_submit: 'site_submit',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Dropbox calls

let cachedToken: string | null = null;

async function getToken(forceRefresh: boolean): Promise<string> {
  if (cachedToken && !forceRefresh) return cachedToken;
  const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN');
  const appKey = Deno.env.get('DROPBOX_APP_KEY');
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET');
  if (!refreshToken || !appKey || !appSecret) {
    throw new HttpError(500, 'Dropbox credentials not configured');
  }
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });
  if (!res.ok) throw new HttpError(502, `Dropbox token refresh failed: ${res.status}`);
  cachedToken = (await res.json()).access_token;
  return cachedToken!;
}

class DropboxApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.error_summary || `Dropbox error ${status}`);
  }
}

async function dbx(endpoint: string, args: unknown): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (res.status === 401 && attempt === 0) continue;
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error_summary: text }; }
    if (!res.ok) throw new DropboxApiError(res.status, body);
    return body;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DropboxApiError && err.status === 409 &&
    String(err.body?.error_summary ?? '').includes('not_found');
}

async function listAll(path: string, recursive: boolean): Promise<any[]> {
  let page = await dbx('files/list_folder', { path, recursive, include_deleted: false });
  const entries = [...page.entries];
  while (page.has_more) {
    page = await dbx('files/list_folder/continue', { cursor: page.cursor });
    entries.push(...page.entries);
  }
  return entries;
}

function toFile(e: any) {
  const isFolder = e['.tag'] === 'folder';
  return {
    id: e.id || e.path_lower || '',
    name: e.name,
    path: e.path_display || e.path_lower || '',
    type: isFolder ? 'folder' : 'file',
    size: !isFolder && 'size' in e ? e.size : null,
    modified: !isFolder && 'server_modified' in e ? e.server_modified : null,
    shared_link: null,
  };
}

async function sharedLink(path: string): Promise<string> {
  try {
    const r = await dbx('sharing/create_shared_link_with_settings', {
      path,
      settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' },
    });
    return r.url;
  } catch (err) {
    if (err instanceof DropboxApiError && err.status === 409 &&
        String(err.body?.error_summary ?? '').startsWith('shared_link_already_exists')) {
      const existing = err.body?.error?.shared_link_already_exists?.metadata?.url;
      if (existing) return existing;
      const links = await dbx('sharing/list_shared_links', { path, direct_only: true });
      if (links.links?.length) return links.links[0].url;
    }
    throw err;
  }
}

/** A name not already taken in `folder`, using Dropbox's "name (n).ext" convention. */
async function freeName(folder: string, name: string): Promise<string> {
  let taken: Set<string>;
  try {
    taken = new Set((await listAll(folder, false)).map((e) => String(e.name).toLowerCase()));
  } catch (err) {
    if (isNotFound(err)) return name;
    throw err;
  }
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new HttpError(409, 'Could not find a free file name');
}

// ---------------------------------------------------------------------------
// Paths and visibility

function cleanPath(p: unknown): string {
  if (typeof p !== 'string' || !p.startsWith('/')) throw new HttpError(400, 'Invalid path');
  const trimmed = p.replace(/\/+$/, '');
  if (trimmed.split('/').some((s) => s === '.' || s === '..')) throw new HttpError(400, 'Invalid path');
  return trimmed;
}

function within(path: string, root: string): boolean {
  const p = path.toLowerCase();
  const r = root.toLowerCase().replace(/\/+$/, '');
  return p === r || p.startsWith(r + '/');
}

function cleanName(n: unknown): string {
  if (typeof n !== 'string') throw new HttpError(400, 'Invalid file name');
  const name = n.trim();
  if (!name || name.includes('/') || name === '.' || name === '..') throw new HttpError(400, 'Invalid file name');
  return name;
}

type Overrides = Map<string, boolean>; // lower-cased path -> visible

function isVisible(path: string, overrides: Overrides, defaultVisible: boolean): boolean {
  const p = path.toLowerCase();
  if (overrides.has(p)) return overrides.get(p)!;
  let best = '';
  let value: boolean | null = null;
  overrides.forEach((visible, o) => {
    if (p.startsWith(o + '/') && o.length > best.length) {
      best = o;
      value = visible;
    }
  });
  return value ?? defaultVisible;
}

// ---------------------------------------------------------------------------

interface PortalScope {
  entityType: EntityType;
  entityId: string;
  root: string;
  overrides: Overrides;
  defaultVisible: boolean;
}

async function resolvePortalScope(
  asUser: SupabaseClient,
  service: SupabaseClient,
  scope: any,
): Promise<PortalScope> {
  const entityType = scope?.entityType as EntityType;
  const entityId = scope?.entityId;
  if (!ENTITY_TABLE[entityType] || typeof entityId !== 'string' || !entityId) {
    throw new HttpError(403, 'forbidden');
  }
  // Portal RLS decides whether this person may see the record at all.
  const { data: row, error } = await asUser
    .from(ENTITY_TABLE[entityType]).select('id').eq('id', entityId).maybeSingle();
  if (error || !row) throw new HttpError(403, 'forbidden');

  const { data: mapping } = await service
    .from('dropbox_mapping').select('dropbox_folder_path')
    .eq('entity_type', entityType).eq('entity_id', entityId).maybeSingle();
  if (!mapping?.dropbox_folder_path) throw new HttpError(404, 'No Dropbox folder linked to this record');

  const { data: rows } = await service
    .from('portal_file_visibility').select('dropbox_path, is_visible')
    .eq('entity_type', entityType).eq('entity_id', entityId);
  const overrides: Overrides = new Map();
  (rows ?? []).forEach((r: any) => overrides.set(String(r.dropbox_path).toLowerCase().replace(/\/+$/, ''), r.is_visible));

  return {
    entityType,
    entityId,
    root: cleanPath(mapping.dropbox_folder_path),
    overrides,
    defaultVisible: entityType === 'property',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return json({ error: 'missing_jwt' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const { data: authData, error: authErr } = await service.auth.getUser(bearer);
    if (authErr || !authData?.user) return json({ error: 'invalid_jwt' }, 401);
    const authUserId = authData.user.id;

    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const op = String(body.op ?? '');

    const { data: internal, error: rpcErr } = await asUser.rpc('is_internal_user');
    if (rpcErr) return json({ error: 'permission_check_failed' }, 403);

    if (internal === true) return json(await internalOp(op, body));

    // Not internal: must be a portal user acting on a record they can see.
    const { data: contactId } = await asUser.rpc('portal_user_contact_id');
    if (!contactId) return json({ error: 'forbidden' }, 403);
    const scope = await resolvePortalScope(asUser, service, body.scope);
    return json(await portalOp(op, body, scope, { service, asUser, contactId, authUserId }));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    if (err instanceof DropboxApiError) {
      console.error('[dropbox-proxy] Dropbox error', err.status, err.body?.error_summary);
      return json({ error: err.message, dropbox_status: err.status }, err.status === 409 ? 409 : 502);
    }
    console.error('[dropbox-proxy] unexpected', err);
    return json({ error: 'Internal error' }, 500);
  }
});

async function exists(path: string): Promise<boolean> {
  try {
    await dbx('files/get_metadata', { path });
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

async function uploadLink(folder: string, rawName: string) {
  const name = await freeName(folder, cleanName(rawName));
  const path = `${folder}/${name}`;
  const r = await dbx('files/get_temporary_upload_link', {
    commit_info: { path, mode: 'add', autorename: false, mute: false },
    duration: 3600,
  });
  return { link: r.link as string, path, name };
}

async function internalOp(op: string, body: any): Promise<unknown> {
  const inBase = (p: unknown) => {
    const path = cleanPath(p);
    if (!within(path, BASE)) throw new HttpError(403, 'Path outside allowed directory');
    return path;
  };

  switch (op) {
    case 'exists':
      return { exists: await exists(inBase(body.path)) };
    case 'list': {
      const entries = await listAll(inBase(body.path), body.recursive !== false);
      return { files: entries.filter((e) => !String(e.name).endsWith('.sfdb')).map(toFile) };
    }
    case 'list_raw':
      return { entries: await listAll(inBase(body.path), body.recursive === true) };
    case 'latest_cursor': {
      const r = await dbx('files/list_folder/get_latest_cursor', {
        path: inBase(body.path), recursive: true, include_deleted: false,
      });
      return { cursor: r.cursor };
    }
    case 'temp_link':
      return { link: (await dbx('files/get_temporary_link', { path: inBase(body.path) })).link };
    case 'shared_link':
      return { link: await sharedLink(inBase(body.path)) };
    case 'upload_link':
      return await uploadLink(inBase(body.folder), body.name);
    case 'create_folder': {
      const r = await dbx('files/create_folder_v2', { path: inBase(body.path), autorename: false });
      return { file: toFile({ ...r.metadata, '.tag': 'folder' }) };
    }
    case 'delete':
      await dbx('files/delete_v2', { path: inBase(body.path) });
      return { ok: true };
    case 'move': {
      const r = await dbx('files/move_v2', {
        from_path: inBase(body.from),
        to_path: inBase(body.to),
        autorename: body.autorename === true,
        allow_ownership_transfer: false,
      });
      return { file: toFile(r.metadata) };
    }
    default:
      throw new HttpError(400, `Unknown op: ${op}`);
  }
}

async function portalOp(
  op: string,
  body: any,
  scope: PortalScope,
  ctx: { service: SupabaseClient; asUser: SupabaseClient; contactId: string; authUserId: string },
): Promise<unknown> {
  const visible = (p: string) => isVisible(p, scope.overrides, scope.defaultVisible);
  const inRoot = (p: unknown) => {
    const path = cleanPath(p);
    if (!within(path, scope.root)) throw new HttpError(403, 'forbidden');
    return path;
  };
  // A folder the portal user may look inside: the record's root, or a visible subfolder.
  const browsable = (p: unknown) => {
    const path = inRoot(p);
    if (path.toLowerCase() !== scope.root.toLowerCase() && !visible(path)) throw new HttpError(403, 'forbidden');
    return path;
  };
  // A single item the portal user may open: inside the root (not the root) and visible.
  const openable = (p: unknown) => {
    const path = inRoot(p);
    if (path.toLowerCase() === scope.root.toLowerCase() || !visible(path)) throw new HttpError(403, 'forbidden');
    return path;
  };

  switch (op) {
    case 'exists':
      return { exists: await exists(inRoot(body.path)) };
    case 'list': {
      const entries = await listAll(browsable(body.path), body.recursive !== false);
      return {
        files: entries
          .filter((e) => !String(e.name).endsWith('.sfdb'))
          .filter((e) => visible(e.path_display || e.path_lower || ''))
          .map(toFile),
      };
    }
    case 'latest_cursor': {
      const r = await dbx('files/list_folder/get_latest_cursor', {
        path: browsable(body.path), recursive: true, include_deleted: false,
      });
      return { cursor: r.cursor };
    }
    case 'temp_link':
      return { link: (await dbx('files/get_temporary_link', { path: openable(body.path) })).link };
    case 'shared_link':
      return { link: await sharedLink(openable(body.path)) };
    case 'upload_link': {
      if (scope.entityType !== 'deal') throw new HttpError(403, 'forbidden');
      const { data: contact } = await ctx.service
        .from('contact').select('portal_can_upload_deal_files').eq('id', ctx.contactId).maybeSingle();
      if (!contact?.portal_can_upload_deal_files) throw new HttpError(403, 'forbidden');

      // Optional site submit for the "file shared" activity feed — only if the
      // caller can see it (portal RLS), since the trigger writes under its client.
      let siteSubmitId: string | null = null;
      if (typeof body.siteSubmitId === 'string' && body.siteSubmitId) {
        const { data: ss } = await ctx.asUser
          .from('site_submit').select('id').eq('id', body.siteSubmitId).maybeSingle();
        siteSubmitId = ss?.id ?? null;
      }

      const result = await uploadLink(browsable(body.folder), body.name);
      // Deal files are hidden from the portal by default; share the upload so it
      // doesn't vanish from the uploader's own view. A new row only — never flips
      // an existing override (the free-name step means the path is new anyway).
      const { error } = await ctx.service.from('portal_file_visibility').upsert({
        dropbox_path: result.path,
        entity_type: 'deal',
        entity_id: scope.entityId,
        site_submit_id: siteSubmitId,
        is_visible: true,
        changed_by_id: ctx.authUserId,
      }, { onConflict: 'entity_type,entity_id,dropbox_path', ignoreDuplicates: true });
      if (error) console.error('[dropbox-proxy] share-on-upload failed', error.message);
      return result;
    }
    default:
      throw new HttpError(403, 'forbidden');
  }
}
